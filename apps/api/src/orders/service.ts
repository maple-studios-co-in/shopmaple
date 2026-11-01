import {
  checkoutInputSchema,
  quoteResponseSchema,
  type QuoteRequest,
  type QuoteSnapshot,
} from "@shopmaple/contracts";
import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type CheckoutAttempt,
} from "@prisma/client";
import {
  PaymentGatewayError,
  type createRazorpayGateway,
} from "../payments/razorpay.js";

export interface FrozenLine {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string;
  sku: string | null;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}
export interface LegacyFrozenSnapshot {
  version: 1;
  currency: "INR";
  policyId: string;
  items: FrozenLine[];
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
}
export type FrozenSnapshot = LegacyFrozenSnapshot | QuoteSnapshot;
interface ReservationBinding {
  attemptId: string;
  snapshotSha256: string;
}
export interface ReservationPort {
  /** Must atomically reserve these exact quantities across online/offline sales.
   * Idempotency is attemptId; verification guarantees this hold through expiresAt.
   * No production adapter exists yet. Never implement this using catalogue booleans. */
  reserve(input: ReservationBinding & { snapshot: FrozenSnapshot }): Promise<
    ReservationBinding & {
      reservationId: string;
      verified: boolean;
      expiresAt: Date;
    }
  >;
  verify(
    input: ReservationBinding & { reservationId: string },
  ): Promise<boolean>;
  /** Best-effort early release of a hold the buyer has abandoned. Callers must
   * quarantine the attempt when this fails; the hold otherwise lapses at expiresAt. */
  release?(
    input: ReservationBinding & { reservationId: string },
  ): Promise<boolean>;
}
import { OrderFlowError } from "./errors.js";
import { sellablePolicy } from "./eligibility.js";
export { OrderFlowError } from "./errors.js";
import { resolveCatalogueBindings, sameCatalogueBindings, storedCatalogueBindings, revalidateCatalogueBindings } from "./catalogue-bindings.js";
interface Options {
  /** A stable server-side merchant + environment identity matching this gateway. */
  merchantScope: string;
  gateway: ReturnType<typeof createRazorpayGateway>;
  reservations?: ReservationPort;
  /** Trusted synchronous policy; charges are added to the stored line subtotal. */
  quote?(items: ReadonlyArray<Readonly<FrozenLine>>): {
    shippingPaise: number;
    taxPaise: number;
    policyId: string;
  };
  /** Configured tenant for persisted Keeri catalogue identities; required with quoteAuthority. */
  keeriTenantId?: string;
  quoteAuthority?(request: QuoteRequest): Promise<unknown>;
  now?: () => Date;
}
/** Stocked carries no lead time; made to order always carries one. */
function consistentFulfilment(f: QuoteSnapshot["items"][number]["fulfilment"]) {
  return f !== undefined && (f.kind === "stocked" ? f.leadTimeDays === null : f.leadTimeDays !== null);
}
const hash = (input: string) =>
  createHash("sha256").update(input).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function validAmount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}
function retryable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}
async function transaction<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await db.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (retryable(error) && retry < 3) continue;
      throw error;
    }
  }
}

