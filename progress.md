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
- Started PR4 public API surface lockdown.
- Disabled legacy Web demo APIs `/api/chat` and `/api/db` by default behind `ENABLE_LEGACY_WEB_DEMO_API`.
- Added Web route tests and a deployment API surface inventory.
- Started PR5 server-side operator BFF.
- Added `/api/operator/cases`, `/api/operator/cases/:id`, and `/api/operator/readiness` Web BFF routes.
- Updated the operator workbench client to call same-origin BFF routes instead of direct API URLs with browser-public keys.
- Tightened the mobile workbench layout back to a single viewport with internal scrolling after the BFF fallback path exposed page-level scroll.
- Started PR6 operator session boundary.
- Added signed HttpOnly operator sessions, `/api/operator/login`, and `/api/operator/logout`.
- Changed Web BFF case list/detail routes to require a session and derive API key, tenant ID, and operator ID from server-side account config.
- Added a Web login state so unauthenticated operators do not see fallback demo cases.
- Addressed final review findings: production rejects placeholder/short session secrets and default demo accounts, login rejects malformed JSON payloads with 400, production BFF fails closed without `API_URL`, and Web no longer shows offline demo cases unless explicitly enabled.
- Started PR7 operator identity/RBAC baseline.
- Added `/api/operator/me` tests and implementation for sanitized current-operator profiles.
- Added role-derived permissions to login/current-session responses and updated the workbench to show the current operator and disable confirm/takeover for read-only accounts.
