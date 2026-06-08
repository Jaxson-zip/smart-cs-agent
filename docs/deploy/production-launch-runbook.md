# PR34 Production Launch And Rollback Runbook

This runbook turns the existing readiness, canary, alerting, and queue recovery tools into a launch rehearsal. It is for a controlled commercial rollout where the operator workbench can be deployed and real-channel signed intake may be opened for a limited allowlist.

It does not prove that real refunds, address changes, coupons, logistics edits, or customer-visible replies are safe to automate. Real customer actions still require separate provider-specific sandbox evidence, approval policies, and human review.

`POST /v2/provider-reads/execute` is also contract-only in this launch track: accepted readonly policy responses must keep `networkExecution=not_implemented` and `providerDataReturned=false`, so the route does not prove live provider order or logistics reads.

Provider read attempts may persist sanitized `ProviderReadRun` rows for audit and idempotency only after the case is verified inside the authenticated tenant. Launch evidence may reference run counts and hashes, but must not include raw order IDs, logistics IDs, provider payloads, provider responses, customer data, operator API keys, or provider tokens.

Admin-only provider read operations routes may be used during launch support to inspect recent run status and aggregate counts. Direct `/v2/provider-reads/*` routes require an authenticated admin operator API key and reject the legacy insecure `x-tenant-id` header fallback. They must expose only fingerprints and counts, never raw lookup values, provider payloads, provider responses, operator API keys, provider tokens, or tenant secrets.

Provider credential resolution is still a no-secret, no-network boundary in this launch track. `ProviderCredentialResolverService` may produce `credentialRefFingerprint`, `credentialRefConfigured`, `credentialMaterialLoaded=false`, and `secretValueReturned=false`, but launch evidence must not include full credential references, secret manager paths, access tokens, client secrets, provider tokens, or provider responses.

Provider credential store configuration is ref-only. `PROVIDER_CREDENTIALS` may list `{ credentialRef }` records for future readonly clients, but it must not contain inline token material, API keys, client secrets, provider payloads, or customer data. The provider credential store does not load credential material, call a vault, or call provider APIs.

The provider readonly sandbox harness is still no-network in this launch track. `ProviderReadonlyClientHarnessService` may prepare sanitized execution metadata for future readonly clients, but launch evidence must keep `networkAttempted=false`, `providerDataReturned=false`, and `providerResponseCaptured=false`. Do not include raw lookup values, provider request payloads, provider responses, full credential references, access tokens, client secrets, provider tokens, or customer data in launch tickets or audit exports.

Provider write requests are also review-only in this launch track. `ProviderWriteRequest` may queue low-risk requests allowed by `PROVIDER_WRITE_REVIEW_ADAPTERS`, but accepted requests must keep `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`. The queue persists `idempotencyKeyHash`, not raw caller idempotency keys. Do not include raw order IDs, logistics IDs, addresses, provider payloads, provider responses, idempotency keys, operator API keys, provider tokens, or customer data in launch tickets or audit exports.

Provider write payload escrow boundary is still pre-execution in this launch track. `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE` defaults to `disabled`; explicit `sealed_metadata` may store request-only fingerprints such as `payloadEscrowEnvelopeFingerprint` for future executor readiness. It must not store raw payloads, ciphertext bodies, credential refs, provider responses, or customer-visible messages. Provider write payload escrow boundary does not open payload escrow and does not prove that a real provider write can run.

Provider write dry-run rehearsal evidence is still no-network in this launch track. The `smart-cs-agent.provider-write-dry-run-rehearsal.v1` package proves only that request, human review, and execution-attempt safety controls were rehearsed with sanitized fingerprints. It must not include raw tenant IDs, order IDs, logistics IDs, addresses, provider payloads, provider responses, idempotency keys, credentials, tokens, or customer messages.

Provider write kill-switch rehearsal evidence is still no-network in this launch track. The `smart-cs-agent.provider-write-kill-switch-rehearsal.v1` package proves only that emergency stop engagement, `emergency_stop_engaged` execution blocking, release safety, idempotency, audit, and two-person observation were rehearsed with sanitized fingerprints and hashes. It must not include raw tenant IDs, order IDs, logistics IDs, addresses, provider payloads, provider responses, idempotency keys, credentials, tokens, or customer messages.

Provider write live pilot preflight evidence is still no-network in this launch track. The `smart-cs-agent.provider-write-live-pilot-preflight.v1` package proves only that the first real provider write pilot is single merchant, single channel, low risk, bounded, operator-watched, rollback-ready, observable, and bound to prior dry-run rehearsal, kill-switch rehearsal, provider write approval, live executor guard, control-plane, and production launch evidence. It must not include raw tenant IDs, order IDs, logistics IDs, addresses, provider payloads, provider responses, idempotency keys, credentials, tokens, or customer messages.

