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

## Launch Decision

Use this runbook before every production launch or gray release that changes real-channel intake, queue handling, identity, readiness, metrics, alerting, or operator review behavior.

Launch may proceed only when all of these are true:

- A rollback owner, incident owner, and operator lead are named in the deploy ticket.
- `.github/workflows/production-static-gates.yml` has passed on the release branch, including `npm run verify:production-static-ci`.
- Production branch protection evidence has passed `npm run verify:production-branch-protection:safe`, with `Static production gates` configured as a required status check and no bypass actors.
- Any real provider write pilot has passed `npm run verify:production-provider-write-approval:safe`, remains `human_review_required`, and has automatic provider writes disabled.
- `npm run verify:provider-write-requests` passes when provider write request queue contracts, `ProviderWriteRequest` persistence, `PROVIDER_WRITE_REVIEW_ADAPTERS`, API/BFF routes, or sanitized response behavior change.
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
npm run verify:production-provider-write-approval:safe
npm run verify:provider-write-requests
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

Inject `SMARTCS_LAUNCH_ENV_FILE`, `SMARTCS_LAUNCH_TENANT`, `SMARTCS_LAUNCH_CHANNEL`, `SMARTCS_LAUNCH_EVIDENCE_OUT`, `SMARTCS_LAUNCH_EVIDENCE_FILE`, `SMARTCS_LAUNCH_MANIFEST_FILE`, `SMARTCS_LAUNCH_EVIDENCE_DIR`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true`, `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true`, `SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS=true`, `SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS=true`, `SMARTCS_RELEASE_PROVENANCE_FILE`, `SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE`, `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE`, `SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_SHA256`, `SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE`, `SMARTCS_PRODUCTION_BRANCH_PROTECTION_REQUIRE_PASS=true`, `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE`, and `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true` through the CI secret/environment layer before running the safe commands. Configure `PROVIDER_WRITE_REVIEW_ADAPTERS` only as a server-side low-risk allowlist when the provider write request queue is in scope; it must not contain credentials, provider payloads, customer data, or tenant secrets. Use `SMARTCS_LAUNCH_EVIDENCE_OUT` for generation, `SMARTCS_LAUNCH_EVIDENCE_FILE` for single archive verification, `SMARTCS_LAUNCH_MANIFEST_FILE` plus `SMARTCS_LAUNCH_EVIDENCE_DIR` for multi-merchant manifest verification, `SMARTCS_RELEASE_PROVENANCE_FILE` for sanitized release provenance verification, `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE` for sanitized production release evidence archive verification, `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE` for sanitized production change approval verification, `SMARTCS_PRODUCTION_LAUNCH_BINDING_*` for sanitized cross-artifact launch binding verification, `SMARTCS_PRODUCTION_BRANCH_PROTECTION_FILE` for sanitized branch protection evidence verification, and `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE` for sanitized provider write approval verification. Do not pass raw tenant IDs, env-file paths, evidence output paths, evidence archive paths, manifest paths, evidence directories, release provenance paths, production release evidence paths, production change approval paths, production launch binding paths, production branch protection paths, production provider write approval paths, provider write idempotency keys, raw provider write payloads, or artifact hashes as npm command arguments in recorded launch logs.

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
