# PR64 Provider Write Live Executor Startup Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed production startup guard for any future live provider write executor without enabling real provider writes.

**Architecture:** PR64 is configuration and verification only. `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED` defaults to `false`; when production sets it to `true`, startup requires evidence hashes, sealed metadata mode, review allowlists, credential refs, and a still-enabled execution kill switch. No code path may call Taobao/Douyin write APIs, read credential material, open payload escrow, or send customer-visible messages.

**Tech Stack:** NestJS API config loader, Node verifier scripts, Node test runner, Markdown deployment docs, GitHub Actions static workflow, npm scripts.

---

## File Structure

- Modify `apps/api/src/config/api-config.ts`: parse live executor guard env vars, expose safe config fields, and fail closed in production when the live executor flag lacks required gates.
- Modify `apps/api/src/config/api-config.spec.ts`: add red-green coverage for defaults, invalid hashes, production guard rejection, and guarded production acceptance.
- Modify `.env.example`: document disabled defaults and empty evidence hashes.
- Create `scripts/verify-provider-write-live-executor-startup-guard.mjs`: static verifier for PR64 config/docs/CI wiring and no-real-write boundary.
- Create `scripts/verify-provider-write-live-executor-startup-guard.test.mjs`: negative fixture tests for missing config, missing CI wiring, and unsafe live execution code.
- Modify `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs`: wire the new verifier into static and launch gates.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, and `docs/deploy/production-launch-runbook.md`: document the startup guard and no-network boundary.
- Modify `task_plan.md` and `progress.md`: track PR64 scope and verification notes.

## Task 1: Config Guard Tests

- [x] **Step 1: Write failing config tests**

Add tests to `apps/api/src/config/api-config.spec.ts` that assert:

```ts
assert.strictEqual(loadApiConfig(baseEnv()).providerWriteLiveExecutorEnabled, false);
assert.strictEqual(providerWriteLiveExecutorEnabled({}), false);
assert.throws(() => loadApiConfig({ ...baseEnv(), PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256: "0".repeat(64) }), /PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256/);
assert.throws(() => loadApiConfig({ ...productionBaseEnv(), PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: "true" }), /PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED/);
assert.strictEqual(loadApiConfig(guardedProductionLiveExecutorEnv()).providerWriteLiveExecutorEnabled, true);
```

- [x] **Step 2: Run red config tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
```

Expected: fail because `providerWriteLiveExecutorEnabled` and the live executor config fields do not exist.

## Task 2: Config Guard Implementation

- [x] **Step 1: Implement config parsing and production guard**

Update `apps/api/src/config/api-config.ts`:

- add `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`, default `false`;
- add `PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256` and `PROVIDER_WRITE_APPROVAL_SHA256`, default empty;
- reject non-empty hashes unless they are non-placeholder lowercase SHA-256 strings;
- return `providerWriteLiveExecutorEnabled`, `providerWriteDryRunRehearsalSha256`, and `providerWriteApprovalSha256` from `loadApiConfig`;
- export `providerWriteLiveExecutorEnabled(env = process.env)`;
- if `NODE_ENV=production` and `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED=true`, require `PROVIDER_WRITE_EXECUTION_KILL_SWITCH=true`, `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE=sealed_metadata`, non-empty valid dry-run/approval hashes, at least one `PROVIDER_WRITE_REVIEW_ADAPTERS` entry, and at least one safe `PROVIDER_CREDENTIALS` credential ref.

- [x] **Step 2: Run green config tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
```

Expected: pass.

## Task 3: Static Verifier And Docs

- [x] **Step 1: Write failing verifier tests**

Create `scripts/verify-provider-write-live-executor-startup-guard.test.mjs` with tests that:

- pass on the repository;
- reject fixtures where the config env vars are removed;
- reject fixtures where static CI does not run the new verifier test;
- reject fixtures where provider write execution code contains `.changeAddress(`, `.issueCoupon(`, `.sendMessage(`, `providerMutationExecuted: true`, `customerVisibleMessageSent: true`, `decrypt`, `secret://`, or `vault://`.

- [x] **Step 2: Implement verifier and docs wiring**

Create `scripts/verify-provider-write-live-executor-startup-guard.mjs` and wire:

```bash
npm run verify:provider-write-live-executor-startup-guard
node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs
```

into `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, `scripts/verify-production-launch.mjs`, `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, `docs/deploy/production-launch-runbook.md`, `task_plan.md`, and `progress.md`.

- [x] **Step 3: Run verifier tests and static gates**

Run:

```bash
node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs
npm.cmd run verify:provider-write-live-executor-startup-guard
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
```

Expected: all pass.

## Task 4: Final Verification And Commit

- [x] **Step 1: Run focused and aggregate verification**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs
npm.cmd run verify:provider-write-live-executor-startup-guard
npm.cmd run verify:provider-write-dry-run-rehearsal
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
npm.cmd run typecheck --workspaces --if-present -- --pretty false
npm.cmd run lint --workspaces --if-present -- --max-warnings=0
npm.cmd run build --workspaces --if-present
node --test scripts\*.test.mjs
git diff --check
```

Expected: all commands exit 0. `git diff --check` may print CRLF warnings only if the command exits 0.

- [x] **Step 2: Commit locally**

Run:

```bash
git add .
git commit -m "feat(pr64): add provider write live executor startup guard"
```

Expected: local commit only. Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers startup config, production guard, evidence hashes, sealed metadata, review allowlists, credential refs, static CI, launch verifier, docs, task tracking, and final verification.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`, `PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256`, `PROVIDER_WRITE_APPROVAL_SHA256`, and `providerWriteLiveExecutorEnabled`.

## Final Verification Notes

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 198 tests.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 75 tests.
- `node --test scripts/verify-provider-write-live-executor-startup-guard.test.mjs` passed with 3 tests.
- `npm.cmd run verify:provider-write-live-executor-startup-guard`, `npm.cmd run verify:provider-write-dry-run-rehearsal`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 124 pass / 1 skipped. The skipped test is the existing Windows symlink-permission case.
- `git diff --check` passed with CRLF warnings only.
- Read-only security review and launch/static CI review found no P0/P1/P2/P3 issues.
- PR64 remains config-only/no-network: no provider API calls, no provider writes, no credential material reads, no payload escrow opening/decrypting, no raw provider/customer payload storage, and no customer-visible replies have been enabled.
