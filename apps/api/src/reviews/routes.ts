import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { keeriDeliveryEventSchema, reviewIdSchema, reviewInputSchema, reviewModerationInputSchema, reviewStatuses, type AdminReview, type ReviewOrder } from "@shopmaple/contracts/reviews";
import { randomUUID } from "node:crypto";
import { HttpError } from "../cart.js";
import type { EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import { decodePageCursor, encodeCursor, requireEnquiryAccess } from "../admin/enquiries.js";
import { confirmedOrderKind, orderMissing, recordDelivery } from "./deliveries.js";
import { verifiedInvitationId } from "./links.js";

export interface ReviewsConfig {
  /** Signs review links (REVIEW_LINK_SECRET). */
  linkSecret: string;
  /** Verifies Keeri's delivery events (KEERI_DELIVERY_WEBHOOK_SECRET); the route is absent without it. */
  keeriDeliverySecret?: string;
}

const disabled = () => new HttpError(503, "REVIEWS_NOT_AVAILABLE", "Reviews are not available yet.");
const linkInvalid = () => new HttpError(404, "REVIEW_LINK_INVALID", "This review link is not valid. Use the link from your email.");
const linkUsed = () => new HttpError(410, "REVIEW_LINK_USED", "A review has already been written with this link. Thank you!");
const linkExpired = () => new HttpError(410, "REVIEW_LINK_EXPIRED", "This review link has expired.");
const reviewMissing = () => new HttpError(404, "REVIEW_NOT_FOUND", "This review could not be found.");
const pageSize = 25;
const iso = (value: Date) => value.toISOString();

/** The invitation a token names, checked as usable; locks it when `lock` is set. */
async function usableInvitation(tx: Prisma.TransactionClient, secret: string, token: unknown, lock = false) {
  const id = verifiedInvitationId(secret, token);
  if (!id) throw linkInvalid();
  if (lock) await tx.$queryRaw`SELECT "id" FROM "ProductReviewInvitation" WHERE "id" = ${id} FOR UPDATE`;
  const invitation = await tx.productReviewInvitation.findUnique({ where: { id } });
  if (!invitation) throw linkInvalid();
  if (invitation.usedAt) throw linkUsed();
  if (invitation.expiresAt <= new Date()) throw linkExpired();
  return invitation;
}

/** Keeri's signed "order delivered" event. Mounted before the JSON parser and the browser Origin check. */
export function registerKeeriDeliveryRoute(app: Express, db: PrismaClient, config: ReviewsConfig | null | undefined) {
  const secret = config?.keeriDeliverySecret;
  app.post("/api/integrations/keeri/order-delivered", express.raw({ type: "application/json", limit: "4kb" }), async (req, res) => {
    if (!secret) throw new HttpError(404, "NOT_FOUND", "This endpoint does not exist.");
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const header = /^t=(\d{9,12}),v1=([a-f0-9]{64})$/.exec(req.get("X-Keeri-Signature") ?? "");
    const at = Number(header?.[1]);
    const expected = createHmac("sha256", secret).update(`${header?.[1]}.`).update(raw).digest();
    if (!header || Math.abs(Date.now() / 1000 - at) > 300 || !timingSafeEqual(Buffer.from(header[2]!, "hex"), expected))
      throw new HttpError(401, "SIGNATURE_REJECTED", "The delivery event signature is not valid.");
    let event: z.infer<typeof keeriDeliveryEventSchema>;
    try { event = keeriDeliveryEventSchema.parse(JSON.parse(raw.toString("utf8"))); } catch { throw new HttpError(400, "INVALID_INPUT", "Check the supplied values and try again."); }
    const outbox = await db.orderOutbox.findFirst({ where: { kind: confirmedOrderKind, externalOrderId: event.externalOrderId }, select: { attemptId: true } });
    if (!outbox) throw orderMissing();
    await db.$transaction((tx) => recordDelivery(tx, outbox.attemptId, { source: "keeri", deliveredAt: new Date(event.deliveredAt) }));
    res.json({ status: "recorded" });
  });
}

export function registerReviewRoutes(app: Express, db: PrismaClient, config: ReviewsConfig | null | undefined, secure: boolean, email: EnquiryDeliveryConfig | null) {
  // ---- Public: the product page's approved reviews, and the buyer's form behind a review link.
  app.get("/api/products/:handle/reviews", async (req, res) => {
    const handle = z.string().min(1).max(200).parse(req.params.handle);
    const product = await db.product.findUnique({ where: { handle }, select: { id: true } })
      ?? (await db.productHandleAlias.findUnique({ where: { handle }, select: { product: { select: { id: true } } } }))?.product;
    if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "We couldn't find that product.");
    const where = { productId: product.id, status: "approved" };
    const [summary, latest] = await Promise.all([
      db.productReview.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      db.productReview.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 }),
    ]);
    const average = summary._avg.rating;
    res.set("Cache-Control", "public, max-age=30, s-maxage=60").json({
      average: average === null ? null : Math.round(average * 10) / 10,
      count: summary._count._all,
      reviews: latest.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.displayName, city: r.city, createdAt: iso(r.createdAt) })),
    });
  });
  app.use("/api/reviews", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  app.get("/api/reviews/invitation", async (req, res) => {
    if (!config) throw disabled();
    const invitation = await usableInvitation(db, config.linkSecret, req.query.token);
    const product = await db.product.findUnique({ where: { id: invitation.productId }, select: { handle: true, published: true } });
    res.json({ productTitle: invitation.productTitle, variantTitle: invitation.variantTitle, productHandle: product?.published ? product.handle : null });
  });
  app.post(
    "/api/reviews",
    rateLimit({
      windowMs: 60 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
      message: { code: "TOO_MANY_REVIEWS", message: "Too many submissions. Please try again later." },
    }),
    async (req, res) => {
      if (!config) throw disabled();
      const input = reviewInputSchema.parse(req.body);
      await db.$transaction(async (tx) => {
        const invitation = await usableInvitation(tx, config.linkSecret, input.token, true);
        await tx.productReview.create({
          data: {
            id: `rev_${randomUUID()}`, invitationId: invitation.id, attemptId: invitation.attemptId, productId: invitation.productId,
            productHandle: invitation.productHandle, variantId: invitation.variantId, rating: input.rating, title: input.title,
            body: input.body, displayName: input.displayName, city: input.city || null,
          },
        });
        await tx.productReviewInvitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } });
      });
      res.status(201).json({ status: "pending" });
    },
  );

  // ---- Staff: confirmed orders to mark delivered, and the moderation queue.
  app.get("/api/admin/review-orders", async (req, res) => {
    const cursor = typeof req.query.cursor === "string" ? decodePageCursor(req.query.cursor, z.object({ at: z.iso.datetime(), id: z.string().max(200) }).strict()) : null;
    const result = await db.$transaction(async (tx) => {
      await requireEnquiryAccess(tx, req, secure);
      const after = cursor ? new Date(cursor.at) : null;
      const rows = await tx.$queryRaw<Array<{ id: string; createdAt: Date }>>`
        SELECT a."id", a."createdAt" FROM "CheckoutAttempt" a
        JOIN "OrderOutbox" o ON o."attemptId" = a."id" AND o."kind" = ${confirmedOrderKind}
        WHERE a."state" = 'captured' AND o."state" = 'delivered' AND o."externalOrderId" IS NOT NULL
          AND (${after}::timestamp IS NULL OR (a."createdAt", a."id") < (${after}::timestamp, ${cursor?.id ?? ""}))
        ORDER BY a."createdAt" DESC, a."id" DESC LIMIT ${pageSize + 1}`;
      const page = rows.slice(0, pageSize);
      const items = await Promise.all(page.map((row) => orderView(tx, row.id, email)));
      const last = page.at(-1);
      return { items: items.filter((x): x is ReviewOrder => x !== null), nextCursor: rows.length > pageSize && last ? encodeCursor({ at: iso(last.createdAt), id: last.id }) : null };
    });
    res.json(result);
  });
  app.post("/api/admin/review-orders/:attemptId/delivered", async (req, res) => {
    const attemptId = z.string().min(1).max(200).parse(req.params.attemptId);
    const view = await db.$transaction(async (tx) => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      if (!config) throw disabled();
      await recordDelivery(tx, attemptId, { source: "staff", deliveredAt: new Date(), actorId: actor.id });
      return orderView(tx, attemptId, email);
    });
    res.json(view);
  });
  app.get("/api/admin/reviews", async (req, res) => {
    const status = z.enum(reviewStatuses).default("pending").parse(req.query.status);
    const cursor = typeof req.query.cursor === "string" ? decodePageCursor(req.query.cursor, z.object({ at: z.iso.datetime(), id: reviewIdSchema }).strict()) : null;
    const result = await db.$transaction(async (tx) => {
      await requireEnquiryAccess(tx, req, secure);
      const rows = await tx.productReview.findMany({
        where: { status, ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        select: { id: true },
      });
      const page = rows.slice(0, pageSize);
      const items = await Promise.all(page.map((row) => reviewView(tx, row.id)));
      const last = items.at(-1);
      return { items, nextCursor: rows.length > pageSize && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null };
    });
    res.json(result);
  });
  app.post("/api/admin/reviews/:id/moderation", async (req, res) => {
    const view = await db.$transaction(async (tx) => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      const id = reviewIdSchema.safeParse(req.params.id);
      if (!id.success) throw reviewMissing();
      const { decision, expectedVersion, note } = reviewModerationInputSchema.parse(req.body);
      const current = await tx.productReview.findUnique({ where: { id: id.data }, select: { status: true } });
      if (!current) throw reviewMissing();
      if (current.status === decision) throw new HttpError(409, "REVIEW_UNCHANGED", `This review is already ${decision}.`);
      const changed = await tx.productReview.updateMany({
        where: { id: id.data, version: expectedVersion },
        data: { status: decision, version: { increment: 1 }, moderatedById: actor.id, moderatedAt: new Date() },
      });
      if (!changed.count) throw new HttpError(409, "REVIEW_VERSION_CONFLICT", "Someone else changed this review. Reload before trying again.");
      await tx.productReviewAudit.create({ data: { reviewId: id.data, actorId: actor.id, version: expectedVersion + 1, action: decision, note: note || null } });
      return reviewView(tx, id.data);
    });
    res.json(view);
  });
}

