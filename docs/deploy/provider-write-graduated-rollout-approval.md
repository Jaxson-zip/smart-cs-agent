# PR77 Provider Write Graduated Rollout Approval Gate

PR77 adds the approval-only gate after PR76 controlled expansion closeout review. It validates sanitized `smart-cs-agent.provider-write-graduated-rollout-approval.v1` evidence under `provider-write-graduated-rollout-approval-artifacts/`, binds it to the PR76 `smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1` package under `provider-write-controlled-expansion-closeout-review-artifacts/`, and continues the PR75 `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` chain under `provider-write-controlled-expansion-run-ledger-artifacts/`.

This gate only proves release owners may consider a bounded transition from `controlled_multi_merchant` to `graduated_multi_merchant`. Passing PR77 does not enable provider writes, does not schedule an automatic next wave, and does not send customer-visible replies.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-graduated-rollout-approval
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_APPROVAL_FILE=provider-write-graduated-rollout-approval-artifacts/graduated-rollout-approval.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_APPROVAL_CLOSEOUT_REVIEW_FILE=provider-write-controlled-expansion-closeout-review-artifacts/controlled-expansion-closeout-review.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_APPROVAL_RUN_LEDGER_FILE=provider-write-controlled-expansion-run-ledger-artifacts/controlled-expansion-run-ledger.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_APPROVAL_REQUIRE_PASS=true
npm run verify:provider-write-graduated-rollout-approval:safe
```

The `:safe` command fails closed unless all three files are supplied. The verifier recomputes `providerWriteControlledExpansionCloseoutReviewSha256` from the PR76 closeout review bytes, then recomputes the closeout review's `providerWriteControlledExpansionRunLedgerSha256` from the PR75 run ledger bytes.

## Evidence Shape

The graduated rollout approval evidence must include:

- `target`: rollout fingerprint, `fromRolloutTrack=controlled_multi_merchant`, `toRolloutTrack=graduated_multi_merchant`, and the same safe change ticket as PR76.
- `expansionScope`: 3 to 25 merchant fingerprints, supported channels, allowed actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`, bounded write limits, coupon cap, `businessHoursOnly=true`, and `automaticNextWaveEnabled=false`.
- `approval`: `approvalStatus=approved`, distinct requester, approver, and second reviewer fingerprints, plus an approval timestamp.
- `prerequisiteEvidence`: PR76 closeout review verifier proof, production launch/static CI/branch protection/alerting/canary proof, control-plane proof, and `providerWriteControlledExpansionCloseoutReviewSha256`.
- `operationalControls`: operator coverage, named owners, rollback playbook, alert route review, rate-limit review, support escalation readiness, merchant notification readiness, and `noAutomaticCustomerVisibleReplies=true`.
- `commercialReadiness`: customer contract, billing plan, support SLA, merchant notification plan, and pricing review.
- `artifactBindings`: audit export SHA-256, production launch SHA-256, and production static CI SHA-256.
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

The approval, closeout review, and run ledger packages must not include raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR77 only after PR75 and PR76 have passed:

```bash
npm run verify:provider-write-controlled-expansion-run-ledger:safe
npm run verify:provider-write-controlled-expansion-closeout-review
npm run verify:provider-write-controlled-expansion-closeout-review:safe
npm run verify:provider-write-graduated-rollout-approval
npm run verify:provider-write-graduated-rollout-approval:safe
```

Passing PR77 still requires a separate future launch-window preflight before any real graduated rollout window can proceed.
