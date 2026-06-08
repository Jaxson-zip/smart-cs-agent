# PR58 Provider Write Request Queue

This stage adds the internal queue boundary for future human-reviewed provider writes. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not store provider payloads, and does not send customer-visible replies.

## PR75 Provider Write Controlled Expansion Run Ledger Gate

PR75 adds the post-window run ledger gate after PR74 controlled expansion preflight. It validates whether a completed `controlled_multi_merchant` rollout window stayed inside its approved preflight scope using a sanitized `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` package and the PR74 preflight source chain.

Run:

```bash
npm run verify:provider-write-controlled-expansion-run-ledger
```

Use `npm run verify:provider-write-controlled-expansion-run-ledger:safe` with `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE`, and `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_REQUIRE_PASS=true` after release owners export sanitized evidence under `provider-write-controlled-expansion-run-ledger-artifacts/`, `provider-write-controlled-expansion-preflight-artifacts/`, `provider-write-controlled-expansion-approval-artifacts/`, `provider-write-safe-ledger-assembly-artifacts/`, `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`. See `docs/deploy/provider-write-controlled-expansion-run-ledger.md`.

This verifier recomputes the PR74 preflight file SHA-256 before accepting `providerWriteControlledExpansionPreflightSha256`, recomputes the PR73 approval and safe-ledger assembly source chain, requires `providerWriteControlledExpansionPreflightVerifierPassed=true`, checks run counts, failures, rollback proof, complaints, rejected compensation, `customerComplaintsStoppedRollout`, and no automatic customer-visible replies. It does not call provider APIs, execute provider writes, read provider credentials, read production databases, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR74 Provider Write Controlled Expansion Preflight Gate

PR74 adds the launch-window preflight gate after PR73 controlled expansion approval. It validates whether a specific `controlled_multi_merchant` rollout window is still inside the approved scope using a sanitized `smart-cs-agent.provider-write-controlled-expansion-preflight.v1` package and the PR73 approval package.

Run:

```bash
npm run verify:provider-write-controlled-expansion-preflight
```

Use `npm run verify:provider-write-controlled-expansion-preflight:safe` with `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE`, and `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_REQUIRE_PASS=true` after release owners export sanitized evidence under `provider-write-controlled-expansion-preflight-artifacts/`, `provider-write-controlled-expansion-approval-artifacts/`, `provider-write-safe-ledger-assembly-artifacts/`, `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`. See `docs/deploy/provider-write-controlled-expansion-preflight.md`.

This verifier recomputes the approval file SHA-256 before accepting `providerWriteControlledExpansionApprovalSha256`, recomputes the PR73 safe-ledger assembly receipt before accepting `providerWriteSafeLedgerAssemblySha256`, recomputes the PR70/PR71/PR69 source artifact SHA-256 values before accepting assembly bindings, requires `providerWriteControlledExpansionApprovalVerifierPassed=true`, rejects merchant/action/limit scope that exceeds PR73 approval, requires `freezeWindowActive=true`, `automaticNextWaveEnabled=false`, `rollbackOnAnyFailedMutation=true`, operator coverage, support escalation readiness, merchant notification readiness, and no automatic customer-visible replies. It does not call provider APIs, execute provider writes, read provider credentials, read production databases, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR73 Provider Write Controlled Expansion Approval Gate

PR73 adds the controlled expansion approval gate after PR72 safe ledger assembly. It validates whether release owners may consider expanding from `single_merchant_pilot` to `controlled_multi_merchant` using a sanitized `smart-cs-agent.provider-write-controlled-expansion-approval.v1` approval package and a separate safe ledger assembly receipt.

Run:

```bash
npm run verify:provider-write-controlled-expansion-approval
```

Use `npm run verify:provider-write-controlled-expansion-approval:safe` with `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE`, `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE`, and `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true` after release owners export sanitized evidence under `provider-write-controlled-expansion-approval-artifacts/`, `provider-write-safe-ledger-assembly-artifacts/`, `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`. See `docs/deploy/provider-write-controlled-expansion-approval.md`.

