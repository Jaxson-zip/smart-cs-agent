# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR59 - Provider Write Approval State Machine

Status: verified locally; commit pending

Previous Stage: PR58 - Provider Write Request Queue was verified locally and committed as `1cb116d`. Remote push is still waiting for GitHub `workflow` scope authorization because PR55 added `.github/workflows/production-static-gates.yml`.

Provider Write Request Stage: PR58 - Provider Write Request Queue was verified with review-only `ProviderWriteRequest` rows, sanitized hashes/status fields, no raw payload storage, and no provider/customer-visible execution. It must stay connected to provider write approvals, launch checks, and static CI.

Provider Write Approval Stage: PR57 - Production Provider Write Approval Gate was verified with sanitized approval evidence shape and must stay connected to provider write request queues, production launch checks, and static CI.

Branch Protection Stage: PR56 - Production Branch Protection Gate was verified with `production-branch-protection-artifacts/` evidence shape and must stay connected to provider write approval and production launch checks.

Static CI Stage: PR55 - Production Static CI Gate was verified with `.github/workflows/production-static-gates.yml` and must stay connected to production launch and branch protection checks.

Launch Binding Stage: PR54 - Production Launch Binding Gate was verified with `production-launch-binding.yml.example` and must stay connected to production launch and static CI checks.

Change Approval Stage: PR53 - Production Change Approval Gate was verified with `production-change-approval.yml.example` and must stay connected to production launch and launch binding checks.

Release Evidence Stage: PR52 - Production Release Evidence Archive was verified with `production-release-evidence.yml.example` and must stay connected to production launch and change approval checks.

Release Provenance Stage: PR51 - Production Release Provenance And Promotion Boundary was verified with `production-release-provenance.yml.example` and must stay connected to production launch and release evidence checks.

Image Security Stage: PR50 - Production Image Security Evidence Gate was verified with `production-image-security.yml.example` and must stay connected to production launch and release provenance checks.

Container Runtime Stage: PR49 - Production Container Runtime Smoke Gate was verified with `production-container-smoke.yml.example` and must stay connected to production launch and image security checks.

Image Build Stage: PR48 - Production Image Build Gate was verified with `production-image-build.yml.example` and must stay connected to production launch and container smoke checks.

Deployment Artifact Stage: PR47 - Production Deployment Artifacts was verified with `docker-compose.production.yml.example` and must stay connected to production launch and image build checks.

Manifest Stage: PR46 - Multi-Merchant Launch Manifest was verified for `smart-cs-agent.launch-manifest.v1` and must stay connected to launch evidence and production launch checks.

Launch Evidence Stage: PR44 - Launch Evidence Bundle was verified and must stay connected to archive and manifest checks.

Merchant Launch Stage: PR43 - Merchant Launch Preflight was verified and must stay connected to safe launch preflight checks.

Provider Readonly Harness Stage: PR42 - Provider Readonly Sandbox Harness was verified and must stay connected to provider read harness checks.

Provider Credential Store Stage: PR41 - Provider Credential Store Boundary was verified and must stay connected to credential inventory checks.

Credential Resolution Stage: PR40 - Provider Credential Resolution Boundary was verified and must stay connected to provider credential boundary checks.

Provider Read Operations Stage: PR39 - Provider Read Operations Visibility was verified and must stay connected to provider read operations checks.

Provider Read Audit Stage: PR38 - Provider Read Audit And Idempotency was verified and must stay connected to provider read audit checks.

Provider Read Contract Stage: PR37 - Provider Read Execution Contract was verified and must stay connected to provider read checks.

PR38 Safety Boundary: persisted provider reads must still verify `caseId + authenticated tenant` before creating run records or case-scoped audit logs.

Readonly Stage: PR36 - Real Provider Readonly Foundation was verified and must stay connected to provider readonly checks.

Provider Adapter Stage: PR35 - Provider Adapter Contract Package was verified and must stay connected to provider adapter checks.

Launch Runbook Stage: PR34 - Production Launch And Rollback Runbook remains verified and must stay connected to launch checks.

PR59 adds the provider write approval state machine on top of the request queue. Admin operators can approve or reject queued low-risk provider write requests, but approval still means "ready for a future executor" only. It must enforce two-person review, block self-approval, audit every transition, return only sanitized fingerprints/status fields, and keep `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`.

### PR59 Scope

