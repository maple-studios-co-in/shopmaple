-- CreateEnum
CREATE TYPE "ShopAdminRole" AS ENUM ('editor', 'publisher');

-- CreateTable
CREATE TABLE "ShopAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "ShopAdminRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopAdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopContent" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedVersion" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopContentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopAdmin_email_key" ON "ShopAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ShopAdminSession_tokenHash_key" ON "ShopAdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ShopAdminSession_expiresAt_idx" ON "ShopAdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopContentRevision_documentId_version_key" ON "ShopContentRevision"("documentId", "version");

-- AddForeignKey
ALTER TABLE "ShopAdminSession" ADD CONSTRAINT "ShopAdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "ShopAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopContentRevision" ADD CONSTRAINT "ShopContentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ShopContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopContentRevision" ADD CONSTRAINT "ShopContentRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
