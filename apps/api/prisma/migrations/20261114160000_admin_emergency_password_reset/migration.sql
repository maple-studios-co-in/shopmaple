-- Resetting the emergency account's password by an emailed link (owner, 14 Nov 2026). Additive: one new table.
-- Only the link's hash is kept. Rows stay as the record of each request and whether it was used.
CREATE TABLE "ShopAdminPasswordReset" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAdminPasswordReset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopAdminPasswordReset_tokenHash_key" ON "ShopAdminPasswordReset"("tokenHash");
CREATE INDEX "ShopAdminPasswordReset_adminId_createdAt_idx" ON "ShopAdminPasswordReset"("adminId", "createdAt");
ALTER TABLE "ShopAdminPasswordReset" ADD CONSTRAINT "ShopAdminPasswordReset_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "ShopAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
