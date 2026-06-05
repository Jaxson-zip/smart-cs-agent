# Progress

## 2026-06-06

- Created production-readiness goal for smart-cs-agent.
- Started PR1: deployable sandbox hardening.
- Created persistent planning files: `task_plan.md`, `findings.md`, `progress.md`.
- Dispatched backend readiness, CI/Ops, and frontend readiness workers.
- Integrated backend readiness, GitHub Actions CI, production readiness docs, and frontend API disconnected state.
- Unified WebSocket CORS configuration through the API config loader.
- Changed Prisma startup behavior to lazy DB connection so liveness and readiness remain separate.
- Fixed final review findings by splitting `loadWebOrigin()` from full API config and constraining `.env` loading in CI/production.
- Final PR1 verification passed: db generate, API tests, typecheck, lint, build, smoke syntax, browser layout checks, and unreachable API smoke error path.
- Started PR2 tenant context baseline.
- Added request context parsing and tenant filtering for cases/rules APIs.
- Updated frontend API client and smoke script to send explicit demo tenant/operator headers.
- Passed tenant context through WeCom event handling into Agent classification/risk rules.
- Final PR2 verification passed: API tests, typecheck, lint, db generate, build, smoke syntax, unreachable API smoke error path, and browser layout checks.
- Started PR3 operator API key guard.
- Added `OPERATOR_API_KEYS` parsing, Bearer/`x-api-key` support, tenant mismatch blocking, and production default rejection for insecure operator headers.
- Updated Web and smoke script to send the sandbox operator key when configured.
- Updated demo and production-readiness docs to prefer Bearer key access for operator-facing APIs.
- Extended PR3 guard coverage to legacy `/v2/*` operator endpoints and `/v1/wecom/webhook/send`.
- Added a runtime gate for `/v1/wecom/events` through `WECOM_SANDBOX_ENABLED`.
- Changed insecure operator header fallback to default `false` in config and `.env.example`.
