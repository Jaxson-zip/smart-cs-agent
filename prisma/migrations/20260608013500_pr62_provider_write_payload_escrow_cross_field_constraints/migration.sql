-- PR62 hardening: request payload escrow status/mode/envelope consistency.
ALTER TABLE "ProviderWriteRequest"
ADD CONSTRAINT "ProviderWriteRequest_payload_escrow_consistency_chk"
CHECK (
  (
    "payloadEscrowStatus" = 'not_stored'
    AND "payloadEscrowMode" = 'disabled'
    AND "payloadEscrowEnvelopeFingerprint" IS NULL
    AND "payloadEscrowCreatedAt" IS NULL
  )
  OR
  (
    "payloadEscrowStatus" = 'sealed_metadata'
    AND "payloadEscrowMode" = 'sealed_metadata'
    AND "payloadEscrowFingerprint" IS NOT NULL
    AND "payloadEscrowEnvelopeFingerprint" IS NOT NULL
    AND "payloadEscrowCreatedAt" IS NOT NULL
  )
);
