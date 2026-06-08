# PR72 Provider Write Safe Ledger Assembly Gate

PR72 adds the final no-network assembly gate for a bounded provider write pilot. It validates that the PR70 `smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1` draft export, PR71 `smart-cs-agent.provider-write-manual-closeout-review.v1` manual closeout review, and PR69 `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` final safe ledger are the same evidence package before any expansion beyond the first `single_merchant_pilot`.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-safe-ledger-assembly
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE=provider-write-live-pilot-run-ledger-draft-artifacts/live-pilot-run-ledger-draft.json
set SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE=provider-write-manual-closeout-review-artifacts/manual-closeout-review.json
set SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE=provider-write-live-pilot-run-ledger-artifacts/live-pilot-run-ledger.json
set SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true
npm run verify:provider-write-safe-ledger-assembly:safe
```

The `:safe` command fails closed unless all three sanitized JSON files are supplied from their artifact directories.

## Evidence Binding

The assembly gate recomputes SHA-256 from local file bytes rather than trusting declared hash fields:

- PR71 `artifactBindings.providerWriteLivePilotRunLedgerDraftSha256` must match the PR70 draft file.
- PR69 `artifactBindings.providerWriteManualCloseoutReviewSha256` must match the PR71 review file.
- PR71 and PR69 must bind identical `auditExportSha256` and `productionLaunchSha256`.
- PR70 `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false` must remain true.
- PR71 `closeout.decision` must be `approved_for_safe_ledger` with no outstanding actions.
- PR69 evidence must include `providerWriteManualCloseoutReviewVerifierPassed=true`.

The gate compares tenant fingerprint, channel, rollout track, launch window, run counts, and stable `(requestFingerprint, executionAttemptFingerprint)` pairs across the three artifacts. PR70 only carries `target.changeTicketFingerprint`; PR72 recomputes that fingerprint from the PR69/PR71 `changeTicket` and rejects null or mismatched values.

## Safety Boundary

This verifier:

- does not generate PR69 pass evidence;
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

The three evidence files must not contain raw tenant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, or raw idempotency keys.

## Launch Placement

Run PR72 after the closeout package has been approved and the final PR69 ledger has been assembled:

```bash
npm run verify:provider-write-live-pilot-run-ledger-draft-export
npm run verify:provider-write-manual-closeout-review
npm run verify:provider-write-manual-closeout-review:safe
npm run verify:provider-write-live-pilot-run-ledger
npm run verify:provider-write-live-pilot-run-ledger:safe
npm run verify:provider-write-safe-ledger-assembly
npm run verify:provider-write-safe-ledger-assembly:safe
```

PR72 is an assembly gate only. It does not permit broader rollout by itself; it proves that the draft, human review, and final ledger are internally consistent enough for release owners to consider the next launch decision.
