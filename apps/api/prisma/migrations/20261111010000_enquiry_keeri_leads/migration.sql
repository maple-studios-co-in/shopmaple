-- Keeri leads join the enquiry outbox as a second target, so they share its lease, backoff, attempt
-- limits and audited staff retry. Existing rows are the staff email and keep target 'email'.
ALTER TABLE "EnquiryDelivery"
  ADD COLUMN "target" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN "keeriLeadId" TEXT,
  ADD COLUMN "keeriOutcome" TEXT,
  ADD COLUMN "keeriLeadPath" TEXT,
  ADD CONSTRAINT "EnquiryDelivery_target_check" CHECK ("target" IN ('email', 'keeri')),
  ADD CONSTRAINT "EnquiryDelivery_keeri_result_check" CHECK (
    ("keeriOutcome" IS NULL OR "keeriOutcome" IN ('created', 'matched'))
    AND ("target" = 'keeri' OR ("keeriLeadId" IS NULL AND "keeriOutcome" IS NULL AND "keeriLeadPath" IS NULL))
  );
-- One row per enquiry and target, instead of one per enquiry.
ALTER TABLE "EnquiryDelivery" DROP CONSTRAINT "EnquiryDelivery_enquiryId_key";
CREATE UNIQUE INDEX "EnquiryDelivery_enquiryId_target_key" ON "EnquiryDelivery"("enquiryId", "target");
DROP INDEX "EnquiryDelivery_status_nextAttemptAt_idx";
CREATE INDEX "EnquiryDelivery_target_status_nextAttemptAt_idx" ON "EnquiryDelivery"("target", "status", "nextAttemptAt");
