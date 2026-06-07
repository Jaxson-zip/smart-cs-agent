# PR62 Provider Write Payload Escrow Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off sealed payload escrow readiness boundary for provider write requests without enabling real provider writes, decrypt/open behavior, credential access, or customer-visible sends.

**Architecture:** `ProviderWriteRequest` may record sanitized escrow readiness metadata when `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE=sealed_metadata`; the default remains `disabled` and stores `payloadEscrowStatus=not_stored`. Execution attempts remain no-network and no-escrow-open by design, preserving the PR61 database constraint that `ProviderWriteExecutionAttempt.payloadEscrowStatus=not_stored` and `payloadEscrowOpened=false`.

**Tech Stack:** NestJS API, Prisma/PostgreSQL, shared Zod contracts, Node verifier scripts, Next.js Web BFF static safety gates.

---

## File Structure

- Modify `apps/api/src/config/api-config.ts`: parse `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE`, default it to `disabled`, reject unsafe inline secret/ciphertext-like values, and expose `providerWritePayloadEscrowMode()`.
- Modify `apps/api/src/config/api-config.spec.ts`: cover default disabled mode, explicit sealed metadata mode, invalid mode, and unsafe inline values.
- Modify `apps/api/src/ops/ops.service.ts`: derive escrow metadata during provider write request persistence, preserve request escrow state through review, block execution attempts for sealed requests without persisting unsafe attempt escrow state, and keep attempt rows at `payloadEscrowStatus=not_stored`.
- Modify `apps/api/src/ops/ops.service.spec.ts`: add red-green coverage for default disabled escrow, sealed metadata request persistence, review preservation, execution blocking, no raw payload leakage, and no provider/credential/decrypt calls.
- Modify `prisma/schema.prisma`: add request-only escrow readiness metadata fields if needed; do not loosen PR61 execution attempt constraints.
- Create `prisma/migrations/20260608013000_pr62_provider_write_payload_escrow_boundary/migration.sql`: add request-only nullable metadata columns and request escrow status/mode checks.
- Create `prisma/migrations/20260608013500_pr62_provider_write_payload_escrow_cross_field_constraints/migration.sql`: bind request escrow status/mode/envelope timestamps so inconsistent stored states fail closed at the database layer.
- Modify `packages/shared/src/ops-contracts.ts`: allow sanitized provider write request list items to expose only `not_stored` or `sealed_metadata` status plus short fingerprints; do not expose envelope bodies or raw provider payloads.
- Create `scripts/verify-provider-write-payload-escrow-boundary.mjs`: statically enforce no provider writes, no decrypt/open calls, no credential reads, default-off config, request-only metadata, PR61 attempt invariants, docs, and CI wiring.
- Create `scripts/verify-provider-write-payload-escrow-boundary.test.mjs`: negative fixtures for missing config, missing verifier wiring, unsafe raw payload terms, and loosened execution attempt constraints.
- Modify `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs`: wire PR62 verifier and its tests.
- Modify `docs/deploy/provider-write-requests.md`, `docs/deploy/provider-adapter-contracts.md`, `docs/deploy/production-readiness.md`, `docs/deploy/public-api-surface.md`, and `docs/deploy/production-launch-runbook.md`: document the escrow boundary and explicitly state it is not real execution.
- Modify `task_plan.md` and `progress.md`: track PR62 start, scope, gate inventory, and final verification notes.

## Task 1: Config Contract

- [x] **Step 1: Write failing config tests**

Add tests in `apps/api/src/config/api-config.spec.ts`:

```ts
it("defaults provider write payload escrow mode to disabled", () => {
  const config = loadApiConfig(baseEnv(), { includeDotEnv: false });
  assert.strictEqual(config.providerWritePayloadEscrowMode, "disabled");
  assert.strictEqual(providerWritePayloadEscrowMode({}), "disabled");
});

it("accepts sealed metadata provider write payload escrow mode without secret material", () => {
  const config = loadApiConfig(
    { ...baseEnv(), PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: "sealed_metadata" },
    { includeDotEnv: false },
  );
  assert.strictEqual(config.providerWritePayloadEscrowMode, "sealed_metadata");
  assert.strictEqual(
    providerWritePayloadEscrowMode({
      PROVIDER_WRITE_PAYLOAD_ESCROW_MODE: "sealed_metadata",
    }),
    "sealed_metadata",
  );
});

it("rejects unsafe provider write payload escrow inline values", () => {
  assert.throws(
    () =>
      loadApiConfig(
        {
          ...baseEnv(),
          PROVIDER_WRITE_PAYLOAD_ESCROW_MODE:
            "sealed_metadata:secret://provider-token",
        },
        { includeDotEnv: false },
      ),
    /PROVIDER_WRITE_PAYLOAD_ESCROW_MODE/,
  );
});
```

