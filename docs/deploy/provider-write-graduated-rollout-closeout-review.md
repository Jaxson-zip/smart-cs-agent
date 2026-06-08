# PR80 Provider Write Graduated Rollout Closeout Review Gate

PR80 adds the manual closeout review gate after PR79 graduated rollout run ledger. It validates sanitized `smart-cs-agent.provider-write-graduated-rollout-closeout-review.v1` evidence under `provider-write-graduated-rollout-closeout-review-artifacts/` and binds that review back to the PR79 `smart-cs-agent.provider-write-graduated-rollout-run-ledger.v1` artifact under `provider-write-graduated-rollout-run-ledger-artifacts/`.

This gate is the last human review before a later general availability decision. Passing PR80 only proves the completed `graduated_multi_merchant` window has been reviewed by named owners, all failed mutations and rollback evidence have been checked, complaints and rejected-compensation cases stopped rollout, merchant notifications and support SLA were reviewed, billing impact was reviewed, and the evidence is ready for a separate general availability approval review.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-graduated-rollout-closeout-review
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_FILE=provider-write-graduated-rollout-closeout-review-artifacts/graduated-rollout-closeout-review.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_RUN_LEDGER_FILE=provider-write-graduated-rollout-run-ledger-artifacts/graduated-rollout-run-ledger.json
set SMARTCS_PROVIDER_WRITE_GRADUATED_ROLLOUT_CLOSEOUT_REVIEW_REQUIRE_PASS=true
npm run verify:provider-write-graduated-rollout-closeout-review:safe
```

The `:safe` command fails closed unless the closeout review and PR79 run ledger files are both supplied. The verifier recomputes the run ledger SHA-256 and requires `providerWriteGraduatedRolloutRunLedgerSha256` to match the bytes on disk.

## Evidence Shape

The closeout review evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=graduated_multi_merchant`, and the same safe change ticket as the PR79 run ledger.
- `expansionScope`: merchant fingerprints, channels, allowed actions, aggregate and per-merchant limits, coupon cap, and `businessHoursOnly=true`, matching the PR79 run ledger.
- `launchWindow`: start, end, closed timestamp, duration, freeze-window proof, and `businessHoursOnly=true`, matching the PR79 run ledger.
- `runSummary`: counts for total, succeeded, failed, rolled-back, blocked, failed provider mutations, complaints, rejected compensation, `allRunsReviewed=true`, `failedRunsHaveIncidentNotes=true`, `rollbackActionsVerified=true`, `customerComplaintsStoppedRollout=true`, `compensationRejectionsStoppedRollout=true`, `merchantNotificationCompleted=true`, `billingImpactReviewed=true`, `supportSlaMaintained=true`, and `noAutoCustomerReplies=true`.
- `reviewers`: distinct release owner, operations reviewer, support reviewer, rollback owner, review timestamp, and `secondReviewCompleted=true`.
- `closeout`: decision set to `approved_for_general_availability_review` or `rejected_needs_investigation`, customer impact review, provider mutation review, complaint review, compensation rejection review, incident review, rollback review, billing impact review, merchant notification review, support SLA review, evidence package review, and no outstanding actions. Safe/pass evidence requires `approved_for_general_availability_review`; rejected reviews are valid evidence packages but do not authorize the next approval stage.
- `evidence`: `graduatedRolloutRunLedgerVerifierPassed=true`, production launch/static CI/alerting/canary proof, audit export review, support escalation review, and merchant notification review.
- `artifactBindings`: `providerWriteGraduatedRolloutRunLedgerSha256`, audit export SHA-256, production launch SHA-256, and production static CI SHA-256.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

## Safety Boundary

This verifier:

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

The review and run ledger packages must not include raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR80 after PR79 has passed and the graduated rollout window has been manually reviewed:

```bash
npm run verify:provider-write-graduated-rollout-run-ledger:safe
npm run verify:provider-write-graduated-rollout-closeout-review
npm run verify:provider-write-graduated-rollout-closeout-review:safe
```

Passing PR80 does not open general availability by itself. It only proves the graduated rollout closeout is clean enough for a separate general availability approval gate.
