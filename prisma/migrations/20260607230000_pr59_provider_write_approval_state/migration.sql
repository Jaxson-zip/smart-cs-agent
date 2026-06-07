-- PR59: provider write approval state machine metadata.
ALTER TABLE "ProviderWriteRequest"
ADD COLUMN "reviewerOperatorId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewReasonCode" TEXT,
ADD COLUMN "reviewFingerprint" TEXT,
ADD COLUMN "payloadEscrowStatus" TEXT NOT NULL DEFAULT 'not_stored',
ADD COLUMN "payloadEscrowFingerprint" TEXT;

CREATE INDEX "ProviderWriteRequest_tenantId_status_reviewedAt_idx"
ON "ProviderWriteRequest"("tenantId", "status", "reviewedAt");

CREATE INDEX "ProviderWriteRequest_tenantId_reviewerOperatorId_reviewedAt_idx"
ON "ProviderWriteRequest"("tenantId", "reviewerOperatorId", "reviewedAt");