- [x] **Step 2: Run red test**

Run: `npm.cmd run test --workspace @smart-cs-agent/api -- apps/api/src/config/api-config.spec.ts`

Expected: fail because `providerWritePayloadEscrowMode` and `providerWritePayloadEscrowMode()` do not exist.

- [x] **Step 3: Implement config parser**

Add `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE` as `z.enum(["disabled", "sealed_metadata"]).optional().default("disabled")`, include it in `ApiConfig`, return it from `loadApiConfig`, and export `providerWritePayloadEscrowMode(env = process.env)`.

- [x] **Step 4: Run green test**

Run: `npm.cmd run test --workspace @smart-cs-agent/api -- apps/api/src/config/api-config.spec.ts`

Expected: pass.

## Task 2: Request Escrow Metadata

- [x] **Step 1: Write failing OpsService tests**

Add tests in `apps/api/src/ops/ops.service.spec.ts`:

```ts
it("keeps provider write payload escrow disabled by default", async () => {
  process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
    { channel: "taobao", tenantId: "tenant_1", allowedActions: ["modify_address"] },
  ]);
  delete process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE;
  const persistence = createProviderOperationPersistence();
  const service = new OpsService(new ProviderAdapterRegistry(), persistence.prisma, persistence.audit);

  await service.requestProviderWrite({
    caseId: "case_1",
    tenantId: "tenant_1",
    channel: "taobao",
    action: "modify_address",
    payload: { orderId: "secret_order_1", addressFingerprint: "address_fp_123456" },
    idempotencyKey: "idem_pr62_default",
    operatorId: "operator_1",
  });

  assert.strictEqual(persistence.writeRequests[0].payloadEscrowStatus, "not_stored");
  assert.strictEqual(persistence.writeRequests[0].payloadEscrowEnvelopeFingerprint, null);
  assert.strictEqual(JSON.stringify(persistence.writeRequests[0]).includes("secret_order_1"), false);
});

it("records sealed metadata fingerprints without raw provider write payloads", async () => {
  process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
  process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
    { channel: "taobao", tenantId: "tenant_1", allowedActions: ["modify_address"] },
  ]);
  const persistence = createProviderOperationPersistence();
  const service = new OpsService(new ProviderAdapterRegistry(), persistence.prisma, persistence.audit);

  await service.requestProviderWrite({
    caseId: "case_1",
    tenantId: "tenant_1",
    channel: "taobao",
    action: "modify_address",
    payload: { orderId: "secret_order_1", addressFingerprint: "address_fp_123456" },
    idempotencyKey: "idem_pr62_sealed",
    operatorId: "operator_1",
  });

  const row = persistence.writeRequests[0];
  assert.strictEqual(row.payloadEscrowStatus, "sealed_metadata");
  assert.match(row.payloadEscrowFingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.match(row.payloadEscrowEnvelopeFingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.strictEqual(JSON.stringify(row).includes("secret_order_1"), false);
  assert.strictEqual(JSON.stringify(row).includes("address_fp_123456"), false);
});
```

- [x] **Step 2: Run red test**

Run: `npm.cmd run test --workspace @smart-cs-agent/api -- apps/api/src/ops/ops.service.spec.ts`

Expected: fail because the new metadata field and sealed mode are not implemented.

- [x] **Step 3: Implement request metadata**

Add request-only nullable Prisma columns `payloadEscrowEnvelopeFingerprint`, `payloadEscrowMode`, and `payloadEscrowCreatedAt`; build metadata from hashes only:

```ts
function providerWritePayloadEscrowMetadata(requestHash: string, payloadHash: string) {
  if (providerWritePayloadEscrowMode() !== "sealed_metadata") {
    return {
      payloadEscrowStatus: "not_stored",
      payloadEscrowFingerprint: providerWritePayloadEscrowFingerprint(requestHash),
      payloadEscrowEnvelopeFingerprint: null,
      payloadEscrowMode: "disabled",
      payloadEscrowCreatedAt: null,
    };
  }
  return {
    payloadEscrowStatus: "sealed_metadata",
    payloadEscrowFingerprint: sha256(stableJson({ kind: "provider_write_payload_escrow_sealed_metadata", requestHash })),
    payloadEscrowEnvelopeFingerprint: sha256(stableJson({ kind: "provider_write_payload_escrow_envelope_metadata", requestHash, payloadHash })),
    payloadEscrowMode: "sealed_metadata",
    payloadEscrowCreatedAt: new Date(),
  };
}
```

