-- The automatic Instagram feed: one state row and the last good set of posts with our own image copies.
CREATE TABLE "InstagramFeedState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "dataAccessExpiresAt" TIMESTAMP(3),
    "tokenSource" TEXT,
    "tokenCiphertext" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    CONSTRAINT "InstagramFeedState_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstagramFeedState_single_row" CHECK ("id" = 1)
);

CREATE TABLE "InstagramFeedPost" (
    "id" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "imageSha256" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstagramFeedPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InstagramFeedPost_imageSha256_idx" ON "InstagramFeedPost"("imageSha256");
CREATE INDEX "InstagramFeedPost_postedAt_idx" ON "InstagramFeedPost"("postedAt");
