# PR47 Production Deployment Artifacts

This stage adds checked deployment artifacts for a controlled self-hosted or platform-managed production rollout. It does not enable real refunds, address changes, coupons, logistics edits, provider writes, provider payload reads, or customer-visible replies.

## PR48 Production Image Build Gate

The Dockerfiles introduced here are now covered by `npm run verify:production-image-builds`. CI environments with Docker daemon access should run `npm run verify:production-image-builds:docker` from `docs/deploy/production-image-build.yml.example` to build the API and Web images without publishing them.

## PR49 Production Container Runtime Smoke Gate

Built images are now covered by `npm run verify:production-container-smoke`. Docker-enabled CI should run `npm run verify:production-container-smoke:docker` from `docs/deploy/production-container-smoke.yml.example` after the image build gate to prove the API and Web production containers start without publishing images or calling real channels.

## PR50 Production Image Security Evidence Gate

Built and smoke-tested images are now covered by `npm run verify:production-image-security`. Docker-enabled CI should run `npm run verify:production-image-security:docker` from `docs/deploy/production-image-security.yml.example` after container smoke to generate SBOM and vulnerability evidence without publishing images, reading deployment secrets, or calling real channels.

## PR51 Production Release Provenance

Release provenance and promotion readiness are now covered by `npm run verify:production-release-provenance`. Release CI should run `npm run verify:production-release-provenance:safe` from `docs/deploy/production-release-provenance.yml.example` after image security evidence is generated, using a sanitized provenance bundle instead of registry credentials or deployment secrets.

## Artifacts

- `apps/api/Dockerfile`: builds the Nest API from the workspace, generates the Prisma client, runs as the non-root `node` user, exposes port `4100`, disables sandbox/demo defaults, and health-checks `GET /health`.
- `apps/web/Dockerfile`: builds the Next.js operator workbench with `output: "standalone"`, runs as the non-root `node` user, exposes port `3000`, disables offline/legacy demo defaults, and health-checks the server-side readiness proxy.
- `.dockerignore`: keeps local env files, logs, node_modules, build outputs, and git state out of image contexts.
- `docker-compose.production.yml.example`: shows a production-shaped API/Web/Postgres stack with required environment interpolation instead of concrete secrets.
- `npm run verify:production-deploy-artifacts`: checks that these files stay aligned with production launch boundaries.

## Required Runtime Steps

Before starting the API image in a target environment:

```bash
npm run db:migrate:deploy
npm run operator:bootstrap-admin
```

Run these against the deployed service before opening real-channel intake:

```bash
npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```

Add `--require-real-channel` only for a launch window where signed real-channel intake must be open. If intake is closed, keep `REAL_CHANNEL_WEBHOOKS_ENABLED=false` or `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`.

## Secret Boundary

Do not bake these into Docker images, compose files, CI logs, deploy tickets, or repository files:

- `DATABASE_URL`
- `OPERATOR_SESSION_SECRET`
- `OPERATOR_API_KEYS`
- `REAL_CHANNEL_WEBHOOK_SECRETS`
- `PROVIDER_CREDENTIALS`
- provider tokens, provider payloads, provider responses, customer messages, order IDs, logistics IDs, signatures, raw request bodies, or tenant IDs

Use the deployment platform secret store or host environment injection. The compose example uses `${NAME:?set NAME}` for required values so missing secrets fail before the service starts.

## Verification

Run:

```bash
npm run verify:production-deploy-artifacts
npm run verify:production-launch
```

The verifier is intentionally static. It proves that deploy artifacts are present, use production commands, avoid dev servers, disable demo defaults, require external secret injection, and remain linked from launch documentation. It does not prove a cloud deployment is live; the production canary still has to run against the target URL.
