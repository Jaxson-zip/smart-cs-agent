# PR69 Provider Write Live Pilot Run Ledger Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sanitized no-network closeout evidence gate for the first real provider write pilot.

**Architecture:** PR69 validates `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` evidence under `provider-write-live-pilot-run-ledger-artifacts/`, then wires the gate into package scripts, static CI, production launch, provider write docs, readiness docs, project tracking, and progress notes. The verifier reads local files only and never calls provider APIs, app APIs, databases, vaults, payload escrow, or customer-visible channels.

**Tech Stack:** Node verifier scripts, Node test runner, Markdown deploy docs, GitHub Actions static workflow, package scripts.

---

## File Structure

- Create `scripts/verify-provider-write-live-pilot-run-ledger.mjs`: static and optional safe evidence verifier.
- Create `scripts/verify-provider-write-live-pilot-run-ledger.test.mjs`: pass/negative fixture tests.
- Create `docs/deploy/provider-write-live-pilot-run-ledger.md`: evidence schema and launch workflow.
- Create `docs/superpowers/specs/2026-06-08-pr69-provider-write-live-pilot-run-ledger-design.md`: compact design record.
- Modify `.gitignore`: ignore `provider-write-live-pilot-run-ledger-artifacts/`.
- Modify `package.json`: add `verify:provider-write-live-pilot-run-ledger` and `verify:provider-write-live-pilot-run-ledger:safe`.
- Modify `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs`: wire PR69 into static and launch gates.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, `docs/deploy/production-launch-runbook.md`, `task_plan.md`, and `progress.md`: document PR69.

## Task 1: Verifier And Evidence Shape

- [x] **Step 1: Write failing verifier tests**

Add tests that prove the verifier:

- passes static checks without evidence;
- accepts sanitized safe evidence from env;
- fails closed when safe mode lacks evidence;
- rejects broad rollout, high-risk actions, and refunds;
- rejects inconsistent summary totals, empty pass ledgers, out-of-window runs, and weak closeout controls;
- rejects unsafe run records, missing incident notes, missing rollback proof, provider payload storage, provider response storage, and automatic customer-visible replies;
- rejects missing or placeholder artifact hashes;
- rejects sensitive fields and values without echoing them;
- rejects evidence paths outside `provider-write-live-pilot-run-ledger-artifacts/`;
- redacts unknown argument values.

- [x] **Step 2: Implement verifier**

Implement `scripts/verify-provider-write-live-pilot-run-ledger.mjs` with:

- safe path handling under `provider-write-live-pilot-run-ledger-artifacts/`;
- schema version `smart-cs-agent.provider-write-live-pilot-run-ledger.v1`;
- target, launch window, summary, run records, at-least-one-run safe mode, run timestamps inside the pilot window, failed-provider-mutation rollback proof, evidence, artifact bindings, and safety validation;
- static wiring checks for docs, package scripts, static CI, production launch, task plan, and progress notes;
- no provider API calls, no database reads, no credential reads, no payload escrow opening, no customer-visible replies, and no provider mutation by the verifier.

## Task 2: Production Gate Wiring

- [x] **Step 1: Wire scripts and CI**

Add package scripts:

```json
"verify:provider-write-live-pilot-run-ledger": "node scripts/verify-provider-write-live-pilot-run-ledger.mjs",
"verify:provider-write-live-pilot-run-ledger:safe": "node scripts/verify-provider-write-live-pilot-run-ledger.mjs --from-env --require-pass"
```

Add the test and verifier command to `.github/workflows/production-static-gates.yml` and `scripts/verify-production-static-ci.mjs`.

- [x] **Step 2: Wire launch**

Update `scripts/verify-production-launch.mjs` so launch docs, package scripts, static workflow, verifier source, provider write docs, production readiness docs, task tracking, and unsafe-example scans all reference PR69.

## Task 3: Documentation And Tracking

- [x] **Step 1: Add deploy docs**

Create `docs/deploy/provider-write-live-pilot-run-ledger.md` and update provider write, readiness, and launch docs. The docs must state that PR69:

- does not call provider APIs;
- does not execute provider writes;
- does not read credentials;
- does not open/decrypt payload escrow;
- does not store raw provider/customer payloads;
- does not expose raw idempotency keys;
- does not send customer-visible replies.

- [x] **Step 2: Update project tracking**

Update `task_plan.md` and `progress.md` with PR69 scope, out-of-scope items, verification inventory, and final notes after commands pass.

## Task 4: Verification And Commit

- [x] **Step 1: Run focused verification**

Run:

```bash
node --check scripts/verify-provider-write-live-pilot-run-ledger.mjs
node --check scripts/verify-provider-write-live-pilot-run-ledger.test.mjs
node --test scripts/verify-provider-write-live-pilot-run-ledger.test.mjs
npm.cmd run verify:provider-write-live-pilot-run-ledger
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

- [ ] **Step 3: Commit locally**

Run:

```bash
git add .
git commit -m "feat(pr69): add provider write live pilot run ledger gate"
```

Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers verifier/test creation, safe artifact path handling, sensitive-data rejection, production launch/static wiring, docs, project tracking, verification, and local commit.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `verify:provider-write-live-pilot-run-ledger`, `provider-write-live-pilot-run-ledger-artifacts/`, and `smart-cs-agent.provider-write-live-pilot-run-ledger.v1`.
