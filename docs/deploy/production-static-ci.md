# PR55 Production Static CI Gate

This stage adds the real GitHub Actions workflow that runs the repository's static production gates on pull requests, pushes, and manual dispatch. It is intentionally not a deploy workflow.

The workflow at `.github/workflows/production-static-gates.yml` runs dependency installation, Prisma client generation, API tests, Web tests, production verifier script tests, typecheck, lint, build, and static production/provider verifiers that do not need production secrets, production databases, launch artifacts, live canary URLs, Docker publish access, or provider credentials.

It does not call production APIs, run database migrations against production, does not read GitHub secrets, read secret managers, publish images, sign artifacts, push to registries, deploy traffic, call real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static CI guard locally:

```bash
npm run verify:production-static-ci
```

The verifier checks that the workflow:

- Uses `permissions: contents: read`.
- Runs on `pull_request`, `push`, and `workflow_dispatch`.
- Uses Node.js 24 and `npm ci`.
- Runs API/Web tests, production verifier script tests, typecheck, lint, build, and the static production/provider gates.
- Treats workflow `run:` commands as an exact allowlist, so Docker-backed, production-bound, demo smoke, or ad hoc shell/network commands cannot satisfy the static gate by substring.
- Avoids production-bound commands such as `verify:production-readiness`, `verify:production-canary`, `verify:merchant-launch-preflight`, `db:migrate:deploy`, Docker publish/login commands, `:safe` artifact commands, and any `secrets.*` reference.

## Workflow Boundary

Keep environment-specific launch checks out of this workflow. These must stay in the controlled launch window where the required sanitized artifacts and production environment inputs are injected:

- `npm run verify:production-readiness`
- `npm run verify:production-canary`
- `npm run verify:merchant-launch-preflight:safe`
- `npm run generate:launch-evidence:safe`
- `npm run verify:launch-evidence-archive:safe`
- `npm run verify:launch-manifest:safe`
- `npm run verify:production-release-provenance:safe`
- `npm run verify:production-release-evidence:safe`
- `npm run verify:production-change-approval:safe`
- `npm run verify:production-launch-binding:safe`
- `npm run db:migrate:deploy`

## Verification

Run:

```bash
npm run verify:production-static-ci
npm run verify:production-launch
```

This gate proves that every PR exercises the static safety net. It still does not prove real registry publish, real image signing, real production deployment, live canary health, provider network execution, provider writes, or customer-visible replies.
