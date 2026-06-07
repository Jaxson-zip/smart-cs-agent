CREATE TABLE "ProviderWriteKillSwitchEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT,
    "action" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "stateFingerprint" TEXT NOT NULL,
    "envKillSwitchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emergencyStopEngaged" BOOLEAN NOT NULL,
    "effectiveKillSwitchEnabled" BOOLEAN NOT NULL,
    "networkExecution" TEXT NOT NULL DEFAULT 'not_started',
    "providerMutationExecuted" BOOLEAN NOT NULL DEFAULT false,
    "customerVisibleMessageSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderWriteKillSwitchEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderWriteKillSwitchEvent_action_chk" CHECK ("action" IN ('engage', 'release')),
    CONSTRAINT "ProviderWriteKillSwitchEvent_reason_chk" CHECK ("reasonCode" IN ('incident_response', 'provider_anomaly', 'operator_error', 'launch_rehearsal', 'post_incident_restore')),
    CONSTRAINT "ProviderWriteKillSwitchEvent_no_network_chk" CHECK ("networkExecution" = 'not_started' AND "providerMutationExecuted" = false AND "customerVisibleMessageSent" = false)
);

CREATE UNIQUE INDEX "ProviderWriteKillSwitchEvent_tenantId_idempotencyKeyHash_key" ON "ProviderWriteKillSwitchEvent"("tenantId", "idempotencyKeyHash");
CREATE INDEX "ProviderWriteKillSwitchEvent_tenantId_createdAt_idx" ON "ProviderWriteKillSwitchEvent"("tenantId", "createdAt");
