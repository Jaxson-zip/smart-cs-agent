-- PR38 provider read audit and idempotency records.
CREATE TABLE "ProviderReadRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT,
    "caseId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "readCapability" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "lookupKeys" JSONB NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "networkExecution" TEXT NOT NULL,
    "providerDataReturned" BOOLEAN NOT NULL DEFAULT false,
    "operatorVisibleResult" TEXT NOT NULL,
    "policyReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderReadRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderReadRun_tenantId_idempotencyKey_key" ON "ProviderReadRun"("tenantId", "idempotencyKey");
CREATE INDEX "ProviderReadRun_tenantId_channel_createdAt_idx" ON "ProviderReadRun"("tenantId", "channel", "createdAt");
CREATE INDEX "ProviderReadRun_tenantId_caseId_createdAt_idx" ON "ProviderReadRun"("tenantId", "caseId", "createdAt");