- Add shared provider write approval request/response contracts and approved/rejected status values.
- Add persistence fields for reviewer identity, review timestamps, approval/rejection reasons, and an approval fingerprint/envelope that does not expose raw provider payload.
- Add API routes for `POST /v2/provider-writes/requests/:id/approve` and `POST /v2/provider-writes/requests/:id/reject`.
- Enforce tenant scoping, admin-only approval/rejection, operator API key auth, and two-person review: the requester cannot approve their own request.
- Add Web BFF routes for approve/reject that use HttpOnly sessions and reject unsafe upstream response shapes.
- Add `npm run verify:provider-write-approval-state` and connect it to docs, public API surface, production launch, and static CI.
- Keep approval local/no-execution: no provider API calls, no provider credentials, no provider writes, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR59

- Multi-channel production rollout.
- Publishing images to a registry.
- Performing real image signing, SBOM attestation upload, provenance signing, registry publish, vulnerability waiver approval, deployment promotion, or production traffic changes.
- Choosing a final cloud vendor, Kubernetes chart, Terraform stack, or managed secret store.
- Live Taobao/Douyin order or logistics API calls.
- Returning real provider order, logistics, customer, or payload data.
- Real secret manager or vault reads.
- Persisting or returning full `credentialRef` values.
- Returning credential material or provider tokens to provider clients.
- Returning real provider data to API or Web clients.
- Calling production API readiness, production databases, vault, provider networks, or registry APIs from image-security static verification.
- Embedding live canary response bodies or metric bodies in the evidence bundle.
- Real payment/refund/coupon execution.
- Full OIDC/SSO implementation, IAM, SCIM, persisted permission policies, and billing.
- Production Taobao/Douyin irreversible actions.
- Automated replay or auto-execution from normalized events.
- Provider-specific production API callbacks beyond sandbox-shaped payloads.
- Real customer replies or real commerce actions from the review pool.
- Bulk review, assignment, SLA routing, and notification workflows.
- Secure payload decrypt-on-approval behavior.
- Live provider write executor, provider-specific write clients, live kill switch enforcement immediately before network calls, execution attempts, compensation rollback, and production canary coverage for provider writes.

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
- [x] PR38 provider read audit and idempotency.
- [x] PR39 provider read operations visibility.
- [x] PR40 provider credential resolution boundary.
- [x] PR41 provider credential store boundary.
- [x] PR42 provider readonly sandbox harness.
- [x] PR43 merchant launch preflight.
- [x] PR44 launch evidence bundle.
- [x] PR45 launch evidence archive safety.
- [x] PR46 multi-merchant launch manifest.
- [x] PR47 production deployment artifacts.
- [x] PR48 production image build gate.
- [x] PR49 production container runtime smoke gate.
- [x] PR50 production image security evidence gate.
- [x] PR51 production release provenance and promotion boundary.
- [x] PR52 production release evidence archive.
- [x] PR53 production change approval gate.
- [x] PR54 production launch binding gate.
- [x] PR55 production static CI gate.
- [x] PR56 production branch protection gate.
- [x] PR57 production provider write approval gate.
- [x] PR58 provider write request queue.
- [x] PR59 provider write approval state machine.

## Verification Gate

