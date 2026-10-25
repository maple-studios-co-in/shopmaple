ALTER TABLE "Product" ADD COLUMN "sourceStatus" TEXT;
CREATE TABLE "ProductSourceIdentity" (
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "ProductSourceIdentity_pkey" PRIMARY KEY ("source", "externalId"),
  CONSTRAINT "ProductSourceIdentity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductSourceIdentity_source_productId_key" ON "ProductSourceIdentity"("source", "productId");
CREATE TABLE "VariantSourceIdentity" (
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  CONSTRAINT "VariantSourceIdentity_pkey" PRIMARY KEY ("source", "externalId"),
  CONSTRAINT "VariantSourceIdentity_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VariantSourceIdentity_source_variantId_key" ON "VariantSourceIdentity"("source", "variantId");
