# PR66 Provider Write Kill Switch Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only provider write emergency stop control plane that records safe kill-switch state changes and keeps provider write execution fail-closed without enabling real provider writes.

**Architecture:** PR66 stores sanitized kill-switch events in Postgres, exposes status/update through the NestJS Ops API and Next.js operator BFF, and audits every state change. The execution path treats either the env kill switch or the persisted emergency stop as blocking; releasing the persisted emergency stop never enables real provider writes and never changes environment variables.

**Tech Stack:** Prisma/PostgreSQL, Zod shared contracts, NestJS OpsController/OpsService, Next.js App Router BFF, Node static verifier scripts, GitHub Actions static gate, Markdown deploy docs.

---

## File Structure

- Modify `packages/shared/src/ops-contracts.ts`: add `ProviderWriteKillSwitchActionSchema`, `ProviderWriteKillSwitchReasonCodeSchema`, `ProviderWriteKillSwitchUpdateRequestSchema`, and `ProviderWriteKillSwitchStatusSchema`.
- Modify `prisma/schema.prisma`: add `ProviderWriteKillSwitchEvent` with tenant-scoped idempotency and no-network invariants.
- Create `prisma/migrations/20260608033000_pr66_provider_write_kill_switch_control_plane/migration.sql`: create the event table, indexes, unique key, and check constraints.
- Modify `apps/api/src/ops/ops.service.ts`: add `getProviderWriteKillSwitchStatus()`, `updateProviderWriteKillSwitch()`, latest-event lookup, idempotent event persistence, audit logging, and execution-decision blocking when emergency stop is engaged.
- Modify `apps/api/src/ops/ops.service.spec.ts`: cover default status, engage/release persistence, idempotency, audit safety, and execution blocking.
- Modify `apps/api/src/ops/ops.controller.ts`: add admin-only `GET /v2/provider-writes/kill-switch/status` and `POST /v2/provider-writes/kill-switch/status`.
- Modify `apps/api/src/ops/ops.controller.spec.ts`: cover admin success, non-admin blocking, insecure-header blocking, and tenant/operator context injection.
- Create `apps/web/src/app/api/operator/provider-writes/kill-switch/status/route.ts`: admin-only BFF route for GET/POST with strict request/response parsing and unsafe-field rejection.
- Modify `apps/web/src/app/api/operator/operator-bff.spec.ts`: cover admin GET/POST proxying, non-admin blocking before fetch, malformed body rejection, and unsafe upstream response rejection.
- Create `scripts/verify-provider-write-kill-switch-control-plane.mjs`: static verifier for contracts, migration constraints, API/BFF routes, execution blocking, audit safety, docs, CI, and no-network boundaries.
- Create `scripts/verify-provider-write-kill-switch-control-plane.test.mjs`: negative fixture tests for missing route/wiring, unsafe migration fields, unsafe BFF fields, and provider write execution calls.
- Modify `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs`: wire the new verifier and tests into static and launch gates.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, `docs/deploy/production-launch-runbook.md`, `docs/deploy/public-api-surface.md`, `task_plan.md`, and `progress.md`: document PR66.

## Task 1: Shared Contract And Persistence

- [x] **Step 1: Write failing shared/API tests**

Add assertions to `apps/api/src/ops/ops.service.spec.ts`:

```ts
ProviderWriteKillSwitchStatusSchema.parse({
  envKillSwitchEnabled: true,
  emergencyStopEngaged: false,
  effectiveKillSwitchEnabled: true,
  source: "env",
  latestEvent: null,
  networkExecution: "not_started",
  providerMutationExecuted: false,
  customerVisibleMessageSent: false,
});

ProviderWriteKillSwitchUpdateRequestSchema.parse({
  action: "engage",
  reasonCode: "incident_response",
  idempotencyKey: "ks_1234567890",
});
```

Expected status fields are safe booleans, enum values, fingerprints, and no-network invariants only.

