# WeCom Sandbox After-Sales Demo

This demo proves the first closed loop:

```text
WeCom-shaped message
-> normalized channel event
-> after-sales category
-> risk decision
-> automation mode
-> mock action / human queue result
```

No real Taobao, Douyin, payment, refund, or production WeCom credentials are required.

## Start Services

API:

```bash
npm run start --workspace @smart-cs-agent/api
```

Web:

```bash
npm run dev --workspace @smart-cs-agent/web -- --port 3100
```

API runs on `http://localhost:4100`.

## Send A Scenario

Windows PowerShell / CMD:

```bash
curl.exe -X POST http://localhost:4100/v1/wecom/events ^
  -H "Content-Type: application/json" ^
  --data-binary "@docs/demo/wecom-sandbox-payloads/03-damage-compensation-low.json"
```

Expected response shape:

```json
{
  "status": "received",
  "normalizedEvent": {},
  "afterSalesCase": {
    "category": "damage_compensation",
    "riskLevel": "low",
    "automationMode": "auto_execute",
    "actions": []
  }
}
```

## V1.2 Integration Features

### Audit Trail
Each case now persists a full audit trail of decisions. To verify:
1. Click **"显示审计"** on any case in the Operator Workbench.
2. Verify you see logs for `event_received`, `category_decision`, `risk_decision`, and `action_executed`.

### Configurable Rules
Rules are now stored in the database. To verify rule effect:
1. View current rules: `GET http://localhost:4100/v1/rules/demo_tenant`
2. Rules include `couponCompensationLimit` (default 50) and `highRiskKeywords`.
3. Try sending a `damage_compensation` scenario with an amount > 50 to see it shift from `auto_execute` to `human_confirm`.

## Scenarios

| File | Expected Category | Expected Risk | Expected Mode | UI Result | Audit Trail Check |
| --- | --- | --- | --- | --- | --- |
| `01-address-change-low.json` | `address_change` | `low` | `auto_execute` | Goes to auto-resolved history | `event_received` -> `action_executed` |
| `02-logistics-inquiry-low.json` | `logistics` | `low` | `auto_execute` | Goes to auto-resolved history | `event_received` -> `action_executed` |
| `03-damage-compensation-low.json` | `damage_compensation` | `low` | `auto_execute` | Goes to auto-resolved history | `event_received` -> `action_executed` |
| `04-compensation-rejected-medium.json` | `compensation_rejected` | `medium` | `human_confirm` | Appears as `客户不接受` / `待确认回复` | `risk_decision`: medium |
| `05-complaint-escalation-high.json` | `complaint_escalation` | `high` | `human_takeover` | Appears as `需人工接管` | `risk_decision`: high |

## Manual QA Checklist

- [ ] API accepts all five payload files as valid JSON.
- [ ] Response includes `afterSalesCase`.
- [ ] Low-risk cases return `auto_execute`.
- [ ] Medium-risk customer rejection returns `human_confirm`.
- [ ] High-risk complaint returns `human_takeover`.
- [ ] **Audit Panel** correctly displays the step-by-step decision trail.
- [ ] **Rules API** returns configurable sandbox rules.
- [ ] Operator UI uses normal product language: `待确认回复`, `接管后回复`, `系统已发送`, `需人工接管`.
- [ ] Operator UI does not show prompt, RAG, vector DB, or tool trace language.
- [ ] 1366x768: no page-level vertical scroll for the core workflow.
- [ ] 1920x1080: layout remains dense and readable.
- [ ] 525x700: no horizontal overflow.
