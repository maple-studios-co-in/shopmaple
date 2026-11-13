import { randomUUID } from "node:crypto";
import { Prisma, type Customer, type CustomerAddress, type PrismaClient } from "@prisma/client";
import { quoteSnapshotSchema } from "@shopmaple/contracts";
import {
  accountEmailSchema,
  accountNameSchema,
  accountPasswordSchema,
  accountProfileUpdateSchema,
  addressInputSchema,
  addressUpdateSchema,
  maxAddresses,
  parseOrderNumber,
  passwordSignInRequestSchema,
  signInCodeSchema,
  signInCodeTtlMinutes,
  signInMaxAttempts,
  signInStartRequestSchema,
  type AccountAddress,
  type AccountCustomer,
  type AccountOverview,
  type AddressMutationResponse,
  type OrderDetail,
  type OrderSummary,
} from "@shopmaple/contracts/account";
import { z } from "zod";
import { HttpError } from "../cart.js";
import type { SignInCodeMessage } from "./config.js";
import { paidOrderStates, toOrderDetail, toOrderSummary, type OrderImages, type PaidOrder } from "./orders.js";
import { loadOrderProgress } from "../orders/keeri-events.js";
import { variantPhoto } from "../variant-photo.js";
import {
  generateSignInCode,
  hashNetwork,
  hashPassword,
  hashSignInCode,
  newSessionToken,
  sameCodeHash,
  sessionLifetimeMs,
  sessionTokenHash,
  signInLimitHit,
  signInLimits,
  signInLimitWindows,
  signInNonceHash,
  verifyPassword,
  verifyRefusal,
} from "./security.js";

/**
 * Customer accounts over the database (owner's spec, 10 Nov 2026; security review, 11 Nov), after the staff auth
 * module's pattern: hashed credentials, constant-time comparison, limits counted in PostgreSQL rather than in one
 * process's memory, and a 404 for anything that is not the signed-in customer's own.
 */
export interface AccountServiceOptions {
  /** ACCOUNT_CODE_SECRET: keys the code and network hashes. */
  codeSecret: string;
  /** Only this merchant scope's orders, when set (KEERI_MERCHANT_SCOPE). */
  merchantScope?: string;
  now?: () => Date;
  /** Where the store-wide cap line goes (default console.error). It never carries personal data. */
  log?: (line: string) => void;
}
type Tx = Prisma.TransactionClient;
/** Sign-in start: the client's network and the browser's sign-in cookie, before and after this request. */
export type SignInStartContext = { network: string; previousNonce: string | null; nonce: string };
/** Sign-in verify: the browser's session (to rotate) and sign-in cookie, and its network. */
export type SignInVerifyContext = { previousToken: string | null; nonce: string | null; network: string };
/** Password sign-in: the browser's session (to rotate) and its network. */
export type PasswordSignInContext = { previousToken: string | null; network: string };
type VerifyOutcome = { kind: "invalid" | "expired" | "too_many" } | { kind: "signed_in"; customer: Customer };

export const accountAuthRequired = () => new HttpError(401, "ACCOUNT_AUTH_REQUIRED", "Sign in to see your account.");
const codeInvalid = () => new HttpError(400, "CODE_INVALID", "That code isn't right. Check it, or ask for a new one.");
const codeExpired = () => new HttpError(400, "CODE_EXPIRED", "That code has expired. Ask for a new one.");
const tooManyAttempts = () => new HttpError(400, "TOO_MANY_ATTEMPTS", "Too many tries. Ask for a new code, or try again later.");
const tooManyPasswords = () =>
  new HttpError(400, "TOO_MANY_ATTEMPTS", "Too many tries. Reset your password with an emailed code, or try again later.");
const credentialsInvalid = () =>
  new HttpError(400, "CREDENTIALS_INVALID", "That email and password don't match. Try again, or reset your password.");
