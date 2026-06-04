# WeCom Sandbox After-Sales Demo Guide

This guide walks you through the full after-sales automation loop using the WeCom sandbox channel.

## Prerequisites

1.  **Start the API Server:**
    ```bash
    npm run dev:api
    ```
    The API should be running at `http://localhost:4100`.

2.  **Start the Web Workbench:**
    ```bash
    npm run dev:web
    ```
    The workbench should be accessible at `http://localhost:3000`.

---

## Demo Scenarios

### 1. Low Risk: Address Change (Auto-Execute)
*   **Input:** `docs/demo/wecom-sandbox-payloads/01-address-change-low.json`
*   **Action:**
    ```bash
    Invoke-RestMethod -Uri "http://localhost:4100/v1/wecom/events" -Method Post -ContentType "application/json" -InFile "docs/demo/wecom-sandbox-payloads/01-address-change-low.json"
    ```
*   **Expected Result:**
    *   Category: `address_change`
    *   Risk: `low`
    *   Mode: `auto_execute`
    *   Workbench: This case should **NOT** appear in the active queue (it's auto-resolved).

### 2. Low Risk: Logistics Inquiry (Auto-Execute)
*   **Input:** `docs/demo/wecom-sandbox-payloads/02-logistics-inquiry-low.json`
*   **Expected Result:**
    *   Category: `logistics`
    *   Risk: `low`
    *   Mode: `auto_execute`

### 3. Medium Risk: Damage Compensation (Human Confirm)
*   **Input:** `docs/demo/wecom-sandbox-payloads/03-damage-compensation-low.json`
*   **Action:** Send the event via curl/Postman.
*   **Expected Result:**
    *   Category: `damage_compensation`
    *   Risk: `low`/`medium` (depending on policy)
    *   Workbench: Case appears in the queue with label **"待确认回复"**.
    *   Interaction: Operator can see the suggested reply and click "确认发送".

### 4. Medium Risk: Customer Rejects Proposal (Human Confirm)
*   **Input:** `docs/demo/wecom-sandbox-payloads/04-compensation-rejected-medium.json`
*   **Expected Result:**
    *   Category: `compensation_rejected`
    *   Risk: `medium`
    *   Workbench: Case appears with label **"客户拒绝"**.
    *   Interaction: Operator should see instructions for a second round of negotiation.

### 5. High Risk: Complaint Escalation (Human Takeover)
*   **Input:** `docs/demo/wecom-sandbox-payloads/05-complaint-escalation-high.json`
*   **Expected Result:**
    *   Category: `complaint_escalation`
    *   Risk: `high`
    *   Mode: `human_takeover`
    *   Workbench: Case appears with label **"需人工接管"** or **"需主管审核"**.
    *   Interaction: "确认发送" button is disabled; operator must click "接管" to reply.

---

## Manual QA Checklist

- [ ] API successfully normalizes WeCom payloads.
- [ ] Agent correctly classifies all 5 scenarios.
- [ ] Low-risk cases are hidden from the active workbench queue.
- [ ] High-risk cases force human takeover.
- [ ] UI labels match `待确认回复`, `接管后回复`, `系统已发送`, `需人工接管`.
- [ ] Responsive test: No horizontal scroll at 525px width.
- [ ] Responsive test: No page-level vertical scroll at 1366x768.
