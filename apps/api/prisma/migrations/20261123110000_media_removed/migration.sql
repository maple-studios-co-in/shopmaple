-- Removing a picture from the media library (owner, 23 Nov 2026) hides it without deleting its file, so pages that use it
-- keep working; "Delete permanently" then deletes the row and the file. Additive: the running release never reads it.
ALTER TABLE "ShopMediaAsset" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "ShopMediaAsset" ADD COLUMN "removedById" TEXT;
CREATE INDEX "ShopMediaAsset_removedAt_idx" ON "ShopMediaAsset"("removedAt");
