-- Keeri's minimum order for a design (2 to 20 pieces across its finishes); null is none. Additive and nullable.
ALTER TABLE "Product" ADD COLUMN "minOrderQuantity" INTEGER;
ALTER TABLE "Product" ADD CONSTRAINT "Product_minOrderQuantity_range" CHECK ("minOrderQuantity" IS NULL OR "minOrderQuantity" BETWEEN 2 AND 20);
