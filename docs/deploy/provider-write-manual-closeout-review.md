# PR71 Provider Write Manual Closeout Review Gate

PR71 adds the manual closeout review gate that must run after a bounded live provider write pilot window and before any PR69 safe ledger can be accepted. It validates sanitized `smart-cs-agent.provider-write-manual-closeout-review.v1` evidence under `provider-write-manual-closeout-review-artifacts/`.

This gate exists because the PR70 draft export is support-only. A draft can help release owners assemble facts, but it cannot prove that people reviewed every run, checked failed provider mutations, verified rollback actions, and agreed that the pilot is ready for safe ledger binding.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-manual-closeout-review
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE=provider-write-manual-closeout-review-artifacts/manual-closeout-review.json
set SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true
npm run verify:provider-write-manual-closeout-review:safe
```

The `:safe` command fails closed when `SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_FILE` is missing, when `SMARTCS_PROVIDER_WRITE_MANUAL_CLOSEOUT_REVIEW_REQUIRE_PASS=true` is not satisfied, or when the review package cannot prove the controls below.

## Evidence Shape

Evidence must use `schemaVersion=smart-cs-agent.provider-write-manual-closeout-review.v1` and include:

- `target`: tenant fingerprint, channel, `single_merchant_pilot`, and safe change ticket.
- `launchWindow`: start, end, closeout timestamp, duration, and active freeze window.
- `runSummary`: total run count, succeeded/failed/rolled-back/blocked counts, failed provider mutation count, all-runs-reviewed proof, failed-run incident proof, rollback verification proof, and no automatic customer reply proof.
- `reviewers`: distinct release owner, operations reviewer, rollback owner fingerprints, review timestamp, and second-review proof.
- `closeout`: `approved_for_safe_ledger`, customer impact review, provider mutation review, incident review, rollback review, evidence package review, and no outstanding actions.
- `evidence`: ledger draft export review, audit export review, provider write live pilot run ledger readiness, and production launch verifier proof.
- `artifactBindings`: SHA-256 bindings for ledger draft export, audit export, and production launch artifacts.
- `safety`: all false for secret exposure, raw tenant/customer/provider data, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

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

The review package must not include raw tenant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, or raw idempotency keys.

## Launch Placement

Run the static gate on release branches. Run the safe gate after:

1. The pilot launch window is closed.
2. The PR70 draft has been reviewed by a release owner.
3. Sanitized audit evidence has been exported.
4. Failed or rolled-back runs have incident notes and rollback verification.
5. A second reviewer has completed the review.

The SHA-256 of the approved manual closeout review artifact becomes `providerWriteManualCloseoutReviewSha256` in the PR69 safe ledger package. If the review is rejected, has outstanding actions, contains customer/provider raw data, or cannot prove no automatic customer-visible replies, expansion beyond the first `single_merchant_pilot` stays blocked.