Provider write live pilot run ledger evidence is still verifier-side no-network in this launch track. The `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` package is exported after a pilot window closes and proves only sanitized run facts: at least one low-risk run inside the declared pilot window, action, status, provider-mutation fact, audit hash, review proof, failure/rollback closeout, and no automatic customer-visible replies. Failed provider mutations require rollback verification before the ledger can pass. It must not include raw tenant IDs, order IDs, logistics IDs, addresses, provider payloads, provider responses, idempotency keys, credentials, tokens, or customer messages.

Provider write live pilot run ledger draft export is support-only in this launch track. Admins may inspect `smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1` through `GET /v2/provider-writes/live-pilot-run-ledger/draft` or `GET /api/operator/provider-writes/live-pilot-run-ledger/draft`, but drafts must keep `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`. The draft can help assemble PR69 evidence after a window closes, but it does not replace artifact bindings, live provider mutation evidence, or release-owner closeout review. The exporter does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies.

Provider write manual closeout review evidence is the human signoff after a live pilot window. The `smart-cs-agent.provider-write-manual-closeout-review.v1` package must be exported under `provider-write-manual-closeout-review-artifacts/`, reviewed with `npm run verify:provider-write-manual-closeout-review:safe`, and bound into the PR69 ledger as `providerWriteManualCloseoutReviewSha256` before expansion beyond the first `single_merchant_pilot`. It proves release, operations, and rollback owners reviewed the PR70 draft, sanitized audit export, failed-run incidents, rollback actions, production launch evidence, and no automatic customer-visible replies. The verifier does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies. See `docs/deploy/provider-write-manual-closeout-review.md`.

Provider write live executor startup guard is still closed in this launch track. `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED` must remain `false` unless a future launch explicitly enables a live executor after dry-run evidence, provider write approval evidence, sealed metadata readiness, review allowlists, credential refs, and kill-switch ownership are all present. The startup guard does not call provider APIs, does not execute provider writes, does not read credential material, does not open or decrypt payload escrow, does not store raw provider/customer payloads, and does not send customer-visible replies.

Provider write live executor control plane is read-only in this launch track. Admins may inspect `ProviderWriteLiveExecutorStatusSchema` through `GET /v2/provider-writes/live-executor/status` or `GET /api/operator/provider-writes/live-executor/status`, but the status surface does not execute provider writes, does not expose evidence hashes, does not expose credential refs, and does not expose provider payloads, provider responses, raw order IDs, logistics IDs, addresses, idempotency keys, operator API keys, provider tokens, webhook secrets, tenant secrets, or customer messages.

Provider write kill switch control plane is an emergency-stop surface in this launch track. Admins may inspect and update `ProviderWriteKillSwitchStatusSchema` through `GET /v2/provider-writes/kill-switch/status`, `POST /v2/provider-writes/kill-switch/status`, `GET /api/operator/provider-writes/kill-switch/status`, or `POST /api/operator/provider-writes/kill-switch/status`. It records sanitized state events with hashed idempotency keys only. When engaged, provider write execution attempts must fail closed with `policyReason=emergency_stop_engaged`; releasing the persisted emergency stop does not change env variables and does not enable real provider writes.

Provider write execution attempt visibility is support-only in this launch track. Admins may inspect sanitized `ProviderWriteExecutionAttemptListItem` rows through `GET /v2/provider-writes/execution-attempts` or `GET /api/operator/provider-writes/execution-attempts`, but these routes must remain read-only and must not expose raw hashes, raw order IDs, logistics IDs, addresses, provider payloads, provider responses, customer messages, operator API keys, provider tokens, webhook secrets, or tenant secrets. Provider write execution attempt visibility does not prove that any real provider write has run.

## Launch Decision

Use this runbook before every production launch or gray release that changes real-channel intake, queue handling, identity, readiness, metrics, alerting, or operator review behavior.

Launch may proceed only when all of these are true:

