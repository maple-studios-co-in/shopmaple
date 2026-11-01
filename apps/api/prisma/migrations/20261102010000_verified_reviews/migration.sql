-- Verified buyer reviews: a delivered order (staff today, Keeri's signed event later), one
-- single-use review link per order line, the buyer's review, and every moderation decision.
-- CreateTable
CREATE TABLE "OrderDelivery" (
    "attemptId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "recordedById" TEXT,
    "emailState" TEXT NOT NULL DEFAULT 'pending',
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, now()),
    "emailLeaseToken" TEXT,
    "emailLeaseExpiresAt" TIMESTAMP(3),
    "emailProviderId" TEXT,
    "emailFailureCode" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDelivery_pkey" PRIMARY KEY ("attemptId"),
    CONSTRAINT "OrderDelivery_source_check" CHECK ("source" IN ('staff', 'keeri')),
    CONSTRAINT "OrderDelivery_staff_check" CHECK ("source" <> 'staff' OR "recordedById" IS NOT NULL),
    CONSTRAINT "OrderDelivery_emailState_check" CHECK ("emailState" IN ('pending', 'processing', 'sent', 'failed'))
);

-- CreateTable
CREATE TABLE "ProductReviewInvitation" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReviewInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "city" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "ProductReview_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    CONSTRAINT "ProductReview_moderation_check" CHECK (("status" = 'pending') = ("moderatedById" IS NULL AND "moderatedAt" IS NULL))
);

-- CreateTable
CREATE TABLE "ProductReviewAudit" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReviewAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductReviewAudit_action_check" CHECK ("action" IN ('approved', 'rejected'))
);

-- CreateIndex
CREATE INDEX "OrderDelivery_emailState_emailNextAttemptAt_idx" ON "OrderDelivery"("emailState", "emailNextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReviewInvitation_attemptId_variantId_key" ON "ProductReviewInvitation"("attemptId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_invitationId_key" ON "ProductReview"("invitationId");

-- CreateIndex
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_status_createdAt_id_idx" ON "ProductReview"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_attemptId_variantId_key" ON "ProductReview"("attemptId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReviewAudit_reviewId_version_key" ON "ProductReviewAudit"("reviewId", "version");

-- AddForeignKey
ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewInvitation" ADD CONSTRAINT "ProductReviewInvitation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "ProductReviewInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewAudit" ADD CONSTRAINT "ProductReviewAudit_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewAudit" ADD CONSTRAINT "ProductReviewAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

