# Team Dispatch Sheet

Use this file to assign real teammates or coding agents.

Project branch:

```bash
codex/wecom-sandbox-after-sales
```

Primary source of truth:

```text
docs/superpowers/plans/2026-06-04-wecom-sandbox-team-development.md
docs/team/README.md
```

## Execution Order

### Phase 0: Everyone Pulls The Same Branch

Everyone runs:

```bash
git clone https://github.com/Jaxson-zip/smart-cs-agent.git
cd smart-cs-agent
git fetch origin codex/wecom-sandbox-after-sales
git switch -c codex/wecom-sandbox-after-sales --track origin/codex/wecom-sandbox-after-sales
npm install
```

Then each teammate creates a personal branch:

```bash
git switch -c feat/<owner-area>
```

### Phase 1: Owner 1 Goes First

Owner 1 must finish shared contracts before deep backend/UI work starts.

Allowed parallel work before Owner 1 merges:

- Owner 2 can scaffold folders and read docs.
- Owner 3 can draft rule tables and tests locally, but should not finalize imports.
- Owner 4 can explore layout, but should not lock data property names.
- Owner 5 can draft demo scenarios.

Blocked until Owner 1 merges:

- Final API payload imports.
- Final UI data mapping.
- Final agent decision output shape.

### Phase 2: Owners 2, 3, 4 Work In Parallel

After Owner 1 PR merges:

- Owner 2 builds WeCom sandbox channel.
- Owner 3 builds classifier/risk/actions.
- Owner 4 builds operator workbench.

Owner 2 and Owner 3 must agree on the integration handoff:

```text
WeCom event -> normalized event -> after-sales case decision
```

Owner 4 should consume mock data matching Owner 1 contracts if API is not ready.

### Phase 3: Owner 5 Validates The Whole Loop

Owner 5 starts final QA after Owners 2 and 3 expose usable endpoints/services, and after Owner 4 has a visible workbench.

Owner 5 owns the demo evidence.

---

## Merge Order

Merge PRs into `codex/wecom-sandbox-after-sales` in this order:

1. `feat/shared-after-sales-contracts`
2. `feat/wecom-sandbox-channel`
3. `feat/agent-risk-actions`
4. `feat/operator-workbench`
5. `feat/demo-qa-script`

Owner 2 and Owner 3 may merge in either order only if their integration point is mocked and documented.

Owner 4 should merge after Owner 1, but does not need to wait for full backend if using contract-shaped mock data.

---

## PR Rules

Each PR must include:

- What owner packet it implements.
- Files changed.
- Verification commands run.
- Known gaps.
- Screenshot if UI changed.
- Example payload/response if API changed.

Do not merge a PR that:

- Changes another owner's write scope without explanation.
- Adds real Taobao/Douyin/payment/refund API calls.
- Shows prompt/RAG/vector/tool trace language in operator UI.
- Changes shared contracts without updating Owner 1 docs or notifying others.

---

## Copy-Paste Assignments

### Assignment For Owner 1

```text
You are Owner 1 for smart-cs-agent.

Branch from: codex/wecom-sandbox-after-sales
Create branch: feat/shared-after-sales-contracts

Read:
- docs/team/README.md
- docs/team/owner-1-shared-contracts.md
- docs/superpowers/plans/2026-06-04-wecom-sandbox-team-development.md

Your mission:
Define shared after-sales contracts and seed/data model foundations so all other owners import the same category, risk, automation mode, case, action, and WeCom event schemas.

Only edit your write scope:
- packages/shared/src/after-sales-contracts.ts
- packages/shared/src/wecom-contracts.ts
- packages/shared/src/index.ts
- prisma/schema.prisma
- prisma/seed.ts

Do not edit UI or agent implementation.

Acceptance:
- npm run typecheck --workspace @smart-cs-agent/shared passes.
- Export Zod schemas and TS types.
- Open PR to codex/wecom-sandbox-after-sales.
```

### Assignment For Owner 2