This verifier recomputes the assembly receipt SHA-256 before accepting `providerWriteSafeLedgerAssemblySha256`, recomputes PR70/PR71/PR69 source artifact SHA-256 values before accepting the assembly receipt bindings, requires `providerWriteSafeLedgerAssemblyVerifierPassed=true`, keeps actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`, and checks operator coverage, rollback ownership, alerting, billing plan, contract review, support SLA, merchant notification readiness, and no automatic customer-visible replies. It does not call provider APIs, execute provider writes, read provider credentials, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR72 Provider Write Safe Ledger Assembly Gate

PR72 adds the final safe ledger assembly gate for a bounded live provider write pilot. It checks that PR70 `smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1` draft evidence, PR71 `smart-cs-agent.provider-write-manual-closeout-review.v1` manual closeout review, and PR69 `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` final ledger evidence are the same `single_merchant_pilot` package before release owners consider expansion.

Run:

```bash
npm run verify:provider-write-safe-ledger-assembly
```

Use `npm run verify:provider-write-safe-ledger-assembly:safe` with `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE`, `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE`, `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE`, and `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true` after release owners export sanitized evidence under `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`. See `docs/deploy/provider-write-safe-ledger-assembly.md`.

This verifier recomputes file SHA-256 bindings for `providerWriteLivePilotRunLedgerDraftSha256` and `providerWriteManualCloseoutReviewSha256`, compares `auditExportSha256` and `productionLaunchSha256`, keeps PR70 at `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`, and requires PR71 `approved_for_safe_ledger`. It does not call provider APIs, execute provider writes, read provider credentials, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR71 Provider Write Manual Closeout Review Gate

PR71 adds the manual closeout review gate for a bounded live provider write pilot. The `smart-cs-agent.provider-write-manual-closeout-review.v1` package must prove that release, operations, and rollback owners reviewed the PR70 draft, sanitized audit export, failed-run notes, rollback actions, and production launch evidence before a PR69 safe ledger can bind the review.

Run:

```bash
npm run verify:provider-write-manual-closeout-review
```

Use `npm run verify:provider-write-manual-closeout-review:safe` with `SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE` and `SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true` after release owners export sanitized review evidence under `provider-write-manual-closeout-review-artifacts/`. See `docs/deploy/provider-write-manual-closeout-review.md`.

This verifier checks reviewer independence, second review, run-count consistency, failure/rollback closeout, no automatic customer replies, artifact bindings, and safety booleans. It does not call provider APIs, execute provider writes, read provider credentials, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR70 Provider Write Live Pilot Run Ledger Draft Export

PR70 adds `ProviderWriteLivePilotRunLedgerDraftSchema` and admin-only draft export routes for release owners assembling post-window provider write evidence:

- `GET /v2/provider-writes/live-pilot-run-ledger/draft`
- `GET /api/operator/provider-writes/live-pilot-run-ledger/draft`

Run:

```bash
npm run verify:provider-write-live-pilot-run-ledger-draft-export
```

The draft is deliberately not a safe ledger. It must keep `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`, and it must continue to list missing `artifact_bindings`, `live_provider_mutation_evidence`, and `manual_closeout_review` until a release owner builds a separate PR69 evidence package with `providerWriteManualCloseoutReviewSha256`. The exporter reads existing sanitized request/attempt facts only; it does not call provider APIs, execute provider writes, read provider credentials, open payload escrow, store provider payloads/responses, expose raw tenant/order/logistics/address/idempotency/customer fields, or send customer-visible replies.

## PR69 Provider Write Live Pilot Run Ledger Gate

PR69 adds the sanitized closeout ledger required after a first real provider write pilot window. The `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` package proves which low-risk pilot runs happened, whether they succeeded, failed, rolled back, or were blocked, and whether every run was reviewed against audit evidence without storing raw provider/customer data.

Run:

```bash
npm run verify:provider-write-live-pilot-run-ledger
```

Use `npm run verify:provider-write-live-pilot-run-ledger:safe` with `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true` after release owners export sanitized pilot closeout evidence under `provider-write-live-pilot-run-ledger-artifacts/`. See `docs/deploy/provider-write-live-pilot-run-ledger.md`.

This verifier checks run-ledger evidence shape, safe artifact paths, count consistency, low-risk first-pilot action limits, post-pilot review controls, rollback evidence, artifact bindings including `providerWriteManualCloseoutReviewSha256`, docs, static CI wiring, and production launch references. It does not call provider APIs, execute provider writes, read credentials, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR68 Provider Write Live Pilot Preflight Gate

PR68 adds the final sanitized preflight gate before any first real provider write pilot launch window may enable a live executor. The `smart-cs-agent.provider-write-live-pilot-preflight.v1` package proves that the pilot is single merchant, single channel, low risk, bounded, operator-watched, rollback-ready, observable, and bound to prior dry-run rehearsal, kill-switch rehearsal, provider write approval, live executor guard, control-plane, and production launch evidence.

Run:

```bash
npm run verify:provider-write-live-pilot-preflight
```

Use `npm run verify:provider-write-live-pilot-preflight:safe` with `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true` after release owners export sanitized preflight evidence under `provider-write-live-pilot-preflight-artifacts/`. See `docs/deploy/provider-write-live-pilot-preflight.md`.

This verifier checks evidence shape, safe artifact paths, first-pilot action/risk limits, runtime controls, operator coverage, rollback, observability, artifact bindings, docs, static CI wiring, and production launch ordering. It does not call provider APIs, execute provider writes, read credentials, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR67 Provider Write Kill Switch Rehearsal Evidence Gate

PR67 adds a sanitized evidence gate for rehearsing provider write emergency stop behavior before any real provider write pilot approval can be accepted. The `smart-cs-agent.provider-write-kill-switch-rehearsal.v1` package proves that admins can engage the emergency stop, that execution attempts fail closed with `policyReason=emergency_stop_engaged`, and that releasing the persisted emergency stop does not enable real provider writes.

Run:

```bash
npm run verify:provider-write-kill-switch-rehearsal
```

Use `npm run verify:provider-write-kill-switch-rehearsal:safe` with `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE` and `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true` after release owners export sanitized rehearsal evidence under `provider-write-kill-switch-rehearsal-artifacts/`. See `docs/deploy/provider-write-kill-switch-rehearsal.md`.

This verifier checks evidence shape, safe artifact paths, admin-only control-plane proof, idempotency, audit trail, execution blocking, release safety, docs, static CI wiring, production provider write approval wiring, and production launch references. It does not call provider APIs, execute provider writes, read credentials, open/decrypt payload escrow, store raw provider/customer payloads, expose raw idempotency keys, or send customer-visible replies.

## PR66 Provider Write Kill Switch Control Plane

PR66 adds an admin-only emergency-stop control plane for future provider write execution. It records sanitized `ProviderWriteKillSwitchEvent` rows, exposes only `ProviderWriteKillSwitchStatusSchema`, and makes provider write execution attempts fail closed with `policyReason=emergency_stop_engaged` when the persisted emergency stop is engaged. Releasing the persisted emergency stop does not change environment variables and does not enable real provider writes.

New control routes:

- `GET /v2/provider-writes/kill-switch/status`: admin-only API route that returns the current safe kill-switch status for the authenticated tenant.
- `POST /v2/provider-writes/kill-switch/status`: admin-only API route that records an `engage` or `release` event with a controlled reason code and a hashed idempotency key.
- `GET /api/operator/provider-writes/kill-switch/status`: Web BFF admin route that uses the HttpOnly admin session and keeps operator API keys server-side.
- `POST /api/operator/provider-writes/kill-switch/status`: Web BFF admin route that validates the update body before proxying it through the server-side operator API key.

The response may show only safe control-plane facts: env kill-switch enabled, persisted emergency stop engaged, effective kill-switch enabled, source, latest safe event metadata, and no-network invariants. It must not expose raw idempotency keys, provider payloads, provider responses, raw order IDs, logistics IDs, addresses, credential refs, credential material, operator API keys, provider tokens, webhook secrets, tenant secrets, or customer messages.

Run:

```bash
npm run verify:provider-write-kill-switch-control-plane
```

This verifier checks the shared status/update contracts, Prisma event table and constraints, admin-only API/BFF routes, execution-attempt blocking, idempotency, audit safety, docs, static CI wiring, and production launch references. It also checks that the control plane does not call provider APIs, does not execute provider writes, does not read credential material, does not open or decrypt payload escrow, and does not send customer-visible replies.

## PR65 Provider Write Live Executor Control Plane

PR65 adds read-only status visibility for the future live provider write executor. It still does not call provider APIs, does not execute provider writes, does not read credential material, does not open payload escrow, and does not send customer-visible replies. Runtime status responses are served from the sanitized startup config snapshot rather than re-reading evidence hash or credential-ref environment values on each request.

New read routes:

- `GET /v2/provider-writes/live-executor/status`: admin-only API route that returns `ProviderWriteLiveExecutorStatusSchema`.
- `GET /api/operator/provider-writes/live-executor/status`: Web BFF admin route that uses the HttpOnly admin session and keeps operator API keys server-side.

The response may show only safe control-plane facts: whether the live executor flag is enabled, whether startup gates are satisfied, safe missing gate names, evidence-present booleans, review allowlist count, credential ref count, payload escrow mode, kill-switch state, and no-network invariants. It does not expose evidence hashes, credential refs, provider payloads, provider responses, tenant IDs, order IDs, logistics IDs, addresses, idempotency keys, operator API keys, tokens, webhook secrets, or customer messages.

Run:

```bash
npm run verify:provider-write-live-executor-control-plane
```

This verifier checks the shared status contract, config status helper, admin-only API route, Web BFF route, docs, static CI wiring, and production launch references. It keeps the control plane read-only and checks that it does not execute provider writes, decrypt/open payload escrow, expose evidence hashes, expose credential refs, or send customer-visible replies.

## PR64 Provider Write Live Executor Startup Guard

PR64 adds a production startup guard for any future live provider write executor. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies.

The live executor remains disabled by default:

```bash
PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=false
PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256=""
PROVIDER_WRITE_APPROVAL_SHA256=""
```

If production sets `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=true`, startup fails closed unless `PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256` and `PROVIDER_WRITE_APPROVAL_SHA256` are non-placeholder SHA-256 evidence hashes, `PROVIDER_WRITE_EXECUTION_KILL_SWITCH=true`, `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE=sealed_metadata`, `PROVIDER_WRITE_REVIEW_ADAPTERS` has at least one low-risk allowlist, and `PROVIDER_CREDENTIALS` contains credential ref records without inline secret material. The app may store or log evidence hashes and credential fingerprints, but it must not store raw order IDs, logistics IDs, addresses, provider payloads, provider responses, idempotency keys, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Run:

```bash
npm run verify:provider-write-live-executor-startup-guard
```

This verifier checks the startup guard config, production launch docs, static CI wiring, and execution slices. It ensures PR64 does not call provider APIs, does not execute provider writes, does not read credential material, does not decrypt/open payload escrow, and does not send customer-visible replies.

## PR63 Provider Write Dry-Run Rehearsal Evidence Gate

PR63 adds a sanitized evidence gate for rehearsing the provider write request, human review, and no-network execution-attempt chain. It validates `smart-cs-agent.provider-write-dry-run-rehearsal.v1` packages under `provider-write-dry-run-rehearsal-artifacts/`, but it does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies.

Run:

```bash
npm run verify:provider-write-dry-run-rehearsal
```

Use `npm run verify:provider-write-dry-run-rehearsal:safe` with `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE` and `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true` after a release owner exports sanitized dry-run evidence. See `docs/deploy/provider-write-dry-run-rehearsal.md`.

## PR62 Provider Write Payload Escrow Boundary

PR62 adds a default-off payload escrow readiness boundary for future provider writes. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, does not decrypt payloads, and does not send customer-visible replies.

Configure the boundary with:

```bash
PROVIDER_WRITE_PAYLOAD_ESCROW_MODE=disabled
```

The default `disabled` mode keeps `ProviderWriteRequest.payloadEscrowStatus=not_stored`. If `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE=sealed_metadata` is explicitly set, a `ProviderWriteRequest` may store only request-scoped metadata such as `payloadEscrowStatus=sealed_metadata`, `payloadEscrowFingerprint`, `payloadEscrowEnvelopeFingerprint`, `payloadEscrowMode`, and `payloadEscrowCreatedAt`. These fields are readiness evidence for a future reviewed executor, not an executable payload. They must not include raw order IDs, logistics IDs, addresses, provider payloads, ciphertext bodies, provider responses, customer messages, operator API keys, provider tokens, credential refs, webhook secrets, or tenant secrets.

Human review preserves the request escrow metadata, but execution attempts still do not open payload escrow. `ProviderWriteExecutionAttempt` rows remain constrained by the PR61 database boundary: `payloadEscrowStatus=not_stored`, `payloadEscrowOpened=false`, `networkExecution=not_started`, `providerMutationExecuted=false`, and `customerVisibleMessageSent=false`. A sealed request therefore blocks execution attempts in this build with a payload-escrow policy reason instead of executing a provider mutation.

Run:

```bash
npm run verify:provider-write-payload-escrow-boundary
```

This verifier checks default-off config, request-only escrow metadata, no raw payload storage, preserved PR61 execution-attempt constraints, no provider/decrypt/credential calls, docs, static CI wiring, production launch references, and task plan references.

## PR61 Provider Write Execution Attempt Invariants And Visibility

PR61 adds database invariants and admin-only sanitized visibility for provider write execution attempts. It does not add a live executor, payload escrow opening, provider credential reads, provider mutations, or customer-visible sends.

New read routes:

- `GET /v2/provider-writes/execution-attempts`: admin-only API route for listing sanitized `ProviderWriteExecutionAttemptListItem` rows for the authenticated tenant.
- `GET /api/operator/provider-writes/execution-attempts`: Web BFF admin route that uses the HttpOnly admin session and keeps operator API keys server-side.

The database now rejects unsafe `ProviderWriteExecutionAttempt` rows unless `status` is one of `dry_run_recorded`, `blocked`, or `failed`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `payloadEscrowStatus=not_stored`.

Visibility responses expose only safe operational metadata: attempt id, provider write request id, operator id, channel/action, status, no-network flags, payload escrow status, short request/attempt fingerprints, policy reason, and timestamps. They must not expose `idempotencyKeyHash`, full request hashes, full attempt fingerprints, raw order IDs, logistics IDs, addresses, provider payloads, provider responses, customer messages, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Run:

```bash
npm run verify:provider-write-execution-attempt-visibility
```

This verifier checks the migration constraints, shared `ProviderWriteExecutionAttemptListItem` contract, API route, Web BFF route, tests, docs, static CI wiring, and production launch references. It keeps visibility read-only and no-network.

## PR60 Provider Write Execution Attempt Safety

PR60 adds execution-attempt records for approved provider write requests. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies.

New API routes:

- `POST /v2/provider-writes/requests/:id/execution-attempts`: admin-only API route for recording a no-network execution attempt for an approved request.
- `POST /api/operator/provider-writes/requests/:id/execution-attempts`: Web BFF route that uses the HttpOnly admin session and keeps operator API keys server-side.

`PROVIDER_WRITE_EXECUTION_KILL_SWITCH` defaults to enabled. With the default kill switch state, execution attempts persist as `status=blocked` with `policyReason=execution_kill_switch_enabled`. If the kill switch is explicitly set to `false`, the API may record `status=dry_run_recorded`; this still keeps `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and `requiresHuman=true`.

