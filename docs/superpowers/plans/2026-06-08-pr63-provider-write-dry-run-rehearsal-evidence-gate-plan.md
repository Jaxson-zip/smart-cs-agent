# PR63 Provider Write Dry-Run Rehearsal Evidence Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sanitized provider write dry-run rehearsal evidence gate that proves the request, human review, and no-network execution-attempt chain can be rehearsed without real provider writes.

**Architecture:** PR63 is an evidence verifier, not a live executor. It validates an optional local JSON artifact under `provider-write-dry-run-rehearsal-artifacts/`, checks only fingerprints and booleans, and connects the gate to static CI, production launch, provider write docs, production readiness, and the PR57 approval package.

**Tech Stack:** Node verifier scripts, Node test runner, Markdown deployment docs, GitHub Actions static workflow, npm scripts.

---

## File Structure

- Create `scripts/verify-provider-write-dry-run-rehearsal.mjs`: static and optional evidence verifier for `smart-cs-agent.provider-write-dry-run-rehearsal.v1`.
- Create `scripts/verify-provider-write-dry-run-rehearsal.test.mjs`: red-green tests for static pass, safe evidence pass, missing evidence, unsafe controls, sensitive data, path boundary, and argument redaction.
- Create `docs/deploy/provider-write-dry-run-rehearsal.md`: schema, safe command, workflow placement, and no-real-write boundary.
- Modify `package.json`: add `verify:provider-write-dry-run-rehearsal` and `verify:provider-write-dry-run-rehearsal:safe`.
- Modify `.github/workflows/production-static-gates.yml`: run the PR63 verifier test and static verifier.
- Modify `scripts/verify-production-static-ci.mjs`: add exact CI commands.
- Modify `scripts/verify-production-launch.mjs`: require PR63 package/docs/verifier/static CI/runbook/readiness references.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/production-provider-write-approval.md`, `docs/deploy/production-readiness.md`, and `docs/deploy/production-launch-runbook.md`: document the rehearsal evidence and safe env vars.
- Modify `.gitignore`: ignore `provider-write-dry-run-rehearsal-artifacts/`.
- Modify `task_plan.md` and `progress.md`: track PR63 scope, final gate inventory, and verification notes.

## Task 1: Rehearsal Verifier Tests

- [x] **Step 1: Write failing verifier tests**

Create `scripts/verify-provider-write-dry-run-rehearsal.test.mjs` with tests that expect:

- static repository checks pass without evidence and print `rehearsal=skipped`;
- safe env mode accepts a sanitized evidence package under `provider-write-dry-run-rehearsal-artifacts/`;
- `--from-env --require-pass` fails when the evidence file is missing;
- weak evidence fails when it lacks human review, idempotency, audit, kill switch, or no-network controls;
- sensitive fields or values fail without echoing the secret markers;
- paths outside the artifact directory fail;
- unknown args are redacted.

- [x] **Step 2: Run red test**

Run:

```bash
node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs
```

Expected: fail because `scripts/verify-provider-write-dry-run-rehearsal.mjs` does not exist.

## Task 2: Rehearsal Verifier Implementation

- [x] **Step 1: Implement verifier**

Create `scripts/verify-provider-write-dry-run-rehearsal.mjs` with:

- artifact root `provider-write-dry-run-rehearsal-artifacts/`;
- args `--rehearsal=<path>`, `--from-env`, and `--require-pass`;
- env vars `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE` and `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS`;
- safe local path handling that rejects URLs, embedded credentials, UNC paths, and files outside the artifact root;
- schema `smart-cs-agent.provider-write-dry-run-rehearsal.v1`;
- allowed channels `taobao` / `douyin`;
- allowed actions `modify_address`, `issue_coupon`, `urge_logistics`;
- execution statuses `blocked` / `dry_run_recorded`;
- hard requirements for `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, and no credential reads/provider calls/customer sends;
- forbidden field names and values for raw tenant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads/responses, tokens, operator API keys, credential refs, webhook secrets, and secret-manager refs.

- [x] **Step 2: Run green verifier tests**

Run:

```bash
node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs
```

Expected: pass.

## Task 3: Static Wiring And Docs

- [x] **Step 1: Wire scripts and CI**

Update `package.json`, `.github/workflows/production-static-gates.yml`, and `scripts/verify-production-static-ci.mjs` so static CI runs:

```bash
node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs
npm run verify:provider-write-dry-run-rehearsal
```

- [x] **Step 2: Wire launch verifier and docs**

Update production launch verifier and docs so `npm run verify:production-launch` requires:

- `docs/deploy/provider-write-dry-run-rehearsal.md`;
- `verify:provider-write-dry-run-rehearsal`;
- `verify:provider-write-dry-run-rehearsal:safe`;
- `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE`;
- `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true`;
- explicit no-network/no-provider-write/no-customer-visible boundary text.

- [x] **Step 3: Run green static gates**

Run:

```bash
npm run verify:provider-write-dry-run-rehearsal
npm run verify:production-static-ci
npm run verify:production-launch
```

Expected: all pass.

## Task 4: Final Verification And Commit

- [x] **Step 1: Run focused and aggregate verification**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
node --test scripts/verify-provider-write-dry-run-rehearsal.test.mjs
npm.cmd run verify:provider-write-dry-run-rehearsal
npm.cmd run verify:provider-write-payload-escrow-boundary
npm.cmd run verify:production-provider-write-approval
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
npm.cmd run typecheck --workspaces --if-present -- --pretty false
npm.cmd run lint --workspaces --if-present -- --max-warnings=0
npm.cmd run build --workspaces --if-present
node --test scripts\*.test.mjs
git diff --check
```

Expected: all commands exit 0. `git diff --check` may print existing CRLF warnings only if the command exits 0.

- [ ] **Step 2: Commit locally**

Run:

```bash
git add .
git commit -m "feat(pr63): add provider write dry-run rehearsal gate"
```

Expected: local commit only. Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers the PR63 evidence schema, safe env mode, no-real-write boundary, static CI, launch verifier, docs, task tracking, and final verification.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `provider-write-dry-run-rehearsal`, `smart-cs-agent.provider-write-dry-run-rehearsal.v1`, `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE`, and `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS`.
