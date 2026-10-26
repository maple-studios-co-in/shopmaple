ALTER TABLE "Enquiry" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Enquiry_assignedToId_createdAt_id_idx" ON "Enquiry"("assignedToId", "createdAt", "id");
CREATE TABLE "EnquiryActivity" (
  "id" TEXT NOT NULL,
  "enquiryId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "body" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnquiryActivity_action_check" CHECK (
    ("action" = 'assigned' AND "assigneeId" IS NOT NULL AND "body" IS NULL) OR
    ("action" = 'unassigned' AND "assigneeId" IS NULL AND "body" IS NULL) OR
    ("action" = 'note' AND "assigneeId" IS NULL AND "body" IS NOT NULL AND length("body") BETWEEN 1 AND 2000)
  ),
  CONSTRAINT "EnquiryActivity_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "EnquiryActivity_enquiryId_version_key" ON "EnquiryActivity"("enquiryId", "version");
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
