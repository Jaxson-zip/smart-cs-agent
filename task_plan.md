# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR75 - Provider Write Controlled Expansion Run Ledger Gate

Status: verified locally, pending commit. Remote push remains blocked until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

Previous Stage: PR74 - Provider Write Controlled Expansion Preflight Gate was verified locally and committed as `cb8507c`. Remote push is still waiting for GitHub `workflow` scope authorization.

Historical Stage: PR73 - Provider Write Controlled Expansion Approval Gate was verified locally and committed as `db5c19b`.

Historical Stage: PR72 - Provider Write Safe Ledger Assembly Gate was verified locally and committed as `e2e2f35`.

PR75 adds the controlled expansion run ledger gate after PR74 preflight and after a concrete `controlled_multi_merchant` launch window closes. Release owners can validate sanitized `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` evidence under `provider-write-controlled-expansion-run-ledger-artifacts/` plus the PR74 preflight evidence under `provider-write-controlled-expansion-preflight-artifacts/`. Safe mode also requires the PR74 preflight's PR73 approval evidence, PR73 safe ledger assembly receipt, PR70 draft, PR71 manual review, and PR69 final ledger source files so PR75 can recompute the preflight-to-approval-to-ledger SHA-256 chain before accepting post-window results. PR75 must remain closeout-only and no-network: it must not enable provider writes, call provider APIs, execute provider writes, read credential material, read production databases, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR75 Scope

- Add `npm run verify:provider-write-controlled-expansion-run-ledger` and `npm run verify:provider-write-controlled-expansion-run-ledger:safe`.
- Validate optional sanitized controlled expansion run ledger evidence under `provider-write-controlled-expansion-run-ledger-artifacts/`.
- Require a separate PR74 controlled expansion preflight evidence file under `provider-write-controlled-expansion-preflight-artifacts/` and recompute its SHA-256 before accepting `providerWriteControlledExpansionPreflightSha256`.
- Require the PR74 preflight approval file, safe ledger assembly receipt, PR70 draft source, PR71 manual review source, and PR69 final ledger source, then recompute their SHA-256 values before accepting the preflight and approval bindings.
- Require `rolloutTrack=controlled_multi_merchant`, the same change ticket and rollout fingerprint as PR74 preflight, merchant/action/channel scope inside the PR74 preflight scope, aggregate and per-merchant write limits inside PR74 limits, launch-window timestamps inside PR74, consistent run counts, `allRunsReviewed=true`, failed-run incident notes, rollback proof for failed provider mutations, `customerComplaintsStoppedRollout=true`, rejected-compensation counts, and no automatic customer-visible replies.
- Connect PR75 to provider write docs, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR75 evidence-only/no-network: no verifier-side provider API calls, no verifier-side provider writes, no provider credentials, no production database reads, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR75

- Approving the next expansion wave automatically.
- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `controlled_multi_merchant`.

PR74 adds the controlled expansion preflight gate after PR73 approval and before a concrete `controlled_multi_merchant` launch window can proceed. Release owners can validate sanitized `smart-cs-agent.provider-write-controlled-expansion-preflight.v1` evidence under `provider-write-controlled-expansion-preflight-artifacts/` plus the PR73 approval evidence under `provider-write-controlled-expansion-approval-artifacts/`. Safe mode also requires the PR73 safe ledger assembly receipt and its PR70 draft, PR71 manual review, and PR69 final ledger source files so PR74 can recompute the approval-to-ledger SHA-256 chain before accepting the launch window. PR74 must remain preflight-only and no-network: it must not enable provider writes, call provider APIs, execute provider writes, read credential material, read production databases, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR74 Scope

- Add `npm run verify:provider-write-controlled-expansion-preflight` and `npm run verify:provider-write-controlled-expansion-preflight:safe`.
- Validate optional sanitized controlled expansion preflight evidence under `provider-write-controlled-expansion-preflight-artifacts/`.
- Require a separate PR73 controlled expansion approval evidence file under `provider-write-controlled-expansion-approval-artifacts/` and recompute its SHA-256 before accepting `providerWriteControlledExpansionApprovalSha256`.
- Require the PR73 safe ledger assembly receipt under `provider-write-safe-ledger-assembly-artifacts/` plus PR70/PR71/PR69 source files under `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`, then recompute their SHA-256 values before accepting `providerWriteSafeLedgerAssemblySha256` and the assembly receipt's internal bindings.
- Require `rolloutTrack=controlled_multi_merchant`, the same change ticket and rollout fingerprint as PR73 approval, merchant/action/channel scope inside the approved PR73 scope, aggregate and per-merchant write limits inside the approved PR73 limits, business-hours-only control, a 30-240 minute launch window, `freezeWindowActive=true`, `automaticNextWaveEnabled=false`, `rollbackOnAnyFailedMutation=true`, operator coverage, distinct owners, support escalation readiness, merchant notification readiness, and no automatic customer-visible replies.
- Connect PR74 to provider write docs, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR74 evidence-only/no-network: no verifier-side provider API calls, no verifier-side provider writes, no provider credentials, no production database reads, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR74

- Enabling controlled multi-merchant rollout automatically.
- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `controlled_multi_merchant`.

PR73 adds the controlled expansion approval gate after PR72 safe ledger assembly. Release owners can validate sanitized `smart-cs-agent.provider-write-controlled-expansion-approval.v1` evidence under `provider-write-controlled-expansion-approval-artifacts/` plus a separate `smart-cs-agent.provider-write-safe-ledger-assembly.v1` receipt under `provider-write-safe-ledger-assembly-artifacts/` before considering expansion from `single_merchant_pilot` to `controlled_multi_merchant`. Safe mode also requires the PR70 draft, PR71 manual review, and PR69 final ledger source files so the verifier can recompute their SHA-256 values before accepting the assembly receipt bindings. PR73 must remain approval-only and no-network: it must not enable provider writes, call provider APIs, execute provider writes, read credential material, read production databases, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR73 Scope