const orderNotFound = () => new HttpError(404, "ORDER_NOT_FOUND", "We couldn't find that order.");
const addressNotFound = () => new HttpError(404, "ADDRESS_NOT_FOUND", "We couldn't find that address.");
const addressLimit = () => new HttpError(409, "ADDRESS_LIMIT", `You can keep up to ${maxAddresses} addresses. Delete one to add another.`);

/** Advisory-lock class for sign-in (7701 was the retired store CRM's). Start locks the email key, then the network; verify
 * locks "verify:" plus the email key. */
const signInLockClass = 7702;
const retentionMs = 2 * 24 * 60 * 60_000;
const lastSeenGranularityMs = 15 * 60_000;
/** The one line staff can alert on when the store-wide cap is reached. No personal data. */
export const storeCapLogLine =
  "[accounts] sign-in email cap reached: 300 codes in the past hour; new codes are held back until the count falls";
const verifyBody = z.object({ email: z.unknown(), code: z.unknown(), password: z.unknown().optional(), name: z.unknown().optional() }).strict();
// The catalogue identities frozen with the quote: the snapshot's Keeri variant id → the local variant (for its photo).
const frozenBindings = z.object({ items: z.array(z.object({ localVariantId: z.string(), sourceVariantId: z.string() })) });
const orderSelect = {
  id: true, orderNumber: true, state: true, capturedAt: true, paymentId: true, snapshot: true, catalogueBindings: true,
} satisfies Prisma.CheckoutAttemptSelect;
type OrderRow = Prisma.CheckoutAttemptGetPayload<{ select: typeof orderSelect }>;
const newestFirst = [{ capturedAt: "desc" }, { orderNumber: "desc" }] satisfies Prisma.CheckoutAttemptOrderByWithRelationInput[];
const addressOrder = [{ isDefault: "desc" }, { updatedAt: "desc" }, { id: "asc" }] satisfies Prisma.CustomerAddressOrderByWithRelationInput[];

/** PostgreSQL's lock_not_available (55P03): a wait that `SET LOCAL lock_timeout` cut short. */
function lockTimedOut(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError)) return false;
  const meta = error instanceof Prisma.PrismaClientKnownRequestError ? JSON.stringify(error.meta ?? {}) : "";
  return /55P03|lock timeout/i.test(`${meta} ${error.message}`);
}

export const publicCustomer = (customer: Customer): AccountCustomer => ({ name: customer.name, email: customer.emailKey, phone: customer.phone });
const publicAddress = (address: CustomerAddress): AccountAddress => ({
  id: address.id, label: address.label ?? "", name: address.name, line1: address.line1, line2: address.line2 ?? "", city: address.city,
  state: address.state, pin: address.pin, phone: address.phone, isDefault: address.isDefault,
});