- [x] **Step 2: Run red API tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
```

Expected: fail because the kill-switch schemas/service methods do not exist.

- [x] **Step 3: Implement shared schema, Prisma model, and migration**

Add the status shape:

```ts
{
  envKillSwitchEnabled: boolean;
  emergencyStopEngaged: boolean;
  effectiveKillSwitchEnabled: boolean;
  source: "env" | "emergency_stop" | "env_and_emergency_stop" | "none";
  latestEvent: null | {
    action: "engage" | "release";
    reasonCode: ProviderWriteKillSwitchReasonCode;
    operatorId: string | null;
    stateFingerprint: string;
    createdAt: string;
  };
  networkExecution: "not_started";
  providerMutationExecuted: false;
  customerVisibleMessageSent: false;
}
```

The migration must create only sanitized fields and enforce no-network invariants with check constraints.

- [x] **Step 4: Run green API tests**

Run:

```bash
npm.cmd run db:generate
npm.cmd run test --workspace @smart-cs-agent/api
```

Expected: pass.

## Task 2: API And BFF Control Plane

- [x] **Step 1: Write failing controller/BFF tests**

Add tests that:

- admin API key can read and update kill-switch status;
- operator API key receives 403;
- insecure header fallback receives 401;
- admin Web session can GET/POST through `/api/operator/provider-writes/kill-switch/status`;
- non-admin Web session receives 403 and does not fetch upstream;
- malformed Web body returns 400;
- unsafe upstream fields such as `providerPayload`, `credentialRef`, `operatorApiKey`, `token`, `secret`, `rawPayload`, or `customerMessage` return 502.

- [x] **Step 2: Run red API/Web tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
```

Expected: fail because the API and BFF routes do not exist.

- [x] **Step 3: Implement admin-only routes**

Add API routes:

```ts
@Get("provider-writes/kill-switch/status")
getProviderWriteKillSwitchStatus(@Headers() headers: RequestHeaders) {
  const context = requireRequestContext(headers);
  requireProviderWriteAdminAccess(context);
  return this.opsService.getProviderWriteKillSwitchStatus(context.tenantId);
}

@Post("provider-writes/kill-switch/status")
updateProviderWriteKillSwitch(@Headers() headers: RequestHeaders, @Body() body: ProviderWriteKillSwitchUpdateRequest) {
  const context = requireRequestContext(headers);
  requireProviderWriteAdminAccess(context);
  const request = ProviderWriteKillSwitchUpdateRequestSchema.parse(body);
  return this.opsService.updateProviderWriteKillSwitch({
    tenantId: context.tenantId,
    operatorId: context.operatorId,
    ...request,
  });
}
```

Create the Web route that checks `readOperatorSession`, blocks non-admin sessions, parses the update body with `ProviderWriteKillSwitchUpdateRequestSchema`, proxies to `/v2/provider-writes/kill-switch/status`, and parses responses with `ProviderWriteKillSwitchStatusSchema`.

- [x] **Step 4: Run green API/Web tests**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
```

Expected: pass.

## Task 3: Execution Blocking, Audit, And Static Gates

- [x] **Step 1: Write failing execution/audit/verifier tests**

Add API tests proving:

- when latest persisted kill-switch event is `engage`, `executeProviderWriteAttempt()` returns `blocked` with `policyReason="emergency_stop_engaged"` even if `PROVIDER_WRITE_EXECUTION_KILL_SWITCH=false`;
- update events write `AuditLog` entries with safe details and no raw idempotency key;
- duplicate idempotency keys replay the same status without creating duplicate events.

Create verifier tests that reject:

- missing API/BFF route wiring;
- migration fields for raw provider/customer data;
- execution slices containing `.changeAddress(`, `.issueCoupon(`, `.sendMessage(`, `providerMutationExecuted: true`, `customerVisibleMessageSent: true`, `decrypt`, `credentialResolver`, `secret://`, or `vault://`;
- BFF routes that omit unsafe-field guards.

- [x] **Step 2: Implement service blocking and static verifier**

Wire the persisted emergency stop into `providerWriteExecutionDecision()` through `executeProviderWriteAttempt()` without calling provider APIs, loading credentials, opening escrow, or changing environment variables.

- [x] **Step 3: Run focused verifier gates**

Run:

```bash
node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs
npm.cmd run verify:provider-write-kill-switch-control-plane
npm.cmd run verify:provider-write-execution-attempts
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
```

Expected: all pass.

## Task 4: Final Verification And Commit

- [x] **Step 1: Run focused and aggregate verification**

Run:

```bash
npm.cmd run db:generate
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
node --check scripts/verify-provider-write-kill-switch-control-plane.mjs
node --test scripts/verify-provider-write-kill-switch-control-plane.test.mjs
npm.cmd run verify:provider-write-kill-switch-control-plane
npm.cmd run verify:provider-write-live-executor-control-plane
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
git commit -m "feat(pr66): add provider write kill switch control plane"
```

Expected: local commit only. Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers a persistent emergency stop event model, safe shared contracts, admin-only API/BFF routes, execution blocking, idempotency, audit logging, static verifiers, docs, tracking, verification, and local commit.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `ProviderWriteKillSwitchStatusSchema`, `ProviderWriteKillSwitchUpdateRequestSchema`, and `verify:provider-write-kill-switch-control-plane`.
