# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR37 - Provider Read Execution Contract

Status: verified

Previous Stage: PR36 - Real Provider Readonly Foundation was verified.

Provider Adapter Stage: PR35 - Provider Adapter Contract Package was verified and must stay connected to provider adapter checks.

Launch Runbook Stage: PR34 - Production Launch And Rollback Runbook remains verified and must stay connected to launch checks.

PR37 adds the checked API contract for future provider readonly execution. It allows the system to evaluate whether a tenant/channel is allowed to attempt `get_order` or `query_logistics`, but this stage still returns `networkExecution=not_implemented` and `providerDataReturned=false`.

### PR37 Scope

- Add shared provider read request/response schemas for `get_order` and `query_logistics`.
- Add `POST /v2/provider-reads/execute` behind operator request context.
- Keep tenant/operator identity derived from request context, not body-supplied fields.
- Add provider read policy evaluation for `real_readonly` / `read_only` tenant-channel pairs.
- Return `policy_accepted` only as a policy result; do not call provider networks or return provider payloads.
- Add verifier coverage so provider read contract drift fails before launch.

### Out Of Scope For PR37

- Multi-channel production rollout.
- Live Taobao/Douyin order or logistics API calls.
- Returning real provider order, logistics, customer, or payload data.
- Real payment/refund/coupon execution.
- Full OIDC/SSO implementation, IAM, SCIM, persisted permission policies, and billing.
- Production Taobao/Douyin irreversible actions.
- Automated replay or auto-execution from normalized events.
- Provider-specific production API callbacks beyond sandbox-shaped payloads.
- Real customer replies or real commerce actions from the review pool.
- Bulk review, assignment, SLA routing, and notification workflows.

## Phases

- [x] V1.2 sandbox loop hardened and pushed.
- [x] PR1 backend readiness and config validation.
- [x] PR1 CI and deployment hygiene.
- [x] PR1 frontend production-state polish.
- [x] PR1 final verification and push.
- [x] PR2 tenant request context and API filtering.
- [x] PR2 tests, docs, verification, and push.
- [x] PR3 operator API key guard.
- [x] PR3 docs, verification, and push.
- [x] PR4 public API surface lockdown.
- [x] PR5 server-side operator BFF.
- [x] PR6 operator session boundary.
- [x] PR7 operator identity/RBAC baseline.
- [x] PR8 operator account hardening.
- [x] PR9 database-backed operator account service.
- [x] PR10 operator account management endpoints and audit.
- [x] PR11 operator account management UI.
- [x] PR12 production identity provider boundary.
- [x] PR13 real channel intake security.
- [x] PR14 real channel payload normalization.
- [x] PR15 real channel review replay pool.
- [x] PR16 operator workbench review pool UI.
- [x] PR17 channel event replay atomic claim safety.
- [x] PR18 channel event processing recovery.
- [x] PR19 channel event queue metrics.
- [x] PR20 channel queue readiness thresholds.
- [x] PR21 channel queue operations runbook and verifier.
- [x] PR22 operator queue operations status.
- [x] PR23 queue operation audit records.
- [x] PR24 queue audit summary.
- [x] PR25 real-channel webhook rate limit.
- [x] PR26 production real-channel intake gates.
- [x] PR27 production readiness verifier.
- [x] PR28 real-channel gray-release allowlist.
- [x] PR29 production operator identity closure.
- [x] PR30 real-channel emergency kill switch.
- [x] PR31 public monitoring metrics.
- [x] PR32 production canary verifier.
- [x] PR33 production alerting pack.
- [x] PR34 production launch and rollback runbook.
- [x] PR35 provider adapter contract package.
- [x] PR36 real provider readonly foundation.
- [x] PR37 provider read execution contract.

## Verification Gate

Do not claim PR37 provider read execution contract complete until these pass:

