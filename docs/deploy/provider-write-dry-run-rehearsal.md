# PR63 Provider Write Dry-Run Rehearsal Evidence Gate

This stage adds a sanitized evidence gate for rehearsing the provider write request, human review, and no-network execution-attempt chain. It does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, does not decrypt payloads, and does not send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:provider-write-dry-run-rehearsal
```

Run the safe evidence gate after release owners export a sanitized rehearsal package:

```bash
SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE=provider-write-dry-run-rehearsal-artifacts/provider-write-dry-run-rehearsal.json \
SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true \
npm run verify:provider-write-dry-run-rehearsal:safe
```

The evidence file must use schema `smart-cs-agent.provider-write-dry-run-rehearsal.v1` and must live under `provider-write-dry-run-rehearsal-artifacts/`. The verifier prints only the channel plus a success marker.

## Required Evidence Shape

The rehearsal package should include:

- Target: tenant fingerprint, channel, `single_merchant_pilot`, and change ticket.
- Scenario: safe rehearsal id, first-pilot action (`modify_address`, `issue_coupon`, or `urge_logistics`), `low` or `medium` risk level, and `local_dry_run` mode.
- Request evidence: sanitized request fingerprint, idempotency-key hash fingerprint, payload escrow status, and no-network/no-provider-mutation/no-customer-visible flags.
- Review evidence: `decision=approved`, human review required, two-person review passed, requester/reviewer fingerprints, and review timestamp.
- Execution-attempt evidence: `status=blocked` or `dry_run_recorded`, safe policy reason, attempt fingerprint, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `payloadEscrowStatus=not_stored`.
- Controls: provider write kill switch verified, idempotency verified, audit trail verified, no credentials read, no provider network calls, no payload escrow opened, no customer-visible reply sent, and no provider mutation executed.
- Evidence booleans proving the provider write request, approval-state, execution-attempt, execution-attempt visibility, payload escrow boundary, production provider write approval, and production launch verifiers passed.
- Artifact bindings: sha256 hashes for the request queue, approval-state, execution-attempt, and payload escrow boundary evidence.
- Safety: no secrets, raw tenant IDs, customer data, provider payloads, provider responses, network execution, provider writes, payload escrow opening, credential reads, or customer-visible actions in evidence.

## Security Boundary

Do not put provider tokens, credential refs, operator API keys, webhook secrets, tenant IDs, customer messages, order IDs, logistics IDs, addresses, provider payloads, provider responses, signatures, raw request bodies, idempotency keys, or API URLs with query-string secrets into provider write dry-run rehearsal evidence.

This verifier rejects unsupported sensitive fields such as `tenantId`, `providerToken`, `credentialRef`, `providerPayload`, `providerResponse`, `orderId`, `logisticsId`, `address`, `operatorApiKey`, `idempotencyKey`, `token`, and `secret`. It also rejects bearer tokens, embedded credentials, secret-manager refs, and known leak sentinels.

## Workflow Placement

Run this gate after:

```bash
npm run verify:provider-write-requests
npm run verify:provider-write-approval-state
npm run verify:provider-write-execution-attempts
npm run verify:provider-write-execution-attempt-visibility
npm run verify:provider-write-payload-escrow-boundary
```

Run the safe evidence command before `npm run verify:production-provider-write-approval:safe`, because the PR57 approval package binds `dryRunRehearsalSha256`.

This rehearsal gate is still not enough to execute real writes. A later implementation must add a live provider write client, decrypt-on-execution controls, persisted write-run records, immediate kill switch checks before network calls, rollback behavior, and production canary coverage for provider write execution.