- Add `npm run verify:provider-write-controlled-expansion-approval` and `npm run verify:provider-write-controlled-expansion-approval:safe`.
- Validate optional sanitized controlled expansion approval evidence under `provider-write-controlled-expansion-approval-artifacts/`.
- Require a separate safe ledger assembly receipt under `provider-write-safe-ledger-assembly-artifacts/` and recompute its SHA-256 before accepting `providerWriteSafeLedgerAssemblySha256`.
- Require PR70/PR71/PR69 source files under `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`, then recompute their SHA-256 values before accepting the assembly receipt's internal bindings.
- Require `fromRolloutTrack=single_merchant_pilot`, `toRolloutTrack=controlled_multi_merchant`, 2-10 merchant fingerprints, allowed first-pilot actions only, aggregate and per-merchant write limits, business-hours-only control, operator coverage, rollback ownership, alert readiness, billing plan, contract review, support SLA, merchant notification readiness, and no automatic customer-visible replies.
- Connect PR73 to provider write docs, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR73 evidence-only/no-network: no verifier-side provider API calls, no verifier-side provider writes, no provider credentials, no production database reads, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR73

- Enabling broad provider write rollout automatically.
- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `controlled_multi_merchant`.

PR72 adds the safe ledger assembly gate after PR70 draft export, PR71 manual closeout review, and PR69 final ledger evidence exist. Release owners can validate that sanitized `smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1`, `smart-cs-agent.provider-write-manual-closeout-review.v1`, and `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` artifacts all describe the same bounded pilot before considering expansion beyond the first `single_merchant_pilot`. PR72 must remain assembly-only and no-network: it must not generate pass evidence, call provider APIs, execute provider writes, read credential material, read production databases, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR72 Scope

- Add `npm run verify:provider-write-safe-ledger-assembly` and `npm run verify:provider-write-safe-ledger-assembly:safe`.
- Validate sanitized PR70/PR71/PR69 evidence files under `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`.
- Recompute SHA-256 from local file bytes so PR71 `providerWriteLivePilotRunLedgerDraftSha256` matches the draft file and PR69 `providerWriteManualCloseoutReviewSha256` matches the review file.
- Require matching `auditExportSha256`, `productionLaunchSha256`, tenant fingerprint, channel, rollout track, launch window, change ticket fingerprint, run counts, and `(requestFingerprint, executionAttemptFingerprint)` pairs.
- Keep PR70 draft evidence at `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`; require PR71 `approved_for_safe_ledger`; require PR69 manual closeout review verifier proof.
- Connect PR72 to provider write docs, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR72 evidence-only/no-network: no verifier-side provider API calls, no verifier-side provider writes, no provider credentials, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR72

- Generating PR69 pass evidence automatically.
- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `single_merchant_pilot`.

PR71 adds the manual closeout review evidence gate after a bounded live provider write pilot window. Release owners can validate sanitized `smart-cs-agent.provider-write-manual-closeout-review.v1` evidence under `provider-write-manual-closeout-review-artifacts/` before PR69 safe ledger evidence binds `providerWriteManualCloseoutReviewSha256`. PR71 must remain evidence-only and no-network: it must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR71 Scope

- Add `npm run verify:provider-write-manual-closeout-review` and `npm run verify:provider-write-manual-closeout-review:safe`.
- Validate optional sanitized manual closeout review evidence under `provider-write-manual-closeout-review-artifacts/`.
- Require distinct reviewer fingerprints, second review, `approved_for_safe_ledger`, consistent run counts, failed-run incident notes, rollback verification, no automatic customer replies, no outstanding actions, artifact hash bindings, and all safety booleans false.
- Bind PR71 into PR69 by requiring `providerWriteManualCloseoutReviewVerifierPassed` and `providerWriteManualCloseoutReviewSha256` in the provider write live pilot run ledger gate.
- Connect PR71 to provider write docs, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR71 evidence-only/no-network: no verifier-side provider API calls, no verifier-side provider writes, no provider credentials, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR71

- Generating PR69 pass evidence automatically.
- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `single_merchant_pilot`.

PR70 adds an admin-only provider write live pilot run ledger draft export. Release owners can export sanitized `smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1` facts from existing `ProviderWriteExecutionAttempt` and `ProviderWriteRequest` rows for one tenant/channel/window. PR70 must remain draft-only: `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`. It must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR70 Scope

- Add `ProviderWriteLivePilotRunLedgerDraftSchema`, API route `GET /v2/provider-writes/live-pilot-run-ledger/draft`, and Web BFF route `GET /api/operator/provider-writes/live-pilot-run-ledger/draft`.
- Derive draft records from existing sanitized provider write execution attempts and reviewed requests, scoped by authenticated tenant, requested channel, and a bounded 15-120 minute window.
- Keep the draft unable to satisfy PR69 safe evidence by requiring missing `artifact_bindings`, `live_provider_mutation_evidence`, and `manual_closeout_review`, plus `pilot_run_records` when no runs exist.
- Add `npm run verify:provider-write-live-pilot-run-ledger-draft-export` and wire it to static CI, production launch, provider docs, public API surface, task tracking, and progress notes.
- Keep PR70 no-network/read-only: no provider API calls, no provider write execution, no credential reads, no payload escrow opening, no raw payload/response/idempotency/tenant/customer fields, and no customer-visible replies.

### Out Of Scope For PR70

