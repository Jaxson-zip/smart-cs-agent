# PR65 Provider Write Live Executor Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only provider write live executor control-plane status surface for admins without enabling real provider writes.

**Architecture:** PR65 exposes safe status only. The shared contract returns booleans, counts, safe gate names, and no-network invariants; startup config derives a sanitized snapshot, and the runtime API endpoint reads that snapshot through `ApiConfigService` instead of re-reading evidence hashes or credential refs. The API endpoint and Web BFF require admin access and reject unsafe upstream fields. Static verifiers wire the control-plane surface into production CI and launch checks while preserving the PR64 default-off startup guard.

**Tech Stack:** Zod shared contracts, NestJS API controller/service, Next.js App Router BFF, Node verifier scripts, GitHub Actions static gate, Markdown deploy docs.

---

## File Structure

- Modify `packages/shared/src/ops-contracts.ts`: add `ProviderWriteLiveExecutorMissingGateSchema`, `ProviderWriteLiveExecutorStatusSchema`, and exported types.
- Modify `apps/api/src/config/api-config.ts`: derive a sanitized `providerWriteLiveExecutorStatus` startup snapshot without returning hashes, credential refs, provider payloads, or raw values.
- Create `apps/api/src/config/api-config.service.ts`: expose the startup status snapshot to runtime services without re-reading raw env hash/ref material on the control-plane request path.
- Modify `apps/api/src/config/api-config.spec.ts`: add focused status helper tests for default disabled, partially configured blocked, guarded-ready, and no-secret output.
- Modify `apps/api/src/ops/ops.service.ts`: add `getProviderWriteLiveExecutorStatus()` that returns the shared safe startup snapshot and does not touch provider adapters or raw env hash/ref material.
- Modify `apps/api/src/ops/ops.service.spec.ts`: assert the status contract rejects unsafe fields and the service reports missing gates without leaking hashes or refs.
- Modify `apps/api/src/ops/ops.controller.ts`: add admin-only `GET /v2/provider-writes/live-executor/status`.
- Modify `apps/api/src/ops/ops.controller.spec.ts`: cover admin success, non-admin blocking, and insecure-header blocking.
- Create `apps/web/src/app/api/operator/provider-writes/live-executor/status/route.ts`: admin-only BFF route that proxies the API status and parses the shared schema.
- Modify `apps/web/src/app/api/operator/operator-bff.spec.ts`: cover admin success, non-admin blocking before fetch, and unsafe upstream response rejection.
- Create `scripts/verify-provider-write-live-executor-control-plane.mjs`: static verifier for schema/API/BFF/docs/CI wiring and no-live-write boundaries.
- Create `scripts/verify-provider-write-live-executor-control-plane.test.mjs`: negative fixture tests for missing route wiring and unsafe fields.
- Modify `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs`: wire the verifier and its tests into static gates and launch checks.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, `docs/deploy/production-launch-runbook.md`, `docs/deploy/public-api-surface.md`, `task_plan.md`, and `progress.md`: document PR65 as read-only control plane.

## Task 1: Shared Contract And Config Status

- [x] **Step 1: Write failing shared/config tests**

Add assertions to `apps/api/src/config/api-config.spec.ts` and `apps/api/src/ops/ops.service.spec.ts`:

```ts
const disabled = providerWriteLiveExecutorStatus({
  PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: "false",
});
assert.strictEqual(disabled.startupMode, "disabled");
assert.deepStrictEqual(disabled.missingStartupGates, []);

const blocked = providerWriteLiveExecutorStatus({
  PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED: "true",
});
assert.strictEqual(blocked.startupMode, "blocked");
assert.ok(blocked.missingStartupGates.includes("dry_run_rehearsal_evidence"));

ProviderWriteLiveExecutorStatusSchema.parse({
  liveExecutorEnabled: false,
  startupMode: "disabled",
  startupGuardSatisfied: false,
  dryRunRehearsalEvidenceConfigured: false,
  providerWriteApprovalEvidenceConfigured: false,
  executionKillSwitchEnabled: true,
  payloadEscrowMode: "disabled",
  reviewAdapterCount: 0,
  credentialRefCount: 0,
  missingStartupGates: [],
  networkExecution: "not_started",
  providerMutationExecuted: false,
  customerVisibleMessageSent: false,
  payloadEscrowOpened: false,
});
```

- [x] **Step 2: Run red API tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
```

Expected: fail because `ProviderWriteLiveExecutorStatusSchema` and `providerWriteLiveExecutorStatus` are not implemented.

- [x] **Step 3: Implement shared schema and config helper**

Add the shared schema and helper so status contains only:

```ts
liveExecutorEnabled;
startupMode;
startupGuardSatisfied;
dryRunRehearsalEvidenceConfigured;
providerWriteApprovalEvidenceConfigured;
executionKillSwitchEnabled;
payloadEscrowMode;
reviewAdapterCount;
credentialRefCount;
missingStartupGates;
networkExecution: "not_started";
providerMutationExecuted: false;
customerVisibleMessageSent: false;
payloadEscrowOpened: false;
```

The control-plane request path must read this status through the startup `ApiConfigService` snapshot. It must not call the env helper directly, must not parse `PROVIDER_CREDENTIALS`, and must not read `PROVIDER_WRITE_DRY_RUN_REHEARSAL_SHA256` or `PROVIDER_WRITE_APPROVAL_SHA256` during the GET request.

- [x] **Step 4: Run green API tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
```