export function createAccountService(db: PrismaClient, options: AccountServiceOptions) {
  const now = options.now ?? (() => new Date());
  const secret = options.codeSecret;
  const log = options.log ?? ((line: string) => console.error(line));
  let storeCapHour = -1;
  /** At most one line per clock hour per process, however many starts meet the cap. */
  function noteStoreCap(at: Date) {
    const hour = Math.floor(at.getTime() / 3_600_000);
    if (hour === storeCapHour) return;
    storeCapHour = hour;
    log(storeCapLogLine);
  }

  /**
   * Issues a code when the limits allow and returns it for delivery; null otherwise. The caller answers 202 either way,
   * so a limit, a new address and an existing account all look the same from outside. The code is bound to the
   * browser's new sign-in cookie; asking again in the same browser voids that browser's earlier code only.
   */
  async function startSignIn(raw: unknown, context: SignInStartContext): Promise<SignInCodeMessage | null> {
    const { email, purpose = "sign-in" } = signInStartRequestSchema.parse(raw);
    const ipHash = hashNetwork(secret, context.network);
    // Rows older than the daily windows no longer count for anything.
    const stale = new Date(now().getTime() - retentionMs);
    await db.customerLoginChallenge.deleteMany({ where: { createdAt: { lt: stale } } });
    await db.customerSignInFailure.deleteMany({ where: { createdAt: { lt: stale } } });
    try {
      return await db.$transaction(async (tx) => {
        // Waiting on another start for this email or network holds a pooled connection: give up after two seconds.
        await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
        // One start at a time per email and per network, so two concurrent requests cannot both slip under a limit.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${signInLockClass}::int, hashtext(${"email:" + email}))::text`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${signInLockClass}::int, hashtext(${"network:" + ipHash}))::text`;
        // Read the clock under the lock, so one email's codes are created in time order.
        const at = now();
        const windows = signInLimitWindows(at);
        const limit = signInLimitHit({
          emailNetwork15m: await tx.customerLoginChallenge.count({ where: { emailKey: email, ipHash, createdAt: { gt: windows.email15m } } }),
          emailDay: await tx.customerLoginChallenge.count({ where: { emailKey: email, createdAt: { gt: windows.emailDay } } }),
          networkHour: await tx.customerLoginChallenge.count({ where: { ipHash, createdAt: { gt: windows.networkHour } } }),
          storeHour: await tx.customerLoginChallenge.count({ where: { createdAt: { gt: windows.networkHour } } }),
        });
        if (limit === "store") noteStoreCap(at);
        if (limit) return null;
        if (context.previousNonce)
          await tx.customerLoginChallenge.updateMany({
            where: { emailKey: email, nonceHash: signInNonceHash(context.previousNonce), usedAt: null, expiresAt: { gt: at } },
            data: { expiresAt: at },
          });
        const id = randomUUID();
        const code = generateSignInCode();
        await tx.customerLoginChallenge.create({
          data: {
            id, emailKey: email, codeHash: hashSignInCode(secret, id, email, code), ipHash, nonceHash: signInNonceHash(context.nonce),
            createdAt: at, expiresAt: new Date(at.getTime() + signInCodeTtlMinutes * 60_000),
          },
        });
        // Only the email's wording uses this (a sign-up for an address that already has a password says so there); the
        // answer to the browser never changes.
        const existing = await tx.customer.findUnique({ where: { emailKey: email }, select: { passwordHash: true } });
        return { challengeId: id, to: email, code, purpose, hasPassword: Boolean(existing?.passwordHash) };
      });
    } catch (error) {
      // Still the same 202 for the caller; nothing was issued.
      if (lockTimedOut(error)) return null;
      throw error;
    }
  }

  /**
   * Checks a code against the live code this browser asked for (email AND sign-in cookie), within the failed-try
   * budgets. Success consumes it, creates the account on first sign-in and rotates the browser's session; the caller
   * sets the returned token as the cookie and clears the sign-in cookie. With `password` (sign-up, or "Forgot
   * password?"), the proven email's account takes that password and every other session it had is signed out; `name`
   * fills an account that has none. Both are checked before the code, so a bad one never spends a try.
   */
  async function verifySignIn(raw: unknown, context: SignInVerifyContext) {
    const body = verifyBody.parse(raw);
    const email = accountEmailSchema.parse(body.email);
    const password = body.password === undefined ? undefined : accountPasswordSchema.parse(body.password);
    const name = body.name === undefined ? undefined : accountNameSchema.parse(body.name);
    const code = signInCodeSchema.safeParse(body.code);
    if (!code.success) throw codeInvalid();
    const ipHash = hashNetwork(secret, context.network);
    const at = now();
    const windows = signInLimitWindows(at);
    const networkFailures = await db.customerSignInFailure.count({ where: { ipHash, createdAt: { gt: windows.networkHour } } });
    if (verifyRefusal({ networkFailures, emailFailures: 0, codeTried: false })) throw tooManyAttempts();
    const fail = (client: Tx | PrismaClient, wrongCode: boolean) =>
      client.customerSignInFailure.create({ data: { emailKey: email, ipHash, wrongCode, createdAt: at } });
    if (!context.nonce) {
      await fail(db, false);
      throw codeInvalid();
    }
    const nonceHash = signInNonceHash(context.nonce);
    const token = newSessionToken();
    // A quarter-second of CPU, so it is done before the transaction rather than while holding its lock and connection.
    const passwordHash = password === undefined ? null : await hashPassword(password);
    let outcome: VerifyOutcome;
    try {
      outcome = await db.$transaction(async (tx): Promise<VerifyOutcome> => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
        // One verify at a time per email, so neither a code's five tries nor the email's budget can be raced.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${signInLockClass}::int, hashtext(${"verify:" + email}))::text`;
        const challenge = await tx.customerLoginChallenge.findFirst({
          where: { emailKey: email, nonceHash, usedAt: null, expiresAt: { gt: at } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (!challenge) {
          const latest = await tx.customerLoginChallenge.findFirst({
            where: { emailKey: email, nonceHash },
            orderBy: [{ createdAt: "desc" }, { expiresAt: "desc" }, { id: "desc" }],
          });
          await fail(tx, false);
          if (!latest || latest.usedAt) return { kind: "invalid" };
          return { kind: latest.attempts >= signInMaxAttempts ? "too_many" : "expired" };
        }
        if (challenge.attempts >= signInMaxAttempts) return { kind: "too_many" };
        const emailFailures = await tx.customerSignInFailure.count({ where: { emailKey: email, wrongCode: true, createdAt: { gt: windows.emailDay } } });
        if (verifyRefusal({ networkFailures, emailFailures, codeTried: challenge.attempts > 0 })) return { kind: "too_many" };
        const tried = await tx.customerLoginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
        if (!sameCodeHash(challenge.codeHash, hashSignInCode(secret, challenge.id, email, code.data))) {
          await fail(tx, true);
          return { kind: tried.attempts >= signInMaxAttempts ? "too_many" : "invalid" };
        }
        await tx.customerLoginChallenge.update({ where: { id: challenge.id }, data: { usedAt: at } });
        const current = await tx.customer.findUnique({ where: { emailKey: email } });
        const passwordFields = passwordHash ? { passwordHash, passwordSetAt: at } : {};
        const nameFields = name && !current?.name ? { name } : {};
        const signedIn = await tx.customer.upsert({
          where: { emailKey: email },
          create: { emailKey: email, ...nameFields, ...passwordFields },
          update: { ...nameFields, ...passwordFields },
        });
        // The email is proven: its failed tries no longer count against it.
        await tx.customerSignInFailure.deleteMany({ where: { emailKey: email } });
        if (context.previousToken) await tx.customerSession.deleteMany({ where: { tokenHash: sessionTokenHash(context.previousToken) } });
        // A new password signs every other device out, in case the old one was known to someone else.
        if (passwordHash) await tx.customerSession.deleteMany({ where: { customerId: signedIn.id } });
        await tx.customerSession.deleteMany({ where: { customerId: signedIn.id, expiresAt: { lte: at } } });
        await tx.customerSession.create({
          data: { tokenHash: sessionTokenHash(token), customerId: signedIn.id, createdAt: at, lastSeenAt: at, expiresAt: new Date(at.getTime() + sessionLifetimeMs) },
        });
        return { kind: "signed_in", customer: signedIn };
      });
    } catch (error) {
      if (lockTimedOut(error)) throw tooManyAttempts();
      throw error;
    }
    if (outcome.kind !== "signed_in")
      throw outcome.kind === "expired" ? codeExpired() : outcome.kind === "too_many" ? tooManyAttempts() : codeInvalid();
    return { token, customer: publicCustomer(outcome.customer) };
  }

  /** The signed-in customer, or 401. An expired session is deleted on sight. */
  async function sessionCustomer(token: string | null) {
    if (!token) throw accountAuthRequired();
    const at = now();
    const session = await db.customerSession.findUnique({ where: { tokenHash: sessionTokenHash(token) }, include: { customer: true } });
    if (!session) throw accountAuthRequired();
    if (session.expiresAt <= at) {
      await db.customerSession.deleteMany({ where: { id: session.id } });
      throw accountAuthRequired();
    }
    if (at.getTime() - session.lastSeenAt.getTime() > lastSeenGranularityMs)
      await db.customerSession.updateMany({ where: { id: session.id }, data: { lastSeenAt: at } });
    return session.customer;
  }

  async function signOut(token: string | null) {
    if (token) await db.customerSession.deleteMany({ where: { tokenHash: sessionTokenHash(token) } });
  }

  /**
   * Email and password (Figma 392:1652). An unknown email, an account without a password and a wrong password get the
   * same answer after the same work. Failures share the code budgets: 20 from a network an hour, 10 for an email a day
   * (then "Forgot password?" still works: a fresh code always gets its first try). Success clears the email's failures
   * and rotates the browser's session.
   */
  async function passwordSignIn(raw: unknown, context: PasswordSignInContext) {
    const { email, password } = passwordSignInRequestSchema.parse(raw);
    const ipHash = hashNetwork(secret, context.network);
    const at = now();
    const windows = signInLimitWindows(at);
    const networkFailures = await db.customerSignInFailure.count({ where: { ipHash, createdAt: { gt: windows.networkHour } } });
    const emailFailures = await db.customerSignInFailure.count({ where: { emailKey: email, wrongCode: true, createdAt: { gt: windows.emailDay } } });
    if (networkFailures >= signInLimits.failedNetworkHour || emailFailures >= signInLimits.failedEmailDay) throw tooManyPasswords();
    const customer = await db.customer.findUnique({ where: { emailKey: email } });
    const matches = await verifyPassword(password, customer?.passwordHash ?? null);
    if (!customer || !matches) {
      await db.customerSignInFailure.create({ data: { emailKey: email, ipHash, wrongCode: true, createdAt: at } });
      throw credentialsInvalid();
    }
    const token = newSessionToken();
    await db.$transaction(async (tx) => {
      await tx.customerSignInFailure.deleteMany({ where: { emailKey: email } });
      if (context.previousToken) await tx.customerSession.deleteMany({ where: { tokenHash: sessionTokenHash(context.previousToken) } });
      await tx.customerSession.deleteMany({ where: { customerId: customer.id, expiresAt: { lte: at } } });
      await tx.customerSession.create({
        data: { tokenHash: sessionTokenHash(token), customerId: customer.id, createdAt: at, lastSeenAt: at, expiresAt: new Date(at.getTime() + sessionLifetimeMs) },
      });
    });
    return { token, customer: publicCustomer(customer) };
  }

  // ---- Orders -------------------------------------------------------------------------------------------------------

  const paidWhere = (customer: Customer, extra: Prisma.CheckoutAttemptWhereInput = {}): Prisma.CheckoutAttemptWhereInput => ({
    customerEmailKey: customer.emailKey,
    state: { in: [...paidOrderStates] },
    orderNumber: { not: null },
    capturedAt: { not: null },
    paymentId: { not: null },
    ...(options.merchantScope ? { merchantScope: options.merchantScope } : {}),
    ...extra,
  });

  /** Rows with their Keeri delivery outcome and a parsed snapshot; a row whose snapshot no longer parses is left out. */
  async function paidOrders(rows: OrderRow[]): Promise<Array<PaidOrder & { row: OrderRow }>> {
    if (!rows.length) return [];
    const outboxes = await db.orderOutbox.findMany({
      where: { attemptId: { in: rows.map((row) => row.id) }, kind: "keeri.order.captured.v2" },
      select: { attemptId: true, state: true, externalOrderId: true, deliveredAt: true },
    });
    const byAttempt = new Map(outboxes.map((outbox) => [outbox.attemptId, outbox]));
    // What Keeri has reported since accepting each order (status, delivery, cancellation, refund).
    const progress = await loadOrderProgress(db, options.merchantScope, outboxes.flatMap((outbox) => (outbox.externalOrderId ? [outbox.externalOrderId] : [])));
    return rows.flatMap((row) => {
      const snapshot = quoteSnapshotSchema.safeParse(row.snapshot);
      if (!snapshot.success || row.orderNumber === null || !row.capturedAt || !row.paymentId) return [];
      return [{ row, orderNumber: row.orderNumber, state: row.state, capturedAt: row.capturedAt, paymentId: row.paymentId,
        snapshot: snapshot.data, outbox: byAttempt.get(row.id) ?? null,
        progress: progress.get(byAttempt.get(row.id)?.externalOrderId ?? "") ?? null }];
    });
  }

  /**
   * Item photos from the catalogue, chosen by variantPhoto (variant-photo.ts) as the bag and the order emails choose
   * them; only for published products (the media route serves nothing else). Found through the bindings frozen with the
   * quote, else the variant's Keeri identity.
   */
  async function orderImages(orders: Array<PaidOrder & { row: OrderRow }>, firstOnly: boolean): Promise<OrderImages> {
    const local = new Map<string, string>();
    const unbound: string[] = [];
    for (const order of orders) {
      const bindings = frozenBindings.safeParse(order.row.catalogueBindings);
      for (const item of firstOnly ? order.snapshot.items.slice(0, 1) : order.snapshot.items) {
        const bound = bindings.success ? bindings.data.items.find((binding) => binding.sourceVariantId === item.variantId) : undefined;
        if (bound) local.set(item.variantId, bound.localVariantId);
        else unbound.push(item.variantId);
      }
    }
    if (unbound.length) {
      const identities = await db.variantSourceIdentity.findMany({
        where: { OR: unbound.map((externalId) => ({ source: externalId.split(":").slice(0, 2).join(":"), externalId })) },
        select: { externalId: true, variantId: true },
      });
      for (const identity of identities) local.set(identity.externalId, identity.variantId);
    }
    if (!local.size) return new Map();
    const variants = await db.variant.findMany({
      where: { id: { in: [...new Set(local.values())] } },
      select: { id: true, images: true, product: { select: { published: true, images: true } } },
    });
    const photos = new Map(variants.map((variant) => [variant.id, variantPhoto(variant)] as const));
    const images = new Map<string, string>();
    for (const [source, variantId] of local) {
      const photo = photos.get(variantId);
      if (photo) images.set(source, photo);
    }
    return images;
  }

  async function listOrders(customer: Customer): Promise<OrderSummary[]> {
    const orders = await paidOrders(await db.checkoutAttempt.findMany({ where: paidWhere(customer), orderBy: newestFirst, take: 200, select: orderSelect }));
    const images = await orderImages(orders, true);
    return orders.map((order) => toOrderSummary(order, images));
  }

  /** "MF-10482" or "10482". Anything that is not this customer's paid order is the same 404. */
  async function getOrder(customer: Customer, raw: string): Promise<OrderDetail> {
    const orderNumber = parseOrderNumber(raw);
    if (orderNumber === null) throw orderNotFound();
    const row = await db.checkoutAttempt.findFirst({ where: paidWhere(customer, { orderNumber }), select: orderSelect });
    const [order] = await paidOrders(row ? [row] : []);
    if (!order) throw orderNotFound();
    return toOrderDetail(order, await orderImages([order], false));
  }

  // ---- Account ------------------------------------------------------------------------------------------------------

  async function overview(customer: Customer): Promise<AccountOverview> {
    const where = paidWhere(customer);
    const orders = await db.checkoutAttempt.count({ where });
    const latestRow = await db.checkoutAttempt.findFirst({ where, orderBy: newestFirst, select: orderSelect });
    const [latest] = await paidOrders(latestRow ? [latestRow] : []);
    const addresses = await db.customerAddress.count({ where: { customerId: customer.id } });
    const defaultAddress = await db.customerAddress.findFirst({ where: { customerId: customer.id, isDefault: true } });
    return {
      customer: publicCustomer(customer),
      counts: { orders, addresses },
      latestOrder: latest ? toOrderSummary(latest, await orderImages([latest], true)) : null,
      defaultAddress: defaultAddress ? publicAddress(defaultAddress) : null,
    };
  }

  async function updateProfile(customer: Customer, raw: unknown) {
    const input = accountProfileUpdateSchema.parse(raw);
    const updated = await db.customer.update({
      where: { id: customer.id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}) },
    });
    return { customer: publicCustomer(updated) };
  }

  // ---- Addresses ----------------------------------------------------------------------------------------------------

  const listed = async (tx: Tx | PrismaClient, customerId: string) =>
    (await tx.customerAddress.findMany({ where: { customerId }, orderBy: addressOrder })).map(publicAddress);
  /** Address changes for one customer run one at a time, which keeps "at most ten" and "exactly one default" true. */
  const lockCustomer = (tx: Tx, customerId: string) => tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
  const addressId = (raw: string) => {
    const id = z.uuid().safeParse(raw);
    if (!id.success) throw addressNotFound();
    return id.data;
  };

  const listAddresses = (customer: Customer) => listed(db, customer.id);

  async function createAddress(customer: Customer, raw: unknown): Promise<AddressMutationResponse> {
    const input = addressInputSchema.parse(raw);
    return db.$transaction(async (tx) => {
      await lockCustomer(tx, customer.id);
      const count = await tx.customerAddress.count({ where: { customerId: customer.id } });
      if (count >= maxAddresses) throw addressLimit();
      const isDefault = count === 0 || input.isDefault === true;
      if (isDefault) await tx.customerAddress.updateMany({ where: { customerId: customer.id, isDefault: true }, data: { isDefault: false } });
      const address = await tx.customerAddress.create({
        data: {
          customerId: customer.id, label: input.label || null, name: input.name, line1: input.line1, line2: input.line2 || null, city: input.city,
          state: input.state, pin: input.pin, phone: input.phone, isDefault,
        },
      });
      return { address: publicAddress(address), addresses: await listed(tx, customer.id) };
    });
  }

  async function updateAddress(customer: Customer, rawId: string, raw: unknown): Promise<AddressMutationResponse> {
    const id = addressId(rawId);
    const input = addressUpdateSchema.parse(raw);
    return db.$transaction(async (tx) => {
      await lockCustomer(tx, customer.id);
      const existing = await tx.customerAddress.findFirst({ where: { id, customerId: customer.id } });
      if (!existing) throw addressNotFound();
      if (input.isDefault)
        await tx.customerAddress.updateMany({ where: { customerId: customer.id, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      const { label, line2, isDefault, ...fields } = input;
      const address = await tx.customerAddress.update({
        where: { id },
        // An emptied label or second line is stored as none.
        data: {
          ...fields,
          ...(label !== undefined ? { label: label || null } : {}),
          ...(line2 !== undefined ? { line2: line2 || null } : {}),
          ...(isDefault ? { isDefault: true } : {}),
        },
      });
      return { address: publicAddress(address), addresses: await listed(tx, customer.id) };
    });
  }

  /** Deleting the default makes the most recently changed remaining address the default. */
  async function deleteAddress(customer: Customer, rawId: string) {
    const id = addressId(rawId);
    return db.$transaction(async (tx) => {
      await lockCustomer(tx, customer.id);
      const existing = await tx.customerAddress.findFirst({ where: { id, customerId: customer.id } });
      if (!existing) throw addressNotFound();
      await tx.customerAddress.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.customerAddress.findFirst({ where: { customerId: customer.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      return { addresses: await listed(tx, customer.id) };
    });
  }

  return {
    startSignIn, verifySignIn, passwordSignIn, sessionCustomer, signOut,
    overview, updateProfile, listOrders, getOrder,
    listAddresses, createAddress, updateAddress, deleteAddress,
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
