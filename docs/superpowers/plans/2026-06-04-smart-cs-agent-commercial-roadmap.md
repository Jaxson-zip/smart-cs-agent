# Smart CS Agent Commercial Roadmap

## Current Truth

The product has completed the V1.1 WeCom sandbox proof loop.

The next target is V1.2: sandbox data, audit trail, configurable rules, and real-shaped adapters without real customer sendback.

V2.0 should only be used after the product has real multi-tenant operations, permissions, rule management, audit, billing, and production-ready reliability. A simulated UI plus reserved APIs is not V2.0.

## Version Gates

### V1.0 - Prototype And Technical Base

- Next.js operator workbench
- NestJS API base
- WebSocket base
- Prisma/Postgres setup
- Shared TypeScript contracts
- Simulated message -> decision -> action -> reply flow

### V1.1 - Complete Simulated Business Loop

- Status: completed through WeCom sandbox validation.
- Compensation refusal flow
- Human handoff queue
- Processing history
- Channel capability model
- Operator-only UI language
- Responsive layout across small, medium, desktop, and ultrawide screens

Exit criteria:
- A support operator can handle simulated after-sales cases without seeing developer/internal terms.
- Completed cases do not clutter the active queue.
- Customer rejection, high-risk cases, and channel failures can enter handoff.

### V1.2 - Sandbox Data Without Real Sendback

- Ingest sandbox channel messages
- Read sandbox order data
- Execute simulated actions through real-shaped adapter interfaces
- No real customer reply or real platform mutation

Exit criteria:
- The backend can receive channel-shaped payloads and produce case decisions.
- Operators can validate generated replies and actions safely.

### V1.3 - One Real Channel Closed Loop

- Connect one real channel first, preferably Taobao or Douyin
- Receive real messages
- Read real order state
- Execute one low-risk action
- Send response back to the original channel

Exit criteria:
- One production shop can run a limited allowlist of low-risk cases.
- Retries, idempotency, and failure handoff are implemented.

### V2.0 - Commercial Multi-Tenant Product

- Multi-merchant tenancy
- Role-based permissions
- Rule management backend
- Audit and quality review
- Billing and plan limits
- Channel authorization center
- Reliability controls: queue, retries, idempotency, dead-letter handling, alerts
- Admin, supervisor, and operator views separated

Exit criteria:
- Multiple merchants can safely use the system at the same time.
- Admins can configure rules without code changes.
- Every automated customer-visible action is auditable.
- Billing and quota controls are enforced.