- Generating PR69 pass evidence or adding a `:safe` mode.
- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Reading production databases from a verifier or exporting raw audit payloads.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `single_merchant_pilot`.

PR69 adds a sanitized provider write live pilot run ledger gate. Release owners can validate `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` packages under `provider-write-live-pilot-run-ledger-artifacts/` after a bounded first real provider write pilot window closes. PR69 must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR69 Scope

- Add `npm run verify:provider-write-live-pilot-run-ledger` and `npm run verify:provider-write-live-pilot-run-ledger:safe`.
- Validate optional sanitized post-window run ledger evidence under `provider-write-live-pilot-run-ledger-artifacts/`.
- Require single merchant, single channel, low-risk first-pilot action scope, bounded launch window, closed pilot window, consistent succeeded/failed/rolled-back/blocked totals, all-runs-reviewed proof, failed-run incident proof, rollback verification proof, no automatic customer replies, audit binding, artifact hash bindings, and sanitized run records only.
- Connect PR69 to provider write docs, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR69 evidence-only/no-network: no verifier-side provider API calls, no verifier-side provider writes, no provider credentials, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR69

- Live Taobao/Douyin provider write clients.
- Enabling or implementing `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Creating provider write requests, approvals, or execution attempts from the verifier.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting, opening, or decrypting sealed payload escrow bodies.
- Real refunds, address changes, coupons, logistics edits, or customer-visible replies.
- Expanding beyond `single_merchant_pilot`.
- Production canary coverage for provider write execution.

PR68 adds a sanitized provider write live pilot preflight evidence gate. Release owners can validate `smart-cs-agent.provider-write-live-pilot-preflight.v1` packages under `provider-write-live-pilot-preflight-artifacts/` before any launch window enables a first real provider write pilot. PR68 must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR68 Scope

- Add `npm run verify:provider-write-live-pilot-preflight` and `npm run verify:provider-write-live-pilot-preflight:safe`.
- Validate optional sanitized live pilot preflight evidence under `provider-write-live-pilot-preflight-artifacts/`.
- Require single merchant, single channel, low-risk first-pilot action scope, live executor disabled at verification, bounded write limits, human confirmation, idempotency, audit, sealed-metadata-only readiness, no provider mutation during verification, operator coverage, rollback readiness, observability, launch freeze, and artifact hash bindings.
- Connect PR68 to provider write docs, production provider write approval, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR68 evidence-only/no-network: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR68

- Live Taobao/Douyin provider write clients.
- Enabling `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Creating provider write requests or execution attempts from the verifier.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting or decrypting sealed payload escrow bodies.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Production canary coverage for provider write execution.

PR67 adds a sanitized provider write kill-switch rehearsal evidence gate. Release owners can validate `smart-cs-agent.provider-write-kill-switch-rehearsal.v1` packages under `provider-write-kill-switch-rehearsal-artifacts/` before any real provider write pilot approval can be accepted. PR67 must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR67 Scope

- Add `npm run verify:provider-write-kill-switch-rehearsal` and `npm run verify:provider-write-kill-switch-rehearsal:safe`.
- Validate optional sanitized emergency-stop rehearsal evidence under `provider-write-kill-switch-rehearsal-artifacts/`.
- Require admin-only control-plane proof, emergency stop engagement, execution blocking with `policyReason=emergency_stop_engaged`, safe release proof, two-person observation, idempotency, audit, no provider credentials, no provider network calls, no payload escrow opening, no provider mutation, and no customer-visible replies in pass evidence.
- Connect PR67 to provider write docs, production provider write approval, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR67 evidence-only/no-network: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR67

- Live Taobao/Douyin provider write clients.
- Creating provider write requests or execution attempts from the verifier.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting or decrypting sealed payload escrow bodies.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Production canary coverage for provider write execution.

PR66 adds an admin-only emergency-stop control plane for future provider write execution. Admins may read and update safe kill-switch status through API and Web BFF routes, while execution attempts fail closed with `policyReason=emergency_stop_engaged` when the persisted emergency stop is engaged. PR66 must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose credential refs, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR66 Scope

- Add `ProviderWriteKillSwitchStatusSchema`, update request schema, action enum, and reason-code enum to shared contracts.
- Add `ProviderWriteKillSwitchEvent` persistence with tenant-scoped idempotency, safe state fingerprints, and no-network database constraints.
- Add admin-only `GET /v2/provider-writes/kill-switch/status` and `POST /v2/provider-writes/kill-switch/status`.
- Add admin-only `GET /api/operator/provider-writes/kill-switch/status` and `POST /api/operator/provider-writes/kill-switch/status` with strict Web BFF request/response parsing and unsafe-field rejection.
- Wire persisted emergency stop state into provider write execution attempts so engaged emergency stop events block attempts before any future executor path can run.
- Add `npm run verify:provider-write-kill-switch-control-plane` and connect it to static CI, production launch, provider write docs, production readiness, public API surface, task tracking, and progress notes.
- Keep PR66 no-network/no-secret: no provider API calls, no provider writes, no provider credentials, no payload escrow opening, no customer-visible replies, no automatic commerce actions, no raw idempotency keys, and no raw tenant/customer/provider data.

### Out Of Scope For PR66

