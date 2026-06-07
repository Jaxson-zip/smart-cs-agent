# Production-Readiness Baseline

## PR61 Provider Write Execution Attempt Invariants And Visibility

Provider write execution attempt invariants and visibility are now checked by:

```bash
npm run verify:provider-write-execution-attempt-visibility
```

This gate adds PostgreSQL check constraints and admin-only sanitized list visibility for `ProviderWriteExecutionAttempt` rows. It requires execution attempts to remain no-network, no-escrow, and customer-invisible at the database boundary, and it exposes only `ProviderWriteExecutionAttemptListItem` metadata through `GET /v2/provider-writes/execution-attempts` and `GET /api/operator/provider-writes/execution-attempts`. This verifier still does not call provider APIs, execute provider writes, read provider credentials, open payload escrow, store raw order/address/logistics/provider payload values, capture provider responses, expose operator API keys, or send customer-visible replies.

## PR60 Provider Write Execution Attempt Safety

Provider write execution attempts are now checked by:

```bash
npm run verify:provider-write-execution-attempts
```

This gate records no-network execution attempts for approved provider write requests. `PROVIDER_WRITE_EXECUTION_KILL_SWITCH` defaults to enabled; when it is enabled, attempts are persisted as `blocked`. Only when explicitly set to `false` can the system record `status=dry_run_recorded`, and even then it must keep `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `requiresHuman=true`. This verifier still does not call provider APIs, execute provider writes, open payload escrow, store raw order/address/logistics/provider payload values, capture provider responses, or send customer-visible replies.

## PR59 Provider Write Approval State Machine

Provider write approval state is now checked by:

```bash
npm run verify:provider-write-approval-state
```

This gate adds admin-only approve/reject transitions for queued `ProviderWriteRequest` rows. It enforces tenant scoping, Operator API key auth, two-person review, self-approval blocking, controlled reason codes, sanitized review fingerprints, and `payloadEscrowStatus=not_stored` as the no-raw-payload escrow boundary. Approved and rejected requests still return `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`. This verifier still does not call provider APIs, execute provider writes, read provider credentials, decrypt payload escrow, store raw order/address/logistics/provider payload values, send customer-visible replies, or enable automatic commerce actions.

## PR58 Provider Write Request Queue

Provider write requests are now checked by:

```bash
npm run verify:provider-write-requests
```

This gate adds a tenant-scoped `ProviderWriteRequest` queue for future human-reviewed provider writes. Operators may request only low-risk actions allowlisted by `PROVIDER_WRITE_REVIEW_ADAPTERS`, such as `modify_address`, `issue_coupon`, and `urge_logistics`; refunds and invoice updates remain blocked. Accepted requests are idempotent on `tenantId + idempotencyKeyHash`, verify `AfterSalesCase.id + merchantId` ownership before persistence, store only hashes and payload-key booleans, and return `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`. This verifier still does not call provider APIs, execute provider writes, read provider credentials, store raw idempotency/order/address/logistics/provider payload values, send customer-visible replies, or enable automatic commerce actions.

## PR57 Production Provider Write Approval Gate

Production provider write approval is now checked by:

```bash
npm run verify:production-provider-write-approval
npm run verify:production-provider-write-approval:safe
```

The gate defines the sanitized approval package required before a real provider write pilot can be considered. The first pilot must be single-merchant, `human_review_required`, explicitly limited to low-risk actions such as address change, coupon issue, and logistics urge, and must include `approvalStatus=approved`, distinct reviewer fingerprints, artifact hash bindings, human approval, two-person review, idempotency, audit, provider write kill switch, daily limits, coupon limits, dry-run rehearsal, and rollback ownership. This verifier still does not call provider APIs, execute provider writes, read provider credentials, send customer-visible replies, or enable automatic commerce actions.

## PR56 Production Branch Protection Gate

Production branch protection is now checked by:

```bash
npm run verify:production-branch-protection
npm run verify:production-branch-protection:safe
```

The gate defines the sanitized branch protection evidence required before commercial launch: the production branch must be protected, `Static production gates` must be configured as a required status check, pull request review controls must be enabled, stale reviews must be dismissed, code owner and last-push approval must be required, force pushes and deletions must be disabled, and bypass actors must be empty. This verifier still does not call the GitHub API, mutate branch protection, read GitHub secrets, deploy, publish images, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR55 Production Static CI Gate

Production static CI is now checked by:

```bash
npm run verify:production-static-ci
```

The real GitHub Actions workflow `.github/workflows/production-static-gates.yml` runs static production gates on pull requests, pushes, and manual dispatch without secrets, live production URLs, launch artifacts, deployment credentials, Docker publish access, or provider credentials. This gate still does not call production APIs, connect to production databases, run production migrations, publish images, authenticate to a registry, read deployment secrets, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR54 Production Launch Binding Gate

Production launch binding is now checked by:

```bash
npm run verify:production-launch-binding
npm run verify:production-launch-binding:safe
```

The default command validates the launch binding gate, docs, workflow example, and launch references. The safe command reads sanitized release provenance, production release evidence, production change approval, and launch manifest artifacts from their artifact directories, then verifies they belong to the same release id, source commit, production target, change ticket, manifest scope, and artifact SHA-256 set through `SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS=true`. Use `docs/deploy/production-launch-binding.yml.example` after release provenance, release evidence, change approval, and launch manifest artifacts have been exported. This gate still does not call the API, connect to a database, publish images, authenticate to a registry, read deployment secrets, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR53 Production Change Approval Gate

Production change approval is now checked by:

```bash
npm run verify:production-change-approval
npm run verify:production-change-approval:safe
```

The default command validates the change approval gate, docs, workflow example, and launch references. The safe command reads a sanitized `smart-cs-agent.production-change-approval.v1` package from `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE` and can require approved product/engineering/security/operations signoff, rollback owner, kill-switch readiness, rollback drill, operator coverage, freeze window, communication readiness, and safety facts through `SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true`. Use `docs/deploy/production-change-approval.yml.example` after release evidence has been exported. This gate still does not call the API, connect to a database, publish images, authenticate to a registry, read deployment secrets, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR52 Production Release Evidence Archive

Production release evidence is now checked by:

```bash
npm run verify:production-release-evidence
npm run verify:production-release-evidence:safe
```

The default command validates the release evidence archive gate, docs, workflow example, and launch references. The safe command reads a sanitized `smart-cs-agent.production-release-evidence.v1` archive from `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE` and can require passing provenance, launch manifest, readiness, canary, alerting, rollback owner, operator coverage, and safety facts through `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true`. Use `docs/deploy/production-release-evidence.yml.example` after release provenance, launch manifest, readiness, and canary evidence have been exported. This gate still does not call the API, connect to a database, publish images, authenticate to a registry, read deployment secrets, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR51 Production Release Provenance And Promotion Boundary

Production release provenance is now checked by:

```bash
npm run verify:production-release-provenance
npm run verify:production-release-provenance:safe
```

The default command validates the release provenance gate, docs, workflow example, and launch references. The safe command reads a sanitized `smart-cs-agent.release-provenance.v1` evidence bundle from `SMARTCS_RELEASE_PROVENANCE_FILE` and can require passing image build, container smoke, image security, signature, provenance, SBOM attestation, and promotion approval facts through `SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true`. Use `docs/deploy/production-release-provenance.yml.example` after the image build, container smoke, and image security workflows. This gate still does not publish images, authenticate to a registry, read deployment secrets, sign artifacts, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR50 Production Image Security Evidence Gate

Production image security evidence is now checked by:

```bash
npm run verify:production-image-security
npm run verify:production-image-security:docker
```

The default command validates the image security gate, docs, workflow example, and launch references. The `:docker` command runs SBOM and vulnerability scanners against the already-built API and Web image tags and stores local evidence artifacts. Use `docs/deploy/production-image-security.yml.example` after the image build and container smoke workflows. This gate still does not publish images, authenticate to a registry, read deployment secrets, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR49 Production Container Runtime Smoke Gate

Production container runtime smoke is now checked by:

```bash
npm run verify:production-container-smoke
npm run verify:production-container-smoke:docker
```

The default command validates the runtime smoke gate, docs, workflow example, and launch references. The `:docker` command starts temporary API and Web containers plus a synthetic local Postgres dependency, checks API `GET /health` and Web `GET /`, and then cleans up. Use `docs/deploy/production-container-smoke.yml.example` after the image build workflow. This gate still does not publish images, authenticate to a registry, read deployment secrets, call real channel webhooks, execute provider reads or writes, or send customer-visible replies.

## PR48 Production Image Build Gate

Production image builds are now checked by:

```bash
npm run verify:production-image-builds
npm run verify:production-image-builds:docker
```

The default command validates the build gate, docs, workflow example, and launch references. The `:docker` command builds the API and Web images locally without pushing them. Use `docs/deploy/production-image-build.yml.example` as the first CI template for build-only image verification. This gate still does not publish images, choose a registry, sign artifacts, deploy traffic, enable real provider writes, return provider payloads, or send customer-visible replies.

## PR47 Production Deployment Artifacts

Production-shaped deployment artifacts are now checked by:

```bash
npm run verify:production-deploy-artifacts
```

The deploy artifact set includes `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`, `docker-compose.production.yml.example`, and `docs/deploy/production-deployment-artifacts.md`. The API image starts `node apps/api/dist/main.js`, the Web image starts the Next standalone server, and the compose example requires secret injection instead of concrete values. These artifacts still do not enable real refunds, address changes, coupons, logistics edits, customer-visible replies, provider writes, provider payload reads, or secret-manager access.

## PR46 Multi-Merchant Launch Manifest

Multi-merchant or multi-channel launch windows now have a local manifest verifier:

```bash
npm run verify:launch-manifest:safe
```

The manifest schema is `smart-cs-agent.launch-manifest.v1`. A launch manifest contains a safe `releaseId`, launch `requirements`, and entries shaped as `{ "tenantFingerprint": "<12-hex>", "channel": "<channel>", "evidenceFile": "<tenantFingerprint>-<channel>.json" }`. It must not contain raw tenant IDs, merchant IDs, env-file paths, credential refs, webhook secrets, operator API keys, provider tokens, provider payloads, customer data, order IDs, logistics IDs, response bodies, metric bodies, signatures, or raw bodies.

Set `SMARTCS_LAUNCH_MANIFEST_FILE`, `SMARTCS_LAUNCH_EVIDENCE_DIR`, `SMARTCS_LAUNCH_MANIFEST_REQUIRE_PASS=true`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true`, and `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true` for the launch gate. The verifier reads each referenced PR44 evidence archive, checks the manifest entry matches the evidence target, rejects duplicate tenant/channel pairs, enforces required launch tracks, and prints only release id, entry count, and channel count.

