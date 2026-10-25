ALTER TABLE "Variant" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "CatalogueSyncState" (
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogueSyncState_pkey" PRIMARY KEY ("source")
);
