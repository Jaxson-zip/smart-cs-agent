# PR67 Provider Write Kill Switch Rehearsal Evidence Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sanitized provider write kill-switch rehearsal evidence gate that must pass before a future real provider write pilot approval can be accepted.

**Architecture:** PR67 is a no-network evidence verifier. It validates `smart-cs-agent.provider-write-kill-switch-rehearsal.v1` JSON files under `provider-write-kill-switch-rehearsal-artifacts/`, connects the safe command to production approval and launch gates, and documents the exact safety boundary. It does not call API routes, provider APIs, databases, vaults, or customer-visible channels.

**Tech Stack:** Node verifier scripts, Node test runner, Markdown deploy docs, GitHub Actions static workflow, package scripts.

---

## File Structure

- Create `scripts/verify-provider-write-kill-switch-rehearsal.mjs`: static verifier plus optional safe evidence verifier.
- Create `scripts/verify-provider-write-kill-switch-rehearsal.test.mjs`: positive and negative fixture tests for the verifier.
- Create `docs/deploy/provider-write-kill-switch-rehearsal.md`: evidence schema, commands, security boundary, and workflow placement.
- Modify `.gitignore`: ignore `provider-write-kill-switch-rehearsal-artifacts/`.
- Modify `package.json`: add `verify:provider-write-kill-switch-rehearsal` and `verify:provider-write-kill-switch-rehearsal:safe`.
- Modify `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs`: wire PR67 into static and launch gates.
- Modify `scripts/verify-production-provider-write-approval.mjs` and `docs/deploy/production-provider-write-approval.md`: require the new kill-switch rehearsal evidence before provider write approval.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, `docs/deploy/production-launch-runbook.md`, `task_plan.md`, and `progress.md`: document PR67.

## Task 1: Verifier And Evidence Shape

- [x] **Step 1: Write failing verifier tests**

Add tests that prove the verifier:

- passes static checks without an evidence file;
- accepts a sanitized `smart-cs-agent.provider-write-kill-switch-rehearsal.v1` file;
- fails closed when `--require-pass` has no file;
- rejects missing engage/release proof, weak execution blocking, unsafe release state, and missing audit/idempotency evidence;
- rejects sensitive fields and values without echoing them;
- rejects evidence paths outside `provider-write-kill-switch-rehearsal-artifacts/`;
- redacts unknown argument values.

- [x] **Step 2: Implement verifier**

Implement `scripts/verify-provider-write-kill-switch-rehearsal.mjs` with:

- safe path handling under `provider-write-kill-switch-rehearsal-artifacts/`;
- schema version `smart-cs-agent.provider-write-kill-switch-rehearsal.v1`;
- target fingerprint/channel/change-ticket validation;
- rehearsal fields for `engage`, `executionBlock`, and `release`;
- controls proving admin-only route use, two-person observation, audit trail, idempotency, no credentials, no provider network calls, no payload escrow opening, no customer-visible replies, and no provider mutations;
- artifact hash bindings for PR66, PR60, PR57, and production launch;
- safety booleans all false for secrets/raw/customer/provider/network/write effects.

## Task 2: Production Gate Wiring

- [x] **Step 1: Wire scripts and CI**

Add package scripts:

```json
"verify:provider-write-kill-switch-rehearsal": "node scripts/verify-provider-write-kill-switch-rehearsal.mjs",
"verify:provider-write-kill-switch-rehearsal:safe": "node scripts/verify-provider-write-kill-switch-rehearsal.mjs --from-env --require-pass"
```

Add the test and verifier command to `.github/workflows/production-static-gates.yml` and `scripts/verify-production-static-ci.mjs`.

- [x] **Step 2: Wire launch and provider approval**

Update `scripts/verify-production-launch.mjs` so launch docs, package scripts, static workflow, and verifier source all reference PR67. Enforce the safe-mode order:

```text
npm run verify:provider-write-dry-run-rehearsal:safe
npm run verify:provider-write-kill-switch-rehearsal:safe
npm run verify:production-provider-write-approval:safe
```

Update `scripts/verify-production-provider-write-approval.mjs` so static approval docs/tests mention the kill-switch rehearsal verifier and `providerWriteKillSwitchSha256` binding.

## Task 3: Documentation And Tracking

- [x] **Step 1: Add deploy docs**

Create `docs/deploy/provider-write-kill-switch-rehearsal.md` and update provider write, readiness, launch, and approval docs. The docs must state that PR67:

- does not call provider APIs;
- does not execute provider writes;
- does not read credentials;
- does not open/decrypt payload escrow;
- does not store raw provider/customer payloads;
- does not expose raw idempotency keys;
- does not send customer-visible replies.

- [x] **Step 2: Update project tracking**

Update `task_plan.md` and `progress.md` with PR67 scope, out-of-scope items, verification inventory, and final notes after commands pass.

## Task 4: Verification And Commit

- [x] **Step 1: Run focused verification**

Run:

```bash
node --check scripts/verify-provider-write-kill-switch-rehearsal.mjs
node --check scripts/verify-provider-write-kill-switch-rehearsal.test.mjs
node --test scripts/verify-provider-write-kill-switch-rehearsal.test.mjs
npm.cmd run verify:provider-write-kill-switch-rehearsal
npm.cmd run verify:production-provider-write-approval
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
```

- [x] **Step 2: Run aggregate verification**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
npm.cmd run typecheck --workspaces --if-present -- --pretty false
npm.cmd run lint --workspaces --if-present -- --max-warnings=0
npm.cmd run build --workspaces --if-present
node --test scripts\*.test.mjs
git diff --check
```

- [x] **Step 3: Commit locally**

Run:

```bash
git add .
git commit -m "feat(pr67): add provider write kill switch rehearsal gate"
```

Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers verifier/test creation, safe artifact path handling, sensitive-data rejection, production approval/launch/static wiring, docs, project tracking, verification, and local commit.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `verify:provider-write-kill-switch-rehearsal`, `provider-write-kill-switch-rehearsal-artifacts/`, and `smart-cs-agent.provider-write-kill-switch-rehearsal.v1`.