`ProviderWriteExecutionAttempt` rows store only tenant/request/operator ids, channel/action names, status, `idempotencyKeyHash`, `requestHash`, `attemptFingerprint`, payload escrow status, no-execution flags, an operator-visible result, and a policy reason. They must not store raw idempotency keys, order IDs, logistics IDs, addresses, provider payloads, provider responses, customer data, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Run:

```bash
npm run verify:provider-write-execution-attempts
```

This verifier checks the shared execution attempt contracts, Prisma migration, kill-switch config, API route, Web BFF route, dry-run/no-network tests, sanitized docs, static CI, production launch references, and task plan.

## PR59 Provider Write Approval State Machine

PR59 adds approve/reject transitions for queued provider write requests. It still does not call provider APIs, does not execute provider writes, does not read provider credentials, does not decrypt payload escrow, and does not send customer-visible replies.

New API routes:

- `POST /v2/provider-writes/requests/:id/approve`: admin-only API route for approving an `approval_required` request.
- `POST /v2/provider-writes/requests/:id/reject`: admin-only API route for rejecting an `approval_required` request.
- `POST /api/operator/provider-writes/requests/:id/approve`: Web BFF route that uses the HttpOnly admin session and keeps operator API keys server-side.
- `POST /api/operator/provider-writes/requests/:id/reject`: Web BFF route that uses the HttpOnly admin session and keeps operator API keys server-side.

