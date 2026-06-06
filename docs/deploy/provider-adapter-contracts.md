# Provider Adapter Contracts

This document defines the launch boundary for commerce provider adapters. It is a contract package for future Taobao, Douyin, Shopify, WeChat, and email integrations. It does not enable real provider network calls, real refunds, real address changes, real coupons, logistics edits, or customer-visible replies.

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
