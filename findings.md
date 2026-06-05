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