```text
You are Owner 2 for smart-cs-agent.

Branch from: codex/wecom-sandbox-after-sales
Create branch: feat/wecom-sandbox-channel

Read:
- docs/team/README.md
- docs/team/owner-2-wecom-channel.md
- docs/superpowers/plans/2026-06-04-wecom-sandbox-team-development.md

Your mission:
Implement the WeCom sandbox channel endpoint that receives simulated after-sales messages and normalizes them into the shared channel/case event shape.

Only edit your write scope:
- apps/api/src/wecom/*
- apps/api/src/channels/*
- apps/api/src/app.module.ts
- .env.example

Coordinate with Owner 1 contracts. Do not invent new category/risk names.
Do not make real WeCom/Taobao/Douyin network calls.

Acceptance:
- POST /v1/wecom/events accepts the documented payload.
- Response returns normalized event or case summary.
- npm run typecheck --workspace @smart-cs-agent/api passes.
- Open PR to codex/wecom-sandbox-after-sales.
```

### Assignment For Owner 3

```text
You are Owner 3 for smart-cs-agent.

Branch from: codex/wecom-sandbox-after-sales
Create branch: feat/agent-risk-actions

Read:
- docs/team/README.md
- docs/team/owner-3-agent-risk-actions.md
- docs/superpowers/plans/2026-06-04-wecom-sandbox-team-development.md

Your mission:
Build the simulated after-sales decision engine: classify category, determine risk level, choose automation mode, and execute only allowed mock actions.

Only edit your write scope:
- apps/api/src/agent/*
- apps/api/src/risk/*
- apps/api/src/actions/*
- apps/api/src/ops/* only if needed for existing simulated endpoints

Do not edit UI, Prisma schema, or WeCom channel implementation.
High-risk cases must never auto-execute.

Acceptance:
- At least one low-risk, one medium-risk, one high-risk test/fixture.
- Low risk returns auto_execute.
- Medium risk returns human_confirm.
- High risk returns human_takeover.
- npm run typecheck --workspace @smart-cs-agent/api passes.
- npm run lint --workspace @smart-cs-agent/api passes.
- Open PR to codex/wecom-sandbox-after-sales.
```

### Assignment For Owner 4

```text
You are Owner 4 for smart-cs-agent.

Branch from: codex/wecom-sandbox-after-sales
Create branch: feat/operator-workbench

Read:
- docs/team/README.md
- docs/team/owner-4-operator-workbench.md
- docs/superpowers/plans/2026-06-04-wecom-sandbox-team-development.md

Your mission:
Build the operator workbench UI for after-sales cases that need attention. This is not a developer trace screen and not a general chat clone.

Only edit your write scope:
- apps/web/src/app/page.tsx
- apps/web/src/app/globals.css
- apps/web/src/lib/*

Use contract-shaped mock data if backend is not ready.

Required UI behavior:
- Main queue only shows waiting confirmation, customer rejected, human takeover, send failed.
- Auto-resolved cases appear in history/metrics only.
- Hide prompt/RAG/tool/vector/debug wording.
- Use labels like 待确认回复, 接管后回复, 系统已发送, 需人工接管.

Acceptance:
- npm run typecheck --workspace @smart-cs-agent/web passes.
- npm run lint --workspace @smart-cs-agent/web passes.
- Verify 1366x768, 1920x1080, 525x700 layout.
- Include screenshot in PR.
- Open PR to codex/wecom-sandbox-after-sales.
```

### Assignment For Owner 5

```text
You are Owner 5 for smart-cs-agent.

Branch from: codex/wecom-sandbox-after-sales
Create branch: feat/demo-qa-script

Read:
- docs/team/README.md
- docs/team/owner-5-qa-demo.md
- docs/superpowers/plans/2026-06-04-wecom-sandbox-team-development.md

Your mission:
Create the demo and QA evidence so a new teammate can prove the sandbox loop works without real Taobao, Douyin, payment, refund, or production WeCom credentials.

Only edit your write scope:
- docs/demo/wecom-sandbox-demo.md
- docs/demo/wecom-sandbox-payloads/*.json
- tests only if matching setup exists or is added by backend owners

Required scenarios:
1. Address change before shipment.
2. Logistics inquiry.
3. Package damage / coupon compensation.
4. Customer rejects compensation proposal.
5. Refund dispute or complaint escalation.

Acceptance:
- Demo proves auto_execute, human_confirm, human_takeover.
- Includes curl commands or payload files.
- Includes expected category/risk/mode/reply/UI result.
- Open PR to codex/wecom-sandbox-after-sales.
```

---

## Daily Sync Format

Each owner posts:

```text
Owner:
Branch:
Done:
Blocked:
Changed contracts? yes/no
Need review from:
```

If anyone changes shared contracts, stop and notify all owners before continuing.
