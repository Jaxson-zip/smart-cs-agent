# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR7 - Operator Identity And RBAC Baseline

Status: in progress

PR7 adds the first production-grade identity/RBAC baseline on top of the PR6 session boundary. The Web BFF can expose the current sanitized operator profile, derive role permissions, and let the workbench adapt actions based on those permissions.

### PR7 Scope

- Add `GET /api/operator/me` to return the current sanitized operator profile.
- Derive role permissions from `admin`, `operator`, and `viewer`.
- Include permissions in login and current-session responses without exposing passwords or API keys.
- Show the current operator identity in the workbench.
- Disable confirm/takeover actions for read-only operators.
- Document the role and permission boundary.

### Out Of Scope For PR7

- Real Taobao/Douyin callbacks.
- Real payment/refund/coupon execution.
- Full SSO/OIDC, password hashing, account management UI, persisted permission policies, and billing.
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
- [x] PR4 public API surface lockdown.
- [x] PR5 server-side operator BFF.
- [x] PR6 operator session boundary.
- [ ] PR7 operator identity/RBAC baseline.
- [ ] PR8 production-grade identity provider or account service.

## Verification Gate

Do not claim PR7 operator identity/RBAC baseline complete until these pass:

- `npm.cmd run db:generate`
- `npm.cmd run test --workspace @smart-cs-agent/api`
- `npm.cmd run test --workspace @smart-cs-agent/web`
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
| 2026-06-06 | Web `/api/chat` and `/api/db` exposed historical mock order data/actions | PR4 disables those legacy demo APIs by default behind `ENABLE_LEGACY_WEB_DEMO_API` |
| 2026-06-06 | Browser carried `NEXT_PUBLIC_OPERATOR_API_KEY` for API access | PR5 moves operator API access to server-side `/api/operator/*` BFF routes using `OPERATOR_API_KEY` |
| 2026-06-06 | Server-side BFF still used one global operator key and could not identify the logged-in operator | PR6 adds HttpOnly signed operator sessions and derives API key/tenant/operator from `OPERATOR_SESSION_ACCOUNTS` |
| 2026-06-06 | Review found PR6 could be misconfigured with placeholder session secrets, default demo accounts, and fallback mock cases after real API failures | PR6 now rejects unsafe production session config and only shows fallback cases when `NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=true` |
| 2026-06-06 | The Web workbench could not ask who the current operator is after reload and had no role-derived permissions | PR7 adds `/api/operator/me`, sanitized profiles, and role permission mapping |
