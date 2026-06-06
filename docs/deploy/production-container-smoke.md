# PR49 Production Container Runtime Smoke Gate

This stage verifies that the production API and Web images can start from their checked `CMD` entries and respond to the smallest runtime probes. It does not publish images, deploy traffic, connect real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-container-smoke
```

Run the Docker-backed runtime smoke in CI or another Docker-enabled environment after the image build gate:

```bash
npm run verify:production-image-builds:docker
npm run verify:production-container-smoke:docker
npm run verify:production-image-security:docker
```

The Docker-backed smoke starts a temporary Docker network with:

- `postgres:16` using synthetic local auth,
- the API image tagged by the build gate,
- the Web image tagged by the build gate.

It then checks:

- API `GET /health`,
- Web `GET /`.

The smoke intentionally does not call `GET /health/ready` as the primary success condition. Full readiness depends on migrations, database state, queue thresholds, and launch canary configuration, which remain covered by the launch preflight and canary gates.

## Runtime Boundary

The smoke injects only synthetic runtime values. It sets production-safe defaults such as sandbox disabled, legacy demo APIs disabled, offline demo disabled, insecure operator headers disabled, dotenv loading disabled, real-channel webhooks disabled, and the kill switch enabled.

The smoke must not pass runtime operator keys, webhook secrets, provider credentials, tenant IDs, customer payloads, provider payloads, raw order IDs, raw logistics IDs, or customer messages into Docker commands or logs.

The smoke does not call real channel webhooks, review replay, ignore, stale recovery, provider read execution, provider adapters, payment/refund/coupon flows, address changes, logistics edits, or customer-visible reply endpoints.

## CI Example

Use `docs/deploy/production-container-smoke.yml.example` as the first GitHub Actions template for runtime smoke. Keep it build-and-run only until a separate release process defines image publishing, registry ownership, signing, SBOM generation, provenance, vulnerability scanning, and promotion rules.

The example workflow must not authenticate to a registry, publish images, read GitHub secrets, provider credentials, operator API keys, webhook secrets, tenant IDs, customer data, or provider payloads.

## Next Gates

After runtime smoke passes, continue to run:

```bash
npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```

Those gates prove deployment-specific readiness. PR49 only proves the production images start and answer the minimal runtime probes.

Run `docs/deploy/production-image-security.yml.example` after this smoke gate when release owners need SBOM and vulnerability evidence before publishing images.