- Live Taobao/Douyin provider write clients.
- Runtime toggling of `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Changing environment variables from the app.
- Reading credential material from a vault or secret manager.
- Opening, decrypting, or releasing payload escrow.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Production canary coverage for provider write execution.

PR65 adds a read-only control-plane status surface for any future live provider write executor. Admins may inspect safe booleans, counts, missing startup gate names, and no-network invariants through API and Web BFF routes. PR65 must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, expose evidence hashes, expose credential refs, store raw provider/customer payloads, or send customer-visible replies.

### PR65 Scope

- Add `ProviderWriteLiveExecutorStatusSchema` and missing-gate enum to shared contracts.
- Add a sanitized provider write live executor startup status snapshot and expose it at runtime through `ApiConfigService` without re-reading evidence hashes, credential refs, tenant IDs, order IDs, provider payloads, or raw values on the control-plane request path.
- Add admin-only `GET /v2/provider-writes/live-executor/status`.
- Add admin-only `GET /api/operator/provider-writes/live-executor/status` with strict Web BFF response parsing.
- Add `npm run verify:provider-write-live-executor-control-plane` and connect it to static CI, production launch, provider write docs, production readiness, public API surface, task tracking, and progress notes.
- Keep PR65 read-only/no-network: no provider API calls, no provider writes, no provider credentials, no payload escrow opening, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR65

- Live Taobao/Douyin provider write clients.
- Runtime toggling of `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.
- Runtime toggling of the execution kill switch.
- Reading credential material from a vault or secret manager.
- Opening, decrypting, or releasing payload escrow.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Production canary coverage for provider write execution.

PR64 adds a production startup guard for any future live provider write executor. `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED` defaults to `false`; if production sets it to `true`, startup requires dry-run rehearsal and provider write approval evidence hashes, sealed metadata readiness, a review allowlist, credential ref records, and the execution kill switch still enabled. PR64 must not call provider APIs, execute provider writes, read credential material, open or decrypt payload escrow, store raw provider/customer payloads, or send customer-visible replies.

### PR64 Scope

- Add `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`, `PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256`, and `PROVIDER_WRITE_APPROVAL_SHA256` config parsing.
- Reject invalid or placeholder evidence hashes.
- Fail closed in production when live provider write executor startup lacks dry-run evidence, approval evidence, kill-switch protection, sealed metadata readiness, review allowlists, or credential refs.
- Add `npm run verify:provider-write-live-executor-startup-guard` and connect it to static CI, production launch, provider write docs, production readiness, task tracking, and progress notes.
- Keep PR64 config-only/no-network: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR64

- Live Taobao/Douyin provider write clients.
- Runtime toggling of the execution kill switch through a control plane.
- Reading credential material from a vault or secret manager.
- Opening, decrypting, or releasing payload escrow.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Production canary coverage for provider write execution.

PR63 adds a sanitized provider write dry-run rehearsal evidence gate. `smart-cs-agent.provider-write-dry-run-rehearsal.v1` evidence lives under `provider-write-dry-run-rehearsal-artifacts/` and proves only that the request, human review, and no-network execution-attempt chain was rehearsed with fingerprints and safety booleans. PR63 must not call provider APIs, execute provider writes, read provider credentials, open or decrypt payload escrow, store raw tenant/customer/provider data, store raw idempotency keys, or send customer-visible replies.

### PR63 Scope

- Add `npm run verify:provider-write-dry-run-rehearsal` and `npm run verify:provider-write-dry-run-rehearsal:safe`.
- Validate optional sanitized rehearsal evidence under `provider-write-dry-run-rehearsal-artifacts/`.
- Require human review, two-person review, idempotency, audit, provider write kill-switch, no provider credentials, no provider network calls, no payload escrow opening, no provider mutation, and no customer-visible replies in pass evidence.
- Connect PR63 to provider write docs, production provider write approval, production readiness, production launch, static CI, task tracking, and progress notes.
- Keep PR63 evidence-only/no-network: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR63

- Live Taobao/Douyin provider write clients.
- Creating provider write requests or execution attempts from the verifier.
- Reading production databases, operator API keys, provider credentials, vaults, or secret managers.
- Persisting or decrypting sealed payload escrow bodies.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Production canary coverage for provider write execution.

PR62 adds a default-off provider write payload escrow readiness boundary. `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE` defaults to `disabled`; when explicitly set to `sealed_metadata`, `ProviderWriteRequest` may store only request-scoped sealed metadata fingerprints for future executor readiness. PR62 must not store raw order IDs, logistics IDs, addresses, provider payloads, ciphertext bodies, provider responses, customer messages, credentials, tokens, operator API keys, or secret material. PR62 also must not execute provider writes, open/decrypt payload escrow, call provider write adapters, read credential material, or send customer-visible replies. `ProviderWriteExecutionAttempt` rows remain protected by the PR61 database invariant: `payloadEscrowStatus=not_stored`, `payloadEscrowOpened=false`, `networkExecution=not_started`, `providerMutationExecuted=false`, and `customerVisibleMessageSent=false`.

### PR62 Scope

- Add `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE` with default `disabled` and explicit safe `sealed_metadata`.
- Add request-only payload escrow metadata/fingerprints for future write executor readiness.
- Preserve request escrow metadata through human approve/reject review.
- Block sealed escrow execution attempts without opening/decrypting escrow or persisting unsafe attempt escrow state.
- Add `npm run verify:provider-write-payload-escrow-boundary` and connect it to docs, public API surface, production launch, and static CI.
- Keep PR62 no-network/no-escrow-open: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR62

- Live Taobao/Douyin provider write clients.
- Persisting sealed ciphertext bodies.
- Opening, decrypting, or releasing payload escrow.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Replacing the provider write execution kill switch with live executor behavior.
- Production canary coverage for provider write execution.

Provider Write Execution Attempt Safety Stage: PR60 - Provider Write Execution Attempt Safety was verified with no-network execution-attempt records, default-on `PROVIDER_WRITE_EXECUTION_KILL_SWITCH`, dry-run-only recording, `payloadEscrowOpened=false`, no provider/customer-visible execution, request/attempt fingerprints, and fail-closed Web BFF response parsing. It must stay connected to PR61 DB invariants, sanitized visibility, launch checks, and static CI.

