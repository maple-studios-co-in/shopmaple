-- Admin settings that take effect at once, outside the draft-and-publish content (owner, 23 Nov 2026): the first is the
-- media library's upload rules (the banner sizes a picture must have). Additive: the running release never reads it.
CREATE TABLE "ShopSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ShopSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "ShopSetting" ADD CONSTRAINT "ShopSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
