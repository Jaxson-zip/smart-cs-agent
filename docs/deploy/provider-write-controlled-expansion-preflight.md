# PR74 Provider Write Controlled Expansion Preflight Gate

PR74 adds the controlled expansion preflight gate that must pass after PR73 controlled expansion approval and before a specific `controlled_multi_merchant` launch window may proceed.

This gate validates a sanitized `smart-cs-agent.provider-write-controlled-expansion-preflight.v1` package under `provider-write-controlled-expansion-preflight-artifacts/` and a separate `smart-cs-agent.provider-write-controlled-expansion-approval.v1` approval package under `provider-write-controlled-expansion-approval-artifacts/`. The preflight package must bind the approval file through `providerWriteControlledExpansionApprovalSha256`; the verifier recomputes the approval file SHA-256 from bytes and rejects self-declared hashes that do not match. Safe mode also requires the PR73 approval's `smart-cs-agent.provider-write-safe-ledger-assembly.v1` receipt plus its PR70 draft, PR71 manual review, and PR69 final ledger source files so PR74 can recheck the same approval-to-ledger chain before a launch window opens.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-controlled-expansion-preflight
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_FILE=provider-write-controlled-expansion-preflight-artifacts/controlled-expansion-preflight.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_FILE=provider-write-controlled-expansion-approval-artifacts/controlled-expansion-approval.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_FILE=provider-write-safe-ledger-assembly-artifacts/safe-ledger-assembly.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_DRAFT_FILE=provider-write-live-pilot-run-ledger-draft-artifacts/live-pilot-run-ledger-draft.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_REVIEW_FILE=provider-write-manual-closeout-review-artifacts/manual-closeout-review.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_APPROVAL_ASSEMBLY_LEDGER_FILE=provider-write-live-pilot-run-ledger-artifacts/live-pilot-run-ledger.json
set SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_PREFLIGHT_REQUIRE_PASS=true
npm run verify:provider-write-controlled-expansion-preflight:safe
```

The `:safe` command fails closed unless the preflight file, approval file, PR73 safe ledger assembly receipt, PR70 draft, PR71 manual closeout review, and PR69 final ledger source files are supplied.

## Evidence Shape

The preflight evidence must include:

- `target`: rollout fingerprint, `rolloutTrack=controlled_multi_merchant`, and the same safe change ticket approved by PR73.
- `expansionScope`: merchant fingerprints, channels, allowed first-pilot actions, aggregate and per-merchant daily write limits, coupon cap, and `businessHoursOnly=true`. The scope must stay inside the approved PR73 merchant, channel, action, and limit bounds.
- `launchWindow`: start and end timestamps, `durationMinutes` from 30 to 240, `freezeWindowActive=true`, and `businessHoursOnly=true`.
- `prerequisiteEvidence`: `providerWriteControlledExpansionApprovalVerifierPassed=true`, `providerWriteControlledExpansionApprovalSha256`, production launch verifier, production static CI, branch protection, alerting, canary, kill-switch control plane, live executor control plane, payload escrow boundary, and execution-attempt visibility proof.
- `rolloutPlan`: bounded wave count, bounded merchants per wave, hold time, `automaticNextWaveEnabled=false`, `rollbackOnAnyFailedMutation=true`, and `stopOnCustomerComplaint=true`.
- `operationalControls`: operator coverage, named operations lead, incident owner, rollback owner, kill switch owner, billing owner, merchant notification readiness, support escalation readiness, rollback playbook, alert route review, rate-limit review, and `noAutomaticCustomerVisibleReplies=true`.
- `safety`: all false for secrets, raw tenant IDs, raw merchant IDs, customer data, provider payloads, provider responses, raw idempotency keys, verifier-side network execution, verifier-side provider writes, payload escrow opening, credential reads, and customer-visible actions.

The PR73 approval evidence must also include `providerWriteSafeLedgerAssemblyVerifierPassed=true`, `providerWriteSafeLedgerAssemblySha256`, production launch/static CI/branch protection/alerting/canary proof, operator coverage, rollback controls, commercial readiness, and no automatic customer-visible replies. PR74 recomputes the PR73 assembly receipt SHA-256 and the PR70/PR71/PR69 source artifact SHA-256 values before accepting those bindings.

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

The preflight and approval files must not contain raw tenant IDs, merchant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, credential refs, tokens, operator API keys, webhook secrets, signatures, raw request bodies, payment tokens, invoice numbers, or raw idempotency keys.

## Launch Placement

Run PR74 after PR73 approval has passed:

```bash
npm run verify:provider-write-controlled-expansion-approval:safe
npm run verify:provider-write-controlled-expansion-preflight
npm run verify:provider-write-controlled-expansion-preflight:safe
```

Passing PR74 does not enable automatic next waves. It proves only that the current controlled expansion window is bounded, staffed, observable, rollback-ready, and still inside the approved PR73 scope.
