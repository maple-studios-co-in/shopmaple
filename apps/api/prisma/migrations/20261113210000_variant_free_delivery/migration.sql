-- Keeri staff ticked this variant free delivery. The store shows a "Free delivery" badge from it; the quote decides the charge.
ALTER TABLE "Variant" ADD COLUMN "freeDelivery" BOOLEAN NOT NULL DEFAULT false;