Provider Write Approval State Stage: PR59 - Provider Write Approval State Machine was verified with admin-only approve/reject transitions, two-person review, controlled reason codes, sanitized review fingerprints, `payloadEscrowStatus=not_stored`, no provider/customer-visible execution, and BFF request-body allowlisting. It must stay connected to provider write execution attempts, launch checks, and static CI.

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

PR61 adds database-level invariants and sanitized admin visibility for `ProviderWriteExecutionAttempt` rows. PostgreSQL check constraints keep persisted attempts locked to `status in (dry_run_recorded, blocked, failed)`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `payloadEscrowStatus=not_stored`. Admin-only API and Web BFF list routes return `ProviderWriteExecutionAttemptListItem` metadata for the authenticated tenant only, using short fingerprints and no raw hashes, no provider payloads, no provider responses, no customer messages, no operator API keys, no provider tokens, and no secrets.

### PR61 Scope

- Add PostgreSQL check constraints for provider write execution attempt no-network/no-escrow/customer-invisible invariants.
- Add shared sanitized `ProviderWriteExecutionAttemptListItem` contract.
- Add admin-only API route `GET /v2/provider-writes/execution-attempts`.
- Add admin-only Web BFF route `GET /api/operator/provider-writes/execution-attempts`.
- Enforce tenant scoping, admin-only access, status/request filters, strict response parsing, and fail-closed unsafe upstream response behavior.
- Add `npm run verify:provider-write-execution-attempt-visibility` and connect it to docs, public API surface, production launch, and static CI.
- Keep PR61 visibility read-only/no-network: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR61

- Live Taobao/Douyin provider write clients.
- Secure payload escrow creation, opening, or decrypt-on-execution.
- Reading provider credentials or secret manager values.
- Real address changes, coupons, refunds, logistics edits, or customer-visible replies.
- Replacing the default provider write kill switch with live executor behavior.
- Production canary coverage for provider write execution.

