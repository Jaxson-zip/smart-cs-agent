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

## Scenarios

| File | Expected Category | Expected Risk | Expected Mode | UI Result |
| --- | --- | --- | --- | --- |
| `01-address-change-low.json` | `address_change` | `low` | `auto_execute` | Goes to auto-resolved history |
| `02-logistics-inquiry-low.json` | `logistics` | `low` | `auto_execute` | Goes to auto-resolved history |
| `03-damage-compensation-low.json` | `damage_compensation` | `low` | `auto_execute` | Goes to auto-resolved history |
| `04-compensation-rejected-medium.json` | `compensation_rejected` | `medium` | `human_confirm` | Appears as `客户不接受` / `待确认回复` |
| `05-complaint-escalation-high.json` | `complaint_escalation` | `high` | `human_takeover` | Appears as `需人工接管` |

## Manual QA Checklist

- [ ] API accepts all five payload files as valid JSON.
- [ ] Response includes `afterSalesCase`.
- [ ] Low-risk cases return `auto_execute`.
- [ ] Medium-risk customer rejection returns `human_confirm`.
- [ ] High-risk complaint returns `human_takeover`.
- [ ] Operator UI uses normal product language: `待确认回复`, `接管后回复`, `系统已发送`, `需人工接管`.
- [ ] Operator UI does not show prompt, RAG, vector DB, or tool trace language.
- [ ] 1366x768: no page-level vertical scroll for the core workflow.
- [ ] 1920x1080: layout remains dense and readable.
- [ ] 525x700: no horizontal overflow.
