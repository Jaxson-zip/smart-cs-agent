# Owner 4: Operator Workbench UI

## Mission

Build the operator-facing workbench. This is not a developer trace viewer and not a general chat clone. It is a queue for after-sales cases that need human attention.

## Write Scope

You own:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/lib/*`

Coordinate before touching:

- `packages/shared/src/after-sales-contracts.ts`
- `apps/web/src/app/api/*`

Do not touch:

- `apps/api/src/agent/*`
- `apps/api/src/wecom/*`
- `prisma/schema.prisma`

## UI Information Architecture

Desktop target:

```text
Left: attention queue and filters
Center: current after-sales case and operator action
Right: order/customer/risk context
Drawer or lower panel: audit/history only when needed
```

The main queue should include only:

- Waiting confirmation
- Customer rejected proposal
- Human takeover
- Send failed

Auto-resolved cases should appear in history/metrics, not in the main queue.

## Required Operator Labels

Use:

- `待确认回复`
- `接管后回复`
- `系统已发送`
- `需人工接管`
- `需主管审核`
- `自动处理完成`

Do not use:

- `AI 建议回复`
- `RAG`
- `Prompt`
- `Tool Trace`
- `Vector DB`
- `可发送`

## Responsive Acceptance

Verify:

- 1366x768: core workflow visible without page-level vertical scrolling.
- 1920x1080: layout remains dense and useful, not stretched.
- 525x700: no horizontal overflow; side context collapses before main work area.

## Interaction Acceptance

The operator must be able to:

- Select a case.
- See category and risk.
- Edit a human-confirm reply.
- Confirm send.
- Take over a high-risk case.
- See why a case was routed to human without reading developer logs.

Run:

```bash
npm run typecheck --workspace @smart-cs-agent/web
npm run lint --workspace @smart-cs-agent/web
```
