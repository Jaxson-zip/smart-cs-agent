# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR2 - Tenant Context Baseline

Status: complete

PR2 starts turning the deployable sandbox into a SaaS-shaped system by making tenant context explicit on operator-facing APIs.

### PR2 Scope

- Require `x-tenant-id` on operator-facing APIs that read cases or rules.
- Filter cases by merchant/tenant to prevent cross-tenant data exposure.
- Prevent `GET /v1/rules/:tenantId` from reading a tenant different from the request context.
- Keep WeCom sandbox webhook body-based merchant routing intact.
- Use the webhook/request tenant when loading classification and risk rules.
- Update frontend and smoke scripts to send explicit demo tenant headers.

### Out Of Scope For PR2

- Real Taobao/Douyin callbacks.
- Real payment/refund/coupon execution.
- Full authentication, SSO, JWT, sessions, and billing.
- Production WeCom credentials.

## Phases

- [x] V1.2 sandbox loop hardened and pushed.
- [x] PR1 backend readiness and config validation.
- [x] PR1 CI and deployment hygiene.
- [x] PR1 frontend production-state polish.
- [x] PR1 final verification and push.
- [x] PR2 tenant request context and API filtering.
- [x] PR2 tests, docs, verification, and push.

## Verification Gate

Do not claim PR2 tenant context complete until these pass:

- `npm.cmd run db:generate`
- `npm.cmd run test --workspace @smart-cs-agent/api`
- `npm.cmd run typecheck --workspaces --if-present -- --pretty false`
- `npm.cmd run lint --workspaces --if-present -- --max-warnings=0`
- `npm.cmd run build --workspaces --if-present`
- `node --check scripts/demo/wecom-sandbox-smoke.mjs`
- Browser desktop and narrow viewport checks for no horizontal overflow and no developer terms.

## Errors Encountered

| Time | Error | Resolution |
| --- | --- | --- |
| 2026-06-06 | Docker/Postgres not running locally, DB smoke success path unavailable | PR1 will add readiness checks and keep DB smoke instructions explicit |
| 2026-06-06 | WebSocket gateway still read `WEB_ORIGIN` directly | Updated it to use the shared API config loader |
| 2026-06-06 | Prisma connected during module init, making `/health` unavailable when DB was down | Removed startup connect and made `/health/ready` own DB availability |
| 2026-06-06 | Full config loader in WebSocket decorator required `DATABASE_URL` at import time | Split `loadWebOrigin()` so WebSocket CORS only validates `WEB_ORIGIN` |
| 2026-06-06 | `.env` fallback could silently affect CI/production | Disabled default `.env` loading when `CI=true` or `NODE_ENV=production` |
| 2026-06-06 | `/v1/cases` returned all merchants and `/v1/rules/:tenantId` could read arbitrary tenants | PR2 adds explicit tenant request context and tenant filtering |
| 2026-06-06 | Agent rules still defaulted to `demo_tenant` during webhook decisions | Passed tenant ID into classification and risk evaluation |
