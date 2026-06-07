# Provider Adapter Contracts

This document defines the launch boundary for commerce provider adapters. It is a contract package for future Taobao, Douyin, Shopify, WeChat, and email integrations. It does not enable real provider network calls, real refunds, real address changes, real coupons, logistics edits, or customer-visible replies.

## PR58 Provider Write Request Queue

PR58 adds the internal request queue for future human-reviewed provider writes:

- `PROVIDER_WRITE_REVIEW_ADAPTERS`: optional JSON allowlist for tenant/channel/action pairs. It contains no credentials and only permits `modify_address`, `issue_coupon`, and `urge_logistics`.
- `POST /v2/provider-writes/request`: creates a sanitized `ProviderWriteRequest` only after case ownership is verified against the authenticated tenant.
- `GET /v2/provider-writes/requests`: admin-only visibility into sanitized queued/blocked/failed write requests.
- `GET /api/operator/provider-writes/requests` and `POST /api/operator/provider-writes/requests`: Web BFF routes that keep operator API keys server-side.

Accepted requests stay `approval_required`, with `networkExecution=not_started`, `providerMutationExecuted=false`, and `customerVisibleMessageSent=false`. The raw caller idempotency key is hashed before persistence as `idempotencyKeyHash` and is not returned. This queue does not call provider APIs and does not execute real writes. It is the review and idempotency boundary that a later provider write executor must consume.

Run:

```bash
npm run verify:provider-write-requests
```

This verifier checks the shared contract, Prisma model and migration, config parser, adapter policy, Ops service queue behavior, API/BFF routes, sanitized tests, docs, launch runbook, and task plan.

## PR42 Provider Readonly Sandbox Harness

PR42 adds the readonly client execution harness that future live provider read clients must pass through:

- `ProviderReadonlyClientHarnessService`: prepares a sanitized execution plan for `get_order` and `query_logistics` after provider read policy, persistence, and credential resolution have already passed.
- Current execution mode is sandbox-only. It keeps `networkExecution=not_implemented`, `networkAttempted=false`, `providerDataReturned=false`, `providerResponseCaptured=false`, and `attemptCount=0`.
- `PROVIDER_READ_TIMEOUT_MS` and `PROVIDER_READ_MAX_RETRIES` define the future client timeout/retry envelope, but current code still performs no provider network request.
- Safe audit metadata may include execution mode, credential readiness status, timeout/retry settings, and whether a provider request was prepared. It must not include raw lookup values, full credential refs, tokens, provider payloads, provider responses, or customer data.

Run:

```bash
npm run verify:provider-read-harness
```

This verifier checks the harness service, config bounds, Ops audit wiring, no-network/no-provider-data behavior, docs, launch runbook, and task plan.

## PR41 Provider Credential Store Boundary

PR41 adds a no-secret provider credential inventory for future readonly provider clients:

- `PROVIDER_CREDENTIALS`: optional JSON array of `{ credentialRef }` records only. It is a ref presence inventory, not a token store.
- The inventory rejects inline `material`, access tokens, API keys, client secrets, duplicate refs, malformed refs, and malformed JSON.
- `ProviderCredentialStoreService`: distinguishes `configured`, `missing`, `invalid`, and `not_implemented` without loading credential material or calling a secret manager.
- Safe audit metadata may include `credentialRefFingerprint`, `credentialResolutionStatus`, `credentialRefConfigured`, `credentialMaterialLoaded=false`, and `secretValueReturned=false`.
- Responses, `ProviderReadRun`, public API responses, Web BFF responses, and audit logs must not include full refs, provider tokens, secret manager paths, provider payloads, provider responses, customer data, or raw lookup values.

Run:

```bash
npm run verify:provider-credential-store
```

This verifier checks the ref-only inventory, store/resolver audit metadata, no inline secrets, no network/provider calls, docs, launch runbook, and task plan.

## PR40 Provider Credential Resolution Boundary

PR40 adds a no-secret credential resolution boundary for future real readonly provider clients:

- `ProviderCredentialResolverService`: accepts `{ tenantId, channel, credentialRef }` only after provider read policy is accepted.
- Current resolver status may be `not_implemented`, `configured`, `missing`, or `invalid`, but it still does not call a secret manager, does not load credential material, and does not call provider APIs.
- Safe audit metadata may include `credentialRefFingerprint`, `credentialResolutionStatus`, `credentialRefConfigured`, `credentialMaterialLoaded=false`, and `secretValueReturned=false`.
- Responses, `ProviderReadRun` records, public API responses, and Web BFF responses must not include full `credentialRef`, secret manager paths, access tokens, client secrets, provider payloads, provider responses, customer data, or raw lookup values.

Run:

```bash
npm run verify:provider-credential-boundary
```