- A rollback owner, incident owner, and operator lead are named in the deploy ticket.
- `.github/workflows/production-static-gates.yml` has passed on the release branch, including `npm run verify:production-static-ci`.
- Production branch protection evidence has passed `npm run verify:production-branch-protection:safe`, with `Static production gates` configured as a required status check and no bypass actors.
- Any real provider write pilot has passed `npm run verify:production-provider-write-approval:safe`, remains `human_review_required`, and has automatic provider writes disabled.
- `npm run verify:provider-write-requests` passes when provider write request queue contracts, `ProviderWriteRequest` persistence, `PROVIDER_WRITE_REVIEW_ADAPTERS`, API/BFF routes, or sanitized response behavior change.
- `npm run verify:provider-write-execution-attempt-visibility` passes when provider write execution attempt visibility, DB no-network constraints, API/BFF list routes, or sanitized list response behavior change.
- `npm run verify:provider-write-payload-escrow-boundary` passes when `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE`, request-only escrow metadata, payload escrow fingerprints, execution-attempt escrow blocking, or escrow docs change.
- `npm run verify:provider-write-dry-run-rehearsal:safe` passes before any real provider write pilot approval is accepted, with sanitized dry-run evidence bound by `dryRunRehearsalSha256`.
- `npm run verify:provider-write-kill-switch-rehearsal:safe` passes before any real provider write pilot approval is accepted, with sanitized emergency-stop evidence bound by `providerWriteKillSwitchSha256`.
- `npm run verify:provider-write-live-pilot-preflight:safe` passes before any launch window enables a live provider write pilot, with sanitized preflight evidence bound to provider write approval and rehearsal hashes.
- `npm run verify:provider-write-live-pilot-run-ledger` passes when run-ledger evidence shape, closeout docs, static CI wiring, or launch closeout guidance changes.
- `npm run verify:provider-write-live-pilot-run-ledger-draft-export` passes when ledger draft export schema, API/BFF draft routes, or draft-only evidence boundaries change.
- `npm run verify:provider-write-manual-closeout-review:safe` passes after a live provider write pilot window closes and before any PR69 safe ledger is accepted, with `SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE` and `SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true`.
- `npm run verify:provider-write-live-executor-startup-guard` passes when `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`, live executor evidence hashes, sealed metadata startup gating, review allowlists, credential ref requirements, or live executor docs change.
- `npm run verify:provider-write-live-executor-control-plane` passes when `ProviderWriteLiveExecutorStatusSchema`, API/BFF live executor status routes, admin-only status visibility, or live executor control-plane docs change.
- `npm run verify:provider-write-kill-switch-control-plane` passes when `ProviderWriteKillSwitchStatusSchema`, `ProviderWriteKillSwitchEvent`, API/BFF emergency-stop routes, persisted kill-switch execution blocking, or kill-switch control-plane docs change.
- Database migrations have been reviewed and `npm run db:migrate:deploy` has completed in the target environment.
- `npm run verify:production-readiness -- --env-file=<secure-production-env> --require-real-channel --api=<public-api-url>` passes for real-channel launch windows.
- `npm run verify:merchant-launch-preflight:safe` passes for every tenant/channel pair included in the launch allowlist after the launch target has been injected through secure environment variables.
- `npm run generate:launch-evidence:safe` has produced a sanitized launch evidence bundle for every tenant/channel pair in scope.
- `npm run verify:launch-evidence-archive:safe` has verified each archived launch evidence bundle with pass, real-channel, and provider-readonly requirements enabled through secure environment variables.
- `npm run verify:launch-manifest:safe` has verified the multi-merchant/channel launch manifest with every referenced evidence archive matching its tenant fingerprint and channel.
- `npm run verify:production-canary -- --api=<public-api-url> --require-real-channel --max-stale-processing=0 --max-oldest-pending-age-seconds=900` passes.
- `npm run verify:production-deploy-artifacts` passes, and `docs/deploy/production-deployment-artifacts.md` matches the API/Web artifacts being deployed.
- `npm run verify:production-image-builds` passes from the release branch, and `npm run verify:production-image-builds:docker` passes in a Docker-enabled CI job before publishing or deploying images.
- `npm run verify:production-container-smoke` passes from the release branch, and `npm run verify:production-container-smoke:docker` passes in a Docker-enabled CI job to prove the built API/Web containers start before publishing or deploying images.
- `npm run verify:production-image-security` passes from the release branch, and `npm run verify:production-image-security:docker` passes in a Docker-enabled CI job to produce SBOM and vulnerability evidence before publishing or deploying images.
- `npm run verify:production-release-provenance` passes from the release branch, and `npm run verify:production-release-provenance:safe` verifies sanitized promotion evidence with `SMARTCS_RELEASE_PROVENANCE_FILE` and `SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true`.
- `npm run verify:production-release-evidence` passes from the release branch, and `npm run verify:production-release-evidence:safe` verifies the sanitized post-deploy evidence archive with `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE` and `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true`.
- `npm run verify:production-change-approval` passes from the release branch, and `npm run verify:production-change-approval:safe` verifies the sanitized change approval package with `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE` and `SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true`.
- `npm run verify:production-launch-binding` passes from the release branch, and `npm run verify:production-launch-binding:safe` verifies release provenance, production release evidence, production change approval, and launch manifest artifacts all bind to the same release id, source commit, production target, change ticket, manifest scope, and artifact SHA-256 set.
- `npm run verify:production-alerting` and `npm run verify:channel-runbook` pass from the release branch.
- `npm run verify:provider-adapters` passes, and the Provider adapter contract still shows no real provider network calls, no real commerce writes, and no customer-visible actions for current Taobao/Douyin adapters.
- `npm run verify:provider-readonly` passes when `PROVIDER_READONLY_ADAPTERS` or provider contract projection changes.
- `npm run verify:provider-read-contract` passes when `POST /v2/provider-reads/execute`, provider read policy, or readonly response shape changes.
- `npm run verify:provider-read-audit` passes when provider read persistence, idempotency, or audit behavior changes.
- `npm run verify:provider-read-operations` passes when provider read operations visibility, BFF mapping, or sanitized response behavior changes.
- `npm run verify:provider-credential-boundary` passes when provider credential resolution, `credentialRef` handling, or future readonly connector setup changes.
- `npm run verify:provider-credential-store` passes when `PROVIDER_CREDENTIALS`, provider credential store behavior, or credential inventory docs change.
- `npm run verify:provider-read-harness` passes when provider readonly execution planning, timeout/retry config, or sanitized harness audit metadata changes.
- Alert routes for API down, database down, real-channel misconfiguration, queue degradation, stale processing, and oldest pending age are enabled.
- Alert routes for `SmartCsAgentApiDown`, `SmartCsAgentDatabaseDown`, `SmartCsAgentRealChannelMisconfigured`, `SmartCsAgentRealChannelKillSwitchEnabled`, `SmartCsAgentChannelQueueDegraded`, `SmartCsAgentStaleProcessingClaims`, and `SmartCsAgentOldestPendingTooOld` are enabled and have owners.
- The first launch allowlist is intentionally small and every allowlisted pair has a matching webhook secret.

