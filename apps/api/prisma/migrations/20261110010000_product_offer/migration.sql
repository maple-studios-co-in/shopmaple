-- Each product's own Keeri offer (Keeri's offers=1 catalogue level), which the product page counts down to.
-- Additive and nullable: empty until the first sync at that level, and cleared by any sync without one.
ALTER TABLE "Product" ADD COLUMN "offer" JSONB;