This verifier checks the resolver boundary, exact tenant/channel credential lookup, no-secret metadata, no network/provider calls, docs, launch runbook, and task plan.

## PR39 Provider Read Operations Visibility

PR39 adds admin-only visibility for provider read audit records:

- `GET /v2/provider-reads/runs`: returns recent provider read run rows for the authenticated tenant.
- `GET /v2/provider-reads/summary`: returns bounded 24-hour aggregates for the authenticated tenant.
- `GET /api/operator/provider-reads/runs` and `GET /api/operator/provider-reads/summary`: Web BFF routes that require an HttpOnly admin session and proxy through the server-side operator API key.

The direct API routes require an authenticated admin operator API key. They reject the legacy insecure `x-tenant-id` header fallback even outside production, so sandbox convenience headers cannot access launch/support operations visibility.

These routes return sanitized operational fields only: case reference, operator reference, channel, read capability, status, network execution state, `providerDataReturned=false`, lookup key presence booleans, `lookupFingerprint`, `requestFingerprint`, policy reason, and timestamps. They do not return raw order IDs, raw logistics IDs, full lookup hashes, full request hashes, idempotency keys, provider payloads, provider responses, customer data, provider tokens, operator API keys, or tenant secrets.

Run:

```bash
npm run verify:provider-read-operations
```

This verifier checks the admin-only API and BFF routes, sanitized response mapping, tests, docs, launch runbook, and task plan.

## PR38 Provider Read Audit And Idempotency

PR38 persists a sanitized `ProviderReadRun` record for each new `POST /v2/provider-reads/execute` attempt when database persistence is available.

Each run is tenant-scoped and idempotent on `tenantId + idempotencyKey`. Reusing the same idempotency key for the same request returns the existing run response. Reusing the same key for a different provider read fails closed before any provider network work can start.

Persisted provider reads also require the requested `caseId` to belong to the authenticated tenant (`AfterSalesCase.id + merchantId`). A mismatch fails closed before `ProviderReadRun` creation and writes only a global sanitized audit entry, not a case-scoped audit entry.

The record stores safe operational evidence only:

- `lookupHash`: SHA-256 hash of the lookup object.
- `lookupKeys`: booleans such as whether an order or logistics identifier was present.
- `requestHash`: SHA-256 hash of the tenant/channel/case/capability/lookup boundary.
- status, network execution state, read capability, channel, operator, and case references.

It does not store raw order IDs, raw logistics IDs, provider payloads, provider responses, customer data, HMAC material, operator API keys, provider tokens, or live provider data. Audit entries for provider reads use the same sanitized hashes and summaries, including idempotency conflict attempts.

Run:

```bash
npm run verify:provider-read-audit
```

This verifier checks the Prisma model and migration, service persistence, sanitized audit behavior, idempotency tests, docs, public API surface, launch runbook, and task plan.

## PR37 Provider Read Execution Contract

PR37 adds the API contract for future non-mutating provider reads:

- `POST /v2/provider-reads/execute`
- Request fields: `caseId`, `channel`, `readCapability`, `lookup`, and `idempotencyKey`; the server derives `tenantId` and `operatorId` from the authenticated request context.
- `readCapability` is limited to `get_order` and `query_logistics`.

The route evaluates `ProviderAdapterRegistry.evaluateReadPolicy()`. A read can reach `status=policy_accepted` only when the current tenant/channel is configured through `PROVIDER_READONLY_ADAPTERS` and the adapter is projected as `real_readonly` / `read_only`.

This PR still does not call real provider APIs, does not query Taobao or Douyin directly, and does not return raw provider data. Even when policy is accepted, the response returns `networkExecution=not_implemented` and `providerDataReturned=false`. The route is a checked contract and policy boundary for future live reads, not a live provider connector.

Run:

```bash
npm run verify:provider-read-contract
```

This verifier checks the shared request/response contract, read policy, route context injection, no-network/no-provider-data response, tests, public API docs, production readiness docs, launch runbook references, and task plan.

## PR36 Real Provider Readonly Foundation

PR36 adds a narrow readonly foundation for future real provider integrations. Configure it with `PROVIDER_READONLY_ADAPTERS`:

```bash
PROVIDER_READONLY_ADAPTERS='[{"channel":"taobao","tenantId":"<tenant-slug>","credentialRef":"secret://smartcs/taobao/<tenant-slug>"}]'
```

The config must contain a `credentialRef` only. The accepted reference schemes are `secret://...` and `vault://...`. It must not contain access tokens, refresh tokens, client secrets, API keys, provider payloads, customer messages, or raw credential material. `credentialRef` is a pointer to deployment secret storage, not a secret value.

When a tenant/channel pair appears in `PROVIDER_READONLY_ADAPTERS`, `GET /v2/integrations` may report the readonly projection only for operators from that tenant:

- `adapterMode=real_readonly`
- `writePolicy=read_only` (`read_only` means no provider write is allowed)
- `capabilities=["handoff"]`
- `readCapabilities=["get_order","query_logistics"]`
- `customerVisibleActionsEnabled=false`
- `realCommerceActionsEnabled=false`

`readCapabilities` are not executable write actions. They describe future non-mutating reads such as `get_order` and `query_logistics`. This foundation does not enable real refunds, address changes, coupons, logistics edits, invoices, or customer-visible replies.

Run:

```bash
npm run verify:provider-readonly
```

This verifier checks the config parser, shared contract, registry projection, docs, environment example, and tests for the readonly/no-write boundary.

## PR35 Provider Adapter Contract Package

## Current Adapter Status

| Channel | Adapter mode | Write policy | Customer-visible actions | Real commerce actions | Notes |
| --- | --- | --- | --- | --- | --- |
| `taobao` | `sandbox_mock` | `sandbox_only` | disabled | disabled | Mock contract only; never call real Taobao APIs. |
| `douyin` | `sandbox_mock` | `sandbox_only` | disabled | disabled | Mock contract only; never call real Douyin APIs. |
| `shopify` | `not_configured` | `disabled` | disabled | disabled | Internal handoff only. |
| `wechat` | `not_configured` | `disabled` | disabled | disabled | Internal handoff only. |
| `email` | `not_configured` | `disabled` | disabled | disabled | Internal handoff only. |

`GET /v2/integrations` reports the adapter contract fields:

- `adapterMode`
- `writePolicy`
- `customerVisibleActionsEnabled`
- `realCommerceActionsEnabled`
- `contractVersion`
- `safetyNotes`

`connected=true` for a mock adapter means the sandbox adapter is available inside this app. It does not mean the merchant has authorized a real platform account, and it does not mean real provider writes are enabled.

## Action Policy

All commerce write actions are blocked unless a future adapter contract explicitly passes a separate production review. The blocked commerce write set is:

- `modify_address`
- `issue_coupon`
- `escalate_coupon`
- `urge_logistics`
- `refund`
- `update_invoice`

`handoff` is the only queueable non-commerce action in this PR. It creates internal operator work and must not call a provider API or send a customer-visible reply.

`POST /v2/actions/execute` must evaluate `ProviderAdapterRegistry.evaluateActionPolicy()` before returning an accepted or queued action. Sandbox Taobao and Douyin write attempts currently return `status=blocked`, `requiresHuman=true`, and a provider write-policy reason.

The older WeCom sandbox auto-execution path may still run local mock adapter methods for demonstration data, but those action results must be marked `simulated`, not `success`. `simulated` means local sandbox behavior only; it must not be used as evidence of a real provider write.

## Future Real Adapter Entry Criteria

A future real provider adapter must start in one of these modes:

- `real_readonly`: signed provider API reads are allowed only for non-mutating order or logistics lookup.
- `real_actions_disabled`: provider authentication is configured, but all customer-visible and commerce writes stay disabled.

A future adapter must not start with real writes enabled. Before any real write policy can be considered, the team must provide:

- Provider-specific sandbox evidence for each action.
- Idempotency keys accepted and tested per action.
- Provider error mapping and retry policy.
- Audit records for every decision and attempted provider call.
- Human review for refunds, cash compensation, address changes after shipment, complaint escalation, and any customer-visible reply.
- Per-tenant allowlist or gray-release control.
- Emergency kill switch behavior.
- Canary and alert coverage.
- Rollback runbook evidence.
- Sanitized production provider write approval evidence under `production-provider-write-approval-artifacts/`, verified by `npm run verify:production-provider-write-approval` and `npm run verify:production-provider-write-approval:safe`.

`writePolicy=human_review_required` is the first possible real-write policy. `human_review_required` still does not mean fully automatic execution. It means the system may queue a reviewed provider action only after operator approval and provider-specific safeguards.

## Safety Boundaries

Provider adapter contracts must not expose or log operator API keys, provider tokens, webhook secrets, HMAC signatures, raw request bodies, customer messages in monitoring signals, tenant IDs in public readiness or metrics, provider payloads, external conversation IDs, or external message IDs.

Mock adapters may simulate order lookup, coupons, logistics, and messages for local development, but their metadata must keep:

- `mode=sandbox_mock`
- `writePolicy=sandbox_only`
- `customerVisibleActionsEnabled=false`
- `realCommerceActionsEnabled=false`

Real customer-visible replies remain outside this PR. Real commerce actions remain outside this PR.

## Verification

Run:

```bash
npm run verify:provider-adapters
```

This verifier checks that the shared API contract, provider registry, mock adapters, public docs, launch runbook, and package script still preserve the no-real-write boundary.