/** Callable server foundation only: no routes, background delivery, environment reads or live configuration. */
export function createOrderService(db: PrismaClient, options: Options) {
  const { gateway, reservations, quote, merchantScope } = options;
  const now = options.now ?? (() => new Date());
  if (
    !/^[A-Za-z0-9:_-]{1,128}$/.test(merchantScope) ||
    (options.quoteAuthority && !/^[A-Za-z0-9_-]{1,64}$/.test(options.keeriTenantId ?? "")) ||
    (typeof quote !== "function" &&
      typeof options.quoteAuthority !== "function")
  )
    throw new OrderFlowError("INVALID_CONFIGURATION");

  async function guestCart(tx: Prisma.TransactionClient, cartToken: string) {
    if (typeof cartToken !== "string" || !/^[a-f0-9]{64}$/.test(cartToken))
      throw new OrderFlowError("CART_NOT_FOUND");
    const cart = await tx.cart.findFirst({
      where: { tokenHash: hash(cartToken), expiresAt: { gt: now() } },
    });
    if (!cart) throw new OrderFlowError("CART_NOT_FOUND");
    return cart;
  }
  /** A cart with a payable provider order or an in-flight hold must not be quoted
   * again: a refresh or second tab would otherwise pay twice for the same goods. */
  async function assertNoPayableAttempt(tx: Prisma.TransactionClient, cartId: string) {
    const payable = await tx.checkoutAttempt.findFirst({
      where: {
        cartId,
        merchantScope,
        OR: [
          { state: { in: ["reserving", "creating_provider_order", "releasing"] } },
          { state: "awaiting_payment", reservationExpiresAt: { gt: now() } },
        ],
      },
      select: { id: true },
    });
    if (payable) throw new OrderFlowError("CHECKOUT_IN_PROGRESS");
  }
  async function freezeCart(
    cartToken: string,
    idempotencyKey: string,
    checkoutInput?: unknown,
  ) {
    if (
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)
    )
      throw new OrderFlowError("INVALID_IDEMPOTENCY_KEY");
    if (options.quoteAuthority)
      return freezeQuotedCart(cartToken, idempotencyKey, checkoutInput);
    // Unique-key conflicts can happen before PostgreSQL reports a serialization conflict.
    for (let retry = 0; ; retry++) {
      try {
        return await transaction(db, async (tx) => {
          const cart = await guestCart(tx, cartToken);
          const existing = await tx.checkoutAttempt.findUnique({
            where: {
              cartId_idempotencyKey: { cartId: cart.id, idempotencyKey },
            },
          });
          if (existing) {
            if (existing.merchantScope !== merchantScope)
              throw new OrderFlowError("ATTEMPT_NOT_FOUND");
            return existing;
          }
          await assertNoPayableAttempt(tx, cart.id);
          const rows = await tx.cartItem.findMany({
            where: { cartId: cart.id },
            include: { variant: { include: { product: true } } },
            orderBy: { variantId: "asc" },
          });
          if (rows.length === 0) throw new OrderFlowError("EMPTY_CART");
          if (rows.length > 50) throw new OrderFlowError("INVALID_CART");
          const items = rows.map(({ variant: v, quantity }): FrozenLine => {
            if (
              !v.published ||
              !v.product.published ||
              !v.available ||
              v.stockPolicy !== "stocked"
            )
              throw new OrderFlowError("RESERVATION_NOT_ELIGIBLE");
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
              throw new OrderFlowError("INVALID_CART");
            if (v.pricePaise === null) throw new OrderFlowError("INVALID_TOTAL");
            const lineTotalPaise = quantity * v.pricePaise;
            if (!validAmount(v.pricePaise) || !validAmount(lineTotalPaise))
              throw new OrderFlowError("INVALID_TOTAL");
            return {
              variantId: v.id,
              productId: v.productId,
              title: v.product.title,
              variantTitle: v.title,
              sku: v.sku,
              quantity,
              unitPricePaise: v.pricePaise,
              lineTotalPaise,
            };
          });
          const charges = quote!(
            items.map((item) => Object.freeze({ ...item })),
          );
          const subtotalPaise = items.reduce(
            (sum, item) => sum + item.lineTotalPaise,
            0,
          );
          const amountPaise =
            subtotalPaise + charges.shippingPaise + charges.taxPaise;
          if (
            ![
              subtotalPaise,
              charges.shippingPaise,
              charges.taxPaise,
              amountPaise,
            ].every(validAmount) ||
            amountPaise < 100 ||
            typeof charges.policyId !== "string" ||
            charges.policyId.length < 1 ||
            charges.policyId.length > 128
          )
            throw new OrderFlowError("INVALID_TOTAL");
          const snapshot: FrozenSnapshot = {
            version: 1,
            currency: "INR",
            policyId: charges.policyId,
            items,
            subtotalPaise,
            shippingPaise: charges.shippingPaise,
            taxPaise: charges.taxPaise,
          };
          const id = randomUUID();
          return tx.checkoutAttempt.create({
            data: {
              id,
              cartId: cart.id,
              merchantScope,
              idempotencyKey,
              receipt: `sm_${id.replaceAll("-", "")}`,
              snapshot: snapshot as unknown as Prisma.InputJsonObject,
              amountPaise,
              currency: "INR",
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          retry < 3
        )
          continue;
        throw error;
      }
    }
  }
  async function freezeQuotedCart(
    cartToken: string,
    idempotencyKey: string,
    raw: unknown,
  ) {
    const input = checkoutInputSchema.parse(raw);
    async function readCart(tx: Prisma.TransactionClient) {
      const cart = await guestCart(tx, cartToken);
      const rows = await tx.cartItem.findMany({
        where: { cartId: cart.id },
        include: { variant: { include: { product: true } } },
        orderBy: { variantId: "asc" },
      });
      if (!rows.length || rows.length > 50)
        throw new OrderFlowError("INVALID_CART");
      if (
        rows.some(
          ({ quantity, variant: v }) =>
            !v.published ||
            !v.product.published ||
            !v.available ||
            !sellablePolicy(v.stockPolicy) ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 20,
        )
      )
        throw new OrderFlowError("RESERVATION_NOT_ELIGIBLE");
      const bindings = await resolveCatalogueBindings(tx, rows.map((r) => r.variantId), options.keeriTenantId!);
      const items = rows
        .map((r) => ({ variantId: bindings.items.find((b) => b.localVariantId === r.variantId)!.sourceVariantId, quantity: r.quantity }))
        .sort((a, b) => a.variantId.localeCompare(b.variantId));
      return { cart, rows, bindings, request: { version: 2 as const, items, ...input } };
    }
    function snapshotRequest(s: QuoteSnapshot) {
      return {
        version: 2,
        items: s.items
          .map(({ variantId, quantity }) => ({ variantId, quantity }))
          .sort((a, b) => a.variantId.localeCompare(b.variantId)),
        customer: s.customer,
        billingAddress: s.billingAddress,
        shippingAddress: s.shippingAddress,
        deliveryMethodId: s.deliveryMethodId,
      };
    }
    async function replay(
      tx: Prisma.TransactionClient,
      current: Awaited<ReturnType<typeof readCart>>,
    ) {
      const existing = await tx.checkoutAttempt.findUnique({
        where: {
          cartId_idempotencyKey: { cartId: current.cart.id, idempotencyKey },
        },
      });
      if (!existing) return null;
      if (existing.merchantScope !== merchantScope)
        throw new OrderFlowError("ATTEMPT_NOT_FOUND");
      const parsed = quoteResponseSchema.shape.snapshot.safeParse(
        existing.snapshot,
      );
      if (!parsed.success) throw new OrderFlowError("CHECKOUT_INPUT_CHANGED");
      const frozenBindings = storedCatalogueBindings(existing.catalogueBindings, options.keeriTenantId!, parsed.data);
      if (!sameCatalogueBindings(frozenBindings, current.bindings))
        throw new OrderFlowError("CATALOGUE_BINDING_CHANGED");
      if (
        canonical(snapshotRequest(parsed.data)) !== canonical(current.request)
      )
        throw new OrderFlowError("CHECKOUT_INPUT_CHANGED");
      return existing;
    }
    const { initial, existing } = await transaction(db, async (tx) => {
      const initial = await readCart(tx);
      const found = await replay(tx, initial);
      if (!found) await assertNoPayableAttempt(tx, initial.cart.id);
      return { initial, existing: found };
    });
    if (existing) return existing;
    // Fetch before opening a transaction, then revalidate the cart under serializable isolation.
    const response = quoteResponseSchema.safeParse(
      await options.quoteAuthority!(structuredClone(initial.request)),
    );
    if (!response.success) throw new OrderFlowError("QUOTE_INVALID");
    const q = response.data,
      s = q.snapshot;
    if (
      q.quoteId !== s.quoteId ||
      q.expiresAt !== s.expiresAt ||
      Date.parse(s.expiresAt) <= now().getTime() ||
      q.snapshotSha256 !== hash(canonical(s)) ||
      canonical(snapshotRequest(s)) !== canonical(initial.request) ||
      new Set(s.items.map((i) => i.variantId)).size !== s.items.length ||
      s.items.some(
        (i) =>
          i.lineTotalPaise !== i.unitPricePaise * i.quantity ||
          initial.bindings.items.find((b) => b.sourceVariantId === i.variantId)
            ?.sourceProductId !== i.productId,
      ) ||
      s.subtotalPaise !== s.items.reduce((n, i) => n + i.lineTotalPaise, 0) ||
      s.totalPaise !==
        s.subtotalPaise +
          s.shippingPaise +
          (s.gstMode === "excluded" ? s.taxPaise : 0) ||
      s.items.some((i) => !consistentFulfilment(i.fulfilment))
    )
      throw new OrderFlowError("QUOTE_INVALID");
    // The owner's rule: only a delivery charge Shiprocket priced may be paid. A
    // policy amount (fallback or otherwise) is refused, never charged.
    if (s.delivery?.source !== "carrier" || !s.delivery.carrier)
      throw new OrderFlowError("DELIVERY_UNPRICED");
    for (let retry = 0; ; retry++) {
      try {
        return await transaction(db, async (tx) => {
          await revalidateCatalogueBindings(tx, initial.bindings);
          const current = await readCart(tx);
          if (!sameCatalogueBindings(initial.bindings, current.bindings))
            throw new OrderFlowError("CATALOGUE_BINDING_CHANGED");
          if (
            canonical(current.request) !== canonical(initial.request) ||
            current.cart.id !== initial.cart.id
          )
            throw new OrderFlowError("CHECKOUT_INPUT_CHANGED");
          const found = await replay(tx, current);
          if (found) return found;
          await assertNoPayableAttempt(tx, current.cart.id);
          if (Date.parse(s.expiresAt) <= now().getTime())
            throw new OrderFlowError("QUOTE_EXPIRED");
          const id = randomUUID();
          return tx.checkoutAttempt.create({
            data: {
              id,
              cartId: current.cart.id,
              merchantScope,
              idempotencyKey,
              receipt: `sm_${id.replaceAll("-", "")}`,
              snapshot: s as unknown as Prisma.InputJsonObject,
              catalogueBindings: initial.bindings as unknown as Prisma.InputJsonObject,
              amountPaise: s.totalPaise,
              currency: "INR",
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          retry < 3
        )
          continue;
        throw error;
      }
    }
  }
  async function ownedAttempt(cartToken: string, attemptId: string) {
    const cart = await guestCart(db, cartToken);
    const attempt = await db.checkoutAttempt.findFirst({
      where: { id: attemptId, cartId: cart.id, merchantScope },
    });
    if (!attempt) throw new OrderFlowError("ATTEMPT_NOT_FOUND");
    return attempt;
  }
  async function createProviderOrder(cartToken: string, attemptId: string) {
    const attempt = await ownedAttempt(cartToken, attemptId);
    if (["awaiting_payment", "captured"].includes(attempt.state))
      return attempt;
    if (attempt.state !== "reservation_required")
      throw new OrderFlowError("ATTEMPT_REQUIRES_RECONCILIATION");
    if (!reservations) throw new OrderFlowError("RESERVATION_REQUIRED");
    const snapshot = attempt.snapshot as unknown as FrozenSnapshot;
    const frozenBindings = snapshot.version === 2
      ? storedCatalogueBindings(attempt.catalogueBindings, options.keeriTenantId ?? "", snapshot)
      : null;
    async function eligible(tx: Prisma.TransactionClient) {
      if (frozenBindings) {
        await revalidateCatalogueBindings(tx, frozenBindings);
      } else {
        const variants = await tx.variant.findMany({
          where: { id: { in: snapshot.items.map((item) => item.variantId) } },
          include: { product: true },
        });
        if (variants.length !== snapshot.items.length || variants.some((v) =>
          !v.published || !v.product.published || !v.available || v.stockPolicy !== "stocked"))
          throw new OrderFlowError("RESERVATION_NOT_ELIGIBLE");
      }
      if (snapshot.version === 2 && Date.parse(snapshot.expiresAt) <= now().getTime())
        throw new OrderFlowError("QUOTE_EXPIRED");
    }
    await transaction(db, async (tx) => {
      await eligible(tx);
      const claim = await tx.checkoutAttempt.updateMany({
        where: { id: attempt.id, merchantScope, state: "reservation_required" },
        data: { state: "reserving" },
      });
      if (claim.count !== 1)
        throw new OrderFlowError("ATTEMPT_REQUIRES_RECONCILIATION");
    });
    const snapshotSha256 = hash(canonical(snapshot));
    let reservation: Awaited<ReturnType<ReservationPort["reserve"]>>;
    try {
      reservation = await reservations.reserve({
        attemptId: attempt.id,
        snapshotSha256,
        snapshot: structuredClone(snapshot),
      });
      if (
        !reservation.verified ||
        reservation.attemptId !== attempt.id ||
        reservation.snapshotSha256 !== snapshotSha256 ||
        typeof reservation.reservationId !== "string" ||
        !/^[A-Za-z0-9:_-]{1,200}$/.test(reservation.reservationId) ||
        !(reservation.expiresAt instanceof Date) ||
        !(reservation.expiresAt.getTime() > now().getTime())
      )
        throw new OrderFlowError("RESERVATION_INVALID");
      // Persist the durable guarantee BEFORE initiating an irreversible provider POST.
      await transaction(db, async (tx) => {
        await eligible(tx);
        await tx.checkoutAttempt.update({
          where: { id: attempt.id },
          data: {
            reservationId: reservation.reservationId,
            reservationExpiresAt: reservation.expiresAt,
            state: "creating_provider_order",
          },
        });
      });
    } catch (error) {
      const code =
        error instanceof OrderFlowError ? error.code : "RESERVATION_UNCERTAIN";
      await db.checkoutAttempt.update({
        where: { id: attempt.id },
        data: { state: "reconciliation_required", failureCode: code },
      });
      throw new OrderFlowError(code);
    }
    try {
      const provider = await gateway.createOrder({
        amountPaise: attempt.amountPaise,
        currency: "INR",
        receipt: attempt.receipt,
      });
      return await db.checkoutAttempt.update({
        where: { id: attempt.id },
        data: {
          providerOrderId: provider.orderId,
          state: "awaiting_payment",
          failureCode: null,
        },
      });
    } catch {
      // Includes a lost DB write after a successful provider POST. No automatic retries.
      await db.checkoutAttempt.update({
        where: { id: attempt.id },
        data: {
          state: "reconciliation_required",
          failureCode: "PROVIDER_CREATION_UNCERTAIN",
        },
      });
      // The buyer was never offered this order, so free the stock now rather than at expiry.
      // The attempt already requires reconciliation; a failed release changes nothing further.
      await releaseHold({
        attemptId: attempt.id,
        reservationId: reservation.reservationId,
        snapshotSha256,
      }).catch(() => false);
      throw new OrderFlowError("PROVIDER_CREATION_UNCERTAIN");
    }
  }
  async function releaseHold(input: ReservationBinding & { reservationId: string }) {
    if (!reservations?.release) return false;
    return reservations.release(input);
  }
  /** The buyer walked away from a payable attempt (edited details, re-quoted or
   * abandoned the provider window). Free the hold; an uncertain release is quarantined. */
  async function releaseAttempt(cartToken: string, attemptId: string) {
    const attempt = await ownedAttempt(cartToken, attemptId);
    if (attempt.state === "abandoned") return attempt;
    if (attempt.state === "reservation_required")
      return db.checkoutAttempt.update({ where: { id: attempt.id }, data: { state: "abandoned" } });
    if (attempt.state !== "awaiting_payment")
      throw new OrderFlowError("ATTEMPT_REQUIRES_RECONCILIATION");
    // Claim first: a payment that lands while the hold is being released is then
    // routed to reconciliation by the worker instead of being accepted silently.
    const claim = await db.checkoutAttempt.updateMany({
      where: { id: attempt.id, merchantScope, state: "awaiting_payment" },
      data: { state: "releasing" },
    });
    if (claim.count !== 1) throw new OrderFlowError("ATTEMPT_REQUIRES_RECONCILIATION");
    let released = false;
    try {
      released = !attempt.reservationId || (await releaseHold(binding(attempt)));
    } catch {
      released = false;
    }
    const updated = await db.checkoutAttempt.update({
      where: { id: attempt.id },
      data: released
        ? { state: "abandoned", failureCode: null }
        : { state: "reconciliation_required", failureCode: "RELEASE_UNCERTAIN" },
    });
    if (!released) throw new OrderFlowError("RELEASE_UNCERTAIN");
    return updated;
  }
  async function ingestWebhook(
    rawBody: Buffer,
    signature: string,
    eventId: string,
  ) {
    const authenticated = gateway.authenticateWebhook(
      rawBody,
      signature,
      eventId,
    );
    async function existing() {
      const sameId = await db.paymentWebhookInbox.findUnique({
        where: { merchantScope_eventId: { merchantScope, eventId } },
      });
      if (sameId) {
        if (sameId.bodySha256 !== authenticated.bodySha256)
          throw new OrderFlowError("WEBHOOK_ID_COLLISION");
        return sameId;
      }
      return db.paymentWebhookInbox.findUnique({
        where: {
          merchantScope_bodySha256: {
            merchantScope,
            bodySha256: authenticated.bodySha256,
          },
        },
      });
    }
    const found = await existing();
    if (found) return found;
    try {
      return await db.paymentWebhookInbox.create({
        data: {
          merchantScope,
          eventId,
          bodySha256: authenticated.bodySha256,
          eventType: authenticated.eventType,
          providerOrderId: authenticated.orderId,
          paymentId: authenticated.paymentId,
          state: authenticated.paymentId ? "pending" : "ignored",
          processedAt: authenticated.paymentId ? null : now(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const duplicate = await existing();
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }
  function binding(attempt: CheckoutAttempt) {
    return {
      attemptId: attempt.id,
      reservationId: attempt.reservationId!,
      snapshotSha256: hash(canonical(attempt.snapshot)),
    };
  }
  type WorkerClaim = { leaseToken: string };
  function assertLease(
    inbox: { leaseToken: string | null; leaseExpiresAt: Date | null },
    claim?: WorkerClaim,
  ) {
    if (claim) {
      if (
        inbox.leaseToken !== claim.leaseToken ||
        !inbox.leaseExpiresAt ||
        inbox.leaseExpiresAt <= now()
      )
        throw new OrderFlowError("WORKER_LEASE_LOST");
    } else if (inbox.leaseToken !== null)
      throw new OrderFlowError("WORKER_LEASE_REQUIRED");
  }
  const leaseWhere = (claim?: WorkerClaim) =>
    claim
      ? { leaseToken: claim.leaseToken, leaseExpiresAt: { gt: now() } }
      : { leaseToken: null };
  async function reconcile(
    inboxId: string,
    failureCode: string,
    claim?: WorkerClaim,
  ) {
    // A delayed failing worker cannot undo a concurrent successful worker's completion.
    await db.paymentWebhookInbox.updateMany({
      where: {
        id: inboxId,
        merchantScope,
        ...leaseWhere(claim),
        state: { in: ["pending", "reconciliation_required"] },
      },
      data: { state: "reconciliation_required", failureCode },
    });
    const current = await db.paymentWebhookInbox.findUniqueOrThrow({
      where: { id: inboxId },
    });
    assertLease(current, claim);
    return current;
  }
  async function processWebhook(inboxId: string, claim?: WorkerClaim) {
    const inbox = await db.paymentWebhookInbox.findFirst({
      where: { id: inboxId, merchantScope },
    });
    if (!inbox) throw new OrderFlowError("WEBHOOK_NOT_FOUND");
    assertLease(inbox, claim);
    if (["processed", "ignored"].includes(inbox.state)) return inbox;
    const attempt = await db.checkoutAttempt.findFirst({
      where: { providerOrderId: inbox.providerOrderId, merchantScope },
    });
    if (!attempt || !inbox.providerOrderId || !inbox.paymentId)
      return reconcile(inboxId, "UNKNOWN_PROVIDER_ORDER", claim);
    if (attempt.state === "captured" && attempt.paymentId !== inbox.paymentId)
      return reconcile(inboxId, "PAYMENT_ID_CONFLICT", claim);
    if (!["awaiting_payment", "captured"].includes(attempt.state))
      return reconcile(inboxId, "ORDER_STATE_REQUIRES_RECONCILIATION", claim);
    if (attempt.state !== "captured") {
      if (
        !reservations ||
        !attempt.reservationId ||
        !attempt.reservationExpiresAt ||
        attempt.reservationExpiresAt <= now()
      )
        return reconcile(inboxId, "RESERVATION_EXPIRED_OR_UNAVAILABLE", claim);
      try {
        if (!(await reservations.verify(binding(attempt))))
          return reconcile(inboxId, "RESERVATION_INVALID", claim);
      } catch {
        return reconcile(inboxId, "RESERVATION_UNCERTAIN", claim);
      }
    }
    try {
      // Event data is only a lookup hint. Persisted money and a fresh authenticated fetch authorize capture.
      await gateway.verifyCapturedPayment(
        {
          orderId: inbox.providerOrderId,
          amountPaise: attempt.amountPaise,
          currency: "INR",
        },
        inbox.paymentId,
      );
    } catch (error) {
      return reconcile(
        inboxId,
        error instanceof PaymentGatewayError
          ? error.code
          : "PAYMENT_VERIFICATION_UNAVAILABLE",
        claim,
      );
    }
    try {
      return await transaction(db, async (tx) => {
        const currentInbox = await tx.paymentWebhookInbox.findUniqueOrThrow({
          where: { id: inboxId },
        });
        assertLease(currentInbox, claim);
        if (currentInbox.state === "processed") return currentInbox;
        const current = await tx.checkoutAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        });
        const finish = async (
          state: string,
          failureCode: string | null = null,
        ) => {
          const updated = await tx.paymentWebhookInbox.updateMany({
            where: { id: inboxId, merchantScope, ...leaseWhere(claim) },
            data: {
              state,
              failureCode,
              ...(state === "processed" ? { processedAt: now() } : {}),
            },
          });
          if (updated.count !== 1)
            throw new OrderFlowError(
              claim ? "WORKER_LEASE_LOST" : "WORKER_LEASE_REQUIRED",
            );
          return tx.paymentWebhookInbox.findUniqueOrThrow({
            where: { id: inboxId },
          });
        };
        if (current.state === "captured") {
          return current.paymentId === inbox.paymentId
            ? finish("processed")
            : finish("reconciliation_required", "PAYMENT_ID_CONFLICT");
        }
        if (current.state !== "awaiting_payment")
          return finish(
            "reconciliation_required",
            "ORDER_STATE_REQUIRES_RECONCILIATION",
          );
        if (
          !current.reservationExpiresAt ||
          current.reservationExpiresAt <= now() ||
          current.reservationId !== attempt.reservationId
        )
          return finish(
            "reconciliation_required",
            "RESERVATION_EXPIRED_OR_UNAVAILABLE",
          );
        await tx.checkoutAttempt.update({
          where: { id: current.id },
          data: {
            state: "captured",
            paymentId: inbox.paymentId,
            capturedAt: now(),
            failureCode: null,
          },
        });
        // Paid goods leave the cart in the same transaction, so a refresh or a
        // second tab cannot quote and pay for them again.
        await tx.cartItem.deleteMany({ where: { cartId: current.cartId } });
        await tx.cart.updateMany({
          where: { id: current.cartId },
          data: { revision: { increment: 1 } },
        });
        await tx.orderOutbox.create({
          data: {
            attemptId: current.id,
            kind: `keeri.order.captured.v${(current.snapshot as unknown as FrozenSnapshot).version}`,
            payload: {
              version: (current.snapshot as unknown as FrozenSnapshot).version,
              attemptId: current.id,
              merchantScope,
              providerOrderId: current.providerOrderId,
              paymentId: inbox.paymentId,
              amountPaise: current.amountPaise,
              currency: current.currency,
              reservationId: current.reservationId,
              snapshot: current.snapshot,
            },
          },
        });
        return finish("processed");
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return reconcile(inboxId, "PAYMENT_ID_CONFLICT", claim);
      // Operational database failure propagates: the transaction rolls back, leaving the inbox retryable.
      throw error;
    }
  }
  async function getAttempt(cartToken: string, attemptId: string) {
    const attempt = await ownedAttempt(cartToken, attemptId);
    if ((attempt.snapshot as unknown as FrozenSnapshot).version !== 2)
      return attempt;
    const outbox = await db.orderOutbox.findUnique({
      where: {
        attemptId_kind: {
          attemptId: attempt.id,
          kind: "keeri.order.captured.v2",
        },
      },
    });
    const confirmed =
      attempt.state === "captured" &&
      outbox?.state === "delivered" &&
      Boolean(outbox.externalOrderId);
    return {
      ...attempt,
      fulfillmentStatus: confirmed
        ? "confirmed"
        : outbox?.state === "failed" ||
            attempt.state === "reconciliation_required"
          ? "review_required"
          : "pending",
      orderReference: confirmed ? outbox!.externalOrderId : null,
    };
  }
  return {
    freezeCart,
    getAttempt,
    createProviderOrder,
    releaseAttempt,
    ingestWebhook,
    processWebhook,
  };
}