- `npm.cmd run db:generate`
- `npm.cmd run db:migrate:deploy`
- `npm.cmd run test --workspace @smart-cs-agent/api`
- `npm.cmd run test --workspace @smart-cs-agent/web`
- `node --test scripts/verify-production-canary.test.mjs`
- `node --check scripts/verify-production-canary.mjs`
- `node --check scripts/verify-production-alerting.mjs`
- `node --check scripts/verify-production-launch.mjs`
- `node --check scripts/verify-provider-adapters.mjs`
- `node --check scripts/verify-provider-readonly.mjs`
- `node --check scripts/verify-provider-read-contract.mjs`
- `npm.cmd run verify:provider-adapters`
- `npm.cmd run verify:provider-readonly`
- `npm.cmd run verify:provider-read-contract`
- `npm.cmd run verify:production-alerting`
- `npm.cmd run verify:production-launch`
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`
- `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`
- `npm.cmd run build --workspaces --if-present`
- `node --check scripts/verify-channel-queue-runbook.mjs`
- `npm.cmd run verify:channel-runbook`
- `node --check scripts/demo/wecom-sandbox-smoke.mjs`
- `node --check scripts/demo/real-channel-webhook-smoke.mjs`
- `node --check scripts/bootstrap-operator-admin.mjs`
- `npm.cmd run verify:operator-bootstrap`
- Config gate check: `loadApiConfig()` rejects production real-channel intake when secrets, `REAL_CHANNEL_WEBHOOK_ALLOWLIST`, positive rate limit, explicit freshness window, or queue thresholds are missing, and accepts it only when all gates are configured.
- Production readiness verifier check: a dangerous production env file fails, a fully configured production env file with `REAL_CHANNEL_WEBHOOK_ALLOWLIST` passes with `--require-real-channel`, and the script does not print secret values.
- Production identity check: Web BFF login rejects `OPERATOR_IDENTITY_PROVIDER=env` and `OPERATOR_ACCOUNT_SOURCE=env` when `NODE_ENV=production`, while database-backed accounts still work.
- Kill-switch check: signed real-channel webhook intake returns HTTP 503 when `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`, writes no `ChannelWebhookReceipt` or `NormalizedChannelEvent`, does not call Agent/Action/customer-visible replies, and does not consume application rate-limit quota.
- Readiness check: `GET /health/ready` reports `checks.channelWebhooks.status=disabled_by_kill_switch` without tenant IDs, secrets, signatures, raw body, payloads, or customer messages.
- Production verifier check: `--require-real-channel` fails when `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`; the same env without `--require-real-channel` passes with a warning and without printing secrets.
- Monitoring metrics check: `GET /metrics` returns Prometheus text with API, database, webhook readiness, kill switch, queue count, oldest pending age, and degraded reason gauges without tenant IDs, channel names, customer messages, provider payloads, external IDs, operator keys, secrets, signatures, or raw bodies.
- Monitoring failure check: `GET /metrics` remains scrapeable when the database is unavailable and reports `smart_cs_agent_database_ready 0` without leaking the database error.
- Production canary check: `npm.cmd run verify:production-canary -- --api=<healthy-local-canary> --require-real-channel` passes against healthy public readiness/metrics.
- Production canary failure checks: degraded readiness/queue fails unless `--allow-degraded`; `--require-real-channel` fails when webhook status is not `ok` or kill switch is enabled; forbidden tenant/channel/payload/secret markers in `/metrics` fail without echoing the marker.
- Production alerting check: Prometheus alert examples cover API down, DB down, real-channel misconfiguration, kill switch, queue degraded, stale processing claims, and oldest pending age without tenant/customer/provider/secret labels.
- Canary schedule check: the scheduled workflow calls `npm run verify:production-canary` every five minutes using `SMART_CS_API_URL`, without operator API keys or webhook secrets.
- Production launch check: launch guidance covers preflight, deploy sequence, rollback triggers, kill-switch rollback, allowlist rollback, real-channel intake disablement, stale-claim recovery evidence, post-launch evidence, rehearsal scenarios, and no-secret/no-customer-action boundaries.
- Live rate-limit check with `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE=1`: first signed real-channel webhook returns 202; second signed webhook for the same tenant/channel returns 429; only one receipt and one normalized event are persisted.
- `npm.cmd run demo:smoke -- --api=http://localhost:4100 --operator-api-key=<operator-key> --timeout-ms=5000`
- `npm.cmd run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=<tenant-slug> --secret=<matching-secret> --timeout-ms=5000`
- `npm.cmd run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=<tenant-slug> --secret=<matching-secret> --replay --operator-api-key=<operator-key> --timeout-ms=5000`
- Live admin check for `GET /v1/channel-events/audit-summary` and `GET /api/operator/channel-events/audit-summary`.
- Browser check at 1366x768 and 390x844: no page-level scroll or horizontal overflow; queue status remains visible; admin queue audit summary and operation records do not expose `webhook`, `normalized`, `channel-events`, tenant IDs, payloads, event IDs, source names, external IDs, or API key terms in the operator UI.

## Errors Encountered