async function reviewView(tx: Prisma.TransactionClient, id: string): Promise<AdminReview> {
  const r = await tx.productReview.findUniqueOrThrow({
    where: { id },
    include: { invitation: true, audit: { orderBy: { version: "asc" }, include: { actor: { select: { email: true } } } } },
  });
  const outbox = await tx.orderOutbox.findUnique({ where: { attemptId_kind: { attemptId: r.attemptId, kind: confirmedOrderKind } }, select: { externalOrderId: true } });
  return {
    id: r.id, status: r.status as AdminReview["status"], version: r.version, rating: r.rating, title: r.title, body: r.body,
    displayName: r.displayName, city: r.city, productTitle: r.invitation.productTitle, variantTitle: r.invitation.variantTitle,
    productHandle: r.productHandle, orderReference: outbox?.externalOrderId ?? r.attemptId, createdAt: iso(r.createdAt),
    audit: r.audit.map((a) => ({ action: a.action as "approved" | "rejected", actorEmail: a.actor.email, note: a.note, createdAt: iso(a.createdAt) })),
  };
}

async function orderView(tx: Prisma.TransactionClient, attemptId: string, email: EnquiryDeliveryConfig | null): Promise<ReviewOrder | null> {
  const attempt = await tx.checkoutAttempt.findUnique({
    where: { id: attemptId },
    include: { delivery: true, reviews: { select: { variantId: true } }, reviewInvitations: { select: { variantId: true, productTitle: true, variantTitle: true } } },
  });
  const outbox = await tx.orderOutbox.findUnique({ where: { attemptId_kind: { attemptId, kind: confirmedOrderKind } }, select: { externalOrderId: true } });
  const quote = attempt?.snapshot as { customer?: { name?: string }; items?: Array<{ title: string; variantTitle: string }> } | undefined;
  if (!attempt || !outbox?.externalOrderId || !quote?.items) return null;
  const reviewed = new Set(attempt.reviews.map((r) => r.variantId));
  const d = attempt.delivery;
  return {
    attemptId, orderReference: outbox.externalOrderId, customerName: quote.customer?.name ?? "", placedAt: iso(attempt.createdAt),
    lines: quote.items.map((item) => {
      const invite = attempt.reviewInvitations.find((i) => i.productTitle === item.title && i.variantTitle === item.variantTitle);
      return { title: item.title, variantTitle: item.variantTitle, reviewed: Boolean(invite && reviewed.has(invite.variantId)) };
    }),
    delivery: d ? {
      deliveredAt: iso(d.deliveredAt), source: d.source as "staff" | "keeri",
      email: !email && d.emailState !== "sent" ? "disabled" : (d.emailState as "pending" | "processing" | "sent" | "failed"),
    } : null,
  };
}

const secretSchema = z.string().min(32).max(256).regex(/^[\x21-\x7e]+$/);
/** Off (null) until REVIEW_LINK_SECRET is set. Keeri's event secret needs the link secret and must differ from it. */
export function loadReviewsConfig(env: Record<string, string | undefined>): ReviewsConfig | null {
  const link = env.REVIEW_LINK_SECRET?.trim(), keeri = env.KEERI_DELIVERY_WEBHOOK_SECRET?.trim();
  if (!link) {
    if (keeri) throw new Error("KEERI_DELIVERY_WEBHOOK_SECRET needs REVIEW_LINK_SECRET.");
    return null;
  }
  if (!secretSchema.safeParse(link).success || (keeri && (!secretSchema.safeParse(keeri).success || keeri === link)))
    throw new Error("Invalid review secrets: use 32 to 256 printable characters, and a different secret for Keeri.");
  return keeri ? { linkSecret: link, keeriDeliverySecret: keeri } : { linkSecret: link };
}
