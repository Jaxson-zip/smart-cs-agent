-- CreateTable
CREATE TABLE "ProviderWriteRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT,
    "caseId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadKeys" JSONB NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "networkExecution" TEXT NOT NULL,
    "providerMutationExecuted" BOOLEAN NOT NULL DEFAULT false,
    "customerVisibleMessageSent" BOOLEAN NOT NULL DEFAULT false,
    "operatorVisibleResult" TEXT NOT NULL,
    "policyReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderWriteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWriteRequest_tenantId_idempotencyKeyHash_key" ON "ProviderWriteRequest"("tenantId", "idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "ProviderWriteRequest_tenantId_channel_createdAt_idx" ON "ProviderWriteRequest"("tenantId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderWriteRequest_tenantId_caseId_createdAt_idx" ON "ProviderWriteRequest"("tenantId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderWriteRequest_tenantId_status_createdAt_idx" ON "ProviderWriteRequest"("tenantId", "status", "createdAt");