If real-channel intake is not part of the launch, omit `--require-real-channel` and keep `REAL_CHANNEL_WEBHOOKS_ENABLED=false` or `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`.

## Preflight Commands

Run these from the release branch before deploy:

```bash
npm run db:generate
npm run test --workspace @smart-cs-agent/api
npm run test --workspace @smart-cs-agent/web
npm run typecheck --workspaces --if-present -- --pretty false
npm run lint --workspaces --if-present -- --max-warnings=0
npm run build --workspaces --if-present
npm run verify:production-static-ci
npm run verify:production-branch-protection
npm run verify:production-branch-protection:safe
npm run verify:production-provider-write-approval
npm run verify:provider-write-requests
npm run verify:provider-write-execution-attempt-visibility
npm run verify:provider-write-payload-escrow-boundary
npm run verify:provider-write-dry-run-rehearsal
npm run verify:provider-write-dry-run-rehearsal:safe
npm run verify:provider-write-kill-switch-rehearsal
npm run verify:provider-write-kill-switch-rehearsal:safe
npm run verify:provider-write-live-executor-startup-guard
npm run verify:provider-write-live-executor-control-plane
npm run verify:provider-write-kill-switch-control-plane
npm run verify:production-provider-write-approval:safe
npm run verify:provider-write-live-pilot-preflight
npm run verify:provider-write-live-pilot-preflight:safe
npm run verify:provider-write-live-pilot-run-ledger
npm run verify:provider-write-live-pilot-run-ledger-draft-export
npm run verify:provider-write-manual-closeout-review
npm run verify:provider-write-manual-closeout-review:safe
npm run verify:production-readiness -- --env-file=<secure-production-env> --require-real-channel --api=<public-api-url>
npm run verify:merchant-launch-preflight:safe
npm run generate:launch-evidence:safe
npm run verify:launch-evidence-archive:safe
npm run verify:launch-manifest:safe
npm run verify:launch-evidence
npm run verify:production-canary -- --api=<public-api-url> --require-real-channel --max-stale-processing=0 --max-oldest-pending-age-seconds=900
npm run verify:production-deploy-artifacts
npm run verify:production-image-builds
npm run verify:production-container-smoke
npm run verify:production-image-security
npm run verify:production-release-provenance
npm run verify:production-release-evidence
npm run verify:production-change-approval
npm run verify:production-launch-binding
npm run verify:production-alerting
npm run verify:provider-adapters
npm run verify:provider-readonly
npm run verify:provider-read-contract
npm run verify:provider-read-audit
npm run verify:provider-read-operations
npm run verify:provider-credential-boundary
npm run verify:provider-credential-store
npm run verify:provider-read-harness
npm run verify:channel-runbook
```

