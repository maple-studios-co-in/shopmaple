-- Keeri's approved reviews beside each product, so card reads carry a rating without reading the whole product page.
-- Additive: filled here from the product page already stored, and kept current by every sync after.
ALTER TABLE "Product" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "reviewAverage" DOUBLE PRECISION;
UPDATE "Product"
SET "reviewCount" = COALESCE(("productPage" -> 'reviews' ->> 'count')::INTEGER, 0),
    "reviewAverage" = CASE WHEN COALESCE(("productPage" -> 'reviews' ->> 'count')::INTEGER, 0) > 0
                           THEN ("productPage" -> 'reviews' ->> 'average')::DOUBLE PRECISION END
WHERE "productPage" IS NOT NULL;
