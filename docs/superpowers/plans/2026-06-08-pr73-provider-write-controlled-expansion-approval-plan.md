# PR73 Provider Write Controlled Expansion Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-network approval gate that must pass before provider write capability expands from one `single_merchant_pilot` to a small `controlled_multi_merchant` rollout.

**Architecture:** Add one sanitized evidence verifier and tests. The verifier reads only local JSON from `provider-write-controlled-expansion-approval-artifacts/`, validates bounded multi-merchant scope, binds the PR72 safe ledger assembly artifact hash, checks operator coverage, rollback, alerting, limits, billing/contract readiness, and rejects secrets, raw identifiers, provider payloads, provider responses, database access, provider network calls, and customer-visible actions.

**Tech Stack:** Node.js ESM verifier scripts, `node:test`, npm scripts, existing production static CI and launch verifier wiring.

---

### Task 1: Controlled Expansion Approval Tests

**Files:**
- Create: `scripts/verify-provider-write-controlled-expansion-approval.test.mjs`

- [ ] **Step 1: Write failing tests for safe missing evidence and static pass.**

Run:

```bash
node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs
```

Expected: FAIL because `scripts/verify-provider-write-controlled-expansion-approval.mjs` does not exist.

- [ ] **Step 2: Add fixture-backed tests for a valid sanitized expansion approval.**

The valid fixture must use `schemaVersion=smart-cs-agent.provider-write-controlled-expansion-approval.v1`, `fromRolloutTrack=single_merchant_pilot`, `toRolloutTrack=controlled_multi_merchant`, 2-10 merchant fingerprints, allowed actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`, all required approval and safety booleans, and `providerWriteSafeLedgerAssemblySha256`.

- [ ] **Step 3: Add rejection tests.**

Cover weak rollout scope, unsupported actions, weak limits, missing PR72 assembly binding, weak operator/rollback coverage, missing commercial readiness, unsafe safety flags, sensitive fields/values, unsafe paths, and unknown argument redaction.

### Task 2: Controlled Expansion Approval Verifier

**Files:**
- Create: `scripts/verify-provider-write-controlled-expansion-approval.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Implement CLI and safe env mode.**

Supported args:
- `--approval=<path>`
- `--from-env`
- `--require-pass`

Safe env vars:
- `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_FILE`
- `SMARTCS_PROVIDER_WRITE_CONTROLLED_EXPANSION_APPROVAL_REQUIRE_PASS=true`

- [ ] **Step 2: Enforce evidence path boundary.**

Approval artifacts must stay under `provider-write-controlled-expansion-approval-artifacts/`, with realpath/symlink checks and file-size limits.

- [ ] **Step 3: Validate evidence invariants.**

Check schema version, approval status, rollout transition, merchant/channel scope, change ticket, PR72 artifact binding, operator coverage, rollback ownership, daily limits, billing/contract/SLA readiness, no automatic customer-visible replies, and all safety flags false.

- [ ] **Step 4: Add static no-network/source checks.**

The verifier must not import or call provider adapters, Prisma, credential resolvers, `fetch`, `node:http`, `node:https`, payload escrow open/decrypt helpers, provider write execution helpers, or customer reply senders.

### Task 3: Repository Wiring

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/production-static-gates.yml`
- Modify: `scripts/verify-production-static-ci.mjs`
- Modify: `scripts/verify-production-launch.mjs`

- [ ] **Step 1: Add npm scripts.**

Add:
- `verify:provider-write-controlled-expansion-approval`
- `verify:provider-write-controlled-expansion-approval:safe`

- [ ] **Step 2: Wire static CI tests and provider safety gate.**

Add:
- `node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs`
- `npm run verify:provider-write-controlled-expansion-approval`

- [ ] **Step 3: Wire production launch verifier and ordering.**

Launch preflight must require PR73 after PR72:

```bash
npm run verify:provider-write-safe-ledger-assembly:safe
npm run verify:provider-write-controlled-expansion-approval
npm run verify:provider-write-controlled-expansion-approval:safe
```

### Task 4: Documentation And Tracking

**Files:**
- Create: `docs/deploy/provider-write-controlled-expansion-approval.md`
- Modify: `docs/deploy/provider-write-requests.md`
- Modify: `docs/deploy/production-readiness.md`
- Modify: `docs/deploy/production-launch-runbook.md`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: Document PR73 boundary and evidence shape.**

State that PR73 does not enable provider writes, does not call providers, does not read credentials, does not read production DBs, does not open payload escrow, and does not send customer-visible replies.

- [ ] **Step 2: Update readiness, launch runbook, provider-write docs, and tracking files with PR73 commands and env vars.**

### Task 5: Verification

**Files:** no new source edits unless failures expose gaps.

- [ ] **Step 1: Run targeted verifier tests and command.**

Run:
- `node --test scripts/verify-provider-write-controlled-expansion-approval.test.mjs`
- `npm.cmd run verify:provider-write-controlled-expansion-approval`

- [ ] **Step 2: Run integration verifiers.**

Run:
- `npm.cmd run verify:production-static-ci`
- `npm.cmd run verify:production-launch`
- `node --test scripts\*.test.mjs`

- [ ] **Step 3: Run workspace quality gates.**

Run:
- `npm.cmd run test --workspace @smart-cs-agent/api`
- `npm.cmd run test --workspace @smart-cs-agent/web`
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`
- `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`
- `npm.cmd run build --workspaces --if-present`
- `git diff --check`
