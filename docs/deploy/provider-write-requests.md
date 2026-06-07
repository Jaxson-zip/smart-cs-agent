# PR58 Provider Write Request Queue

This stage adds the internal queue boundary for future human-reviewed provider writes. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not store provider payloads, and does not send customer-visible replies.

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

This queue is not enough to execute real writes. A later stage must add secure payload escrow, a live kill switch check immediately before network calls, provider-specific write clients, approval state transitions, execution attempts, rollback behavior, and production canary coverage.

## Verification

Run:

```bash
npm run verify:provider-write-requests
```

This verifier checks the shared contract, Prisma model and migration, config parser, adapter policy, Ops service queue behavior, API/BFF routes, sanitized tests, docs, launch runbook, and task plan.