Inject `SMARTCS_LAUNCH_ENV_FILE`, `SMARTCS_LAUNCH_TENANT`, `SMARTCS_LAUNCH_CHANNEL`, `SMARTCS_LAUNCH_EVIDENCE_OUT`, `SMARTCS_LAUNCH_EVIDENCE_FILE`, `SMARTCS_LAUNCH_MANIFEST_FILE`, `SMARTCS_LAUNCH_EVIDENCE_DIR`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true`, `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true`, `SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS=true`, `SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS=true`, `SMARTCS_RELEASE_PROVENANCE_FILE`, `SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE`, `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE`, `SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE`, `SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true`, `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE`, `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true`, `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE`, `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE`, `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true`, `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE`, `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true`, `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=false`, `PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256`, and `PROVIDER_WRITE_APPROVAL_SHA256` through the CI secret/environment layer before running the safe commands. Configure `PROVIDER_WRITE_REVIEW_ADAPTERS` only as a server-side low-risk allowlist when the provider write request queue is in scope; it must not contain credentials, provider payloads, customer data, or tenant secrets. Use `SMARTCS_LAUNCH_EVIDENCE_OUT` for generation, `SMARTCS_LAUNCH_EVIDENCE_FILE` for single archive verification, `SMARTCS_LAUNCH_MANIFEST_FILE` plus `SMARTCS_LAUNCH_EVIDENCE_DIR` for multi-merchant manifest verification, `SMARTCS_RELEASE_PROVENANCE_FILE` for sanitized release provenance verification, `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE` for sanitized production release evidence archive verification, `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE` for sanitized production change approval verification, `SMARTCS_PRODUCTION_LAUNCH_BINDING_*` for sanitized cross-artifact launch binding verification, `SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE` for sanitized branch protection evidence verification, `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE` for sanitized provider write dry-run rehearsal verification, `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE` for sanitized provider write kill-switch rehearsal verification, `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE` for sanitized provider write approval verification, and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE` for sanitized provider write live pilot preflight verification. Keep `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=false` during this launch track unless a future launch explicitly accepts live write execution. Do not pass raw tenant IDs, env-file paths, evidence output paths, evidence archive paths, manifest paths, evidence directories, release provenance paths, production release evidence paths, production change approval paths, production launch binding paths, production branch protection paths, provider write dry-run rehearsal paths, provider write kill-switch rehearsal paths, production provider write approval paths, provider write live pilot preflight paths, provider write idempotency keys, raw provider write payloads, or artifact hashes as npm command arguments in recorded launch logs.

After a bounded live pilot window closes, inject `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true` through the CI secret/environment layer before running `npm run verify:provider-write-live-pilot-run-ledger:safe`. Use `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE` only for sanitized provider write live pilot run ledger verification. Do not pass provider write live pilot run ledger paths, raw provider write payloads, provider responses, tenant IDs, order IDs, logistics IDs, addresses, customer messages, idempotency keys, credentials, tokens, or artifact hashes as npm command arguments in recorded launch logs.

Do not put operator API keys, webhook secrets, signatures, raw request bodies, customer messages, provider payloads, tenant IDs, or API URLs with query-string secrets into the deploy ticket, CI logs, Prometheus labels, alert annotations, or this repository.

## Deploy Sequence

1. Deploy migrations with `npm run db:migrate:deploy`.
2. Deploy the API and Web artifacts described in `docs/deploy/production-deployment-artifacts.md`.
3. Confirm `GET /health/ready` is `ok` or intentionally `degraded` only under an accepted incident note.
4. Confirm `GET /metrics` is scrapeable and contains aggregate service, database, real-channel, and queue gauges only.
5. Run the production canary.
6. Confirm the operator workbench login works through the database-backed identity provider.
7. If real-channel intake is launching, enable the smallest allowlist first.
8. Keep the first window under active operator coverage until the oldest pending age and stale processing counts remain below thresholds.

## Rollback Triggers

Rollback or pause the launch immediately when any of these happen:

- `SmartCsAgentApiDown`, `SmartCsAgentDatabaseDown`, `SmartCsAgentRealChannelMisconfigured`, `SmartCsAgentRealChannelKillSwitchEnabled`, `SmartCsAgentChannelQueueDegraded`, `SmartCsAgentStaleProcessingClaims`, or `SmartCsAgentOldestPendingTooOld` fires.
- `npm run verify:production-canary` fails without an accepted degraded-rollout reason.
- `checks.channelWebhooks.status` is `misconfigured` or `disabled_by_kill_switch` during a real-channel-required launch.
- `staleProcessingCount` is above the launch threshold.
- `oldestPendingAgeSeconds` is above the launch threshold.
- Operators report duplicate cases, missing pending messages, unauthorized access, or customer-visible actions that bypass human review.

## Rollback Sequence

Use the smallest rollback that stops the risk:

1. Set `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true` to stop all real-channel signed intake without changing secrets.
2. Remove the affected pair from `REAL_CHANNEL_WEBHOOK_ALLOWLIST` if one merchant/channel must be paused.
3. Set `REAL_CHANNEL_WEBHOOKS_ENABLED=false` if the launch should return to operator-workbench-only mode.
4. Revert the application artifact only after intake is stopped or confirmed safe.
5. Run `npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>` without `--require-real-channel` if real intake is intentionally closed.
6. Run `npm run verify:production-canary -- --api=<public-api-url> --allow-degraded` only when the incident owner has accepted queue pressure.
7. Check queue metrics and recover stale processing claims only when stale claims remain.

Rollback must not execute real refunds, address changes, coupons, logistics edits, or customer-visible replies. It should stop intake, preserve review data, and keep operator recovery explicit.

