# PR73 Provider Write Controlled Expansion Approval Gate

PR73 adds the controlled expansion approval gate that must pass after PR72 safe ledger assembly and before any provider write capability expands from `single_merchant_pilot` to `controlled_multi_merchant`.

This gate validates a sanitized `smart-cs-agent.provider-write-controlled-expansion-approval.v1` approval package, a separate `smart-cs-agent.provider-write-safe-ledger-assembly.v1` assembly receipt, and the PR72 source artifacts behind that receipt. The approval package must bind the assembly receipt through `providerWriteSafeLedgerAssemblySha256`; the verifier recomputes that SHA-256 from the assembly file bytes and rejects self-declared hashes that do not match. It also recomputes the PR70 draft, PR71 manual review, and PR69 final ledger source artifact SHA-256 values before accepting the assembly receipt bindings.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-controlled-expansion-approval
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE=provider-write-controlled-expansion-approval-artifacts/controlled-expansion-approval.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_FILE=provider-write-safe-ledger-assembly-artifacts/safe-ledger-assembly.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_DRAFT_FILE=provider-write-live-pilot-run-ledger-draft-artifacts/live-pilot-run-ledger-draft.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_REVIEW_FILE=provider-write-manual-closeout-review-artifacts/manual-closeout-review.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_ASSEMBLY_LEDGER_FILE=provider-write-live-pilot-run-ledger-artifacts/live-pilot-run-ledger.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true
npm run verify:provider-write-controlled-expansion-approval:safe
```

The `:safe` command fails closed unless the approval file, assembly receipt file, and all three local sanitized PR72 source files are supplied.

## Evidence Shape

The approval evidence must include:

- `target`: rollout fingerprint, `fromRolloutTrack=single_merchant_pilot`, `toRolloutTrack=controlled_multi_merchant`, and a safe change ticket.
- `expansionScope`: 2-10 merchant fingerprints, allowed channels, first-pilot actions only, aggregate and per-merchant daily limits, coupon cap, and `businessHoursOnly=true`.
- `approval`: `approvalStatus=approved`, requester fingerprint, approver fingerprint, second reviewer fingerprint, and approval timestamp with distinct people.
- `prerequisiteEvidence`: `providerWriteSafeLedgerAssemblyVerifierPassed=true`, `providerWriteSafeLedgerAssemblySha256`, production launch verifier, production static CI, branch protection, alerting, and canary proof.
- `operationalControls`: operator coverage, named operations lead, incident owner, rollback owner, kill switch owner, rollback playbook, alert route, rate limit review, and `noAutomaticCustomerVisibleReplies=true`.
- `commercialReadiness`: contract, billing plan, support SLA, and merchant notification plan review.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

The assembly receipt must include `providerWriteLivePilotRunLedgerDraftSha256`, `providerWriteManualCloseoutReviewSha256`, and `providerWriteLivePilotRunLedgerSha256`. Those values must match files under `provider-write-live-pilot-run-ledger-draft-artifacts/`, `provider-write-manual-closeout-review-artifacts/`, and `provider-write-live-pilot-run-ledger-artifacts/`.

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

The approval and assembly files must not contain raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR73 after PR72 safe assembly:

```bash
npm run verify:provider-write-safe-ledger-assembly:safe
npm run verify:provider-write-controlled-expansion-approval
npm run verify:provider-write-controlled-expansion-approval:safe
```

Passing PR73 does not by itself open a broad rollout. It proves that release owners have a bounded controlled expansion approval package ready for the next launch decision.
