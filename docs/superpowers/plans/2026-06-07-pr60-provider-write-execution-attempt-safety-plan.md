# PR60 Provider Write Execution Attempt Safety Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-network provider write execution-attempt safety layer that can consume approved provider write requests without executing real provider mutations.

**Architecture:** PR60 introduces an execution attempt record and a dry-run executor boundary. The API may create an execution attempt only for an approved request owned by the authenticated tenant, but every attempt remains blocked or dry-run until a later PR adds reviewed real provider clients, secure payload escrow, and live canary controls.

**Tech Stack:** NestJS, Prisma, Next.js BFF, Zod shared contracts, Node verifier scripts, npm workspace tests.

---

## File Structure

- Modify `packages/shared/src/ops-contracts.ts`: add execution attempt status, execute request, and execute response contracts.
- Modify `prisma/schema.prisma`: add `ProviderWriteExecutionAttempt`.
- Create `prisma/migrations/20260608003000_pr60_provider_write_execution_attempts/migration.sql`.
- Modify `apps/api/src/config/api-config.ts`: parse `PROVIDER_WRITE_EXECUTION_KILL_SWITCH`, defaulting to `true`.
- Modify `apps/api/src/ops/ops.controller.ts`: add admin-only `POST /v2/provider-writes/requests/:id/execution-attempts`.
- Modify `apps/api/src/ops/ops.service.ts`: create dry-run attempts only from approved provider write requests; never call provider adapter write methods.
- Modify `apps/api/src/ops/ops.controller.spec.ts` and `apps/api/src/ops/ops.service.spec.ts`: cover auth, approved-only transitions, request-scoped idempotency, kill switch, no-network behavior, and sanitized persistence.
- Modify `apps/web/src/app/api/operator/provider-writes/requests/[id]/execution-attempts/route.ts`: add BFF route with admin session and response sanitization.
- Modify `apps/web/src/app/api/operator/operator-bff.spec.ts`: cover BFF proxy behavior and unsafe response rejection.
- Create `scripts/verify-provider-write-execution-attempts.mjs` and `.test.mjs`: static no-network gate.
- Modify `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, `scripts/verify-production-launch.mjs`, `docs/deploy/provider-write-requests.md`, `docs/deploy/production-readiness.md`, `docs/deploy/production-launch-runbook.md`, `docs/deploy/public-api-surface.md`, `docs/deploy/provider-adapter-contracts.md`, `task_plan.md`, and `progress.md`.

## Task 1: Shared Contracts

- [ ] Add `ProviderWriteExecutionAttemptStatusSchema` with `dry_run_recorded`, `blocked`, and `failed`.
- [ ] Add `ProviderWriteExecutionAttemptRequestSchema` with only `{ idempotencyKey: string }`.
- [ ] Add `ProviderWriteExecutionAttemptResponseSchema` with `networkExecution="not_started"`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, `payloadEscrowOpened=false`, `requiresHuman=true`, and `retryable`.
- [ ] Add exported types.
- [ ] Add contract tests in API service spec that reject free text, raw payload, provider response, or operator key fields.

## Task 2: Persistence

- [ ] Add `ProviderWriteExecutionAttempt` model with tenant/request/operator/channel/action/status/idempotencyKeyHash/requestHash/attemptFingerprint/payloadEscrowStatus/payloadEscrowOpened/networkExecution/providerMutationExecuted/customerVisibleMessageSent/operatorVisibleResult/policyReason timestamps.
- [ ] Add uniqueness on `tenantId + providerWriteRequestId + idempotencyKeyHash`.
- [ ] Add indexes for tenant/request/status/createdAt.
- [ ] Migration must not add raw order ID, logistics ID, address, provider payload, provider response, token, operator API key, or customer message fields.

## Task 3: API State Machine

- [ ] Add `executeProviderWriteAttempt` in `OpsService`.
- [ ] Fail closed without persistence when Prisma is unavailable.
- [ ] Find request by `tenantId + requestId`.
- [ ] Require request `status=approved`; block `approval_required`, `rejected`, `blocked`, and `failed`.
- [ ] Require `payloadEscrowStatus=not_stored` as the PR60 dry-run safety precondition; any other escrow state is blocked because this build cannot open raw payload escrow.
- [ ] If `PROVIDER_WRITE_EXECUTION_KILL_SWITCH !== "false"`, return `blocked` and persist the attempt with `policyReason=execution_kill_switch_enabled`.
- [ ] If kill switch is explicitly false, record `dry_run_recorded` but still keep `networkExecution=not_started`, `providerMutationExecuted=false`, `customerVisibleMessageSent=false`, and `payloadEscrowOpened=false`.
- [ ] Make idempotency replay return the existing attempt response for the same `tenantId + providerWriteRequestId + idempotencyKeyHash` and same request hash; allow different provider write requests to reuse the same external idempotency key.
- [ ] Bind execution attempt `requestHash` / `attemptFingerprint` to `providerWriteRequestId`, original provider write `requestHash`, request `status`, `reviewFingerprint`, `payloadEscrowStatus`, and `payloadEscrowFingerprint`.
- [ ] Fail closed when the same request/idempotency key is replayed after request fingerprint drift.
- [ ] Audit every attempt with sanitized ids/fingerprints only.

## Task 4: API/BFF Routes

- [ ] Add direct API route `POST /v2/provider-writes/requests/:id/execution-attempts`.
- [ ] Require admin operator API key; reject insecure header fallback.
- [ ] Add Web BFF route `POST /api/operator/provider-writes/requests/:id/execution-attempts`.
- [ ] BFF must parse shared request schema and rebuild `{ idempotencyKey }` only.
- [ ] BFF must reject upstream responses that imply network execution, provider mutation, customer-visible send, or payload escrow opening.

## Task 5: Verifier and Docs

- [ ] Add `npm run verify:provider-write-execution-attempts`.
- [ ] Static verifier must check shared contracts, Prisma model/migration, API/BFF routes, tests, no-network literals, docs, public API surface, static CI wiring, and production launch wiring.
- [ ] Static verifier must reject execution-attempt code that contains provider write calls (`changeAddress`, `issueCoupon`, `sendMessage`), unsafe success flags, credential resolver/decrypt usage, or `secret://` / `vault://` access.
- [ ] Add at least one negative verifier test using a copied fixture root.
- [ ] Docs must state PR60 is execution-attempt recording only, not real execution.

## Task 6: Verification and Commit

- [ ] Run `npm.cmd run db:generate`.
- [ ] Run `npm.cmd run db:migrate:deploy`.
- [ ] Run `npm.cmd run test --workspace @smart-cs-agent/api`.
- [ ] Run `npm.cmd run test --workspace @smart-cs-agent/web`.
- [ ] Run `npm.cmd run verify:provider-write-execution-attempts`.
- [ ] Run `npm.cmd run verify:production-static-ci`.
- [ ] Run `npm.cmd run verify:production-launch`.
- [ ] Run `npm.cmd run typecheck --workspaces --if-present -- --pretty false`.
- [ ] Run `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`.
- [ ] Run `npm.cmd run build --workspaces --if-present`.
- [ ] Run `node --test scripts\*.test.mjs`.
- [ ] Run `git diff --check`.
- [ ] Commit as `feat(pr60): add provider write execution attempt safety`.

## Self-Review

- Spec coverage: this plan covers shared contracts, persistence, service state machine, API/BFF routes, verifier, docs, and verification.
- Placeholder scan: no TBD/TODO/implement-later placeholders.
- Boundary check: PR60 explicitly forbids real provider network execution, payload decrypt/open, provider mutation, and customer-visible message sends.
