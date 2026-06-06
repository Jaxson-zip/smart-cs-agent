# PR35 Provider Adapter Contract Package

This document defines the launch boundary for commerce provider adapters. It is a contract package for future Taobao, Douyin, Shopify, WeChat, and email integrations. It does not enable real provider network calls, real refunds, real address changes, real coupons, logistics edits, or customer-visible replies.

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
