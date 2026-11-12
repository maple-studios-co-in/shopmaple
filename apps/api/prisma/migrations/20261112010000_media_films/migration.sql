-- Films in the media library (owner, 12 Nov 2026). Existing rows are images and stay valid unchanged.
-- CreateEnum
CREATE TYPE "ShopMediaKind" AS ENUM ('image', 'video');

-- AlterTable
ALTER TABLE "ShopMediaAsset" ADD COLUMN     "kind" "ShopMediaKind" NOT NULL DEFAULT 'image',
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "faststart" BOOLEAN,
ALTER COLUMN "width" DROP NOT NULL,
ALTER COLUMN "height" DROP NOT NULL;
