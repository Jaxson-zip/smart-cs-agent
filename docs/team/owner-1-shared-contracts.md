# Owner 1: Shared Contracts And Data

## Mission

Define the shared after-sales language that every other owner imports. Your job is to prevent five teams from inventing five different versions of "case", "risk", and "action".

## Write Scope

You own:

- `packages/shared/src/after-sales-contracts.ts`
- `packages/shared/src/wecom-contracts.ts`
- `packages/shared/src/index.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`

Coordinate before touching:

- `packages/shared/src/ops-contracts.ts`
- `packages/shared/src/events.ts`

Do not touch:

- `apps/web/src/app/page.tsx`
- `apps/api/src/agent/*`
- `apps/api/src/wecom/*`

## Required Types

Create or export these exact concepts:

```ts
export const afterSalesCategoryValues = [
  "address_change",
  "logistics",
  "damage_compensation",
  "refund_return",
  "compensation_rejected",
  "complaint_escalation",
  "unknown",
] as const;

export type AfterSalesCategory = (typeof afterSalesCategoryValues)[number];

export const riskLevelValues = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof riskLevelValues)[number];

export const automationModeValues = [
  "auto_execute",
  "human_confirm",
  "human_takeover",
] as const;
export type AutomationMode = (typeof automationModeValues)[number];
```

Use Zod schemas for API payloads. Export TypeScript types from those schemas.

## Data Model Requirements

The shared case model must include:

- `caseId`
- `merchantId`
- `channel`
- `customerName`
- `orderId`
- `category`
- `riskLevel`
- `automationMode`
- `customerMessage`
- `customerReply`
- `actions`
- `createdAt`
- `updatedAt`

The action model must support:

- `change_address`
- `query_logistics`
- `issue_coupon`
- `create_handoff`
- `create_supervisor_review`
- `send_channel_reply`

## Acceptance

Run:

```bash
npm run typecheck --workspace @smart-cs-agent/shared
```

Expected:

```text
0 TypeScript errors
```

Open a PR with:

- Summary of exported schemas.
- Any Prisma model changes.
- Seed data examples added.
