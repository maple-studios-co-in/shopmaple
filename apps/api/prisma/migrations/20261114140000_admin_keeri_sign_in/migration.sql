-- Shop admin sign-in with Keeri accounts (owner, 14 Nov 2026). Additive: nullable columns, one
-- defaulted column and one new table, so the running release keeps working and no row is rewritten.

-- A person who signs in with Keeri has no shop password; existing accounts keep theirs.
ALTER TABLE "ShopAdmin" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "ShopAdmin" ADD COLUMN "keeriUserId" TEXT;
ALTER TABLE "ShopAdmin" ADD COLUMN "name" TEXT;
CREATE UNIQUE INDEX "ShopAdmin_keeriUserId_key" ON "ShopAdmin"("keeriUserId");

-- Existing sessions are password sessions.
ALTER TABLE "ShopAdminSession" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'password';
ALTER TABLE "ShopAdminSession" ADD COLUMN "keeriCheckedAt" TIMESTAMP(3);
ALTER TABLE "ShopAdminSession" ADD CONSTRAINT "ShopAdminSession_method_check" CHECK ("method" IN ('password', 'keeri', 'emergency'));
-- A Keeri session always carries the time Keeri last confirmed it.
ALTER TABLE "ShopAdminSession" ADD CONSTRAINT "ShopAdminSession_keeri_checked" CHECK ("method" <> 'keeri' OR "keeriCheckedAt" IS NOT NULL);

CREATE TABLE "ShopAdminSignIn" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAdminSignIn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopAdminSignIn_createdAt_idx" ON "ShopAdminSignIn"("createdAt");
CREATE INDEX "ShopAdminSignIn_adminId_createdAt_idx" ON "ShopAdminSignIn"("adminId", "createdAt");
ALTER TABLE "ShopAdminSignIn" ADD CONSTRAINT "ShopAdminSignIn_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopAdminSignIn" ADD CONSTRAINT "ShopAdminSignIn_method_check" CHECK ("method" IN ('keeri', 'emergency'));
