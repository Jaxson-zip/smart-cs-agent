-- PR61: database no-network invariants for provider write execution attempts.
ALTER TABLE "ProviderWriteExecutionAttempt"
ADD CONSTRAINT "ProviderWriteExecutionAttempt_status_chk"
CHECK ("status" IN ('dry_run_recorded', 'blocked', 'failed'));

ALTER TABLE "ProviderWriteExecutionAttempt"
ADD CONSTRAINT "ProviderWriteExecutionAttempt_no_network_chk"
CHECK (
  "networkExecution" = 'not_started'
  AND "providerMutationExecuted" = false
  AND "customerVisibleMessageSent" = false
  AND "payloadEscrowOpened" = false
);

ALTER TABLE "ProviderWriteExecutionAttempt"
ADD CONSTRAINT "ProviderWriteExecutionAttempt_payload_escrow_chk"
CHECK ("payloadEscrowStatus" = 'not_stored');