## Stale Claim Recovery

Use recovery only after confirming stuck `processing` claims:

```bash
curl -sS \
  -X POST \
  -H "Authorization: Bearer <admin-operator-key>" \
  -H "Content-Type: application/json" \
  -d '{"olderThanMinutes":15,"limit":50}' \
  https://api.example.com/v1/channel-events/recover-stale
```

After recovery:

- Check `GET /v1/channel-events/metrics` for `staleProcessingCount=0`.
- Check `GET /v1/channel-events/operation-audits` for a sanitized recovery record.
- Check `GET /v1/channel-events/audit-summary` for bounded totals.
- Confirm no audit response exposes raw audit JSON, event ID lists, normalized event IDs, tenant IDs, provider payloads, external IDs, customer messages, operator API keys, or secrets.

## Post-Launch Evidence

Collect these facts in the launch ticket without copying sensitive values:

- Git commit SHA and deployed artifact version.
- Migration status and whether there were pending migrations.
- Production readiness verifier result.
- Production canary result.
- Sanitized launch evidence bundle path and summary status.
- Alert route confirmation.
- Real-channel intake state: closed, kill-switch enabled, or allowlist-open.
- Queue metrics summary: pending count, stale processing count, and oldest pending age.
- Operator coverage window and incident owner.
- Rollback decision: not needed, partial allowlist pause, kill switch, intake disabled, or artifact reverted.

Do not paste response bodies, metric bodies, customer messages, provider payloads, tenant IDs, external conversation IDs, external message IDs, operator API keys, webhook secrets, signatures, or raw request bodies.

The launch evidence bundle must not include raw tenant IDs, webhook secrets, operator API keys, full credential refs, provider tokens, provider payloads, customer data, raw order IDs, raw logistics IDs, response bodies, metric bodies, external conversation IDs, external message IDs, signatures, or raw request bodies.

## Rehearsal

Before opening real-channel traffic for a new merchant, rehearse these paths in a sandbox or staging environment:

- Healthy launch: readiness passes, canary passes, no queue pressure.
- Kill-switch rollback: `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true` closes intake and readiness reports `disabled_by_kill_switch`.
- Allowlist rollback: removing one allowlist pair blocks that merchant/channel while other pairs remain configured.
- Queue recovery: a stale processing claim returns to pending and leaves a sanitized recovery audit.
- Alert response: each critical alert has an owner and a runbook link.

The rehearsal is complete only when the team can stop intake, prove recovery, and continue the operator workbench without exposing secrets or executing customer-visible actions.

## Verification

Run:

```bash
npm run verify:production-launch
```

This checks that the launch runbook stays connected to readiness, canary, alerting, channel queue operations, rollback controls, recovery evidence, and no-secret/no-customer-action boundaries. Run `npm run verify:provider-adapters` alongside it when provider adapter contracts or action execution policy change.

Run `npm run verify:production-deploy-artifacts` alongside it when Dockerfiles, production compose examples, Next standalone output, image startup commands, or deployment artifact docs change.

Run `npm run verify:production-static-ci` alongside it when `.github/workflows/production-static-gates.yml`, static CI command coverage, workflow permissions, or CI/deploy boundary docs change.

See `docs/deploy/production-static-ci.md` for the static PR/push workflow boundary.

Run `npm run verify:production-branch-protection` alongside it when branch protection evidence, required status check guidance, pull request review controls, bypass rules, or merge policy guidance change.

Use `SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE` and `SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true` with `npm run verify:production-branch-protection:safe` after a repository administrator has exported sanitized branch protection evidence. See `docs/deploy/production-branch-protection.md`.

Run `npm run verify:production-provider-write-approval` alongside it when provider write pilot approval evidence, human-review controls, provider write kill switch, write limits, or rollback guidance change.

Use `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE` and `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true` with `npm run verify:production-provider-write-approval:safe` after release owners have exported sanitized provider write approval evidence. The safe command fails closed without approval evidence and the package must include `approvalStatus=approved`, distinct reviewer fingerprints, artifact hash bindings, and automatic provider writes disabled. See `docs/deploy/production-provider-write-approval.md`.

Run `npm run verify:provider-write-requests` alongside it when `ProviderWriteRequest`, `PROVIDER_WRITE_REVIEW_ADAPTERS`, provider write request API/BFF routes, idempotency, case ownership checks, or sanitized response behavior change. This verifier keeps the queue review-only and checks that it does not call provider APIs, execute provider writes, store raw provider payloads, or send customer-visible replies. See `docs/deploy/provider-write-requests.md`.

Run `npm run verify:provider-write-approval-state` alongside it when the Provider write approval state machine, approve/reject API/BFF routes, two-person review, self-approval blocking, controlled reason codes, `payloadEscrowStatus`, review fingerprints, or sanitized approval response behavior change. This verifier keeps approvals decision-only and checks that approval does not call provider APIs, execute provider writes, decrypt payload escrow, or send customer-visible replies. See `docs/deploy/provider-write-requests.md`.