- [x] **Step 4: Run green test**

Run: `npm.cmd run test --workspace @smart-cs-agent/api -- apps/api/src/ops/ops.service.spec.ts`

Expected: pass.

## Task 3: Review And Execution Boundary

- [x] **Step 1: Write failing review/execution tests**

Add tests in `apps/api/src/ops/ops.service.spec.ts`:

```ts
it("preserves sealed payload escrow metadata through human review", async () => {
  process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
  process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
    { channel: "taobao", tenantId: "tenant_1", allowedActions: ["issue_coupon"] },
  ]);
  const persistence = createProviderOperationPersistence();
  const service = new OpsService(new ProviderAdapterRegistry(), persistence.prisma, persistence.audit);

  const requested = await service.requestProviderWrite({
    caseId: "case_1",
    tenantId: "tenant_1",
    channel: "taobao",
    action: "issue_coupon",
    payload: { orderId: "secret_order_1", couponAmountCents: 2000 },
    idempotencyKey: "idem_pr62_review",
    operatorId: "operator_1",
  });
  const originalFingerprint = persistence.writeRequests[0].payloadEscrowFingerprint;
  const originalEnvelope = persistence.writeRequests[0].payloadEscrowEnvelopeFingerprint;

  await service.approveProviderWriteRequest({
    tenantId: "tenant_1",
    requestId: requested.writeRequestId,
    reviewerOperatorId: "admin_1",
    reasonCode: "policy_verified",
  });

  assert.strictEqual(persistence.writeRequests[0].payloadEscrowStatus, "sealed_metadata");
  assert.strictEqual(persistence.writeRequests[0].payloadEscrowFingerprint, originalFingerprint);
  assert.strictEqual(persistence.writeRequests[0].payloadEscrowEnvelopeFingerprint, originalEnvelope);
});

it("blocks sealed escrow execution attempts without opening escrow or violating attempt invariants", async () => {
  process.env.PROVIDER_WRITE_PAYLOAD_ESCROW_MODE = "sealed_metadata";
  process.env.PROVIDER_WRITE_EXECUTION_KILL_SWITCH = "false";
  process.env.PROVIDER_WRITE_REVIEW_ADAPTERS = JSON.stringify([
    { channel: "taobao", tenantId: "tenant_1", allowedActions: ["issue_coupon"] },
  ]);
  const persistence = createProviderOperationPersistence();
  const adapter = new PoisonTaobaoAdapter();
  const service = new OpsService(new ProviderAdapterRegistry(adapter), persistence.prisma, persistence.audit);

  const requested = await service.requestProviderWrite({
    caseId: "case_1",
    tenantId: "tenant_1",
    channel: "taobao",
    action: "issue_coupon",
    payload: { orderId: "secret_order_1", couponAmountCents: 2000 },
    idempotencyKey: "idem_pr62_exec_request",
    operatorId: "operator_1",
  });
  await service.approveProviderWriteRequest({
    tenantId: "tenant_1",
    requestId: requested.writeRequestId,
    reviewerOperatorId: "admin_1",
    reasonCode: "policy_verified",
  });

  const attempt = await service.executeProviderWriteAttempt({
    tenantId: "tenant_1",
    requestId: requested.writeRequestId,
    operatorId: "admin_2",
    idempotencyKey: "idem_pr62_exec_attempt",
  });

  assert.strictEqual(attempt.status, "blocked");
  assert.strictEqual(attempt.payloadEscrowOpened, false);
  assert.strictEqual(attempt.providerMutationExecuted, false);
  assert.strictEqual(adapter.writeCallCount, 0);
  assert.strictEqual(persistence.writeExecutionAttempts[0].payloadEscrowStatus, "not_stored");
  assert.strictEqual(persistence.writeExecutionAttempts[0].payloadEscrowOpened, false);
});
```

- [x] **Step 2: Run red test**

Run: `npm.cmd run test --workspace @smart-cs-agent/api -- apps/api/src/ops/ops.service.spec.ts`

