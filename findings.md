# Findings

## 2026-06-06

- The V1.2 branch is clean at commit `04469dd`.
- API currently has a basic `/health` endpoint only; it does not prove database connectivity.
- `.env.example` includes `DATABASE_URL`, `WEB_ORIGIN`, `PORT`, and `WECOM_SANDBOX_ENABLED`, but runtime env validation is not centralized.
- There is no `.github/workflows` directory, so CI is not yet enforcing tests/typecheck/lint/build.
- Full DB smoke success path could not be run because Docker/Postgres is not currently running in this environment.
- Frontend fallback state is visually acceptable and avoids developer terms in the rendered UI at 1366x768 and 390px widths.
- PR1 adds `/health/ready` for database readiness while keeping `/health` as lightweight liveness.
- PR1 adds a GitHub Actions quality gate for generate, test, typecheck, lint, and build.
- The API config loader now searches upward for `.env` and lets explicit environment variables override file defaults.
- `.env` loading is disabled by default when `NODE_ENV=production` or `CI=true`; production should use real environment variables from the deploy platform.
- `PrismaService` no longer connects during module initialization; DB availability is reported by `/health/ready` instead of blocking liveness.
- Operator-facing APIs need tenant context before real commercial use. PR2 uses `x-tenant-id` and `x-operator-id` headers as the tenant context boundary until full auth is implemented.
- Agent classification and risk evaluation must use the event/request tenant's rules, not the default demo tenant. PR2 passes tenant context through AgentService, ClassifierService, and RiskService.
- PR2's tenant header boundary is still spoofable. PR3 adds `OPERATOR_API_KEYS` so sandbox/pre-production operator APIs can derive tenant/operator/role from a configured key and reject mismatched tenant headers.
- Browser-public operator keys are not secure production auth. PR5 removes `NEXT_PUBLIC_OPERATOR_API_KEY` from the operator workbench path and moves API access behind a server-side BFF, but a commercial launch still needs real sessions/JWT and role enforcement.
- Malformed `OPERATOR_API_KEYS` must fail closed instead of falling back to insecure tenant headers.
- Legacy `/v2/*` operation endpoints and `/v1/wecom/webhook/send` are operator-facing and must not stay outside the PR3 guard.
- `WECOM_SANDBOX_ENABLED` should be a real runtime gate. In production, the sandbox event intake should be disabled unless explicitly enabled for a controlled demo environment.
- Web `/api/chat` and `/api/db` are historical demo routes. They are not used by the current operator workbench and should stay disabled by default because they expose mock order data and mutation-like tools.
- Web operator data now flows through `/api/operator/*` BFF routes. PR6 protects case data with a signed HttpOnly operator session and derives operator secrets from server-side `OPERATOR_SESSION_ACCOUNTS`; the browser should not receive operator secrets.
- The PR6 login boundary is still a sandbox/commercial-readiness step, not final identity. True production needs SSO/OIDC or a dedicated account service, password hashing, RBAC administration, and session revocation.
- Offline demo cases must not mask real authorization or API failures. PR6 only enables fallback cases when `NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=true`; default deployable environments show an error state for non-401 sync failures.
- PR7 introduces a fixed role-to-permission map in the Web BFF. This is useful for product behavior and tests, but persisted permission policies and audit-backed role changes still belong in a later identity/account-service slice.
