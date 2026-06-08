# PR79 Provider Write Graduated Rollout Run Ledger Gate

PR79 adds the post-window run ledger gate after PR78 graduated rollout preflight. It validates sanitized `smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1` evidence under `provider-write-graduated-rollout-run-ledger-artifacts/`, binds it to the PR78 `smart-cs-agent.provider-write-graduated-rollout-preflight.v1` preflight under `provider-write-graduated-rollout-preflight-artifacts/`, and rechecks the PR77 `smart-cs-agent.provider-write-graduated-rollout-approval.v1`, PR76 `smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1`, and PR75 `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` chain.

This gate only proves that a completed `graduated_multi_merchant` launch window stayed inside its approved scope and was closed out by humans. Passing PR79 does not approve another wave, does not enable provider writes, and does not send customer-visible replies.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-graduated-rollout-run-ledger
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_FILE=provider-write-graduated-rollout-run-ledger-artifacts/graduated-rollout-run-ledger.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_FILE=provider-write-graduated-rollout-preflight-artifacts/graduated-rollout-preflight.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_APPROVAL_FILE=provider-write-graduated-rollout-approval-artifacts/graduated-rollout-approval.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_CLOSEOUT_REVIEW_FILE=provider-write-controlled-expansion-closeout-review-artifacts/controlled-expansion-closeout-review.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_PREFLIGHT_RUN_LEDGER_FILE=provider-write-controlled-expansion-run-ledger-artifacts/controlled-expansion-run-ledger.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_RUN_LEDGER_REQUIRE_PASS=true
npm run verify:provider-write-graduated-rollout-run-ledger:safe
```

The `:safe` command fails closed unless all five files are supplied. The verifier recomputes `providerWriteGraduatedRolloutPreflightSha256` from the PR78 preflight bytes, recomputes `providerWriteGraduatedRolloutApprovalSha256` from the PR77 approval bytes, recomputes `providerWriteControlledExpansionCloseoutReviewSha256` from the PR76 closeout review bytes, and recomputes `providerWriteControlledExpansionRunLedgerSha256` from the PR75 run ledger bytes.

## Evidence Shape

The graduated rollout run ledger evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=graduated_multi_merchant`, and the same safe change ticket as PR78.
- `expansionScope`: merchant fingerprints, supported channels, allowed actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`, bounded write limits, coupon cap, and `businessHoursOnly=true`.
- `launchWindow`: ISO start and end timestamps that stay inside the PR78 preflight window.
- `prerequisiteEvidence`: `providerWriteGraduatedRolloutPreflightVerifierPassed=true`, `providerWriteGraduatedRolloutPreflightSha256`, `providerWriteGraduatedRolloutApprovalSha256`, `providerWriteControlledExpansionCloseoutReviewSha256`, `providerWriteControlledExpansionRunLedgerSha256`, production launch/static CI/alerting/canary proof, live executor visibility, kill switch proof, audit export proof, and post-graduated-rollout review proof.
- `runSummary`: reviewed totals for succeeded, rolled-back, blocked, complaints, and `customerRejectedCompensationCount`.
- `runRecords`: sanitized per-run records whose merchants, channels, actions, timestamps, and outcomes stay inside the PR78 scope and window.
- `closeoutControls`: `allRunsReviewed=true`, failed-run incident notes, `rollbackActionsVerified=true`, `customerComplaintsStoppedRollout=true`, `compensationRejectionsStoppedRollout=true`, `merchantNotificationCompleted=true`, `billingImpactReviewed=true`, `supportSlaMaintained=true`, and `noAutoCustomerReplies=true`.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

## Safety Boundary

This verifier:

- does not call provider APIs;
- does not execute provider writes;
- does not read provider credentials;
- does not read operator API keys;
- does not read production databases;
- does not open payload escrow;
- does not store raw provider/customer payloads;
- does not expose raw idempotency keys;
- does not send customer-visible replies.

The run ledger, preflight, approval, closeout review, and controlled run ledger packages must not include raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR79 only after PR75, PR76, PR77, and PR78 have passed and after the graduated rollout window has closed:

```bash
npm run verify:provider-write-controlled-expansion-run-ledger:safe
npm run verify:provider-write-controlled-expansion-closeout-review:safe
npm run verify:provider-write-graduated-rollout-approval:safe
npm run verify:provider-write-graduated-rollout-preflight:safe
npm run verify:provider-write-graduated-rollout-run-ledger
npm run verify:provider-write-graduated-rollout-run-ledger:safe
```

Passing PR79 is still not global launch approval. Any next wave needs a separate release decision and must keep provider writes guarded by the existing live executor and kill-switch control planes.

PR80 Provider Write Graduated Rollout Closeout Review Gate follows this ledger. It uses `verify:provider-write-graduated-rollout-closeout-review` to bind `providerWriteGraduatedRolloutRunLedgerSha256` to this PR79 package and requires `approved_for_general_availability_review` before any later general availability approval can be considered.