PR60 adds a no-network provider write execution-attempt safety layer on top of approved write requests. Admin operators can record a dry-run execution attempt only after approval, but the default `PROVIDER_WRITE_EXECUTION_KILL_SWITCH=true` blocks attempts. Even with the kill switch explicitly disabled, attempts only record `dry_run_recorded` and must keep `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `requiresHuman=true`. Execution-attempt idempotency is scoped to `tenantId + providerWriteRequestId + idempotencyKeyHash`, and the attempt fingerprint binds the original write request hash, approval state, review fingerprint, and payload escrow fingerprint.

### PR60 Scope

- Add shared provider write execution-attempt request/response contracts and `dry_run_recorded` / `blocked` / `failed` status values.
- Add `ProviderWriteExecutionAttempt` persistence with tenant-scoped idempotency, request/attempt fingerprints, payload escrow status, and no-execution flags.
- Add `PROVIDER_WRITE_EXECUTION_KILL_SWITCH`, default enabled.
- Add API route `POST /v2/provider-writes/requests/:id/execution-attempts`.
- Add Web BFF route `POST /api/operator/provider-writes/requests/:id/execution-attempts` with HttpOnly admin session and response shape validation.
- Enforce tenant scoping, admin-only API key auth, approved-request-only attempts, idempotency replay/conflict behavior, sanitized audit records, and no provider network calls.
- Add `npm run verify:provider-write-execution-attempts` and connect it to docs, public API surface, production launch, and static CI.
- Keep execution attempts local/no-network: no provider API calls, no provider credentials, no provider writes, no payload escrow opening, no customer-visible replies, no automatic commerce actions, and no raw tenant/customer/provider data.

### Out Of Scope For PR60

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
- Secure payload decrypt-on-execution behavior.
- Live provider write executor, provider-specific write clients, live kill switch enforcement immediately before network calls, real execution attempts, compensation rollback, and production canary coverage for provider writes.

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
- [x] PR60 provider write execution attempt safety.
- [x] PR61 - Provider Write Execution Attempt Invariants And Visibility.
- [x] PR62 - Provider Write Payload Escrow Boundary.
- [x] PR63 - Provider Write Dry-Run Rehearsal Evidence Gate.
- [x] PR64 - Provider Write Live Executor Startup Guard.
- [x] PR65 - Provider Write Live Executor Control Plane.
- [x] PR66 - Provider Write Kill Switch Control Plane.
- [x] PR67 - Provider Write Kill Switch Rehearsal Evidence Gate.
- [x] PR68 - Provider Write Live Pilot Preflight Gate.
- [x] PR69 - Provider Write Live Pilot Run Ledger Gate.
- [x] PR70 - Provider Write Live Pilot Run Ledger Draft Export.
- [x] PR71 - Provider Write Manual Closeout Review Gate.

## Verification Gate

PR71 provider write manual closeout review gate is tracked against this gate inventory:

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
- `node --test scripts/verify-production-launch.test.mjs`
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
- `node --check scripts/verify-provider-write-execution-attempts.mjs`
- `node --test scripts/verify-provider-write-execution-attempts.test.mjs`
- `npm.cmd run verify:provider-write-execution-attempts`
- `node --check scripts/verify-provider-write-execution-attempt-visibility.mjs`
- `node --test scripts/verify-provider-write-execution-attempt-visibility.test.mjs`
- `npm.cmd run verify:provider-write-execution-attempt-visibility`
- `node --check scripts/verify-provider-write-payload-escrow-boundary.mjs`
- `node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs`
- `npm.cmd run verify:provider-write-payload-escrow-boundary`
- `node --check scripts/verify-provider-write-dry-run-rehearsal.mjs`
- `node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs`
- `npm.cmd run verify:provider-write-dry-run-rehearsal`
- `npm.cmd run verify:provider-write-dry-run-rehearsal:safe`
- `node --check scripts/verify-provider-write-kill-switch-rehearsal.mjs`
- `node --check scripts/verify-provider-write-kill-switch-rehearsal.test.mjs`
- `node --test scripts/verify-provider-write-kill-switch-rehearsal.test.mjs`
- `npm.cmd run verify:provider-write-kill-switch-rehearsal`
- `npm.cmd run verify:provider-write-kill-switch-rehearsal:safe`
- `node --check scripts/verify-provider-write-live-pilot-preflight.mjs`
- `node --check scripts/verify-provider-write-live-pilot-preflight.test.mjs`
- `node --test scripts/verify-provider-write-live-pilot-preflight.test.mjs`
- `npm.cmd run verify:provider-write-live-pilot-preflight`
- `npm.cmd run verify:provider-write-live-pilot-preflight:safe`
- `node --check scripts/verify-provider-write-live-pilot-run-ledger.mjs`
- `node --check scripts/verify-provider-write-live-pilot-run-ledger.test.mjs`
- `node --test scripts/verify-provider-write-live-pilot-run-ledger.test.mjs`
- `npm.cmd run verify:provider-write-live-pilot-run-ledger`
- `npm.cmd run verify:provider-write-live-pilot-run-ledger:safe`
- `node --check scripts/verify-provider-write-live-pilot-run-ledger-draft-export.mjs`
- `node --test scripts/verify-provider-write-live-pilot-run-ledger-draft-export.test.mjs`
- `npm.cmd run verify:provider-write-live-pilot-run-ledger-draft-export`
- `node --check scripts/verify-provider-write-manual-closeout-review.mjs`
- `node --check scripts/verify-provider-write-manual-closeout-review.test.mjs`
- `node --test scripts/verify-provider-write-manual-closeout-review.test.mjs`
- `npm.cmd run verify:provider-write-manual-closeout-review`
- `node --check scripts/verify-provider-write-live-executor-startup-guard.mjs`
- `node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs`
- `npm.cmd run verify:provider-write-live-executor-startup-guard`
- `node --check scripts/verify-provider-write-live-executor-control-plane.mjs`
- `node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs`
- `npm.cmd run verify:provider-write-live-executor-control-plane`
- `node --check scripts/verify-provider-write-kill-switch-control-plane.mjs`
- `node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs`
- `npm.cmd run verify:provider-write-kill-switch-control-plane`
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

### PR68 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 211 tests when rerun alone from the repository cwd, avoiding the known broad parallel sandbox cwd false failure mode.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 80 tests.
- `node --check scripts/verify-provider-write-live-pilot-preflight.mjs`, `node --check scripts/verify-provider-write-live-pilot-preflight.test.mjs`, `node --test scripts/verify-provider-write-live-pilot-preflight.test.mjs`, and `npm.cmd run verify:provider-write-live-pilot-preflight` passed. The PR68 verifier tests passed with 12 tests after adding explicit `providerWriteKillSwitchControlPlaneSha256` artifact binding coverage.
- `npm.cmd run verify:production-static-ci`, `npm.cmd run verify:production-launch`, and `node --test scripts/verify-production-launch.test.mjs` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 154 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.
- Read-only verifier review found no blocking issues. Its optional schema-consistency finding was fixed by requiring `providerWriteKillSwitchControlPlaneSha256` alongside the kill-switch control-plane pass boolean.
- PR68 remains evidence-only/no-network: no provider API calls, no provider writes, no credential material reads, no payload escrow opening/decrypting, no raw provider/customer payload storage, no raw idempotency-key output, and no customer-visible replies have been enabled.

### PR69 Final Verification Notes

- `node --check scripts/verify-provider-write-live-pilot-run-ledger.mjs`, `node --check scripts/verify-provider-write-live-pilot-run-ledger.test.mjs`, and `node --check scripts/verify-production-launch.mjs` passed.
- `node --test scripts/verify-provider-write-live-pilot-run-ledger.test.mjs` passed with 13 tests, including safe evidence acceptance, safe-mode missing-evidence failure, empty-ledger rejection, launch-window timestamp rejection, and failed-provider-mutation rollback-proof rejection.
- `npm.cmd run verify:provider-write-live-pilot-run-ledger`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 211 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 80 tests.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 167 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.
- Read-only PR69 review found three safe-ledger semantics gaps; all were fixed by requiring at least one run record when ledger evidence is required, requiring run timestamps inside the pilot window, and requiring rollback verification for failed provider mutations.
- PR69 remains post-window evidence-only/no-network: the verifier may attest sanitized facts from an approved bounded pilot, but it does not call provider APIs, execute provider writes, read credential material, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

### PR70 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 218 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 83 tests.
- `npm.cmd run verify:provider-write-live-pilot-run-ledger-draft-export` passed.
- `node --test scripts\verify-provider-write-live-pilot-run-ledger-draft-export.test.mjs` passed with 4 tests.
- `node --test scripts\*.test.mjs` passed with 171 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `npm.cmd run verify:production-static-ci` and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `git diff --check` exited 0 with CRLF warnings only.
- Read-only PR70 reviews found draft semantics gaps; all were fixed by failing closed instead of truncating windows with more than 50 records, requiring `artifact_bindings`, `live_provider_mutation_evidence`, and `manual_closeout_review`, requiring `pilot_run_records` for empty drafts, scoping request metadata lookup by channel, and constraining draft `policyReason` to a safe enum with unknown values sanitized.
- PR70 remains draft-only/read-only/no-network: it does not generate PR69 pass evidence, add a `:safe` command, call provider APIs, execute provider writes, read credential material, open/decrypt payload escrow, expose raw provider/customer/idempotency data, or send customer-visible replies.

### PR71 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 218 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 83 tests.
- `node --test scripts\verify-provider-write-manual-closeout-review.test.mjs` passed with 9 tests, including malformed JSON rejection, unsafe safety flag rejection, weak closeout rejection, path restriction, and unknown positional argument redaction.
- `npm.cmd run verify:provider-write-manual-closeout-review`, `npm.cmd run verify:provider-write-live-pilot-run-ledger`, `npm.cmd run verify:provider-write-live-pilot-run-ledger-draft-export`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `node --test scripts\verify-provider-write-live-pilot-run-ledger.test.mjs`, `node --test scripts\verify-provider-write-live-pilot-run-ledger-draft-export.test.mjs`, `node --test scripts\verify-production-launch.test.mjs`, and `node --test scripts\verify-production-static-ci.test.mjs` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 180 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.
- Read-only PR71 reviews found no provider-network, credential, payload-escrow, provider-write, or customer-visible execution path. Their P2 findings were fixed by adding malformed JSON and unsafe safety flag tests, asserting second-review and closeout flag failures, and synchronizing PR70/PR69 docs around `manual_closeout_review` and `providerWriteManualCloseoutReviewSha256`.
- PR71 remains manual closeout evidence-only/no-network: no provider API calls, no provider writes, no credential material reads, no payload escrow opening/decrypting, no raw provider/customer/idempotency data, and no customer-visible replies have been enabled.

### PR67 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 211 tests when rerun alone from the repository cwd, avoiding the known broad parallel sandbox cwd false failure mode.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 80 tests.
- `node --check scripts/verify-provider-write-kill-switch-rehearsal.mjs`, `node --check scripts/verify-provider-write-kill-switch-rehearsal.test.mjs`, `node --test scripts/verify-provider-write-kill-switch-rehearsal.test.mjs`, and `npm.cmd run verify:provider-write-kill-switch-rehearsal` passed.
- `npm.cmd run verify:production-provider-write-approval`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `node --test scripts/verify-production-launch.test.mjs` passed and covers the required safe-mode order: dry-run rehearsal, kill-switch rehearsal, then provider write approval.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 142 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.
- Read-only verification review found no P0. Its P1 findings were fixed by requiring exact workflow `uses:` action allowlisting and rejecting placeholder/repeated-character artifact hashes in kill-switch rehearsal evidence. Low-cost P2 hardening was also added for static CI workflow path boundaries, sensitive workflow env/key markers, kill-switch rehearsal stage ordering, and engage/release state-fingerprint drift.
- `npm.cmd run lint --workspaces --if-present -- --max-warnings=0` first hit the known broad parallel Codex sandbox cwd / ESLint project-path false failure, then passed when rerun alone from `G:\vibe-coding\smart-cs-agent`.
- PR67 remains evidence-only/no-network: no provider API calls, no provider writes, no credential material reads, no payload escrow opening/decrypting, no raw provider/customer payload storage, no raw idempotency-key output, and no customer-visible replies have been enabled.

### PR62 Final Verification Notes

- `npm.cmd run db:generate` passed.
- `npm.cmd run db:migrate:deploy` passed after applying `20260608013000_pr62_provider_write_payload_escrow_boundary` and `20260608013500_pr62_provider_write_payload_escrow_cross_field_constraints`; the final run reported no pending migrations across 15 migrations.
- `node --test scripts\verify-provider-write-payload-escrow-boundary.test.mjs` passed with 5 tests.
- `npm.cmd run verify:provider-write-payload-escrow-boundary`, `npm.cmd run verify:provider-write-execution-attempts`, `npm.cmd run verify:provider-write-execution-attempt-visibility`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 194 tests when rerun alone from the repository cwd. An earlier broad parallel run failed from a Codex sandbox temp cwd with the known `experimentalDecorators`/tsx project-path issue, then passed immediately from `G:\vibe-coding\smart-cs-agent`.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 75 tests.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 112 pass / 1 skipped. The skipped test is the existing Windows symlink-permission case.
- `git diff --check` passed with CRLF warnings only.
- PR62 remains a default-off readiness boundary only: no payload escrow opening/decrypting, no provider credential reads, no real Taobao/Douyin mutation, no provider write adapter call, no raw provider/customer payload storage, and no customer-visible message send has been enabled. Independent read-only review found no P0/P1 blocker; its P2 database consistency finding was fixed by adding `ProviderWriteRequest_payload_escrow_consistency_chk`, which rejects mismatched `payloadEscrowStatus` / `payloadEscrowMode` / envelope metadata combinations.

### PR63 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 194 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 75 tests.
- `node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs` passed with 8 tests.
- `node --test scripts/verify-production-launch.test.mjs` passed with 1 test, covering the dry-run-before-provider-write-approval safe-mode order.
- `npm.cmd run verify:provider-write-dry-run-rehearsal`, `npm.cmd run verify:provider-write-payload-escrow-boundary`, `npm.cmd run verify:production-provider-write-approval`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 121 pass / 1 skipped. The skipped test is the existing Windows symlink-permission case.
- `git diff --check` passed with CRLF warnings only.
- Read-only security review found no P0/P1/P2/P3 findings. Read-only launch/static CI review found no P0/P1/P2 findings; its P3 test-hardening finding was fixed by checking the exact verifier ordering assertion block.
- PR63 remains no-network evidence only: no provider API calls, no provider credentials, no vault/decrypt access, no payload escrow opening, no real Taobao/Douyin mutation, no raw provider/customer payload storage, no raw idempotency-key output, and no customer-visible message send has been enabled.

### PR64 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 198 tests when rerun alone from the repository cwd, avoiding the known broad parallel sandbox cwd false failure mode.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 75 tests.
- `node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs` passed with 3 tests.
- `npm.cmd run verify:provider-write-live-executor-startup-guard`, `npm.cmd run verify:provider-write-dry-run-rehearsal`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 124 pass / 1 skipped. The skipped test is the existing Windows symlink-permission case.
- `git diff --check` passed with CRLF warnings only.
- Read-only security review and read-only launch/static CI review found no P0/P1/P2/P3 findings.
- PR64 remains config-only/no-network: `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED` defaults to `false`; production startup fails closed without dry-run and approval evidence hashes, sealed metadata readiness, review allowlists, credential refs, and the execution kill switch still enabled. No provider API calls, provider writes, credential material reads, payload escrow opening/decrypting, raw provider/customer payload storage, or customer-visible replies have been enabled.

### PR65 Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 204 tests when rerun alone from the repository cwd. An earlier broad parallel run hit the known Codex sandbox cwd / `experimentalDecorators` false failure and is not counted as a pass.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 77 tests.
- `node --check scripts/verify-provider-write-live-executor-control-plane.mjs`, `node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs`, `npm.cmd run verify:provider-write-live-executor-control-plane`, `npm.cmd run verify:provider-write-live-executor-startup-guard`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 127 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.
- Read-only launch/static CI review found no P0/P1/P2 findings; its P3 checklist consistency finding was fixed by adding `node --check scripts/verify-provider-write-live-executor-control-plane.mjs` to the PR65 gate inventory.
- Read-only security review found no P0; its P1 runtime env-read finding was fixed by serving live executor status from an `ApiConfigService` startup snapshot instead of re-reading evidence hashes or credential refs on the control-plane request path.
- PR65 remains read-only/no-network: no provider API calls, no provider writes, no provider credential material reads, no payload escrow opening/decrypting, no raw provider/customer payload storage, and no customer-visible replies have been enabled.

### PR66 Final Verification Notes

- `npm.cmd run db:generate` passed.
- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 211 tests when rerun alone from the repository cwd. An earlier broad parallel run hit the known Codex sandbox cwd / `experimentalDecorators` false failure and is not counted as a pass.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 80 tests.
- `node --check scripts/verify-provider-write-kill-switch-control-plane.mjs`, `node --check scripts/verify-provider-write-kill-switch-control-plane.test.mjs`, `node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs`, and `npm.cmd run verify:provider-write-kill-switch-control-plane` passed.
- `npm.cmd run verify:provider-write-execution-attempts`, `npm.cmd run verify:provider-write-live-executor-startup-guard`, `npm.cmd run verify:provider-write-live-executor-control-plane`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 131 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.
- PR66 remains emergency-stop/no-network: persisted `engage` events block provider write execution attempts with `policyReason=emergency_stop_engaged`, release events do not modify env variables or enable real provider writes, and no provider API calls, provider writes, credential material reads, payload escrow opening/decrypting, raw provider/customer payload storage, raw idempotency-key output, or customer-visible replies have been enabled.

### PR60 Final Verification Notes

- `npm.cmd run db:generate` passed.
- `npm.cmd run db:migrate:deploy` passed and applied `20260608004500_pr60_provider_write_execution_attempt_idempotency_scope`.
- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 185 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 73 tests.
- `node --test scripts\verify-provider-write-execution-attempts.test.mjs` passed with 3 tests.
- `npm.cmd run verify:provider-write-execution-attempts`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false` passed.
- `npm.cmd run lint --workspaces --if-present -- --max-warnings=0` passed when rerun alone from the repository cwd. A broad parallel run failed from a Codex sandbox temp cwd with existing ESLint project-path errors, matching the known PR59 caveat.
- `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 103 pass / 1 skipped. The skipped test is the existing Windows symlink-permission case.
- `git diff --check` passed with CRLF warnings only.
- Read-only PR60 reviews found a P1 plan ambiguity around `payloadEscrowStatus=not_stored` and idempotency scope, then P2/P3 hardening opportunities in verifier scanning and BFF upstream response handling. The implementation and plan now define `not_stored` as the safe dry-run precondition, persist `payloadEscrowOpened=false`, scope idempotency to each provider write request, bind request/attempt fingerprints to approval and escrow state, add verifier checks that reject provider write calls or credential/decrypt access in execution helpers, and make the Web BFF fail closed if the upstream execution-attempt response contains raw/provider/secret fields.
- PR60 is still no-network only: no payload escrow opening, no provider credential/decrypt path, no real Taobao/Douyin mutation, and no customer-visible message send has been enabled.

### PR61 Final Verification Notes

- `npm.cmd run db:generate` passed.
- `npm.cmd run db:migrate:deploy` passed and applied `20260608011000_pr61_provider_write_execution_attempt_constraints`.
- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 188 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 75 tests.
- `node --test scripts\verify-provider-write-execution-attempt-visibility.test.mjs` passed with 4 tests.
- `npm.cmd run verify:provider-write-execution-attempt-visibility`, `npm.cmd run verify:provider-write-execution-attempts`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 107 pass / 1 skipped. The skipped test is the existing Windows symlink-permission case.
- `git diff --check` passed with CRLF warnings only.
- Read-only PR61 review found no blocking issue. One P3 hardening item was fixed: `operatorVisibleResult` is now blocked from execution-attempt list visibility by the shared schema test, BFF unsafe-field guard, and PR61 verifier negative fixture.
- PR61 is still read-only/no-network visibility only: no payload escrow opening, no provider credential/decrypt path, no real Taobao/Douyin mutation, and no customer-visible message send has been enabled.

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
