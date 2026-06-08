# PR78 Provider Write Graduated Rollout Preflight Gate

PR78 adds the launch-window preflight gate after PR77 graduated rollout approval. It validates sanitized `smart-cs-agent.provider-write-graduated-rollout-preflight.v1` evidence under `provider-write-graduated-rollout-preflight-artifacts/`, binds it to the PR77 `smart-cs-agent.provider-write-graduated-rollout-approval.v1` approval under `provider-write-graduated-rollout-approval-artifacts/`, and rechecks the PR76 `smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1` plus PR75 `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` chain.

This gate only proves that a specific `graduated_multi_merchant` launch window is ready for human-controlled execution. Passing PR78 does not enable provider writes, does not schedule an automatic next wave, and does not send customer-visible replies.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-graduated-rollout-preflight
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_FILE=provider-write-graduated-rollout-preflight-artifacts/graduated-rollout-preflight.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_APPROVAL_FILE=provider-write-graduated-rollout-approval-artifacts/graduated-rollout-approval.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_CLOSEOUT_REVIEW_FILE=provider-write-controlled-expansion-closeout-review-artifacts/controlled-expansion-closeout-review.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_RUN_LEDGER_FILE=provider-write-controlled-expansion-run-ledger-artifacts/controlled-expansion-run-ledger.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_PREFLIGHT_REQUIRE_PASS=true
npm run verify:provider-write-graduated-rollout-preflight:safe
```

The `:safe` command fails closed unless all four files are supplied. The verifier recomputes `providerWriteGraduatedRolloutApprovalSha256` from the PR77 approval bytes, recomputes `providerWriteControlledExpansionCloseoutReviewSha256` from the PR76 closeout review bytes, and recomputes `providerWriteControlledExpansionRunLedgerSha256` from the PR75 run ledger bytes.

## Evidence Shape

The graduated rollout preflight evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=graduated_multi_merchant`, and the same safe change ticket as PR77.
- `expansionScope`: merchant fingerprints, supported channels, allowed actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`, bounded write limits, coupon cap, and `businessHoursOnly=true`.
- `launchWindow`: ISO start and end timestamps, duration from 30 to 240 minutes, `freezeWindowActive=true`, and `businessHoursOnly=true`.
- `prerequisiteEvidence`: `providerWriteGraduatedRolloutApprovalVerifierPassed=true`, `providerWriteGraduatedRolloutApprovalSha256`, production launch/static CI/branch protection/alerting/canary proof, control-plane proof, payload escrow boundary proof, and execution-attempt visibility proof.
- `rolloutPlan`: one wave, bounded merchant count, `automaticNextWaveEnabled=false`, `manualApprovalBeforeNextWave=true`, `rollbackOnAnyFailedMutation=true`, customer complaint stop, and `stopOnRejectedCompensation=true`.
- `operationalControls`: operator coverage, distinct owners, merchant notification readiness, support escalation readiness, rollback playbook review, alert route review, rate-limit review, and `noAutomaticCustomerVisibleReplies=true`.
- `commercialReadiness`: billing, merchant notification, support SLA, and pricing review.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

## Safety Boundary

This verifier:

- does not enable provider writes;
- does not call provider APIs;
- does not execute provider writes;
- does not read provider credentials;
- does not read operator API keys;
- does not read production databases;
- does not open payload escrow;
- does not store raw provider/customer payloads;
- does not expose raw idempotency keys;
- does not send customer-visible replies.

The preflight, approval, closeout review, and run ledger packages must not include raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR78 only after PR75, PR76, and PR77 have passed:

```bash
npm run verify:provider-write-controlled-expansion-run-ledger:safe
npm run verify:provider-write-controlled-expansion-closeout-review:safe
npm run verify:provider-write-graduated-rollout-approval
npm run verify:provider-write-graduated-rollout-approval:safe
npm run verify:provider-write-graduated-rollout-preflight
npm run verify:provider-write-graduated-rollout-preflight:safe
```

Passing PR78 is still not a global launch. Each future launch window must provide its own sanitized evidence and must keep provider writes disabled until the live executor is explicitly enabled through the existing guarded control plane.

PR79 Provider Write Graduated Rollout Run Ledger Gate follows this preflight after the selected window closes. It uses `verify:provider-write-graduated-rollout-run-ledger` and recomputes `providerWriteGraduatedRolloutPreflightSha256` before accepting post-window run evidence.