Run `npm run verify:provider-write-execution-attempts` alongside it when the Provider write execution attempt state, execution-attempt API/BFF routes, `PROVIDER_WRITE_EXECUTION_KILL_SWITCH`, dry-run attempt recording, idempotency, payload escrow flags, or sanitized execution-attempt response behavior change. This verifier keeps execution attempts no-network and checks that attempts do not call provider APIs, execute provider writes, open payload escrow, or send customer-visible replies. See `docs/deploy/provider-write-requests.md`.

Run `npm run verify:provider-write-execution-attempt-visibility` alongside it when Provider write execution attempt visibility, DB no-network constraints, API/BFF list routes, `ProviderWriteExecutionAttemptListItem`, or sanitized response behavior change. This verifier keeps visibility read-only and checks that the browser and launch support exports do not expose raw hashes, provider payloads, provider responses, customer messages, operator API keys, provider tokens, or secrets. See `docs/deploy/provider-write-requests.md`.

Run `npm run verify:provider-write-payload-escrow-boundary` alongside it when Provider write payload escrow boundary config, request-only escrow metadata, `payloadEscrowStatus`, `payloadEscrowEnvelopeFingerprint`, execution-attempt escrow blocking, or sanitized response behavior change. This verifier keeps escrow readiness pre-execution and checks that requests do not store raw payloads while execution attempts do not open payload escrow or execute provider writes. See `docs/deploy/provider-write-requests.md`.

Run `npm run verify:provider-write-dry-run-rehearsal` alongside it when provider write dry-run rehearsal evidence shape, static CI wiring, launch evidence guidance, or approval evidence binding changes. Use `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE` and `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true` with `npm run verify:provider-write-dry-run-rehearsal:safe` after release owners export sanitized dry-run evidence. This verifier keeps rehearsal no-network and checks that evidence does not contain raw provider/customer data, credentials, idempotency keys, or customer-visible messages. See `docs/deploy/provider-write-dry-run-rehearsal.md`.

Run `npm run verify:provider-write-kill-switch-rehearsal` alongside it when provider write kill-switch rehearsal evidence shape, static CI wiring, launch evidence guidance, or approval evidence binding changes. Use `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE` and `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true` with `npm run verify:provider-write-kill-switch-rehearsal:safe` after release owners export sanitized emergency-stop rehearsal evidence. This verifier keeps rehearsal no-network and checks that evidence does not contain raw provider/customer data, credentials, idempotency keys, or customer-visible messages. See `docs/deploy/provider-write-kill-switch-rehearsal.md`.

Run `npm run verify:provider-write-live-pilot-preflight` alongside it when provider write live pilot preflight evidence shape, static CI wiring, launch ordering, launch evidence guidance, or live pilot approval binding changes. Use `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true` with `npm run verify:provider-write-live-pilot-preflight:safe` after release owners export sanitized launch-window preflight evidence. This verifier keeps preflight no-network and checks that the first pilot is single merchant, single channel, low risk, bounded, operator-watched, rollback-ready, observable, and free of raw provider/customer data, credentials, idempotency keys, and customer-visible messages. See `docs/deploy/provider-write-live-pilot-preflight.md`.

Run `npm run verify:provider-write-live-pilot-run-ledger` alongside it when provider write live pilot run ledger evidence shape, static CI wiring, launch closeout guidance, or post-window review requirements change. Use `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true` with `npm run verify:provider-write-live-pilot-run-ledger:safe` after a bounded live pilot window closes and release owners export sanitized closeout evidence. This verifier keeps closeout verification no-network and checks that every first-pilot run is low risk, reviewed, audit-bound, counted consistently, closed out for failures/rollbacks, and free of raw provider/customer data, credentials, idempotency keys, and automatic customer-visible replies. See `docs/deploy/provider-write-live-pilot-run-ledger.md`.

Run `npm run verify:provider-write-live-pilot-run-ledger-draft-export` alongside it when provider write live pilot run ledger draft export schema, API/BFF draft routes, static CI wiring, or draft-only launch guidance changes. This verifier keeps the draft support route no-network and checks that it returns `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false` while hiding raw tenant/customer/provider/idempotency data, credentials, payloads, responses, and customer-visible messages. See `docs/deploy/provider-write-live-pilot-run-ledger.md`.

Run `npm run verify:provider-write-live-executor-startup-guard` alongside it when provider write live executor startup config, evidence hashes, sealed metadata gating, kill switch requirements, review allowlists, credential ref requirements, static CI wiring, or launch guidance changes. This verifier keeps live provider writes disabled by default and checks that PR64 does not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, or send customer-visible replies. See `docs/deploy/provider-write-requests.md`.

