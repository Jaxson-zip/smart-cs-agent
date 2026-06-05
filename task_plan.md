# Production Readiness Plan

Goal: move smart-cs-agent from V1.2 sandbox proof toward a deployable commercial service through small, verifiable production-readiness slices.

## Current Stage: PR1 - Deployable Sandbox

Status: complete

PR1 makes the current WeCom sandbox loop deployable and testable in a real environment without connecting real Taobao/Douyin yet.

### Scope

- Backend readiness: config validation, DB health/readiness endpoint, safer startup behavior.
- CI gate: generate Prisma client, test, typecheck, lint, build.
- Demo/ops: smoke script checks DB-backed endpoints and documents exact startup path.
- Frontend: clear API disconnected state and no developer-facing terms.

### Out Of Scope For PR1

- Real Taobao/Douyin callbacks.
- Real payment/refund/coupon execution.
- Authentication and billing.
- Production WeCom credentials.

## Phases

- [x] V1.2 sandbox loop hardened and pushed.
- [x] PR1 backend readiness and config validation.
- [x] PR1 CI and deployment hygiene.
- [x] PR1 frontend production-state polish.
- [x] PR1 final verification and push.

## Verification Gate

Do not claim PR1 complete until these pass:

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
