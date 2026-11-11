import type { Express } from "express";
import type { EnquiryDelivery, Prisma, PrismaClient } from "@prisma/client";
import { enquiryAdminIdSchema } from "@shopmaple/contracts";
import { enquiryDeliveryRetryInputSchema } from "@shopmaple/contracts/enquiry-delivery";
import type { EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import type { KeeriLeadsConfig } from "../keeri-leads.js";
import { deliveryResponse } from "../enquiry-delivery-worker.js";
import { HttpError } from "../cart.js";
import { requireEnquiryAccess } from "./enquiries.js";
const missing = () => new HttpError(404, "ENQUIRY_NOT_FOUND", "This enquiry could not be found.");
export function registerEnquiryDeliveryAdminRoutes(app: Express, db: PrismaClient, secure: boolean, config: EnquiryDeliveryConfig | null, keeri: KeeriLeadsConfig | null = null) {
  async function load(tx: Prisma.TransactionClient, id: string) {
    const enquiry = await tx.enquiry.findUnique({ where: { id }, select: { deliveries: true } });
    if (!enquiry) throw missing();
    const of = (target: string) => enquiry.deliveries.find(row => row.target === target) ?? null;
    return { email: of("email"), keeri: of("keeri") };
  }
  const respond = (id: string, rows: { email: EnquiryDelivery | null; keeri: EnquiryDelivery | null }, at?: Date) =>
    deliveryResponse(id, rows.email, config, at, { job: rows.keeri, config: keeri });
  app.get("/api/admin/enquiries/:id/delivery", async (req, res) => {
    const result = await db.$transaction(async tx => {
      await requireEnquiryAccess(tx, req, secure);
      const id = enquiryAdminIdSchema.parse(req.params.id);
      return respond(id, await load(tx, id));
    });
    res.json(result);
  });
  app.post("/api/admin/enquiries/:id/delivery/retry", async (req, res) => {
    const result = await db.$transaction(async tx => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      const id = enquiryAdminIdSchema.parse(req.params.id);
      const { expectedVersion, target } = enquiryDeliveryRetryInputSchema.parse(req.body);
      await tx.$queryRaw`SELECT "id" FROM "EnquiryDelivery" WHERE "enquiryId"=${id} AND "target"=${target} FOR UPDATE`;
      const rows = await load(tx, id);
      const job = rows[target];
      if (job && job.version !== expectedVersion) throw new HttpError(409, "ENQUIRY_DELIVERY_VERSION_CONFLICT", "Delivery status changed. Refresh before trying again.");
      const at = new Date();
      const current = respond(id, rows, at);
      const eligible = target === "keeri" ? current.keeri?.delivery?.canRetry : current.delivery?.canRetry;
      if (!job || !eligible) throw new HttpError(409, "ENQUIRY_DELIVERY_RETRY_UNAVAILABLE", "This notification cannot be retried automatically. Reconciliation may be required.");
      const updated = await tx.enquiryDelivery.update({ where: { id: job.id }, data: { version: { increment: 1 }, nextAttemptAt: at } });
      await tx.enquiryDeliveryRetryAudit.create({ data: { deliveryId: job.id, actorId: actor.id, version: updated.version } });
      return respond(id, { ...rows, [target]: updated }, at);
    });
    res.json(result);
  });
}
