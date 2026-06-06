-- AlterTable
ALTER TABLE "NormalizedChannelEvent"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "replayedCaseId" TEXT,
ADD COLUMN "reviewNote" TEXT;

-- CreateIndex
CREATE INDEX "NormalizedChannelEvent_merchantId_reviewStatus_createdAt_idx" ON "NormalizedChannelEvent"("merchantId", "reviewStatus", "createdAt");
