# PR81 Provider Write General Availability Approval Gate

PR81 adds the approval-only gate after PR80 provider write graduated rollout closeout review. It validates sanitized `smart-cs-agent.provider-write-general-availability-approval.v1` evidence under `provider-write-general-availability-approval-artifacts/`, binds that approval to the PR80 `smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1` file under `provider-write-graduated-rollout-closeout-review-artifacts/`, and rechecks the PR80-to-PR79 `smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1` binding under `provider-write-graduated-rollout-run-ledger-artifacts/`.

This gate proves only that release, security, operations, commercial, billing, support, and merchant-success owners have approved moving from `graduated_multi_merchant` review into `general_availability` approval planning. Passing PR81 does not activate merchants automatically, does not open general availability automatically, and does not change runtime provider write behavior.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-general-availability-approval
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_FILE=provider-write-general-availability-approval-artifacts/general-availability-approval.json
set SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_CLOSEOUT_REVIEW_FILE=provider-write-graduated-rollout-closeout-review-artifacts/graduated-rollout-closeout-review.json
set SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_RUN_LEDGER_FILE=provider-write-graduated-rollout-run-ledger-artifacts/graduated-rollout-run-ledger.json
set SMARTCS_PROVIDER_WRITE_GENERAL_AVAILABILITY_APPROVAL_REQUIRE_PASS=true
npm run verify:provider-write-general-availability-approval:safe
```

The `:safe` command fails closed unless the approval, PR80 closeout review, and PR79 run ledger files are all supplied. The verifier recomputes `providerWriteGraduatedRolloutCloseoutReviewSha256` from the closeout review bytes and rechecks that closeout review's `providerWriteGraduatedRolloutRunLedgerSha256` against the run ledger bytes.

## Evidence Shape

The approval evidence must include:

- `target`: rollout fingerprint, `fromRolloutTrack=graduated_multi_merchant`, `toRolloutTrack=general_availability`, and the same safe change ticket as the PR80 closeout review and PR79 run ledger.
- `expansionScope`: merchant fingerprints, channels, allowed actions, aggregate and per-merchant limits, coupon cap, `businessHoursOnly=true`, `automaticActivationEnabled=false`, and `manualMerchantActivationRequired=true`.
- `approval`: approved or rejected decision, requester and reviewer fingerprints, distinct security, operations, and commercial reviewers, approval timestamp, and `secondReviewCompleted=true`.
- `prerequisiteEvidence`: PR80 closeout, production launch, static CI, branch protection, alerting, canary, kill-switch, live executor control-plane, and execution visibility verifier proof.
- `operationalControls`: named owners, rollback and alert review, support escalation readiness, merchant notification readiness, `noAutomaticCustomerVisibleReplies=true`, `liveExecutorKillSwitchDefaultOn=true`, and per-merchant activation requirements.
- `commercialReadiness`: contract, billing, support SLA, merchant notification, pricing, legal, and retention review.
- `rolloutControls`: `automaticActivationEnabled=false`, `automaticNextWaveEnabled=false`, `manualApprovalBeforeMerchantActivation=true`, rollback on failed mutation, stop on customer complaint, stop on rejected compensation, and broadcast readiness.
- `artifactBindings`: approval evidence includes `providerWriteGraduatedRolloutCloseoutReviewSha256`, audit export SHA-256, production launch SHA-256, and production static CI SHA-256. The bound PR80 closeout review must still include `providerWriteGraduatedRolloutRunLedgerSha256`.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

Safe/pass evidence requires `approval.approvalStatus=approved`. A `rejected_needs_investigation` package is valid evidence outside pass mode so release owners can archive a blocked approval without pretending it passed.

## Safety Boundary

This verifier:

- does not enable provider writes;
- does not call provider APIs;
- does not execute provider writes;
- does not read provider credentials;
- does not read production databases;
- does not open payload escrow;
- does not send customer-visible replies;
- does not automatically activate merchants;
- does not automatically open general availability.

The approval, closeout review, and run ledger packages must not include raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment data, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR81 only after PR80 has passed and the graduated rollout closeout is approved for GA review:

```bash
npm run verify:provider-write-graduated-rollout-closeout-review:safe
npm run verify:provider-write-general-availability-approval
npm run verify:provider-write-general-availability-approval:safe
```

Passing PR81 permits a human release owner to continue toward manual merchant activation planning. It still keeps `automaticActivationEnabled=false`, `manualMerchantActivationRequired=true`, `manualApprovalBeforeMerchantActivation=true`, `noAutomaticCustomerVisibleReplies=true`, and `liveExecutorKillSwitchDefaultOn=true`.
