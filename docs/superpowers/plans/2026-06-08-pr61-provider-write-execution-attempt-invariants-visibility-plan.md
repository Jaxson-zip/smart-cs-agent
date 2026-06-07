# PR61 Provider Write Execution Attempt Invariants And Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database-level no-network invariants and sanitized admin visibility for provider write execution attempts.

**Architecture:** PR61 keeps PR60 no-network semantics intact. PostgreSQL check constraints make unsafe execution evidence unpersistable, while API and Web BFF list endpoints expose only sanitized attempt metadata for admins. This does not add payload escrow, credential reads, provider writes, or customer-visible sends.

**Tech Stack:** NestJS, Prisma raw SQL migrations, Next.js BFF route handlers, Zod shared contracts, Node verifier scripts, npm workspace tests.

---

## File Structure

- Create `prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql`: add PostgreSQL check constraints for PR60 no-network invariants.
- Modify `packages/shared/src/ops-contracts.ts`: add sanitized execution-attempt list item schema.
- Modify `apps/api/src/ops/ops.service.ts`: add `listProviderWriteExecutionAttempts`.
- Modify `apps/api/src/ops/ops.controller.ts`: add admin-only `GET /v2/provider-writes/execution-attempts`.
- Modify `apps/api/src/ops/ops.service.spec.ts` and `apps/api/src/ops/ops.controller.spec.ts`: cover sanitized list output, tenant isolation, status/request filters, and admin-only access.
- Create `apps/web/src/app/api/operator/provider-writes/execution-attempts/route.ts`: add admin session BFF list route.
- Modify `apps/web/src/app/api/operator/operator-bff.spec.ts`: cover BFF proxy and unsafe upstream response rejection.
- Create `scripts/verify-provider-write-execution-attempt-visibility.mjs` and `.test.mjs`: static gate for constraints, list routes, sanitized fields, and no-network invariants.
- Modify `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, `scripts/verify-production-launch.mjs`, docs, `task_plan.md`, and `progress.md`.

## Task 1: Database Invariants

- [x] **Step 1: Create migration with check constraints**

Create `prisma/migrations/20260608011000_pr61_provider_write_execution_attempt_constraints/migration.sql`:

```sql
-- PR61: database no-network invariants for provider write execution attempts.
ALTER TABLE "ProviderWriteExecutionAttempt"
ADD CONSTRAINT "ProviderWriteExecutionAttempt_status_chk"
CHECK ("status" IN ('dry_run_recorded', 'blocked', 'failed'));

ALTER TABLE "ProviderWriteExecutionAttempt"
ADD CONSTRAINT "ProviderWriteExecutionAttempt_no_network_chk"
CHECK (
  "networkExecution" = 'not_started'
  AND "providerMutationExecuted" = false
  AND "customerVisibleMessageSent" = false
  AND "payloadEscrowOpened" = false
);

