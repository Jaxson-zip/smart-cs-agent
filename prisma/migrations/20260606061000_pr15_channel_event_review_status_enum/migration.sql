-- CreateEnum
CREATE TYPE "ChannelEventReviewStatus" AS ENUM ('pending', 'replayed', 'ignored');

-- DropIndex
DROP INDEX "NormalizedChannelEvent_merchantId_reviewStatus_createdAt_idx";

-- AlterTable
ALTER TABLE "NormalizedChannelEvent"
ALTER COLUMN "reviewStatus" DROP DEFAULT,
ALTER COLUMN "reviewStatus" TYPE "ChannelEventReviewStatus" USING "reviewStatus"::"ChannelEventReviewStatus",
ALTER COLUMN "reviewStatus" SET DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "NormalizedChannelEvent_merchantId_source_reviewStatus_createdAt_idx" ON "NormalizedChannelEvent"("merchantId", "source", "reviewStatus", "createdAt");