Approval and rejection are tenant-scoped and require two-person review. The reviewer is derived from the authenticated operator context; body-supplied tenant, operator, reviewer, raw payload, or key fields are ignored or rejected. The original requester cannot approve their own request, even when that requester is an admin.

Review requests accept only controlled `reasonCode` values. They do not accept free-text notes, raw order IDs, logistics IDs, addresses, provider payloads, provider responses, customer data, operator API keys, provider tokens, webhook secrets, or tenant secrets.

Reviewed rows may store `reviewerOperatorId`, `reviewedAt`, `reviewReasonCode`, `reviewFingerprint`, `payloadEscrowStatus`, and `payloadEscrowFingerprint`. `payloadEscrowStatus=not_stored` is an explicit boundary: PR59 records that no raw provider write payload is available for execution in this build. The fingerprint is only an audit marker for the absent escrow envelope.

Approved requests return `status=approved`, `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `requiresHuman=true`. Rejected requests use the same no-execution flags with `status=rejected`. Approval means "eligible for a future executor after another reviewed implementation," not "executed."

Run:

```bash
npm run verify:provider-write-approval-state
```

This verifier checks the shared approval contracts, Prisma migration, API routes, Web BFF routes, two-person review tests, sanitized response behavior, docs, static CI, production launch references, and task plan.

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

This queue and approval state machine are not enough to execute real writes. A later stage must add secure payload escrow with decrypt-on-execution controls, a live kill switch check immediately before network calls, provider-specific write clients, execution attempts, rollback behavior, and production canary coverage.

## Verification

Run:

```bash
npm run verify:provider-write-requests
```

This verifier checks the shared contract, Prisma model and migration, config parser, adapter policy, Ops service queue behavior, API/BFF routes, sanitized tests, docs, launch runbook, and task plan.