## PR45 Launch Evidence Archive Safety

Launch preflight and evidence generation now have safe env-mode commands for CI and launch terminals:

```bash
npm run verify:merchant-launch-preflight:safe
npm run generate:launch-evidence:safe
npm run verify:launch-evidence-archive:safe
```

These commands read launch target values from secure environment variables instead of command-line arguments: `SMARTCS_LAUNCH_ENV_FILE`, `SMARTCS_LAUNCH_TENANT`, `SMARTCS_LAUNCH_CHANNEL`, `SMARTCS_LAUNCH_EVIDENCE_OUT`, `SMARTCS_LAUNCH_EVIDENCE_FILE`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL`, `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY`, and `SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS`.

Set these values for a real launch gate:

| Command | Required environment values |
| --- | --- |
| `npm run verify:merchant-launch-preflight:safe` | `SMARTCS_LAUNCH_ENV_FILE`, `SMARTCS_LAUNCH_TENANT`, `SMARTCS_LAUNCH_CHANNEL`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true`, `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true` |
| `npm run generate:launch-evidence:safe` | `SMARTCS_LAUNCH_ENV_FILE`, `SMARTCS_LAUNCH_TENANT`, `SMARTCS_LAUNCH_CHANNEL`, `SMARTCS_LAUNCH_EVIDENCE_OUT`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true`, `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true` |
| `npm run verify:launch-evidence-archive:safe` | `SMARTCS_LAUNCH_EVIDENCE_FILE`, `SMARTCS_LAUNCH_EVIDENCE_REQUIRE_PASS=true`, `SMARTCS_LAUNCH_REQUIRE_REAL_CHANNEL=true`, `SMARTCS_LAUNCH_REQUIRE_PROVIDER_READONLY=true` |

Use the safe commands in launch tickets and CI so npm does not echo raw tenant IDs, env-file paths, or evidence output paths in command logs. The archive verifier reads the generated JSON evidence bundle, checks the schema and required launch tracks, and rejects forbidden raw fields or values such as tenant IDs, full credential refs, webhook secrets, operator API keys, provider tokens, provider payloads, customer data, order IDs, logistics IDs, response bodies, metric bodies, signatures, and raw bodies.

## PR44 Launch Evidence Bundle

Launch evidence can now be generated as a sanitized local JSON bundle:

```bash
npm run generate:launch-evidence:safe
npm run verify:launch-evidence-archive:safe
npm run verify:launch-evidence
```

The bundle schema is `smart-cs-agent.launch-evidence.v1`. It records the target `tenantFingerprint`, channel, launch-track booleans, check statuses, evidence flags, document/script references, and warning counts. It does not call the API, connect to the database, read a secret manager or vault, call provider networks, execute provider actions, or send customer-visible replies.

Evidence may include booleans such as `webhookSecretConfigured=true`, `providerCredentialConfigured=true`, and `networkAttempted=false`, plus `credentialRefFingerprint`. It must not include raw tenant IDs, webhook secrets, operator API keys, full credential refs, provider tokens, provider payloads, customer data, raw order IDs, or raw logistics IDs.

## PR43 Merchant Launch Preflight

Merchant/channel launch now has a checked local preflight command:

```bash
npm run verify:merchant-launch-preflight:safe
```

The command reads only local environment configuration. It does not call the API, connect to the database, read a secret manager or vault, call Taobao/Douyin/provider networks, execute provider actions, or send customer-visible replies.

It checks that the target tenant/channel has production-safe operator identity, an admin operator key, real-channel webhook allowlist and matching secret when required, queue thresholds, provider readonly adapter configuration when required, and a matching `PROVIDER_CREDENTIALS` ref-only inventory record. Its output is sanitized: it may show `tenantFingerprint`, channel, booleans, and credential fingerprints, but it must not print raw tenant IDs, webhook secrets, operator API keys, provider credential refs, provider tokens, provider payloads, or customer data.

## PR42 Provider Readonly Sandbox Harness

Provider readonly execution now has a checked sandbox harness for future live read clients:

- `ProviderReadonlyClientHarnessService`: prepares the future readonly client execution envelope only after provider read policy, run persistence, and credential resolution have already passed.
- Current execution remains sandbox-only. It keeps `networkExecution=not_implemented`, `networkAttempted=false`, `providerDataReturned=false`, `providerResponseCaptured=false`, and `attemptCount=0`.
- `PROVIDER_READ_TIMEOUT_MS`: bounded future client timeout setting, default `5000`, accepted range `100..30000`.
- `PROVIDER_READ_MAX_RETRIES`: bounded future retry setting, default `0`, accepted range `0..3`.
- Audit metadata may include execution mode, credential readiness status, timeout/retry settings, and `providerRequestPrepared`, but it must not include lookup values, provider payloads, provider responses, full credential refs, tokens, API keys, client secrets, or customer data.
- `npm run verify:provider-read-harness`: checks the harness service, config bounds, Ops audit wiring, no-network/no-provider-data behavior, docs, launch runbook, and task plan.

This is still not a live provider connector. It only proves the server has a safe execution boundary where future Taobao/Douyin readonly clients can be attached after separate provider-specific implementation, sandbox evidence, and production review.

## PR41 Provider Credential Store Boundary

Provider readonly credentials now have a checked no-secret ref inventory:

- `PROVIDER_CREDENTIALS`: optional JSON array of `{ credentialRef }` records only. It must not contain inline `material`, access tokens, API keys, client secrets, provider payloads, or customer data.
- `ProviderCredentialStoreService`: reports `configured`, `missing`, `invalid`, or `not_implemented` for a requested ref without loading credential material, reading a vault, or calling provider APIs.
- `ProviderCredentialResolverService`: may audit `credentialRefFingerprint`, `credentialResolutionStatus`, `credentialRefConfigured`, `credentialMaterialLoaded=false`, and `secretValueReturned=false`.
- It does not change `networkExecution=not_implemented` or `providerDataReturned=false`.
- `npm run verify:provider-credential-store`: checks the ref-only inventory, no-inline-secret behavior, store/resolver tests, docs, and launch guidance.

This is still not a live provider connector. It only proves a deployment has intentionally listed refs that future secret-manager-backed clients may use after a separate implementation review.

## PR40 Provider Credential Resolution Boundary

Provider readonly credentials now have a checked no-secret resolution boundary:

- `ProviderCredentialResolverService`: receives `{ tenantId, channel, credentialRef }` only after case ownership, idempotency, and readonly policy checks pass.
- Current implementation may return `status=not_implemented`, `configured`, `missing`, or `invalid`, plus `credentialRefFingerprint`, `credentialRefConfigured`, `credentialMaterialLoaded=false`, and `secretValueReturned=false`.
- It does not read a real secret manager, does not return credential material, does not call Taobao/Douyin/other provider APIs, and does not change `networkExecution=not_implemented` or `providerDataReturned=false`.
- `npm run verify:provider-credential-boundary`: checks that resolver metadata, tests, docs, and launch guidance preserve the no-secret/no-provider-network boundary.

This is still not a live provider connector. It is the safety seam that future real readonly clients must pass through before any provider-specific implementation is considered.

## PR39 Provider Read Operations Visibility

Provider readonly attempts now have admin-only operations visibility:

- `GET /v2/provider-reads/runs`: admin operator API route for recent sanitized provider read runs in the authenticated tenant.
- `GET /v2/provider-reads/summary`: admin operator API route for capped 24-hour aggregate counts by status, channel, and read capability.
- `GET /api/operator/provider-reads/runs` and `GET /api/operator/provider-reads/summary`: Web BFF admin routes that proxy the same data without exposing operator API keys to the browser.
- Direct `/v2/provider-reads/*` operations visibility rejects the legacy insecure `x-tenant-id` header fallback and requires a real admin operator API key.
- Returned rows expose `lookupKeys`, `lookupFingerprint`, and `requestFingerprint`, not raw lookup values, full hashes, idempotency keys, provider payloads, provider responses, customer data, operator API keys, provider tokens, or tenant secrets.
- `npm run verify:provider-read-operations`: checks that API, BFF, docs, tests, and launch guidance preserve the admin-only/no-raw-data boundary.

This is an operations surface for launch support. It is not part of the normal客服工作台 and still does not enable live provider reads, real provider network execution, or provider data return.

## PR38 Provider Read Audit And Idempotency

Provider readonly execution now leaves a sanitized audit trail:

- `ProviderReadRun`: persists one run per new `POST /v2/provider-reads/execute` attempt.
- `tenantId + idempotencyKey`: prevents duplicate run creation for retries and fails closed if the key is reused for a different provider read.
- `lookupHash`, `lookupKeys`, and `requestHash`: provide operational traceability without storing raw order IDs, raw logistics IDs, provider payloads, customer data, or provider responses.
- Case ownership: the API verifies `caseId + merchantId` before persisted provider reads, so an operator cannot attach provider-read records or case-scoped audit logs to another tenant's case.
- `AuditLog`: records sanitized provider read status and idempotency conflicts without raw lookup values. Case ownership failures are audited without attaching the supplied case ID.
- `npm run verify:provider-read-audit`: checks that the model, migration, service logic, tests, docs, and launch runbook preserve the audit/idempotency/no-raw-data boundary.

This does not enable live provider reads or real provider network execution. `networkExecution=not_implemented` and `providerDataReturned=false` remain the current launch boundary.

## PR37 Provider Read Execution Contract

Provider readonly execution now has a checked API contract:

- `POST /v2/provider-reads/execute`: authenticated operator route for future non-mutating provider reads.
- The server derives `tenantId` and `operatorId` from request context, so body-supplied tenant or operator values cannot spoof the provider read boundary.
- `status=policy_accepted` is possible only for tenant/channel pairs configured as `real_readonly` / `read_only` through `PROVIDER_READONLY_ADAPTERS`.
- Accepted responses still return `networkExecution=not_implemented` and `providerDataReturned=false`.
- `npm run verify:provider-read-contract`: checks that the route, shared contract, policy tests, docs, and launch runbook preserve the no-real-network and no-provider-data boundary.

This contract does not enable live provider reads, real provider network calls, real order data return, refunds, address changes, coupons, logistics edits, invoices, or customer-visible replies.

## PR36 Real Provider Readonly Foundation

Real provider adapters now have a checked readonly configuration boundary:

- `PROVIDER_READONLY_ADAPTERS`: JSON array of `{channel, tenantId, credentialRef}` records. `credentialRef` must use `secret://` or `vault://`, points to deployment secret storage, and must not inline provider tokens, client secrets, API keys, payloads, or customer data.
- `GET /v2/integrations`: configured tenant/channel pairs may report `adapterMode=real_readonly`, `writePolicy=read_only`, `capabilities=["handoff"]`, and `readCapabilities=["get_order","query_logistics"]` only to that tenant's operators.
- `npm run verify:provider-readonly`: checks that readonly provider configuration, shared contracts, registry projection, docs, and tests preserve the no-real-write boundary.

This foundation does not enable real refunds, address changes, coupons, logistics edits, invoices, customer-visible replies, or provider write APIs.

## PR35 Provider Adapter Contract Package

Provider adapter contracts now define the boundary between channel intake and real commerce execution:

- `docs/deploy/provider-adapter-contracts.md`: current adapter modes, write policies, supported capabilities, action policy, future real-adapter entry criteria, and safety boundaries.
- `npm run verify:provider-adapters`: checks shared contracts, adapter registry, mock adapters, operation service policy use, public docs, and launch runbook references.

Taobao and Douyin remain `sandbox_mock` adapters with `writePolicy=sandbox_only`. `customerVisibleActionsEnabled=false` and `realCommerceActionsEnabled=false` must remain true for the current launch track. This package does not enable real provider network calls, real refunds, real address changes, real coupons, logistics edits, or customer-visible replies.

## PR34 Production Launch And Rollback Runbook

Production release operations now have a checked launch rehearsal:

- `docs/deploy/production-launch-runbook.md`: launch decision gate, preflight commands, deploy sequence, rollback triggers, rollback sequence, stale-claim recovery, post-launch evidence, and rehearsal scenarios.
- `npm run verify:production-launch`: checks that launch guidance remains connected to production readiness, canary, alerting, channel queue operations, rollback controls, recovery evidence, and no-secret/no-customer-action boundaries.

Run `npm run verify:production-launch` before opening a new real-channel allowlist window or changing production rollback behavior. This launch runbook does not prove real refunds, address changes, coupons, logistics edits, or customer-visible replies are safe to automate.

## PR33 Production Alerting Pack

Production monitoring now has a checked alerting pack:

- `docs/deploy/production-alerting.md`: response guidance, routing severity, and safety boundaries.
- `docs/deploy/production-alerts.prometheus.yml.example`: Prometheus alert rules for API up, database readiness, real-channel misconfiguration, kill switch, queue degradation, stale processing claims, and oldest pending age.
- `docs/deploy/production-canary-schedule.yml.example`: GitHub Actions schedule example that runs `npm run verify:production-canary` every five minutes.

Run `npm run verify:production-alerting` after changing public metrics, readiness, canary behavior, alert routing, or production deployment docs. The alerting pack must not include tenant IDs, customer messages, provider payloads, external IDs, operator API keys, webhook secrets, signatures, raw request bodies, or full metric bodies.

## PR32 Production Canary Verifier

Deploy and on-call checks now have an executable live canary:

```bash
npm run verify:production-canary -- --api=https://api.example.com --require-real-channel
```

The canary reads only public `GET /health/ready` and `GET /metrics`. It fails when readiness is not `ok`, the API/database metrics are not healthy, real-channel webhook readiness is `misconfigured`, `--require-real-channel` is set while webhook status is not `ok` or the emergency kill switch is enabled, queue degraded metrics are active, stale processing claims exceed the threshold, oldest pending age exceeds the threshold, or `/metrics` contains forbidden tenant/channel/payload/secret markers.

Use `--allow-degraded` only during a planned degraded rollout or incident where the team has explicitly accepted queue pressure. The canary will still fail on database down, API down, misconfigured real-channel intake, kill switch under `--require-real-channel`, stale processing above `--max-stale-processing`, or oldest pending age above `--max-oldest-pending-age-seconds`.

The canary must not print response bodies, API URLs with query strings, metric bodies, tenant IDs, customer messages, provider payloads, external IDs, operator API keys, webhook secrets, signatures, or raw request bodies.

## PR31 Public Monitoring Metrics

The API now exposes `GET /metrics` in Prometheus text format. It is public like `/health` and `/health/ready`, but it contains only aggregate numeric gauges: API up, database readiness, real-channel webhook enabled state, emergency kill switch state, one-hot webhook readiness status, source-wide queue counts, oldest pending age, and known degraded reasons.

`/metrics` must remain a no-tenant/no-secret boundary. It must not include tenant IDs, merchant IDs, channel names, customer messages, provider payloads, source names, external conversation IDs, external message IDs, operator API keys, webhook secrets, signatures, or raw request bodies. When the database is unavailable, the endpoint should still be scrapeable with `smart_cs_agent_api_up 1` and `smart_cs_agent_database_ready 0`, without leaking the database error.

## PR30 Real-Channel Emergency Kill Switch

Real-channel intake now has an emergency shutoff. Set `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true` to make `POST /v1/channels/:channel/webhook/events` fail closed with HTTP 503 before HMAC verification, rate limiting, replay receipt writes, normalized event writes, case creation, action execution, or customer-visible replies.

`GET /health/ready` reports `checks.channelWebhooks.status=disabled_by_kill_switch` while preserving the same no-secret boundary: it may show channel names and allowlisted pair counts, but never tenant IDs, webhook secrets, signatures, raw request bodies, provider payloads, or customer messages. `npm run verify:production-readiness -- --require-real-channel` fails when this kill switch is true; without `--require-real-channel`, the verifier emits a warning because the operator workbench can still run while real-channel intake is intentionally emergency-disabled.

## PR29 Production Operator Identity Closure

Production Web login now fails closed if `OPERATOR_IDENTITY_PROVIDER=env` or `OPERATOR_ACCOUNT_SOURCE=env` is selected. Env-backed operator accounts are local/sandbox only. A deployable environment must use `OPERATOR_IDENTITY_PROVIDER=database`, run migrations, and create the first admin account in the `OperatorAccount` table before operators can log in.

Bootstrap the first admin without printing secrets:

```bash
export OPERATOR_BOOTSTRAP_PASSWORD="<long temporary password>"
export OPERATOR_BOOTSTRAP_API_KEY="<matching operator API key>"
npm run operator:bootstrap-admin -- --username=admin --tenant=$TENANT_SLUG --operator-id=$OPERATOR_ID
```

Use `npm run verify:operator-bootstrap` in CI to prove the bootstrap script dry-run works and does not print passwords, API keys, or password hashes.

## PR28 Real-Channel Gray-Release Allowlist

Real-channel intake now has a merchant/channel allowlist gate. When `REAL_CHANNEL_WEBHOOKS_ENABLED=true`, every signed webhook must match an exact pair in `REAL_CHANNEL_WEBHOOK_ALLOWLIST`, and every allowlisted pair must have a matching item in `REAL_CHANNEL_WEBHOOK_SECRETS`.

`GET /health/ready` may report `allowlistedChannels` and `allowlistedPairCount`, but it must not expose tenant IDs. To roll back a single merchant, remove that pair from `REAL_CHANNEL_WEBHOOK_ALLOWLIST`; to close all real-channel intake for planned configuration, set `REAL_CHANNEL_WEBHOOKS_ENABLED=false`; for emergency rollback, set `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`. This allowlist only controls normalization intake. It does not enable real refunds, address changes, coupons, automated customer replies, or commerce actions.

`npm run demo:real-channel-smoke` now requires the server to set `REAL_CHANNEL_WEBHOOKS_ENABLED=true`, a matching `REAL_CHANNEL_WEBHOOK_SECRETS` item, and a matching `REAL_CHANNEL_WEBHOOK_ALLOWLIST` item for the same channel and tenant. The smoke still proves only normalization intake and optional human-reviewed replay.

## PR27 Production Readiness Verifier

Production readiness now has an executable preflight:

```bash
npm run verify:production-readiness -- --env-file=/secure/path/production.env --require-real-channel --api=https://api.example.com
```

The verifier checks the production environment without printing secret values. It fails when production uses local or sandbox defaults, enables legacy demo APIs, enables offline demo data, uses insecure operator headers, uses env-backed operator accounts, keeps placeholder session or API secrets, opens real-channel webhooks without the PR28/PR26 intake gates, or uses `--require-real-channel` while `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`. When `--api` is provided, it also checks `GET /health/ready`; by default readiness must be `ok`, and `--require-real-channel` also requires `checks.channelWebhooks.status=ok` plus a positive `checks.channelWebhooks.allowlistedPairCount`.

Use `--require-real-channel` for a launch where real signed webhook intake must be open. Omit it for a production deployment that is ready to serve the operator workbench but has real-channel intake intentionally closed.

## PR26 Production Real-Channel Intake Gates

Production API startup now fails closed when `NODE_ENV=production` and `REAL_CHANNEL_WEBHOOKS_ENABLED=true` are set without the required intake gates. A production real-channel intake must configure at least one webhook secret, at least one matching `REAL_CHANNEL_WEBHOOK_ALLOWLIST` tenant/channel pair, a positive `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE`, an explicit `REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS`, and all channel queue thresholds before the API can start.

The required queue thresholds are `CHANNEL_QUEUE_PENDING_WARN_THRESHOLD`, `CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS`, `CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD`, and `CHANNEL_QUEUE_STALE_AFTER_MINUTES`. This does not make the endpoint a full commercial automation path; it only prevents real webhook traffic from being enabled without rate limiting and queue observability.

## PR25 Real-Channel Webhook Rate Limit

Signed real-channel webhook intake can now be protected with `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE`. The default is `0`, which keeps the limiter disabled for local development and existing sandboxes. A positive value enables a per-process, per-minute counter for each `channel:tenantId` pair.

The limiter runs only after HMAC verification succeeds and before `ChannelWebhookReceipt` or `NormalizedChannelEvent` writes. When the limit is exceeded, the endpoint returns HTTP 429 and must not create receipts, normalized events, after-sales cases, actions, or customer-visible replies.

This is an application-level guardrail, not the final commercial traffic-control layer. Production deployments should still add gateway, CDN, load-balancer, or shared-store rate limits because multiple API replicas do not share this in-memory counter.

## PR24 Queue Audit Summary

Admin operators can now review bounded queue handling totals through `GET /v1/channel-events/audit-summary` and the same-origin BFF route `GET /api/operator/channel-events/audit-summary`. The summary includes generated-case counts, intentionally not-handled counts, stale recovery run counts, recovered event counts, and per-operator activity totals. Custom summary windows are capped at 24 hours.

The audit summary response is tenant-scoped and sanitized. It must not expose tenant IDs, raw audit JSON, provider payloads, source names, normalized event IDs, event ID lists, customer messages, external conversation IDs, external message IDs, operator API keys, or secrets. The Web BFF requires an admin session before proxying this endpoint.

## PR23 Queue Operation Audit Records

Admin operators can now review recent queue recovery operations from the workbench through `GET /v1/channel-events/operation-audits` and the same-origin BFF route `GET /api/operator/channel-events/operation-audits`. Recovery audit entries include who ran the recovery, how many stale processing claims were restored, the cutoff timestamp, and whether the queue was healthy afterward.

The audit response is tenant-scoped and sanitized. It must not expose tenant IDs, raw audit JSON, provider payloads, source names, normalized event IDs, event ID lists, external conversation IDs, external message IDs, operator API keys, or secrets. The Web BFF requires an admin session before proxying this endpoint.

## PR22 Operator Queue Operations Status

The operator workbench now reads API readiness and real-channel queue metrics through the same-origin BFF. Operators see a compact product-language queue status for normal intake, backlog, unavailable queue status, and stale processing claims. Admin operators can recover stale processing claims from the workbench without exposing operator API keys or raw channel-event internals to the browser.

The Web API client keeps queue metrics sanitized to counts, timestamps, and age values. It must not surface tenant IDs, source names, provider payloads, external conversation IDs, external message IDs, operator API keys, or secrets.

## PR21 Channel Queue Operations Runbook

Channel queue operations are now documented in `docs/deploy/channel-queue-runbook.md`. The runbook covers `/health/ready`, `/metrics`, `GET /v1/channel-events/metrics`, `POST /v1/channel-events/recover-stale`, the Web BFF equivalents, threshold env vars, degraded reason codes, triage steps, and safety boundaries.

The runbook is guarded by `npm run verify:channel-runbook`, which checks the runbook, `.env.example`, `docs/deploy/public-api-surface.md`, and the relevant API source files for required operational facts. Any future change to readiness, queue metrics, stale recovery, or the public API surface should update the runbook and keep this verifier passing.

## PR20 Queue Readiness Thresholds

`GET /health/ready` now includes aggregate real-channel queue health. Database failure still returns HTTP 503 with `status=unhealthy`; queue pressure returns HTTP 200 with `status=degraded` so deploy platforms can distinguish "service is up but needs operator attention" from "service cannot serve".

Queue degraded thresholds are configured with `CHANNEL_QUEUE_PENDING_WARN_THRESHOLD`, `CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS`, `CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD`, and `CHANNEL_QUEUE_STALE_AFTER_MINUTES`. Empty threshold values disable the corresponding warning. Readiness queue checks are source-wide aggregates and must not expose tenant IDs, customer messages, provider payloads, external conversation IDs, or external message IDs.

## PR19 Queue Metrics

Real-channel review operations now expose a tenant-scoped queue metrics snapshot through `GET /v1/channel-events/metrics` and the same-origin BFF route `GET /api/operator/channel-events/metrics`. The response includes counts for `pending`, `processing`, stale `processing`, `replayed`, and `ignored`, plus the oldest pending receive time and age in seconds.

The metrics route is read-only and must not expose customer message text, tenant identifiers, provider payloads, source names, external conversation IDs, external message IDs, operator API keys, or secrets to the browser.

## PR18 Processing Recovery

Admin operators can recover stale real-channel review events through `POST /v1/channel-events/recover-stale` or the same-origin BFF route `POST /api/operator/channel-events/recover-stale`. Recovery only touches the current tenant, `source=real_channel_webhook`, `reviewStatus=processing`, and rows whose `reviewedAt` is older than the requested cutoff.

This is an operations safety valve for interrupted replay attempts. It moves stale claims back to `pending`, clears `reviewedBy` and `reviewedAt`, records a non-secret audit log, and does not call AgentService, create cases, execute actions, or send customer-visible replies.

## PR17 Channel Review Concurrency

Real-channel review replay now uses a server-side `pending -> processing -> replayed` lifecycle. The `processing` status is an internal claim state, not an operator-facing product state. Its purpose is to prevent two operators from generating duplicate after-sales cases from the same pending real-channel message.

If replay or ignore loses the claim because the event has already been reviewed, the API returns HTTP 409 Conflict. If the event does not belong to the operator tenant or real-channel source, the API returns 404. Replay still forces `human_confirm` or `human_takeover`; it must not execute commerce actions or send real customer replies.

本文档定义 PR1 的可部署沙盒门槛。当前目标是 deployable sandbox / production-readiness baseline，用于让团队和 GitHub 自动验证基础质量；它不代表已经接入真实淘宝、抖音或企业微信生产链路，也不声称系统已生产可用。

## 范围

- 覆盖 V1.2 售后沙盒闭环：本地/沙盒事件进入 API，生成工单、消息、动作和审计记录，并可通过客服台查看。
- PR13/PR14 增加真实渠道 webhook 的安全接收和归一化边界：默认关闭，启用后只做 raw-body HMAC、时间窗、租户密钥、replay receipt 校验和 `NormalizedChannelEvent` 入库；不创建工单、不触发 Agent、不发送客户可见回复、不执行真实退款/改地址/补偿。
- GitHub Actions 只验证基础质量：依赖安装、Prisma client 生成、API 单测、TypeScript、lint、build。
- CI 不连接真实外部数据库；`DATABASE_URL` 使用 dummy Postgres URL，仅供 Prisma generate 解析 schema。
- 真实电商渠道、真实支付/退款、真实物流回写、正式 SSO/RBAC/账号后台均不在 PR1 范围。

## CI Gate

PR1 合入前必须通过质量门禁。当前仓库提供 `docs/deploy/sandbox-ci.yml.example` 作为 GitHub Actions 模板；安装时将它复制到 `.github/workflows/sandbox-ci.yml`。注意：推送 `.github/workflows/*` 需要 GitHub token 具备 `workflow` scope。

```bash
npm ci
npm run db:generate
npm run test --workspace @smart-cs-agent/api
npm run typecheck --workspaces --if-present -- --pretty false
npm run lint --workspaces --if-present -- --max-warnings=0
npm run build --workspaces --if-present
```

CI 环境变量使用沙盒默认值：

```bash
DATABASE_URL=postgresql://smartcs_ci:smartcs_ci@localhost:5432/smartcs_ci?schema=public
OPENAI_API_KEY=
WEB_ORIGIN=http://localhost:3000
PORT=4100
WECOM_SANDBOX_ENABLED=true
REAL_CHANNEL_WEBHOOKS_ENABLED=false
REAL_CHANNEL_WEBHOOK_KILL_SWITCH=false
REAL_CHANNEL_WEBHOOK_SECRETS=[]
REAL_CHANNEL_WEBHOOK_ALLOWLIST=[]
REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS=300
REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE=0
NEXT_PUBLIC_API_URL=http://localhost:4100
NEXT_PUBLIC_WS_URL=http://localhost:4100
NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false
API_URL=http://localhost:4100
OPERATOR_API_KEY=<operator-api-key>
OPERATOR_SESSION_SECRET=replace_with_a_long_random_secret
OPERATOR_IDENTITY_PROVIDER=database
OPERATOR_ACCOUNT_SOURCE=database
OPERATOR_SESSION_ACCOUNTS=[{"username":"demo","passwordHash":"scrypt:<salt>:<hash>","tenantId":"<tenant-slug>","operatorId":"<operator-id>","role":"admin","apiKey":"<operator-api-key>","sessionVersion":1}]
```

如果后续新增需要数据库连接的集成测试，应显式在 CI 中启动 Postgres service，并隔离为 integration/smoke job，避免让 API 单测隐式依赖外部数据库。

## 环境变量

部署沙盒环境至少需要：

- `DATABASE_URL`：Postgres 连接串。沙盒可使用独立数据库，禁止复用生产库。
- `OPENAI_API_KEY`：PR1 可以为空；为空时不得把 LLM 能力视为已上线。
- `WEB_ORIGIN`：允许访问 API/WebSocket 的前端 origin。
- `PORT`：API 监听端口，默认 `4100`。
- `WECOM_SANDBOX_ENABLED`：沙盒入站模拟入口开关。本地演示可以为 `true`；生产环境未显式设为 `true` 时，`/v1/wecom/events` 默认不可用。
- `REAL_CHANNEL_WEBHOOKS_ENABLED`：真实渠道 webhook 安全接收入口开关，默认必须为 `false`。只有在完成渠道密钥配置、迁移和安全 smoke 后才可显式设为 `true`。
- `REAL_CHANNEL_WEBHOOK_KILL_SWITCH`：真实渠道 webhook 紧急全局关闭开关。设为 `true` 时，真实渠道入口返回 HTTP 503，且不会做签名校验、限流计数、入库、Agent 决策、动作执行或客户可见回复。
- `REAL_CHANNEL_WEBHOOK_SECRETS`：真实渠道 webhook 租户密钥 JSON 数组，格式为 `[{"channel":"taobao","tenantId":"<tenant-slug>","secret":"long-random-secret"}]`。该值只能放在服务端 secret 管理中，不得提交到 Git，不得暴露给浏览器。
- `REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS`：真实渠道 webhook 时间窗，默认 `300` 秒。过期、未来偏移过大、重复 `eventId` 都应拒绝。
- `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE`：真实渠道 webhook 应用层限流。`0` 表示关闭；生产环境若设置 `REAL_CHANNEL_WEBHOOKS_ENABLED=true`，该值必须显式设置为正整数。
- `REAL_CHANNEL_WEBHOOK_SMOKE_SECRET`：本地 `npm run demo:real-channel-smoke` 使用的测试密钥，必须与服务端 `REAL_CHANNEL_WEBHOOK_SECRETS` 中同租户/渠道 secret 一致；不要用于真实商户。
- `API_URL`：Web 服务端 BFF 访问 API 的内部地址，默认可指向 `http://localhost:4100`。
- `NEXT_PUBLIC_API_URL`：旧健康检查客户端的公开 API 地址；客服台主数据路径不应再依赖它直连 API。
- `NEXT_PUBLIC_WS_URL`：WebSocket 地址；本地可与 API 地址相同。
- `NEXT_PUBLIC_ENABLE_OFFLINE_DEMO`：离线演示工单开关，默认必须为 `false`。生产和可部署沙盒不得用假工单掩盖 403/503/配置错误。
- `OPERATOR_API_KEYS`：PR3 沙盒客服台 API key 配置，格式为 JSON 数组，例如 `[{"key":"<operator-api-key>","tenantId":"<tenant-slug>","operatorId":"<operator-id>","role":"admin"}]`。配置后，`/v1/cases` 和 `/v1/rules` 等客服侧接口必须携带 `Authorization: Bearer <operator-key>` 或 `x-api-key`。
- `OPERATOR_API_KEY`：本地 smoke 脚本或直连 API 验证时使用的 operator key，应匹配 `OPERATOR_API_KEYS` 中的一项。Web 客服台 BFF 不再直接使用该变量，也不要使用 `NEXT_PUBLIC_` 前缀。
- `OPERATOR_SESSION_SECRET`：Web 客服台签发 HttpOnly 登录 cookie 的服务端密钥。部署环境必须使用长随机值，并通过 secret 管理；生产环境会拒绝占位值和过短密钥。
- `OPERATOR_SESSION_ACCOUNTS`：Web 客服台沙盒账号配置，格式为 JSON 数组，例如 `[{"username":"demo","passwordHash":"scrypt:<salt>:<hash>","tenantId":"<tenant-slug>","operatorId":"<operator-id>","role":"admin","apiKey":"<operator-api-key>","sessionVersion":1}]`。登录后 BFF 会从该账号派生 `apiKey`、`tenantId` 和 `operatorId` 调用 API；生产环境会拒绝默认 demo 账号和明文 `password`。`role` 当前支持 `admin`、`operator`、`viewer`，并映射为 Web 侧权限。`disabled: true` 会禁止登录并让已有 session 失效；提升 `sessionVersion` 可撤销旧 session。
- `ALLOW_INSECURE_OPERATOR_HEADERS`：只用于本地沙盒调试，默认 `false`。生产环境未配置 `OPERATOR_API_KEYS` 时，默认拒绝只靠 `x-tenant-id` 的访问；除非显式设为 `true`。
- `ENABLE_LEGACY_WEB_DEMO_API`：早期 Web demo 的 `/api/chat` 和 `/api/db` 开关，默认应为 `false`。部署沙盒和生产环境不得打开，除非是隔离的历史演示环境。

敏感值应由部署平台 secret 管理，不应提交到 Git。

PR28 adds `REAL_CHANNEL_WEBHOOK_ALLOWLIST` as the real-channel gray-release gate. Use a JSON array such as `[{"channel":"taobao","tenantId":"<tenant-slug>"}]`. Production requires this value when `REAL_CHANNEL_WEBHOOKS_ENABLED=true`; every allowlisted pair must have a matching `REAL_CHANNEL_WEBHOOK_SECRETS` record. Readiness and public docs may show allowlisted channel names and pair counts only, never tenant IDs or secrets.

生产账号应使用 `passwordHash`，当前支持 `scrypt:<salt>:<hash>` 格式。可用下面的 Node 命令生成单个账号 hash：

```bash
node -e "const { randomBytes, scryptSync } = require('node:crypto'); const p = process.argv[1]; const s = randomBytes(16).toString('base64url'); console.log('scrypt:' + s + ':' + scryptSync(p, s, 32).toString('base64url'))" "replace-password"
```

API 进程在本地和测试环境会尝试读取项目 `.env`；`NODE_ENV=production` 或 `CI=true` 时默认只信任真实环境变量。若确实需要在特殊环境读取 `.env`，可以显式设置 `SMART_CS_LOAD_DOTENV=true`，但生产部署不建议这样做。

## Postgres、迁移和 Seed

PR1 的可部署沙盒需要独立 Postgres 实例：

1. 创建空数据库和受限账号，账号仅授予该沙盒数据库权限。
2. 设置 `DATABASE_URL` 指向沙盒数据库。
3. 运行 `npm run db:generate` 生成 Prisma client。
4. 运行迁移命令。部署环境应使用 Prisma deploy 语义，例如 `npx prisma migrate deploy`。
5. 运行 `npm run db:seed` 写入演示租户、规则、订单和售后案例基础数据。

迁移前应确认目标库不是生产库。Seed 数据只用于沙盒演示，不应导入真实客户、订单或售后记录。

## Health、Readiness 和 Smoke

当前 API 提供 `GET /health`，用于确认 API 进程可响应：

```bash
curl http://localhost:4100/health
```

PR1 的 readiness baseline 还应通过数据库路径验证，而不是只看 `/health`：

- `GET /health/ready` 能确认 API 到数据库的路径是否可用；数据库不可用时应返回 HTTP 503。
- `GET /metrics` 能被 Prometheus 或部署平台抓取聚合指标；数据库不可用时仍应返回文本指标，其中 `smart_cs_agent_database_ready` 为 `0`，且不得泄露数据库错误、tenant ID、渠道名、客户消息或 secret。
- `GET /health/ready` 的 `checks.channelWebhooks` 会展示真实渠道 webhook 的 readiness：默认 `disabled`，启用但缺少/损坏密钥时为 `misconfigured`，配置正确时为 `ok`，应急关闭时为 `disabled_by_kill_switch`。该响应只能出现渠道名，不得出现 tenant ID、secret、signature、raw body。
- `POST /v1/channels/:channel/webhook/events` 是真实渠道安全接收和归一化入口。启用后必须携带 `x-smartcs-signature-version: v1`、`x-smartcs-tenant-id`、`x-smartcs-event-id`、`x-smartcs-timestamp` 和 `x-smartcs-signature`；签名 payload 为 `version/channel/tenantId/timestamp/eventId/sha256(rawBody)` 逐行拼接后做 HMAC-SHA256。成功返回 `202`、`mode: normalized_only` 和 `normalizedEventId`，但不回显客户消息文本。
- 真实渠道入口会先完成签名验证和 payload 归一化，再在同一事务中写入 replay receipt 与 `NormalizedChannelEvent`。归一化失败时不应写 replay receipt，以免合法重试被重复事件保护误拦截。
- `GET /v1/cases` 携带 `Authorization: Bearer <operator-key>` 后能读取该 key 所属租户的 seed 或 smoke 后售后工单。
- `GET /v1/channel-events` 携带 `Authorization: Bearer <operator-key>` 后只能读取该 key 所属租户仍处于 `pending` 且 `source=real_channel_webhook` 的真实渠道归一化事件。
- `POST /v1/channel-events/:id/replay` 携带 operator key 后，可将一个 pending 归一化事件转成售后工单，但必须强制进入 `human_confirm` 或 `human_takeover`，不得自动执行动作、不得真实回传、不得创建 agent 已发送消息。
- `POST /v1/channel-events/:id/ignore` 携带 operator key 后，可将一个 pending 归一化事件标记为 `ignored`，用于重复、噪音或暂不处理的真实渠道消息。
- `GET /v1/rules/<tenant-slug>` 携带 `Authorization: Bearer <operator-key>` 后能读取该 key 所属租户的沙盒规则配置；请求其他租户应返回 403。
- `GET /v2/integrations`、`POST /v2/actions/execute`、`POST /v2/compensation/declined`、`POST /v2/handoffs` 等操作侧接口也必须携带 operator key。
- `POST /v1/wecom/webhook/send` 必须携带 operator key，且 key 所属租户必须与 body 中的 `merchantId` 一致。
- Web 客服台应先通过 `/api/operator/login` 获取 HttpOnly session cookie，再通过同源 `/api/operator/me`、`/api/operator/cases`、`/api/operator/cases/:id` 和 `/api/operator/readiness` 访问 API；浏览器包中不得包含 operator key。
- `/api/operator/me` 应返回脱敏身份和权限：`admin` 可查看、确认、接管、管理规则和管理客服；`operator` 可查看、确认、接管；`viewer` 只可查看。
- Web 侧 `/api/chat` 和 `/api/db` 默认返回 404；只有显式设置 `ENABLE_LEGACY_WEB_DEMO_API=true` 才会打开旧 demo 接口。
- `npm run demo:smoke` 能向沙盒 API 发送 5 条售后消息，并验证分类、风险等级和自动化模式。
- `npm run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=<tenant-slug> --secret=<matching-secret>` 能验证真实渠道安全入口可以接受一条签名事件并归一化入库。运行前服务端必须显式设置 `REAL_CHANNEL_WEBHOOKS_ENABLED=true` 和匹配的 `REAL_CHANNEL_WEBHOOK_SECRETS`。该 smoke 不会触发 Agent、Action 或客户消息回传。
- `npm run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=<tenant-slug> --secret=<matching-secret> --replay --operator-api-key=<operator-key>` 会继续验证归一化事件可被 operator 手动回放为人工审核工单；该 smoke 仍应证明 `automationMode` 不是 `auto_execute`。

公开路由清单见 `docs/deploy/public-api-surface.md`。新增任何 HTTP 路由时，应同步更新该清单和对应测试。

真实渠道鉴权状态未来应作为独立 channel readiness 展示，不应阻塞当前沙盒 readiness。

## 回滚

PR1 的回滚边界是应用版本和沙盒数据库 schema：

- 应用回滚：回退到上一版本镜像或上一部署 artifact。
- 数据库回滚：优先恢复沙盒数据库备份；不要在未知状态下手写反向 SQL。
- Seed 回滚：可清空并重建沙盒数据库，再重新执行迁移和 `npm run db:seed`。
- 配置回滚：恢复上一组部署平台环境变量。

任何涉及真实客户数据、真实退款动作或真实渠道 webhook 的变更，都必须另起生产变更流程，不得混入 PR1 的沙盒回滚策略。

## 风险边界

- 当前基线验证的是可部署沙盒质量，不验证真实淘宝/抖音/企业微信接入。
- CI 的 `DATABASE_URL` 是 dummy 值；它证明 Prisma schema 可生成 client，不证明数据库可连接。
- API 单测使用本地 mock/in-memory 路径，不覆盖真实数据库并发、锁、索引或网络抖动。
- `/health` 只说明进程存活；沙盒发布前仍需执行 readiness 检查和 smoke。
- `OPENAI_API_KEY` 为空时，任何依赖真实模型调用的能力都应视为未启用。
- 沙盒 smoke payload 是演示数据，不可作为真实售后判责、退款或客服绩效依据。
- 真实渠道 webhook PR13/PR14 只证明“可安全接收签名事件并归一化入库”，不证明已经能生产处理淘宝/抖音售后。进入自动处理前还需要沙盒回放、人工审核开关、provider-specific 错误处理和真实小流量灰度。
- PR15 的回放池只证明“人工可控地把真实渠道归一化事件转成内部售后工单”。它只接受 `source=real_channel_webhook` 的事件，仍不代表真实客户回复、真实退款、真实改地址或真实补偿动作已经上线。
- `ChannelWebhookReceipt` 只保存 `channel`、`tenantId`、`eventId`、`bodySha256` 和时间信息；不得保存 raw body、signature 或密钥。
- `OPERATOR_API_KEY` 和 `OPERATOR_SESSION_ACCOUNTS[*].apiKey` 属于服务端 secret，不能使用 `NEXT_PUBLIC_` 前缀，也不能暴露给浏览器。
- `OPERATOR_SESSION_ACCOUNTS[*].password` 当前仅适用于本地沙盒登录演示；生产环境必须使用 `passwordHash`。真正上线前仍建议替换为 SSO、OIDC 或独立账号服务，并补 RBAC 管理界面。
- `/api/chat`、`/api/db` 是历史 demo API，不属于当前售后闭环主路径；上线默认关闭。

## PR9 Operator Accounts

PR9 将 Web 客服台账号来源从静态 `OPERATOR_SESSION_ACCOUNTS` 迁移到数据库 `OperatorAccount` 表。部署环境建议设置 `OPERATOR_ACCOUNT_SOURCE=database`，并在执行 `npm run db:migrate:deploy` 后通过 seed 或后续账号管理流程创建客服账号。

`OperatorAccount` 保存 `username`、`tenantId`、`operatorId`、`role`、`passwordHash`、`apiKey`、`disabled` 和 `sessionVersion`。登录和 session 校验都会重新读取账号状态；账号被禁用或 `sessionVersion` 提升后，旧 cookie 会失效。`/api/operator/login` 和 `/api/operator/me` 仍只返回脱敏身份与权限，不暴露 `apiKey` 或 `passwordHash`。

`OPERATOR_SESSION_ACCOUNTS` 现在只作为本地/沙盒兜底来源。若显式设置 `OPERATOR_ACCOUNT_SOURCE=env`，Web BFF 只会在非生产环境继续使用旧 JSON 账号；`NODE_ENV=production` 会直接 fail closed。正式部署必须使用数据库 `OperatorAccount`，首个管理员通过 `npm run operator:bootstrap-admin` 创建。

本地开发继续使用 `npm run db:migrate`；部署环境使用 `npm run db:migrate:deploy`，避免在生产执行 Prisma dev migration 语义。

## PR10 Operator Management

PR10 增加管理员账号管理 BFF：`GET /api/operator/operators`、`POST /api/operator/operators` 和 `PATCH /api/operator/operators/:operatorId`。这些接口只接受带 HttpOnly session 的 `admin` 账号访问，普通 `operator` 和 `viewer` 会返回 403。

创建账号时，BFF 使用管理员 session 的租户和服务端 API key 派生新账号上下文，浏览器不需要也不能提交 `apiKey`。密码只以 `scrypt:<salt>:<hash>` 形式写入数据库，响应只返回 `username`、`tenantId`、`operatorId`、`role`、`disabled` 和 `sessionVersion`。

更新账号时，管理员可以调整 `role`、设置 `disabled`，或通过 `revokeSessions` 提升 `sessionVersion` 来撤销旧 cookie。创建和更新都会写入 `AuditLog`，审计详情只包含 actor、target、tenant、role/disabled/revokedSessions 等非 secret 字段。

## PR11 Operator Management UI

PR11 在客服工作台中为 `admin` 账号增加“客服账号”入口。该入口以右侧抽屉打开，不改变一屏客服处理台的主布局。管理员可以查看当前租户账号、创建新客服、切换角色、停用/启用账号，并执行“撤销登录”来提升目标账号的 `sessionVersion`。

该 UI 只调用同源 `/api/operator/operators` BFF 路由；浏览器仍不会接触 `apiKey` 或 `passwordHash`。非管理员不会看到入口，即使直接访问 BFF 也会由 PR10 的权限边界返回 403。