Run `npm run verify:provider-write-live-executor-control-plane` alongside it when provider write live executor status contracts, admin-only API/BFF status routes, startup snapshot visibility, static CI wiring, or launch guidance changes. This verifier keeps PR65 read-only and checks that it does not expose evidence hashes, credential refs, provider payloads, provider responses, raw order/address/logistics data, operator API keys, provider tokens, webhook secrets, tenant secrets, or customer messages.

Run `npm run verify:provider-write-kill-switch-control-plane` alongside it when provider write emergency-stop contracts, `ProviderWriteKillSwitchEvent`, admin-only API/BFF status/update routes, persisted execution blocking, static CI wiring, or launch guidance changes. This verifier keeps PR66 no-network and checks that it does not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, or send customer-visible replies.

Run `npm run verify:production-image-builds` alongside it when Docker build scripts, image-build CI examples, or image build guidance changes. Run `npm run verify:production-image-builds:docker` in CI or another Docker-enabled environment before publishing image artifacts.

See `docs/deploy/production-image-builds.md` for the build-only image gate and `docs/deploy/production-image-build.yml.example` for the GitHub Actions template.

Run `npm run verify:production-container-smoke` alongside it when Docker runtime smoke scripts, container smoke CI examples, container startup commands, or runtime probe guidance changes. Run `npm run verify:production-container-smoke:docker` in CI or another Docker-enabled environment before publishing image artifacts.

See `docs/deploy/production-container-smoke.md` for the runtime smoke gate and `docs/deploy/production-container-smoke.yml.example` for the GitHub Actions template.

Run `npm run verify:production-image-security` alongside it when SBOM/vulnerability scan scripts, image security CI examples, scanner policy, or security evidence guidance changes. Run `npm run verify:production-image-security:docker` in CI or another Docker-enabled environment before publishing image artifacts.

See `docs/deploy/production-image-security.md` for the image security evidence gate and `docs/deploy/production-image-security.yml.example` for the GitHub Actions template.

Run `npm run verify:production-release-provenance` alongside it when release provenance scripts, promotion evidence shape, image digest policy, signing/provenance/SBOM attestation checks, or release promotion guidance changes. Run `npm run verify:production-release-provenance:safe` in CI or a launch terminal after `SMARTCS_RELEASE_PROVENANCE_FILE` and `SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true` are injected.

See `docs/deploy/production-release-provenance.md` for the release provenance boundary and `docs/deploy/production-release-provenance.yml.example` for the GitHub Actions template.

Run `npm run verify:production-release-evidence` alongside it when production release evidence scripts, post-deploy evidence schema, readiness/canary evidence, rollback owner proof, operator coverage, or release safety archive guidance changes. Run `npm run verify:production-release-evidence:safe` after `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE` and `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true` are injected.

See `docs/deploy/production-release-evidence.md` for the post-deploy evidence archive and `docs/deploy/production-release-evidence.yml.example` for the GitHub Actions template.

Run `npm run verify:production-change-approval` alongside it when production change approval scripts, approval schema, rollback drill evidence, operator coverage proof, freeze window controls, communication readiness, or launch signoff guidance changes. Run `npm run verify:production-change-approval:safe` after `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE` and `SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true` are injected.

See `docs/deploy/production-change-approval.md` for the production change approval gate and `docs/deploy/production-change-approval.yml.example` for the GitHub Actions template.

Run `npm run verify:production-launch-binding` alongside it when release provenance, production release evidence, production change approval, launch manifest, artifact hash binding, or production launch signoff guidance changes. Run `npm run verify:production-launch-binding:safe` after the `SMARTCS_PRODUCTION_LAUNCH_BINDING_*` file, hash, and require-pass variables are injected.

See `docs/deploy/production-launch-binding.md` for the production launch binding gate and `docs/deploy/production-launch-binding.yml.example` for the GitHub Actions template.

Run `npm run verify:provider-readonly` alongside it when `PROVIDER_READONLY_ADAPTERS`, provider readonly config parsing, or `readCapabilities` changes.

Run `npm run verify:provider-read-contract` alongside it when `POST /v2/provider-reads/execute`, provider read policy, or readonly response fields change.

Run `npm run verify:provider-read-audit` alongside it when `ProviderReadRun`, provider read idempotency, lookup hashing, or sanitized audit behavior changes.

Run `npm run verify:provider-read-operations` alongside it when provider read operations visibility, admin-only BFF routes, or sanitized run summaries change.

Run `npm run verify:provider-credential-boundary` alongside it when provider credential resolution, credential reference handling, or future readonly connector setup changes.

Run `npm run verify:provider-credential-store` alongside it when `PROVIDER_CREDENTIALS`, provider credential store behavior, or credential inventory docs change.

Run `npm run verify:provider-read-harness` alongside it when provider readonly sandbox harness execution planning, timeout/retry config, or sanitized execution audit metadata changes.
