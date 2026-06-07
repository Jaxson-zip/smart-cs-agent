# PR58 Provider Write Request Queue

This stage adds the internal queue boundary for future human-reviewed provider writes. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not store provider payloads, and does not send customer-visible replies.

## PR61 Provider Write Execution Attempt Invariants And Visibility

PR61 adds database invariants and admin-only sanitized visibility for provider write execution attempts. It does not add a live executor, payload escrow opening, provider credential reads, provider mutations, or customer-visible sends.

New read routes:

- `GET /v2/provider-writes/execution-attempts`: admin-only API route for listing sanitized `ProviderWriteExecutionAttemptListItem` rows for the authenticated tenant.
- `GET /api/operator/provider-writes/execution-attempts`: Web BFF admin route that uses the HttpOnly admin session and keeps operator API keys server-side.

The database now rejects unsafe `ProviderWriteExecutionAttempt` rows unless `status` is one of `dry_run_recorded`, `blocked`, or `failed`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `payloadEscrowStatus=not_stored`.

Visibility responses expose only safe operational metadata: attempt id, provider write request id, operator id, channel/action, status, no-network flags, payload escrow status, short request/attempt fingerprints, policy reason, and timestamps. They must not expose `idempotencyKeyHash`, full request hashes, full attempt fingerprints, raw order IDs, logistics IDs, addresses, provider payloads, provider responses, customer messages, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Run:

```bash
npm run verify:provider-write-execution-attempt-visibility
```

This verifier checks the migration constraints, shared `ProviderWriteExecutionAttemptListItem` contract, API route, Web BFF route, tests, docs, static CI wiring, and production launch references. It keeps visibility read-only and no-network.

## PR60 Provider Write Execution Attempt Safety

PR60 adds execution-attempt records for approved provider write requests. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies.

New API routes:

- `POST /v2/provider-writes/requests/:id/execution-attempts`: admin-only API route for recording a no-network execution attempt for an approved request.
- `POST /api/operator/provider-writes/requests/:id/execution-attempts`: Web BFF route that uses the HttpOnly admin session and keeps operator API keys server-side.

`PROVIDER_WRITE_EXECUTION_KILL_SWITCH` defaults to enabled. With the default kill switch state, execution attempts persist as `status=blocked` with `policyReason=execution_kill_switch_enabled`. If the kill switch is explicitly set to `false`, the API may record `status=dry_run_recorded`; this still keeps `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `requiresHuman=true`.

`ProviderWriteExecutionAttempt` rows store only tenant/request/operator ids, channel/action names, status, `idempotencyKeyHash`, `requestHash`, `attemptFingerprint`, payload escrow status, no-execution flags, an operator-visible result, and a policy reason. They must not store raw idempotency keys, order IDs, logistics IDs, addresses, provider payloads, provider responses, customer data, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Run:

```bash
npm run verify:provider-write-execution-attempts
```

This verifier checks the shared execution attempt contracts, Prisma migration, kill-switch config, API route, Web BFF route, dry-run/no-network tests, sanitized docs, static CI, production launch references, and task plan.

## PR59 Provider Write Approval State Machine

PR59 adds approve/reject transitions for queued provider write requests. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not decrypt payload escrow, and does not send customer-visible replies.

New API routes:

- `POST /v2/provider-writes/requests/:id/approve`: admin-only API route for approving an `approval_required` request.
- `POST /v2/provider-writes/requests/:id/reject`: admin-only API route for rejecting an `approval_required` request.
- `POST /api/operator/provider-writes/requests/:id/approve`: Web BFF route that uses the HttpOnly admin session and keeps operator API keys server-side.
- `POST /api/operator/provider-writes/requests/:id/reject`: Web BFF route that uses the HttpOnly admin session and keeps operator API keys server-side.

Approval and rejection are tenant-scoped and require two-person review. The reviewer is derived from the authenticated operator context; body-supplied tenant, operator, reviewer, raw payload, or key fields are ignored or rejected. The original requester cannot approve their own request, even when that requester is an admin.

Review requests accept only controlled `reasonCode` values. They do not accept free-text notes, raw order IDs, logistics IDs, addresses, provider payloads, provider responses, customer data, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Reviewed rows may store `reviewerOperatorId`, `reviewedAt`, `reviewReasonCode`, `reviewFingerprint`, `payloadEscrowStatus`, and `payloadEscrowFingerprint`. `payloadEscrowStatus=not_stored` is an explicit boundary: PR59 records that no raw provider write payload is available for execution in this build. The fingerprint is only an audit marker for the absent escrow envelope.

Approved requests return `status=approved`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`. Rejected requests use the same no-execution flags with `status=rejected`. Approval means "eligible for a future executor after another reviewed implementation," not "executed."