| Time | Error | Resolution |
| --- | --- | --- |
| 2026-06-06 | Docker/Postgres not running locally, DB smoke success path unavailable | PR1 will add readiness checks and keep DB smoke instructions explicit |
| 2026-06-06 | WebSocket gateway still read `WEB_ORIGIN` directly | Updated it to use the shared API config loader |
| 2026-06-06 | Prisma connected during module init, making `/health` unavailable when DB was down | Removed startup connect and made `/health/ready` own DB availability |
| 2026-06-06 | Full config loader in WebSocket decorator required `DATABASE_URL` at import time | Split `loadWebOrigin()` so WebSocket CORS only validates `WEB_ORIGIN` |
| 2026-06-06 | `.env` fallback could silently affect CI/production | Disabled default `.env` loading when `CI=true` or `NODE_ENV=production` |
| 2026-06-06 | `/v1/cases` returned all merchants and `/v1/rules/:tenantId` could read arbitrary tenants | PR2 adds explicit tenant request context and tenant filtering |
| 2026-06-06 | Agent rules still defaulted to `demo_tenant` during webhook decisions | Passed tenant ID into classification and risk evaluation |
| 2026-06-06 | `x-tenant-id` can be spoofed by any browser/client | PR3 adds sandbox operator API keys and blocks tenant mismatch |
| 2026-06-06 | Public browser key is not real commercial authentication | Documented it as sandbox/pre-production only; real production still needs session/JWT/BFF |
| 2026-06-06 | Legacy `/v2/*` and `/v1/wecom/webhook/send` were outside the new operator guard | PR3 now requires request context for those operator-facing APIs |
| 2026-06-06 | `WECOM_SANDBOX_ENABLED` existed but did not gate the event intake | PR3 now blocks `/v1/wecom/events` when the sandbox endpoint is disabled or production has not explicitly enabled it |
| 2026-06-06 | Web `/api/chat` and `/api/db` exposed historical mock order data/actions | PR4 disables those legacy demo APIs by default behind `ENABLE_LEGACY_WEB_DEMO_API` |
| 2026-06-06 | Browser carried `NEXT_PUBLIC_OPERATOR_API_KEY` for API access | PR5 moves operator API access to server-side `/api/operator/*` BFF routes using `OPERATOR_API_KEY` |
| 2026-06-06 | Server-side BFF still used one global operator key and could not identify the logged-in operator | PR6 adds HttpOnly signed operator sessions and derives API key/tenant/operator from `OPERATOR_SESSION_ACCOUNTS` |
| 2026-06-06 | Review found PR6 could be misconfigured with placeholder session secrets, default demo accounts, and fallback mock cases after real API failures | PR6 now rejects unsafe production session config and only shows fallback cases when `NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=true` |
| 2026-06-06 | The Web workbench could not ask who the current operator is after reload and had no role-derived permissions | PR7 adds `/api/operator/me`, sanitized profiles, and role permission mapping |
| 2026-06-06 | `OPERATOR_SESSION_ACCOUNTS` still depended on plaintext passwords and had no account disable/session revocation mechanism | PR8 adds scrypt password hashes, production plaintext rejection, disabled accounts, and session version invalidation |
| 2026-06-06 | A real-channel webhook path could accidentally be mistaken for a production business integration | PR13 creates a separate security-only intake at `/v1/channels/:channel/webhook/events`; it writes replay receipts only and never calls Agent/Action/customer-visible replies |
| 2026-06-06 | Real-channel HMAC verification must use raw request bytes and fail closed if raw body capture or secret parsing breaks | PR13 enables Nest raw body, rejects missing raw body, converts malformed secret config to controlled auth failure, and signs `channel + tenantId + timestamp + eventId + sha256(rawBody)` |
| 2026-06-06 | Real-channel normalization can collapse the trust boundary if body tenant/channel overrides signed context | PR14 derives tenant/channel from the signed context, only checks body merchant identity for consistency, and keeps normalized events out of Agent/Action/case processing |
| 2026-06-06 | Normalized real-channel events need a controlled path into case review without becoming automatic actions | PR15 adds a pending/replayed/ignored review lifecycle and operator-gated replay that forces human review modes |
| 2026-06-06 | PR15 review pool queries could mix non-real-channel normalized events if they only filter tenant and pending status | Added `source=real_channel_webhook` filters, status enum migration, source-aware index, and regression tests |
| 2026-06-06 | API workspace tests could miss `experimentalDecorators` under the current Node/tsx worker path | Added `apps/api/scripts/run-tests.mjs` to set `TSX_TSCONFIG=tsconfig.json` and invoke the `tsx` CLI directly |
| 2026-06-06 | Initial production canary redacted only `--key=value` unknown args and looked for a narrow set of leaked metric values | Added tests for bare URL argument redaction and generic public metric label leakage, then restricted public metric labels to `status` and `reason` |
