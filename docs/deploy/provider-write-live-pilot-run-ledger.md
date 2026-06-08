# PR69 Provider Write Live Pilot Run Ledger Gate

PR69 adds a sanitized post-window evidence gate for the first real provider write pilot. It validates `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` packages exported after a pilot window so release owners can close the loop on what happened, what was reviewed, and whether failures or rollbacks were handled.

## PR71 Provider Write Manual Closeout Review Gate

PR71 adds the manual closeout review required before PR69 safe evidence can pass. The review validates `smart-cs-agent.provider-write-manual-closeout-review.v1` packages under `provider-write-manual-closeout-review-artifacts/` and records that release, operations, and rollback owners reviewed every pilot run, failed-run incident note, rollback action, audit export, and evidence binding.

Run:

```bash
npm run verify:provider-write-manual-closeout-review
npm run verify:provider-write-manual-closeout-review:safe
```

The PR69 ledger must bind the approved review artifact through `providerWriteManualCloseoutReviewSha256`, and its evidence must include `providerWriteManualCloseoutReviewVerifierPassed=true`. This manual closeout review is separate from the PR70 draft exporter: PR70 helps assemble facts, PR71 signs off that people reviewed them, and PR69 binds the approved artifacts into safe ledger evidence.

The closeout review verifier does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, and does not send customer-visible replies.

## PR70 Provider Write Live Pilot Run Ledger Draft Export

PR70 adds an admin-only draft exporter for release owners who need to assemble PR69 evidence from runtime records. It returns `schemaVersion=smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1` through `GET /v2/provider-writes/live-pilot-run-ledger/draft` and the Web BFF route `GET /api/operator/provider-writes/live-pilot-run-ledger/draft`.

Run:

```bash
npm run verify:provider-write-live-pilot-run-ledger-draft-export
```

The draft export is not PR69 pass evidence. It must always keep `draftOnly=true`, `readyForSafeLedger=false`, and `canPassPr69SafeLedger=false`. A release owner must still bind approved artifacts, real provider mutation evidence, and manual closeout review before producing a separate PR69 safe ledger package. Drafts must keep `missingSafeLedgerInputs` populated with `artifact_bindings`, `live_provider_mutation_evidence`, and `manual_closeout_review`; empty windows also include `pilot_run_records`.

The exporter reads existing sanitized `ProviderWriteExecutionAttempt` and `ProviderWriteRequest` facts for one tenant, one channel, and a bounded 15-120 minute window. It uses fingerprints rather than raw identifiers and must not include raw tenant IDs, order IDs, logistics IDs, addresses, customer messages, raw idempotency keys, provider payloads, provider responses, credential refs, tokens, operator API keys, or secrets.

The draft exporter does not call provider APIs, does not execute provider writes, does not read provider credentials, does not open payload escrow, does not decrypt payload escrow, and does not send customer-visible replies.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-live-pilot-run-ledger
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE=provider-write-live-pilot-run-ledger-artifacts/provider-write-live-pilot-run-ledger.json
set SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true
npm run verify:provider-write-live-pilot-run-ledger:safe
```

## Evidence Shape

Evidence must use `schemaVersion=smart-cs-agent.provider-write-live-pilot-run-ledger.v1` and include:

- `target`: tenant fingerprint, channel, `single_merchant_pilot`, and change ticket.
- `launchWindow`: start, end, closeout timestamp, bounded duration, and active freeze window.
- `summary`: total run count, succeeded/failed/rolled-back/blocked counts, all-runs-reviewed proof, failed-run incident proof, rollback verification proof, and no automatic customer reply proof. Safe evidence must contain at least one run record.
- `runRecords`: one sanitized record per pilot run with action, low risk, controlled status, short fingerprints, audit hash, network-execution fact, provider mutation fact, timestamps inside the declared launch window, and no stored provider payload/response. Failed runs that already mutated provider state require rollback verification before the ledger can pass.
- `evidence`: preflight verifier, provider write approval verifier, kill-switch control plane, manual closeout review, audit export, post-pilot review, and production launch verifier pass booleans.
- `artifactBindings`: SHA-256 bindings for preflight, provider write approval, kill-switch control plane, live executor startup guard, live executor control plane, manual closeout review, production launch, and audit export artifacts, including `providerWriteManualCloseoutReviewSha256`.
- `safety`: all false for secrets, raw tenant/customer/provider data, raw idempotency keys, verifier-side network execution, verifier-side provider writes, verifier-side payload escrow opening, verifier-side credential reads, and verifier-side customer-visible actions.

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
- does not send customer-visible replies;
- does not enable `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.

The run ledger package is post-pilot evidence only. It may attest that an approved runtime called a provider API during a bounded pilot window, but this verifier itself never performs that call and must not contain provider responses, provider payloads, raw order IDs, logistics IDs, addresses, customer messages, credentials, tokens, or raw idempotency keys.

## Launch Placement

Run this static gate on release branches. Run the safe gate after a live pilot window has closed and after release owners have exported sanitized audit evidence:

```bash
npm run verify:provider-write-live-pilot-preflight:safe
npm run verify:provider-write-live-pilot-run-ledger:safe
```

The closeout gate is required before expanding beyond the first `single_merchant_pilot`. It must not pass on an empty ledger; if the pilot is canceled before any run occurs, keep expansion blocked and record the cancellation in the launch ticket instead of using PR69 as pass evidence.