Run:

```bash
npm run verify:provider-write-approval-state
```

This verifier checks the shared approval contracts, Prisma migration, API routes, Web BFF routes, two-person review tests, sanitized response behavior, docs, static CI, production launch references, and task plan.

## Configuration

Configure a tenant/channel pair for reviewed write requests with `PROVIDER_WRITE_REVIEW_ADAPTERS`:

```bash
PROVIDER_WRITE_REVIEW_ADAPTERS='[{"channel":"taobao","tenantId":"<tenant-slug>","allowedActions":["modify_address","issue_coupon","urge_logistics"]}]'
```

This is an allowlist only. It must not contain `credentialRef`, access tokens, client secrets, provider payloads, customer data, or raw tenant secrets. Allowed actions are limited to `modify_address`, `issue_coupon`, and `urge_logistics`; refunds and invoice updates remain out of scope.

## API Boundary

- `POST /v2/provider-writes/request`: operator/admin API for creating a `ProviderWriteRequest`. The server derives tenant and operator from the authenticated request context.
- `GET /v2/provider-writes/requests`: admin-only API for listing sanitized request rows.
- `POST /api/operator/provider-writes/requests`: Web BFF route that proxies through the server-side operator API key from an HttpOnly session.
- `GET /api/operator/provider-writes/requests`: Web BFF admin route for sanitized queue visibility.

`ProviderWriteRequest` rows are tenant-scoped and idempotent on `tenantId + idempotencyKeyHash`. The raw caller-provided idempotency key is accepted only at the request boundary, immediately hashed with a provider-write domain separator, and never persisted or returned. Reusing the same key for the same request returns the existing response. Reusing the same key for a different payload fails closed before any provider network work can start.

Persisted requests require the requested `caseId` to belong to the authenticated tenant (`AfterSalesCase.id + merchantId`). A mismatch fails closed before `ProviderWriteRequest` creation and writes only a sanitized global audit entry.

## Stored Evidence

The row stores safe operational evidence only:

- `payloadHash`: SHA-256 hash of the sanitized request payload.
- `payloadKeys`: booleans for whether order, logistics, address fingerprint, or coupon amount fields were present.
- `idempotencyKeyHash`: SHA-256 hash of the caller idempotency key with provider-write domain separation.
- `requestHash`: SHA-256 hash of tenant/channel/case/action/payload boundary.
- status, network execution state, action, channel, operator, and case references.

It does not store raw idempotency keys, raw order IDs, raw logistics IDs, raw addresses, provider payloads, provider responses, customer data, operator API keys, provider tokens, or webhook secrets.

## Safety Status

Accepted requests return `status=approval_required`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`.

This queue and approval state machine are not enough to execute real writes. A later stage must add secure payload escrow with decrypt-on-execution controls, a live kill switch check immediately before network calls, provider-specific write clients, execution attempts, rollback behavior, and production canary coverage.

## Verification

Run:

```bash
npm run verify:provider-write-requests
```

This verifier checks the shared contract, Prisma model and migration, config parser, adapter policy, Ops service queue behavior, API/BFF routes, sanitized tests, docs, launch runbook, and task plan.
