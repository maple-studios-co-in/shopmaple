-- Keeri's approved making time for a made-to-order variant; null otherwise.
ALTER TABLE "Variant" ADD COLUMN "leadTimeDays" INTEGER;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_leadTimeDays_range"
  CHECK ("leadTimeDays" IS NULL OR ("leadTimeDays" >= 1 AND "leadTimeDays" <= 365));