Expected: fail because review resets status to `not_stored` and execution attempt tries to persist request escrow state.

- [x] **Step 3: Implement boundary**

Preserve request escrow fields during review. In `persistProviderWriteExecutionAttempt`, always persist `payloadEscrowStatus: "not_stored"` and `payloadEscrowOpened: false`; keep the execution fingerprint bound to request escrow metadata so attempts remain auditable without opening escrow.

- [x] **Step 4: Run green test**

Run: `npm.cmd run test --workspace @smart-cs-agent/api -- apps/api/src/ops/ops.service.spec.ts`

Expected: pass.

## Task 4: Static Verifier And Docs

- [x] **Step 1: Write verifier tests**

Create `scripts/verify-provider-write-payload-escrow-boundary.test.mjs` with fixtures that fail when:

- `PROVIDER_WRITE_PAYLOAD_ESCROW_MODE` is missing from API config.
- `ProviderWriteRequest` lacks request-only escrow metadata.
- `ProviderWriteExecutionAttempt_payload_escrow_chk` no longer forces `not_stored`.
- `ops.service.ts` execution slices contain `.changeAddress(`, `.issueCoupon(`, `.sendMessage(`, `decrypt`, `credentialResolver`, `payloadEscrowOpened: true`, `providerMutationExecuted: true`, or `customerVisibleMessageSent: true`.
- static CI or production launch verifier lacks `verify:provider-write-payload-escrow-boundary`.

- [x] **Step 2: Run red verifier test**

Run: `node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs`

Expected: fail until the verifier script and wiring exist.

- [x] **Step 3: Implement verifier and docs wiring**

Add `scripts/verify-provider-write-payload-escrow-boundary.mjs`, package script, static CI workflow/test command, production static verifier references, production launch references, and docs sections that say:

- PR62 is not a real write executor.
- It stores only sealed metadata/fingerprints, not raw order IDs, addresses, logistics IDs, provider payloads, ciphertext bodies, provider responses, customer messages, credentials, tokens, or operator API keys.
- Execution attempts still cannot open escrow and still store `payloadEscrowStatus=not_stored`.

- [x] **Step 4: Run green verifier test**

Run: `node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs`

Expected: pass.

## Task 5: Full Verification And Commit

- [x] **Step 1: Generate Prisma client**

Run: `npm.cmd run db:generate`

Expected: exit 0.

- [x] **Step 2: Apply migrations**

Run: `npm.cmd run db:migrate:deploy`

Expected: exit 0 and PR62 migrations applied or already present.

- [x] **Step 3: Run focused and aggregate suites**

Run:

```bash
npm.cmd run test --workspace @smart-cs-agent/api
npm.cmd run test --workspace @smart-cs-agent/web
node --test scripts/verify-provider-write-payload-escrow-boundary.test.mjs
npm.cmd run verify:provider-write-payload-escrow-boundary
npm.cmd run verify:provider-write-execution-attempts
npm.cmd run verify:provider-write-execution-attempt-visibility
npm.cmd run verify:production-static-ci
npm.cmd run verify:production-launch
npm.cmd run typecheck --workspaces --if-present -- --pretty false
npm.cmd run lint --workspaces --if-present -- --max-warnings=0
npm.cmd run build --workspaces --if-present
node --test scripts\*.test.mjs
git diff --check
```

Expected: all commands exit 0. `git diff --check` may print existing CRLF warnings only if the command exits 0.

- [x] **Step 4: Commit**

Run:

```bash
git add .
git commit -m "feat(pr62): add provider write payload escrow boundary"
```

Expected: local commit only. Do not push until GitHub OAuth has `workflow` scope because PR55 added `.github/workflows/production-static-gates.yml`.

## Self-Review

- Spec coverage: The plan covers default-off config, request-only sealed metadata, review preservation, execution block, no raw payload leakage, verifier wiring, docs, and final verification.
- Placeholder scan: No TBD/TODO/fill-later steps remain.
- Type consistency: The plan consistently uses `payloadEscrowStatus`, `payloadEscrowFingerprint`, `payloadEscrowEnvelopeFingerprint`, `payloadEscrowMode`, and `payloadEscrowCreatedAt` as request-only fields; the database now rejects mismatched request escrow status/mode/envelope combinations; execution attempts remain `payloadEscrowStatus=not_stored` and `payloadEscrowOpened=false`.
