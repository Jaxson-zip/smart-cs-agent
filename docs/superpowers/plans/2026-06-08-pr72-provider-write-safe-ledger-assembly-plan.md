# PR72 Provider Write Safe Ledger Assembly Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-network assembly gate that proves PR70 draft evidence, PR71 manual closeout review evidence, and PR69 safe ledger evidence belong to the same bounded provider-write pilot before expansion beyond the first merchant.

**Architecture:** Add one static/safe verifier script with tests. The verifier reads only sanitized local JSON artifacts from artifact directories, validates schema/version/safety markers, compares target/window/run-count consistency, and verifies SHA-256 bindings across the draft, review, and ledger files.

**Tech Stack:** Node.js ESM verifier scripts, `node:test`, npm scripts, existing production static CI and launch verifier wiring.

---

### Task 1: Verifier Behavior Tests

**Files:**
- Create: `scripts/verify-provider-write-safe-ledger-assembly.test.mjs`
- Test: `scripts/verify-provider-write-safe-ledger-assembly.mjs`

- [ ] **Step 1: Write failing tests for static pass, safe pass, missing evidence, hash mismatch, target/window mismatch, draft pass-shape rejection, sensitive redaction, and path restriction.**

Use fixtures for:
- `smart-cs-agent.provider-write-live-pilot-run-ledger-draft.v1`
- `smart-cs-agent.provider-write-manual-closeout-review.v1`
- `smart-cs-agent.provider-write-live-pilot-run-ledger.v1`

- [ ] **Step 2: Run the test and confirm it fails because the verifier script does not exist.**

Run: `node --test scripts/verify-provider-write-safe-ledger-assembly.test.mjs`

Expected: FAIL with module/script not found.

### Task 2: Verifier Implementation

**Files:**
- Create: `scripts/verify-provider-write-safe-ledger-assembly.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Implement CLI args and safe env mode.**

Supported args:
- `--draft=<path>`
- `--review=<path>`
- `--ledger=<path>`
- `--from-env`
- `--require-pass`

Safe env vars:
- `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_DRAFT_FILE`
- `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REVIEW_FILE`
- `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_LEDGER_FILE`
- `SMARTCS_PROVIDER_WRITE_SAFE_LEDGER_ASSEMBLY_REQUIRE_PASS=true`

- [ ] **Step 2: Enforce path boundaries.**

Draft artifacts stay under `provider-write-live-pilot-run-ledger-draft-artifacts/`.
Review artifacts stay under `provider-write-manual-closeout-review-artifacts/`.
Ledger artifacts stay under `provider-write-live-pilot-run-ledger-artifacts/`.

- [ ] **Step 3: Validate assembly invariants.**

Check:
- all three schema versions are exact;
- tenant fingerprint, channel, rollout track, launch start/end/duration/freeze are consistent;
- ledger and review change tickets match;
- draft remains `draftOnly=true`, `readyForSafeLedger=false`, `canPassPr69SafeLedger=false`;
- review decision is `approved_for_safe_ledger`;
- ledger binds review SHA through `providerWriteManualCloseoutReviewSha256`;
- review binds draft SHA through `providerWriteLivePilotRunLedgerDraftSha256`;
- review and ledger bind identical production launch and audit export SHA values;
- run counts and request/execution-attempt fingerprints are consistent;
- no safety flag, forbidden field, forbidden value, provider network, credential read, payload escrow opening, or customer-visible action is present in verifier-side evidence.

- [ ] **Step 4: Add artifact ignore entry.**

Add `provider-write-live-pilot-run-ledger-draft-artifacts/` to `.gitignore`.

### Task 3: Repository Wiring

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/production-static-gates.yml`
- Modify: `scripts/verify-production-static-ci.mjs`
- Modify: `scripts/verify-production-launch.mjs`

- [ ] **Step 1: Add npm scripts.**

Add:
- `verify:provider-write-safe-ledger-assembly`
- `verify:provider-write-safe-ledger-assembly:safe`

- [ ] **Step 2: Wire static CI tests and static provider safety gates.**

Add:
- `node --test scripts/verify-provider-write-safe-ledger-assembly.test.mjs`
- `npm run verify:provider-write-safe-ledger-assembly`

- [ ] **Step 3: Wire production launch verifier and ordering.**

Launch preflight must run:
1. PR70 draft export static verifier
2. PR71 manual closeout static and safe verifier
3. PR69 ledger static and safe verifier
4. PR72 assembly static and safe verifier

### Task 4: Documentation And Tracking

**Files:**
- Create: `docs/deploy/provider-write-safe-ledger-assembly.md`
- Modify: `docs/deploy/provider-write-live-pilot-run-ledger.md`
- Modify: `docs/deploy/provider-write-manual-closeout-review.md`
- Modify: `docs/deploy/provider-write-requests.md`
- Modify: `docs/deploy/production-readiness.md`
- Modify: `docs/deploy/production-launch-runbook.md`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: Document the PR72 gate and safety boundary.**

State clearly that it does not generate pass evidence, does not call providers, does not read credentials, does not open/decrypt payload escrow, does not read production DBs, and does not send customer-visible replies.

- [ ] **Step 2: Update readiness, launch, provider-write docs, and tracking files with the new command and evidence vars.**

### Task 5: Verification

**Files:** no new source edits unless failures expose gaps.

- [ ] **Step 1: Run targeted verifier tests and command.**

Run:
- `node --test scripts/verify-provider-write-safe-ledger-assembly.test.mjs`
- `npm run verify:provider-write-safe-ledger-assembly`

- [ ] **Step 2: Run integration verifiers.**

Run:
- `npm run verify:production-static-ci`
- `npm run verify:production-launch`
- `node --test scripts\*.test.mjs`

- [ ] **Step 3: Run workspace quality gates.**

Run:
- `npm run test --workspace @smart-cs-agent/api`
- `npm run test --workspace @smart-cs-agent/web`
- `npm run typecheck --workspaces --if-present -- --pretty false`
- `npm run lint --workspaces --if-present -- --max-warnings=0`
- `npm run build --workspaces --if-present`
- `git diff --check`