PR59 provider write approval state machine is tracked against this gate inventory:

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
- `node --check scripts/verify-provider-read-audit.mjs`
- `node --check scripts/verify-provider-read-operations.mjs`
- `node --check scripts/verify-provider-credential-boundary.mjs`
- `node --check scripts/verify-provider-credential-store.mjs`
- `node --check scripts/verify-provider-read-harness.mjs`
- `node --check scripts/verify-merchant-launch-preflight.mjs`
- `node --test scripts/verify-merchant-launch-preflight.test.mjs`
- `node --check scripts/generate-launch-evidence.mjs`
- `node --check scripts/generate-launch-evidence.test.mjs`
- `node --test scripts/generate-launch-evidence.test.mjs`
- `node --check scripts/verify-launch-evidence.mjs`
- `node --check scripts/verify-launch-evidence-archive.mjs`
- `node --check scripts/verify-launch-evidence-archive.test.mjs`
- `node --test scripts/verify-launch-evidence-archive.test.mjs`
- `node --check scripts/verify-launch-manifest.mjs`
- `node --check scripts/verify-launch-manifest.test.mjs`
- `node --test scripts/verify-launch-manifest.test.mjs`
- `node --check scripts/verify-production-deploy-artifacts.mjs`
- `npm.cmd run verify:production-deploy-artifacts`
- `node --check scripts/verify-production-image-builds.mjs`
- `npm.cmd run verify:production-image-builds`
- `node --check scripts/verify-production-container-smoke.mjs`
- `node --test scripts/verify-production-container-smoke.test.mjs`
- `npm.cmd run verify:production-container-smoke`
- `node --check scripts/verify-production-image-security.mjs`
- `node --test scripts/verify-production-image-security.test.mjs`
- `npm.cmd run verify:production-image-security`
- `node --check scripts/verify-production-release-provenance.mjs`
- `node --test scripts/verify-production-release-provenance.test.mjs`
- `npm.cmd run verify:production-release-provenance`
- `node --check scripts/verify-production-release-evidence.mjs`
- `node --test scripts/verify-production-release-evidence.test.mjs`
- `npm.cmd run verify:production-release-evidence`
- `node --check scripts/verify-production-change-approval.mjs`
- `node --test scripts/verify-production-change-approval.test.mjs`
- `npm.cmd run verify:production-change-approval`
- `node --check scripts/verify-production-launch-binding.mjs`
- `node --test scripts/verify-production-launch-binding.test.mjs`
- `npm.cmd run verify:production-launch-binding`
- `node --check scripts/verify-production-static-ci.mjs`
- `node --test scripts/verify-production-static-ci.test.mjs`
- `npm.cmd run verify:production-static-ci`
- `node --check scripts/verify-production-branch-protection.mjs`
- `node --test scripts/verify-production-branch-protection.test.mjs`
- `npm.cmd run verify:production-branch-protection`
- `node --check scripts/verify-production-provider-write-approval.mjs`
- `node --test scripts/verify-production-provider-write-approval.test.mjs`
- `npm.cmd run verify:production-provider-write-approval`
- `node --check scripts/verify-provider-write-requests.mjs`
- `npm.cmd run verify:provider-write-requests`
- `node --check scripts/verify-provider-write-approval-state.mjs`
- `node --test scripts/verify-provider-write-approval-state.test.mjs`
- `npm.cmd run verify:provider-write-approval-state`
- `npm.cmd run verify:provider-adapters`
- `npm.cmd run verify:provider-readonly`
- `npm.cmd run verify:provider-read-contract`
- `npm.cmd run verify:provider-read-audit`
- `npm.cmd run verify:provider-read-operations`
- `npm.cmd run verify:provider-credential-boundary`
- `npm.cmd run verify:provider-credential-store`
- `npm.cmd run verify:provider-read-harness`
- `npm.cmd run verify:merchant-launch-preflight:safe`
- `npm.cmd run generate:launch-evidence:safe`
- `npm.cmd run verify:launch-evidence-archive:safe`
- `npm.cmd run verify:launch-manifest:safe`
- `npm.cmd run verify:launch-manifest -- --manifest=<launch-manifest-json> --evidence-dir=<launch-evidence-dir> --require-pass --require-real-channel --require-provider-readonly`
- `npm.cmd run verify:launch-evidence-archive -- --file=<launch-evidence-json> --require-pass --require-real-channel --require-provider-readonly`
- `npm.cmd run verify:launch-evidence`
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

### PR59 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed when run from the repository cwd. A prior parallel run failed from a Codex sandbox temp cwd with existing `tsx/esbuild` decorator project-path errors; the same API suite passed immediately when run alone from `G:\vibe-coding\smart-cs-agent`.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false` passed.
- `npm.cmd run lint --workspaces --if-present -- --max-warnings=0` passed when run alone from the repository cwd. A prior parallel run failed from a Codex sandbox temp cwd with existing ESLint project-path errors.
- `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 99 pass / 1 skipped after adding the PR59 negative verifier test. The skipped test is the existing Windows symlink-permission case.
- `npm.cmd run verify:provider-write-approval-state`, `npm.cmd run verify:provider-write-requests`, `npm.cmd run verify:production-static-ci`, `npm.cmd run verify:production-launch`, and `git diff --check` passed.
- Two read-only subagent reviews found no P0/P1 blocker. One P2 finding was fixed: the Web BFF now parses provider write create payloads and rebuilds a controlled body instead of forwarding browser JSON wholesale. The remaining known risks are future work: DB-level status/check constraints, true human identity matching beyond `operatorId`, and a real concurrent race integration test.
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
| 2026-06-07 | API tests failed only when run in a broad parallel tool batch from the sandbox cwd, losing tsx decorator config | Reran `npm.cmd run test --workspace @smart-cs-agent/api` alone from the repo cwd; 153/153 passed |
