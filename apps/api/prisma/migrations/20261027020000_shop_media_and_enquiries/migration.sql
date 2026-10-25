-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ShopAdmin" ADD COLUMN     "canManageEnquiries" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShopMediaAsset" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicAt" TIMESTAMP(3),

    CONSTRAINT "ShopMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryReviewAudit" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryReviewAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopMediaAsset_sha256_key" ON "ShopMediaAsset"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ShopMediaAsset_storageKey_key" ON "ShopMediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ShopMediaAsset_createdAt_id_idx" ON "ShopMediaAsset"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EnquiryReviewAudit_enquiryId_version_key" ON "EnquiryReviewAudit"("enquiryId", "version");

-- AddForeignKey
ALTER TABLE "ShopMediaAsset" ADD CONSTRAINT "ShopMediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryReviewAudit" ADD CONSTRAINT "EnquiryReviewAudit_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryReviewAudit" ADD CONSTRAINT "EnquiryReviewAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