ALTER TABLE "ProviderWriteExecutionAttempt"
ADD CONSTRAINT "ProviderWriteExecutionAttempt_payload_escrow_chk"
CHECK ("payloadEscrowStatus" = 'not_stored');
```

- [x] **Step 2: Add verifier checks**

Update the new PR61 verifier to require the three constraint names and reject `CASCADE`, `DROP TABLE`, provider write calls, or raw provider fields in the migration.

- [x] **Step 3: Run migration**

Run: `npm.cmd run db:migrate:deploy`
Expected: migration `20260608011000_pr61_provider_write_execution_attempt_constraints` applied successfully.

## Task 2: Shared Sanitized List Contract

- [x] **Step 1: Add shared schema**

Modify `packages/shared/src/ops-contracts.ts` after `ProviderWriteExecutionAttemptResponseSchema`:

```ts
export const ProviderWriteExecutionAttemptListItemSchema = z
  .object({
    id: z.string(),
    providerWriteRequestId: z.string(),
    operatorId: z.string().nullable(),
    channel: CommerceChannelSchema,
    action: ProviderWriteActionSchema,
    status: ProviderWriteExecutionAttemptStatusSchema,
    networkExecution: z.literal("not_started"),
    providerMutationExecuted: z.literal(false),
    customerVisibleMessageSent: z.literal(false),
    payloadEscrowStatus: z.literal("not_stored"),
    payloadEscrowOpened: z.literal(false),
    requestFingerprint: z.string(),
    attemptFingerprint: z.string(),
    policyReason: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
```

Export `ProviderWriteExecutionAttemptListItem`.

- [x] **Step 2: Extend contract tests**

Add API spec assertions that `ProviderWriteExecutionAttemptListItemSchema` rejects `orderId`, `logisticsId`, `address`, `providerPayload`, `providerResponse`, `operatorApiKey`, `token`, `customerMessage`, `networkExecution="started"`, and true execution flags.

## Task 3: API Visibility

- [x] **Step 1: Add service list method**

Add `listProviderWriteExecutionAttempts(input)` in `apps/api/src/ops/ops.service.ts`:

```ts
async listProviderWriteExecutionAttempts(input: {
  tenantId: string;
  limit?: number;
  status?: ProviderWriteExecutionAttemptStatus;
  providerWriteRequestId?: string;
}) {
  if (!this.prisma) return [];
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const attempts = await this.prisma.providerWriteExecutionAttempt.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.providerWriteRequestId
        ? { providerWriteRequestId: input.providerWriteRequestId }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return attempts.map(toSanitizedProviderWriteExecutionAttempt);
}
```

The mapper must expose fingerprints only with `fingerprint(hash)`, must force all no-network fields to false/not_started/not_stored, and must not return raw hashes.

- [x] **Step 2: Add controller route**

Add `GET /v2/provider-writes/execution-attempts` in `apps/api/src/ops/ops.controller.ts`. Require admin operator API key using `requireProviderWriteAdminAccess`. Query schema:

```ts
const providerWriteExecutionAttemptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: ProviderWriteExecutionAttemptStatusSchema.optional(),
  providerWriteRequestId: z.string().min(1).optional(),
});
```

- [x] **Step 3: Add API tests**

Add tests proving:
- admin can list sanitized attempts for one tenant only;
- status and providerWriteRequestId filters work;
- viewer/operator cannot list attempts;
- insecure headers are rejected;
- output does not include raw requestHash, idempotencyKeyHash, full attemptFingerprint, raw order/logistics/address/provider fields, operator API keys, tokens, or customer messages.

## Task 4: Web BFF Visibility

- [x] **Step 1: Add BFF route**

Create `apps/web/src/app/api/operator/provider-writes/execution-attempts/route.ts`. It must:
- require a valid operator session;
- require `session.role === "admin"`;
- proxy `limit`, `status`, and `providerWriteRequestId` query params to `/v2/provider-writes/execution-attempts`;
- parse upstream array items with `ProviderWriteExecutionAttemptListItemSchema`;
- reject extra raw/sensitive fields before returning JSON.

- [x] **Step 2: Add Web tests**

Add tests proving:
- admin sessions can list sanitized execution attempts without exposing API keys;
- non-admin sessions get 403 before fetch is called;
- upstream items with unsafe flags, `providerPayload`, `operatorApiKey`, raw order/logistics/address, token, or customer message fields return 502.

## Task 5: Verifier, Docs, And Planning

- [x] **Step 1: Add PR61 verifier**

Create `scripts/verify-provider-write-execution-attempt-visibility.mjs` and `.test.mjs`. The verifier must check:
- migration constraints exist;
- shared list schema exists and is strict;
- API route and service method exist;
- Web BFF route exists and rejects unsafe fields;
- tests contain admin/non-admin/sanitization cases;
- docs and production launch/static CI wire `verify:provider-write-execution-attempt-visibility`;
- no provider writes, credential/decrypt, secret/vault, raw provider payload, or customer-visible send paths are introduced.

- [x] **Step 2: Wire scripts and docs**

Add `verify:provider-write-execution-attempt-visibility` to `package.json`, production static CI, production launch verifier, production readiness docs, public API surface, provider write docs, provider adapter docs, `task_plan.md`, and `progress.md`.

## Task 6: Verification And Commit

- [x] Run `npm.cmd run db:generate`.
- [x] Run `npm.cmd run db:migrate:deploy`.
- [x] Run `npm.cmd run test --workspace @smart-cs-agent/api`.
- [x] Run `npm.cmd run test --workspace @smart-cs-agent/web`.
- [x] Run `node --test scripts\verify-provider-write-execution-attempt-visibility.test.mjs`.
- [x] Run `npm.cmd run verify:provider-write-execution-attempt-visibility`.
- [x] Run `npm.cmd run verify:provider-write-execution-attempts`.
- [x] Run `npm.cmd run verify:production-static-ci`.
- [x] Run `npm.cmd run verify:production-launch`.
- [x] Run `npm.cmd run typecheck --workspaces --if-present -- --pretty false`.
- [x] Run `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`.
- [x] Run `npm.cmd run build --workspaces --if-present`.
- [x] Run `node --test scripts\*.test.mjs`.
- [x] Run `git diff --check`.
- [x] Commit as `feat(pr61): add provider write execution attempt invariants`.

## Self-Review

- Spec coverage: constraints, sanitized list contracts, API route, BFF route, verifier, docs, and verification are covered.
- Placeholder scan: no TBD/TODO/implement-later placeholders.
- Boundary check: PR61 still forbids real provider network execution, payload decrypt/open, provider mutation, customer-visible message sends, and raw provider/customer data exposure.
