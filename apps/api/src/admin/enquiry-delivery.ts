import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { enquiryAdminIdSchema, enquiryDeliveryRetryInputSchema } from "@shopmaple/contracts";
import type { EnquiryDeliveryConfig } from "../enquiry-delivery-provider.js";
import { deliveryResponse } from "../enquiry-delivery-worker.js";
import { HttpError } from "../cart.js";
import { requireEnquiryAccess } from "./enquiries.js";
const missing = () => new HttpError(404, "ENQUIRY_NOT_FOUND", "This enquiry could not be found.");
export function registerEnquiryDeliveryAdminRoutes(app: Express, db: PrismaClient, secure: boolean, config: EnquiryDeliveryConfig | null) {
  app.get("/api/admin/enquiries/:id/delivery", async (req, res) => {
    const result = await db.$transaction(async tx => {
      await requireEnquiryAccess(tx, req, secure);
      const id = enquiryAdminIdSchema.parse(req.params.id);
      const enquiry = await tx.enquiry.findUnique({ where: { id }, select: { delivery: true } });
      if (!enquiry) throw missing();
      return deliveryResponse(id, enquiry.delivery, config);
    });
    res.json(result);
  });
  app.post("/api/admin/enquiries/:id/delivery/retry", async (req, res) => {
    const result = await db.$transaction(async tx => {
      const actor = await requireEnquiryAccess(tx, req, secure, true);
      const id = enquiryAdminIdSchema.parse(req.params.id);
      const { expectedVersion } = enquiryDeliveryRetryInputSchema.parse(req.body);
      await tx.$queryRaw`SELECT "id" FROM "EnquiryDelivery" WHERE "enquiryId"=${id} FOR UPDATE`;
      const enquiry = await tx.enquiry.findUnique({ where: { id }, select: { delivery: true } });
      if (!enquiry) throw missing();
      const job = enquiry.delivery;
      if (job && job.version !== expectedVersion) throw new HttpError(409, "ENQUIRY_DELIVERY_VERSION_CONFLICT", "Delivery status changed. Refresh before trying again.");
      const at = new Date();
      if (!job || !deliveryResponse(id, job, config, at).delivery?.canRetry) throw new HttpError(409, "ENQUIRY_DELIVERY_RETRY_UNAVAILABLE", "This notification cannot be retried automatically. Reconciliation may be required.");
      const updated = await tx.enquiryDelivery.update({ where: { id: job.id }, data: { version: { increment: 1 }, nextAttemptAt: at } });
      await tx.enquiryDeliveryRetryAudit.create({ data: { deliveryId: job.id, actorId: actor.id, version: updated.version } });
      return deliveryResponse(id, updated, config, at);
    });
    res.json(result);
  });
}
