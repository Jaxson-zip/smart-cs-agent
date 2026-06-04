# WeCom Sandbox After-Sales Team Development Plan

> **For teammates:** this branch is for building the first testable commercial loop. Do not start by polishing UI. Build the event -> case -> decision -> action -> reply loop first.

**Goal:** Build a WeCom-based sandbox channel that can simulate Taobao/Douyin after-sales messages, classify all common after-sales cases, auto-handle low-risk cases, and route higher-risk cases to human review.

**Branch:** `codex/wecom-sandbox-after-sales`

**Product Definition:** Full after-sales intake, risk-graded automation.

**Market Target:** Taobao/Tmall and Douyin merchants.

**Testing Channel:** WeCom first. Real Taobao/Douyin integrations are not part of this phase.

---

## 1. Product Boundary

This product is not a general chat tool.

The first commercial proof is:

```text
Every after-sales message can enter the system.
Low-risk cases are handled by Agent automatically.
Medium-risk cases need operator confirmation.
High-risk cases are routed to human or supervisor takeover.
Every customer-visible action has an audit trail.
```

Supported after-sales categories in this phase:

- Address change
- Logistics inquiry or delay
- Package damage / small compensation
- Refund / return request
- Customer rejects compensation proposal
- Complaint / escalation risk
- Unknown or incomplete order context

Automation policy:

- Auto-execute: low-risk address change before shipment, logistics inquiry, low-value coupon compensation.
- Human confirm: compensation close to limit, unclear order match, customer rejects first proposal.
- Human takeover: refund dispute, cash refund, complaint threat, platform dispute, low confidence.

---

## 2. Team Roles

### Owner 0: Coordinator / Integrator

Responsible for:

- Keeping this plan current.
- Reviewing PRs from all owners.
- Ensuring shared contracts stay stable.
- Running final integration tests.
- Deciding whether wording belongs in operator UI, customer reply, audit logs, or developer logs.

Do not let multiple people redesign the same UI or API contract independently.

### Owner 1: Shared Contracts And Domain Model

Write scope:

- `packages/shared/src/wecom-contracts.ts`
- `packages/shared/src/after-sales-contracts.ts`
- `packages/shared/src/index.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`

Deliverables:

- Unified incoming channel event schema.
- Unified after-sales case schema.
- Category enum.
- Risk level enum.
- Automation outcome enum.
- Action request/result schema.
- Seed data for Taobao/Douyin-like orders, customers, policies, and conversations.

Must define these concepts:

```ts
AfterSalesCategory =
  | "address_change"
  | "logistics"
  | "damage_compensation"
  | "refund_return"
  | "compensation_rejected"
  | "complaint_escalation"
  | "unknown";

RiskLevel = "low" | "medium" | "high";

AutomationMode =
  | "auto_execute"
  | "human_confirm"
  | "human_takeover";
```

Acceptance:

- `npm run typecheck --workspace @smart-cs-agent/shared` passes.
- All downstream owners can import the contracts from `@smart-cs-agent/shared`.

### Owner 2: Backend WeCom Sandbox Channel

Write scope:

- `apps/api/src/wecom/*`
- `apps/api/src/channels/*`
- `apps/api/src/app.module.ts`
- `.env.example`

Deliverables:

- `POST /v1/wecom/events` for sandbox inbound events.
- `POST /v1/wecom/webhook/send` mock outbound endpoint or provider wrapper.
- Verification placeholder for future WeCom API mode.
- Normalizer that converts WeCom-shaped input to shared channel event.
- Service method to send a reply back through a provider interface.

Important distinction:

- Ordinary WeCom group robot webhook mainly sends messages out.
- Receiving messages needs an API-mode callback style endpoint.
- In this phase, implement the callback shape and a local sandbox payload. Do not require real WeCom credentials to test.

Acceptance:

- A local curl request can create an inbound customer message.
- Backend logs or response show a normalized channel event.
- No real external network call is required in tests.

### Owner 3: Agent Classification, Risk, And Actions

Write scope:

- `apps/api/src/agent/*`
- `apps/api/src/risk/*`
- `apps/api/src/actions/*`
- `apps/api/src/ops/*` only if integrating with existing simulated ops endpoints.

Deliverables:

- Classifier for all supported after-sales categories.
- Risk decision service.
- Action planner.
- Mock action executors:
  - Change address
  - Query logistics
  - Issue coupon compensation
  - Create human handoff
  - Create supervisor review
- Reply generator with customer-facing copy.

Rules:

- Agent must not directly mutate orders or send customer messages.
- Agent produces structured decisions.
- Action services execute only if risk policy allows it.
- High-risk cases must never auto-execute.

Acceptance:

