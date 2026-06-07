-- PR62: request-only payload escrow readiness metadata.
ALTER TABLE "ProviderWriteRequest"
ADD COLUMN "payloadEscrowEnvelopeFingerprint" TEXT,
ADD COLUMN "payloadEscrowMode" TEXT NOT NULL DEFAULT 'disabled',
ADD COLUMN "payloadEscrowCreatedAt" TIMESTAMP(3);

ALTER TABLE "ProviderWriteRequest"
ADD CONSTRAINT "ProviderWriteRequest_payload_escrow_status_chk"
CHECK ("payloadEscrowStatus" IN ('not_stored', 'sealed_metadata'));

ALTER TABLE "ProviderWriteRequest"
ADD CONSTRAINT "ProviderWriteRequest_payload_escrow_mode_chk"
CHECK ("payloadEscrowMode" IN ('disabled', 'sealed_metadata'));
