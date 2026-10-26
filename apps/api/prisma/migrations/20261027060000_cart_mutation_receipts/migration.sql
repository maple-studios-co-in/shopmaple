ALTER TABLE "Cart" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "CartMutationReceipt" (
    "cartId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartMutationReceipt_pkey" PRIMARY KEY ("cartId", "operationId"),
    CONSTRAINT "CartMutationReceipt_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
