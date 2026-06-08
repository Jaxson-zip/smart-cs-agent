# PR67 Provider Write Kill Switch Rehearsal Evidence Gate

This stage defines the sanitized rehearsal package required before any real provider write pilot approval can be accepted. It proves that the provider write emergency stop can be engaged, that an execution attempt is blocked with `emergency_stop_engaged`, and that releasing the persisted emergency stop does not enable real provider writes.

It does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, does not decrypt payload escrow, does not store raw provider/customer payloads, does not expose raw idempotency keys, and does not send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:provider-write-kill-switch-rehearsal
```

Run the safe evidence gate after release owners export a sanitized provider write kill-switch rehearsal package:

```bash
SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE=provider-write-kill-switch-rehearsal-artifacts/provider-write-kill-switch-rehearsal.json \
SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true \
npm run verify:provider-write-kill-switch-rehearsal:safe
```

The evidence file must use schema `smart-cs-agent.provider-write-kill-switch-rehearsal.v1` and must live under `provider-write-kill-switch-rehearsal-artifacts/`. The verifier prints only the channel plus a success marker.

The `:safe` command hard-requires pass evidence. It fails closed when `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE` is missing or when the package does not prove engagement, blocking, release safety, audit, and idempotency.

## Required Evidence Shape

The provider write kill-switch rehearsal package should include:

- Target: tenant fingerprint, channel, `single_merchant_pilot`, and change ticket.
- Rehearsal: safe rehearsal id, initiator fingerprint, two distinct observer fingerprints, and `local_control_plane` mode.
- Engage: `action=engage`, controlled reason code, safe timestamp, `statusSource=emergency_stop`, `emergencyStopEngaged=true`, `effectiveKillSwitchEnabled=true`, state fingerprint, idempotency-key hash fingerprint, and admin route proof.
- Execution block: request and attempt fingerprints, `status=blocked`, `policyReason=emergency_stop_engaged`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `payloadEscrowOpened=false`.
- Release: `action=release`, controlled reason code, safe timestamp, `persistedEmergencyStopReleased=true`, `envKillSwitchStillControlled=true`, `realWritesEnabled=false`, state fingerprint, idempotency-key hash fingerprint, and admin route proof.
- Controls: admin-only API/BFF access, two-person observation, idempotency, audit trail, execution blocked while engaged, release does not enable writes, no provider credentials, no provider network calls, no payload escrow opening, no provider mutation, and no customer-visible reply.
- `artifactBindings`: sha256 fingerprints for provider write kill-switch control plane, provider write execution-attempt safety, production provider write approval, and production launch verification.
- Safety: no secrets, raw tenant IDs, customer data, provider payloads, provider responses, raw idempotency keys, network execution by verifier, provider writes by verifier, payload escrow opening by verifier, credential reads by verifier, or customer-visible actions sent by verifier.

## Security Boundary

Do not put provider tokens, credential refs, operator API keys, webhook secrets, tenant IDs, customer messages, order IDs, logistics IDs, addresses, provider payloads, provider responses, signatures, raw request bodies, raw idempotency keys, or API URLs with query-string secrets into provider write kill-switch rehearsal evidence.

This verifier rejects unsupported sensitive fields such as `tenantId`, `providerToken`, `credentialRef`, `providerPayload`, `providerResponse`, `orderId`, `logisticsId`, `address`, `idempotencyKey`, `operatorApiKey`, `token`, and `secret`. It also rejects bearer tokens, embedded credentials, secret-manager refs, and known leak sentinels.

## Workflow Placement

Run this gate after:

```bash
npm run verify:provider-write-kill-switch-control-plane
npm run verify:provider-write-execution-attempts
npm run verify:production-launch
```

Run this safe gate before:

```bash
npm run verify:production-provider-write-approval:safe
```

The production provider write approval package binds this rehearsal through `providerWriteKillSwitchSha256`.

This rehearsal gate is still not enough to execute real writes. A later implementation must add the actual provider write client, persisted write-run records, idempotency enforcement at the write endpoint, provider-specific rollback behavior, and a live kill switch check immediately before any provider network call.

## Verification

Run:

```bash
npm run verify:provider-write-kill-switch-rehearsal
npm run verify:production-provider-write-approval
npm run verify:production-launch
```

Use `npm run verify:provider-write-kill-switch-rehearsal:safe` in release CI or a launch terminal after `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE` and `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true` are injected through the environment.