Expected: pass.

## Task 2: API And Web BFF Read-Only Status

- [x] **Step 1: Write failing API/BFF tests**

Add tests that:

- admin API key can call `OpsController.getProviderWriteLiveExecutorStatus`;
- operator API key receives 403;
- insecure header fallback receives 401;
- admin Web session can call `/api/operator/provider-writes/live-executor/status`;
- operator Web session receives 403 and does not fetch upstream;
- unsafe upstream fields like `providerPayload`, `credentialRef`, `operatorApiKey`, `token`, `hash`, or `secret` return 502.

- [x] **Step 2: Run red API/Web tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
```

Expected: fail because the API and BFF routes do not exist.

- [x] **Step 3: Implement API and BFF routes**

Add:

```ts
@Get("provider-writes/live-executor/status")
getProviderWriteLiveExecutorStatus(@Headers() headers: RequestHeaders) {
  const context = requireRequestContext(headers);
  requireProviderWriteAdminAccess(context);
  return this.opsService.getProviderWriteLiveExecutorStatus();
}
```

Create the Web route that checks `readOperatorSession`, blocks non-admin sessions, proxies `/v2/provider-writes/live-executor/status`, and returns `ProviderWriteLiveExecutorStatusSchema.parse(body)`.

- [x] **Step 4: Run green API/Web tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
```

Expected: pass.

## Task 3: Static Verifier And Launch Wiring

- [x] **Step 1: Write failing verifier tests**

Create `scripts/verify-provider-write-live-executor-control-plane.test.mjs` with tests that:

- pass on the repository;
- reject a fixture missing the API route or BFF route;
- reject a fixture whose BFF route allows unsafe fields;
- reject execution slices containing `.changeAddress(`, `.issueCoupon(`, `.sendMessage(`, `providerMutationExecuted: true`, `customerVisibleMessageSent: true`, `payloadEscrowOpened: true`, `decrypt`, `secret://`, or `vault://`.

- [x] **Step 2: Implement verifier and CI wiring**

Wire:

```bash
node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs
npm run verify:provider-write-live-executor-control-plane
```

into `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, `scripts/verify-production-launch.mjs`, docs, `task_plan.md`, and `progress.md`.

- [x] **Step 3: Run verifier/static gates**

Run:

```bash
node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs
npm.cmd run verify:provider-write-live-executor-control-plane
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
node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs
npm.cmd run verify:provider-write-live-executor-control-plane
npm.cmd run verify:provider-write-live-executor-startup-guard
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
node --check scripts/verify-provider-write-live-executor-control-plane.mjs
npm.cmd run typecheck --workspaces --if-present -- --pretty false
npm.cmd run lint --workspaces --if-present -- --max-warnings=0
npm.cmd run build --workspaces --if-present
node --test scripts\*.test.mjs
git diff --check
```

Expected: all commands exit 0. `git diff --check` may print CRLF warnings only if the command exits 0.

Actual:

- `npm.cmd run test --workspace @smart-cs-agent/api` passed with 204 tests when rerun alone from the repository cwd. An earlier broad parallel run hit the known Codex sandbox cwd / `experimentalDecorators` false failure and is not counted as a pass.
- `npm.cmd run test --workspace @smart-cs-agent/web` passed with 77 tests.
- `node --check scripts/verify-provider-write-live-executor-control-plane.mjs`, `node --test scripts/verify-provider-write-live-executor-control-plane.test.mjs`, `npm.cmd run verify:provider-write-live-executor-control-plane`, `npm.cmd run verify:provider-write-live-executor-startup-guard`, `npm.cmd run verify:production-static-ci`, and `npm.cmd run verify:production-launch` passed.
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`, `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`, and `npm.cmd run build --workspaces --if-present` passed.
- `node --test scripts\*.test.mjs` passed with 127 pass / 1 skipped. The skipped case is the existing Windows symlink-permission test.
- `git diff --check` exited 0 with CRLF warnings only.

- [x] **Step 2: Commit locally**

Run:

```bash
git add .
git commit -m "feat(pr65): add provider write live executor control plane"
```

Expected: local commit only. Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers a safe contract, config status computation, admin-only API/BFF visibility, no-secret/no-network boundaries, static CI, launch wiring, docs, tracking, verification, and local commit.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `ProviderWriteLiveExecutorStatusSchema`, `providerWriteLiveExecutorStatus`, and `verify:provider-write-live-executor-control-plane`.
