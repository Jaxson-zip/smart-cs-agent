-- PR60 hardening: scope execution-attempt idempotency to a provider write request.
DROP INDEX IF EXISTS "ProviderWriteExecutionAttempt_tenantId_idempotencyKeyHash_key";

CREATE UNIQUE INDEX "ProviderWriteExecutionAttempt_tenantId_providerWriteRequestId_idempotencyKeyHash_key"
ON "ProviderWriteExecutionAttempt"("tenantId", "providerWriteRequestId", "idempotencyKeyHash");
