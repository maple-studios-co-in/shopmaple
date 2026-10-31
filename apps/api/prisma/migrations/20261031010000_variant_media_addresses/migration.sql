-- Variants keep their own photos and readable ?variant= value; products keep earlier addresses for redirects.
ALTER TABLE "Variant" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Variant" ADD COLUMN "slug" TEXT;

CREATE TABLE "ProductHandleAlias" (
    "handle" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductHandleAlias_pkey" PRIMARY KEY ("handle")
);
CREATE INDEX "ProductHandleAlias_productId_idx" ON "ProductHandleAlias"("productId");
ALTER TABLE "ProductHandleAlias" ADD CONSTRAINT "ProductHandleAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
