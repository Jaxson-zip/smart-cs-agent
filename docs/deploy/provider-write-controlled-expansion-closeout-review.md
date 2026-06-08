# PR76 Provider Write Controlled Expansion Closeout Review Gate

PR76 adds the manual closeout review gate after PR75 controlled expansion run ledger. It validates sanitized `smart-cs-agent.provider-write-controlled-expansion-closeout-review.v1` evidence under `provider-write-controlled-expansion-closeout-review-artifacts/` and binds that review back to the PR75 `smart-cs-agent.provider-write-controlled-expansion-run-ledger.v1` artifact under `provider-write-controlled-expansion-run-ledger-artifacts/`.

This gate is deliberately narrower than a broad rollout approval. Passing PR76 only proves the completed `controlled_multi_merchant` window has been reviewed by named owners, all incidents and rollback evidence have been checked, complaints and rejected-compensation cases have been closed out, and the evidence is ready for the next expansion approval review.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-controlled-expansion-closeout-review
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_CLOSEOUT_REVIEW_FILE=provider-write-controlled-expansion-closeout-review-artifacts/controlled-expansion-closeout-review.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_CLOSEOUT_REVIEW_RUN_LEDGER_FILE=provider-write-controlled-expansion-run-ledger-artifacts/controlled-expansion-run-ledger.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_CLOSEOUT_REVIEW_REQUIRE_PASS=true
npm run verify:provider-write-controlled-expansion-closeout-review:safe
```

The `:safe` command fails closed unless the closeout review and PR75 run ledger files are both supplied. The verifier recomputes the run ledger SHA-256 and requires `providerWriteControlledExpansionRunLedgerSha256` to match the bytes on disk.

## Evidence Shape

The closeout review evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=controlled_multi_merchant`, and the same safe change ticket as the PR75 run ledger.
- `expansionScope`: merchant fingerprints, channels, allowed actions, aggregate and per-merchant limits, coupon cap, and `businessHoursOnly=true`, matching the PR75 run ledger.
- `launchWindow`: start/end/closed timestamps, duration, freeze-window proof, and `businessHoursOnly=true`, matching the PR75 run ledger.
- `runSummary`: counts for total/succeeded/failed/rolled-back/blocked runs, failed provider mutations, complaints, rejected compensation, `allRunsReviewed=true`, `failedRunsHaveIncidentNotes=true`, `rollbackActionsVerified=true`, `customerComplaintsStoppedRollout=true`, `rejectedCompensationReviewed=true`, and `noAutoCustomerReplies=true`.
- `reviewers`: distinct release owner, operations reviewer, support reviewer, rollback owner, review timestamp, and `secondReviewCompleted=true`.
- `closeout`: `approved_for_next_expansion_review`, customer impact review, provider mutation review, complaint review, compensation rejection review, incident review, rollback review, billing impact review, evidence package review, and no outstanding actions.
- `evidence`: controlled expansion run ledger verifier proof, production launch/static CI/alerting/canary proof, audit export review, support escalation review, and merchant notification review.
- `artifactBindings`: `providerWriteControlledExpansionRunLedgerSha256`, audit export SHA-256, production launch SHA-256, and production static CI SHA-256.
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

Run PR76 after PR75 has passed and the controlled expansion window has been reviewed:

```bash
npm run verify:provider-write-controlled-expansion-run-ledger:safe
npm run verify:provider-write-controlled-expansion-closeout-review
npm run verify:provider-write-controlled-expansion-closeout-review:safe
```

Passing PR76 does not approve the next wave by itself. It only proves the post-window closeout is clean enough for a separate next-expansion approval gate.

PR77 Provider Write Graduated Rollout Approval Gate follows this review. It uses `verify:provider-write-graduated-rollout-approval` to bind `providerWriteControlledExpansionCloseoutReviewSha256` to this PR76 package before any `graduated_multi_merchant` approval can be considered.
