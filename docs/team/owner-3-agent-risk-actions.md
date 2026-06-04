# Owner 3: Agent Risk And Actions

## Mission

Build the simulated decision engine. The system must classify all common after-sales requests, decide risk, choose automation mode, and call only allowed mock actions.

## Write Scope

You own:

- `apps/api/src/agent/*`
- `apps/api/src/risk/*`
- `apps/api/src/actions/*`
- `apps/api/src/ops/*` only when integrating with existing simulated ops endpoints

Coordinate before touching:

- `packages/shared/src/after-sales-contracts.ts`
- `apps/api/src/wecom/*`

Do not touch:

- `apps/web/src/app/page.tsx`
- `prisma/schema.prisma`

## Required Decision Rules

Implement these baseline rules:

| Scenario | Category | Risk | Mode |
| --- | --- | --- | --- |
| Customer asks to change address before shipment | `address_change` | `low` | `auto_execute` |
| Customer asks logistics status | `logistics` | `low` | `auto_execute` |
| Package damaged, product okay, coupon under limit | `damage_compensation` | `low` | `auto_execute` |
| Compensation amount near limit or order unclear | `damage_compensation` | `medium` | `human_confirm` |
| Customer rejects first compensation proposal | `compensation_rejected` | `medium` | `human_confirm` |
| Refund dispute, cash refund, complaint threat | `refund_return` or `complaint_escalation` | `high` | `human_takeover` |
| Cannot identify order or category | `unknown` | `high` | `human_takeover` |

## Required Mock Actions

Implement mock executors for:

- `change_address`
- `query_logistics`
- `issue_coupon`
- `create_handoff`
- `create_supervisor_review`
- `send_channel_reply`

Agent must not directly send messages or mutate orders. It returns structured decisions; action services execute through policy gates.

## Reply Copy Rules

Customer-facing reply must be plain and professional.

Do not include:

- "AI"
- "RAG"
- "prompt"
- "vector database"
- "tool call"
- "confidence score"

## Acceptance

Add tests or test fixtures for:

- One low-risk auto case.
- One medium-risk confirmation case.
- One high-risk takeover case.

Run:

```bash
npm run typecheck --workspace @smart-cs-agent/api
npm run lint --workspace @smart-cs-agent/api
```

Expected:

- Typecheck passes.
- Lint passes.
- Test fixtures show correct `automationMode`.