- Test cases cover at least one low, medium, and high risk case.
- Low risk returns `auto_execute`.
- Medium risk returns `human_confirm`.
- High risk returns `human_takeover`.

### Owner 4: Operator Workbench UI

Write scope:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/lib/*`

Deliverables:

- One-screen operator workbench.
- Main queue shows only items needing attention:
  - Waiting confirmation
  - Customer rejected
  - Human takeover
  - Send failed
- Auto-resolved items appear only in history/metrics, not the main queue.
- UI hides developer terms such as prompt, RAG, vector DB, tool trace.
- Operator sees:
  - Customer message
  - Matched order
  - Category
  - Risk level
  - Agent conclusion
  - Reply preview if human confirmation is needed
  - Actions available to operator

Responsive rule:

- The page itself should avoid vertical page scrolling on desktop.
- Internal panels may scroll.
- On narrow screens, collapse side context first, not the main work area.

Acceptance:

- At 1366x768, core workflow is visible without page-level vertical scrolling.
- At 1920x1080, layout does not become sparse or stretched.
- At 525x700, no horizontal overflow.
- No labels like "AI 建议回复"; use "待确认回复", "接管后回复", or "系统已发送".

### Owner 5: Integration QA And Demo Script

Write scope:

- `docs/demo/wecom-sandbox-demo.md`
- `apps/api/test/*` or nearest local test pattern
- `apps/web/src/app/*.test.*` if test setup exists

Deliverables:

- End-to-end demo script:
  1. Send address change event.
  2. Send logistics inquiry event.
  3. Send damage compensation event.
  4. Send customer rejected compensation event.
  5. Send complaint escalation event.
- Expected system result for each scenario.
- Manual QA checklist.
- Regression checklist for desktop and mobile widths.

Acceptance:

- A new teammate can run the demo from the documentation.
- The demo proves all three modes: auto-execute, human-confirm, human-takeover.

---

## 3. Git Workflow

Base branch:

```bash
git switch codex/wecom-sandbox-after-sales
git pull --ff-only origin codex/wecom-sandbox-after-sales
```

Each teammate creates a personal feature branch:

```bash
git switch -c feat/<owner-area>
```

Examples:

```bash
feat/shared-after-sales-contracts
feat/wecom-sandbox-channel
feat/agent-risk-actions
feat/operator-workbench
feat/demo-qa-script
```

PR target:

```text
codex/wecom-sandbox-after-sales
```

Rules:

- Do not PR directly to `main`.
- Do not modify another owner's files without coordination.
- Do not reformat unrelated files.
- If contracts change, notify all owners before merging.
- Keep commits focused.

Recommended commit format:

```bash
feat(shared): add after-sales contracts
feat(api): add wecom sandbox channel
feat(agent): classify after-sales risk
feat(web): add operator workbench queue
test(demo): document wecom sandbox flow
```

---

## 4. Shared API Shape

Inbound sandbox event:

```http
POST /v1/wecom/events
Content-Type: application/json
```

```json
{
  "source": "wecom_sandbox",
  "merchantId": "merchant_demo_001",
  "channel": "taobao",
  "externalConversationId": "wecom-room-001",
  "externalMessageId": "msg-001",
  "senderName": "林女士",
  "text": "鞋盒压坏了，鞋子没问题，但是送人的，能不能补偿一下？",
  "receivedAt": "2026-06-04T10:00:00.000Z"
}
```

Normalized case result:

```json
{
  "caseId": "case_001",
  "category": "damage_compensation",
  "riskLevel": "low",
  "automationMode": "auto_execute",
  "customerReply": "非常抱歉影响您的送礼体验。我们可以为您补偿 30 元无门槛券，稍后会发放到您的账户。",
  "actions": [
    {
      "type": "issue_coupon",
      "status": "success",
      "amount": 30
    }
  ]
}
```

---

## 5. Definition Of Done

This phase is done when:

- WeCom sandbox inbound event can create an after-sales case.
- The backend classifies every supported category.
- The backend returns low/medium/high risk decisions.
- Low-risk cases can complete with mock action and mock reply.
- Medium-risk cases appear in the operator queue for confirmation.
- High-risk cases appear in the takeover queue.
- The operator UI no longer looks like a developer trace/debug screen.
- Auto-completed cases do not clutter the active queue.
- Demo documentation can be followed by a new teammate.
- `npm run typecheck --workspaces --if-present` passes.
- `npm run lint --workspaces --if-present` passes.

---

## 6. What Not To Build Yet

- Real Taobao API.
- Real Douyin API.
- Real payment/refund execution.
- Real WeCom production credential verification.
- Billing.
- Multi-tenant permission UI.
- Full rules admin.
- Vector database UI.
- Prompt debugging UI for operators.

Keep the adapter interfaces ready, but do not build these in this phase.
