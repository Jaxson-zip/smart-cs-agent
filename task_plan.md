# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR3 - Operator API Key Guard

Status: complete

PR3 turns the PR2 tenant header boundary into a minimal protected operator boundary for sandbox and pre-production demos.

### PR3 Scope

- Support `OPERATOR_API_KEYS` as JSON-configured operator credentials.
- Accept `Authorization: Bearer <key>` or `x-api-key` for operator-facing APIs.
- Derive tenant, operator, and role from the matched key instead of trusting browser-supplied identity.
- Block mismatched `x-tenant-id` headers with 403.
- Keep local insecure header fallback only for sandbox development.
- Reject production operator access when no key is configured unless `ALLOW_INSECURE_OPERATOR_HEADERS=true` is explicitly set.
- Update Web, smoke script, and docs to use the sandbox key.
- Protect legacy `/v2/*` operator APIs with the same request context.
- Protect `/v1/wecom/webhook/send` and verify body `merchantId` matches the request tenant.
- Enforce `WECOM_SANDBOX_ENABLED` so production does not accidentally expose the sandbox event intake.

### Out Of Scope For PR3

- Real Taobao/Douyin callbacks.
- Real payment/refund/coupon execution.
- Full authentication, SSO, JWT, sessions, RBAC UI, and billing.
- Production WeCom credentials.

## Phases

- [x] V1.2 sandbox loop hardened and pushed.
- [x] PR1 backend readiness and config validation.
- [x] PR1 CI and deployment hygiene.
- [x] PR1 frontend production-state polish.
- [x] PR1 final verification and push.
- [x] PR2 tenant request context and API filtering.
- [x] PR2 tests, docs, verification, and push.
- [x] PR3 operator API key guard.
- [x] PR3 docs, verification, and push.
- [ ] PR4 public API surface lockdown.

## Verification Gate

Do not claim PR3 operator API key guard complete until these pass:

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
| 2026-06-06 | `x-tenant-id` can be spoofed by any browser/client | PR3 adds sandbox operator API keys and blocks tenant mismatch |
| 2026-06-06 | Public browser key is not real commercial authentication | Documented it as sandbox/pre-production only; real production still needs session/JWT/BFF |
| 2026-06-06 | Legacy `/v2/*` and `/v1/wecom/webhook/send` were outside the new operator guard | PR3 now requires request context for those operator-facing APIs |
| 2026-06-06 | `WECOM_SANDBOX_ENABLED` existed but did not gate the event intake | PR3 now blocks `/v1/wecom/events` when the sandbox endpoint is disabled or production has not explicitly enabled it |
