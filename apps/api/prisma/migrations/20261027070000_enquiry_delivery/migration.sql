CREATE TABLE "EnquiryDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "enquiryId" TEXT NOT NULL UNIQUE REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "configurationHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "firstAttemptAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "providerId" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryDelivery_status_check" CHECK ("status" IN ('queued','sending','retry_wait','accepted','failed','uncertain'))
);
CREATE INDEX "EnquiryDelivery_status_nextAttemptAt_idx" ON "EnquiryDelivery"("status", "nextAttemptAt");
CREATE TABLE "EnquiryDeliveryRetryAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deliveryId" TEXT NOT NULL REFERENCES "EnquiryDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("deliveryId", "version")
);
