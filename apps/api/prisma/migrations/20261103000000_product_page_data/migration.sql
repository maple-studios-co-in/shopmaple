-- Keeri's product-page data (specs, highlights, FAQ, reviews, photo details, bundles, batch counts).
-- Additive and nullable: a product synced before Keeri's productPage=1 level simply has none.
ALTER TABLE "Product" ADD COLUMN "productPage" JSONB;
ALTER TABLE "Variant" ADD COLUMN "productPage" JSONB;
