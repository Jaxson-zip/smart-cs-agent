# PR75 Provider Write Controlled Expansion Run Ledger Gate

PR75 adds the post-window run ledger gate after PR74 controlled expansion preflight. It validates a sanitized `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` package under `provider-write-controlled-expansion-run-ledger-artifacts/` after a concrete `controlled_multi_merchant` launch window closes.

This gate binds the run ledger back to the PR74 `smart-cs-agent.provider-write-controlled-expansion-preflight.v1` file through `providerWriteControlledExpansionPreflightSha256`. Safe mode also requires the PR74 preflight's PR73 `smart-cs-agent.provider-write-controlled-expansion-approval.v1` approval file, PR73 `smart-cs-agent.provider-write-safe-ledger-assembly.v1` safe-ledger assembly receipt, PR70 draft, PR71 manual review, and PR69 final ledger source files so the verifier can recompute the same SHA-256 chain before accepting post-window results.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-controlled-expansion-run-ledger
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_FILE=provider-write-controlled-expansion-run-ledger-artifacts/controlled-expansion-run-ledger.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_FILE=provider-write-controlled-expansion-preflight-artifacts/controlled-expansion-preflight.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE=provider-write-controlled-expansion-approval-artifacts/controlled-expansion-approval.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_FILE=provider-write-safe-ledger-assembly-artifacts/safe-ledger-assembly.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE=provider-write-live-pilot-run-ledger-draft-artifacts/live-pilot-run-ledger-draft.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE=provider-write-manual-closeout-review-artifacts/manual-closeout-review.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE=provider-write-live-pilot-run-ledger-artifacts/live-pilot-run-ledger.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_RUN_LEDGER_REQUIRE_PASS=true
npm run verify:provider-write-controlled-expansion-run-ledger:safe
```

The `:safe` command fails closed unless the run ledger, PR74 preflight file, PR73 approval file, PR73 safe ledger assembly receipt, PR70 draft, PR71 manual closeout review, and PR69 final ledger source files are supplied.

## Evidence Shape

The run ledger evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=controlled_multi_merchant`, and the same safe change ticket from PR74.
- `expansionScope`: merchant fingerprints, channels, allowed actions, aggregate and per-merchant daily write limits, coupon cap, and `businessHoursOnly=true`. The scope must stay inside the PR74 preflight scope.
- `launchWindow`: start/end timestamps matching PR74, `closedAt`, `durationMinutes`, `freezeWindowActive=true`, and `businessHoursOnly=true`.
- `summary`: total, succeeded, failed, rolled-back, blocked, complaint, and rejected-compensation counts matching `runRecords`; `allRunsReviewed=true`; `failedRunsHaveIncidentNotes=true` when failures exist; `rollbackActionsVerified=true` when rollbacks or failed provider mutations exist; `customerComplaintsStoppedRollout=true`; and `noAutoCustomerReplies=true`.
- `runRecords`: sanitized merchant/channel/action/run fingerprints, audit hashes, operator/reviewer/rollback owner fingerprints, risk/status/network flags, provider mutation facts, complaint/rejection flags, and timestamps inside the launch window.
- `evidence`: `providerWriteControlledExpansionPreflightVerifierPassed=true`, `providerWriteControlledExpansionPreflightSha256`, production launch/static CI/alerting/canary proof, kill-switch and live-executor control-plane proof, execution-attempt visibility proof, audit export verification, and post-expansion review.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

## Failure And Complaint Rules

Failed provider mutations cannot remain in plain `failed` state. They must be rolled back or blocked with incident notes and rollback proof before the ledger can pass.

Customer complaints and compensation rejection are not automatic next-wave triggers. The ledger requires complaint and rejection counts to match sanitized run flags, keeps `customerComplaintsStoppedRollout=true`, and keeps `noAutoCustomerReplies=true` so operators can review the closeout without the system sending customer-visible messages.

## Safety Boundary

This verifier:

- does not enable provider writes;
- does not call provider APIs;
- does not execute provider writes;
- does not read provider credentials;
- does not read operator API keys;
- does not read production databases;
- does not open payload escrow;
- does not open or decrypt payload escrow;
- does not store raw provider/customer payloads;
- does not expose raw idempotency keys;
- does not send customer-visible replies.

The run ledger, preflight, approval, assembly, draft, review, and final ledger source files must not contain raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR75 after PR74 preflight has passed and the controlled expansion window has closed:

```bash
npm run verify:provider-write-controlled-expansion-preflight:safe
npm run verify:provider-write-controlled-expansion-run-ledger
npm run verify:provider-write-controlled-expansion-run-ledger:safe
```

Passing PR75 does not approve the next expansion by itself. It proves only that the completed controlled expansion window stayed inside its preflight scope, every run was reviewed, failures and complaints were closed out, and no customer-visible automatic reply was sent.

PR76 Provider Write Controlled Expansion Closeout Review Gate follows this ledger with a separate manual review package. Run `verify:provider-write-controlled-expansion-closeout-review` after PR75; the PR76 verifier binds `providerWriteControlledExpansionRunLedgerSha256`, requires `approved_for_next_expansion_review`, and still does not approve the next wave automatically.
