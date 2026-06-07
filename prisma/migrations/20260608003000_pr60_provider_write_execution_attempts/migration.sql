-- PR60: no-network provider write execution attempt records.
CREATE TABLE "ProviderWriteExecutionAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerWriteRequestId" TEXT NOT NULL,
    "operatorId" TEXT,
    "channel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "attemptFingerprint" TEXT NOT NULL,
    "payloadEscrowStatus" TEXT NOT NULL DEFAULT 'not_stored',
    "payloadEscrowOpened" BOOLEAN NOT NULL DEFAULT false,
    "networkExecution" TEXT NOT NULL,
    "providerMutationExecuted" BOOLEAN NOT NULL DEFAULT false,
    "customerVisibleMessageSent" BOOLEAN NOT NULL DEFAULT false,
    "operatorVisibleResult" TEXT NOT NULL,
    "policyReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderWriteExecutionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderWriteExecutionAttempt_tenantId_idempotencyKeyHash_key"
ON "ProviderWriteExecutionAttempt"("tenantId", "idempotencyKeyHash");

CREATE INDEX "ProviderWriteExecutionAttempt_tenantId_providerWriteRequestId_createdAt_idx"
ON "ProviderWriteExecutionAttempt"("tenantId", "providerWriteRequestId", "createdAt");

CREATE INDEX "ProviderWriteExecutionAttempt_tenantId_status_createdAt_idx"
ON "ProviderWriteExecutionAttempt"("tenantId", "status", "createdAt");
