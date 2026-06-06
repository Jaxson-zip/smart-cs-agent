# PR48 Production Image Build Gate

This stage adds an executable image-build gate for the API and Web deployment artifacts. It still does not publish images, push to a registry, run production traffic, enable provider writes, execute refunds, change addresses, issue coupons, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-image-builds
```

Run the Docker-backed gate in CI or on a machine with Docker daemon access:

```bash
npm run verify:production-image-builds:docker
```

The Docker-backed gate builds both images locally with:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`

It uses `--pull=false` and does not pass runtime environment variables, operator keys, webhook secrets, provider credentials, tenant IDs, or customer data into the build command.

After the images build, run `npm run verify:production-container-smoke:docker` from `docs/deploy/production-container-smoke.yml.example` to verify the API and Web containers can start and answer their minimal runtime probes without publishing images.

After runtime smoke passes, run `npm run verify:production-image-security:docker` from `docs/deploy/production-image-security.yml.example` to generate SBOM and vulnerability evidence for the same local API/Web image tags before publishing or deployment.

## CI Example

Use `docs/deploy/production-image-build.yml.example` as the template for a GitHub Actions job. Keep it as a build-only job until a separate release process defines registry ownership, image signing, SBOM generation, provenance, and promotion rules.

The example workflow must not authenticate to a registry, publish images, read GitHub secrets, provider credentials, operator API keys, webhook secrets, tenant IDs, or customer payloads.

## Verification Boundary

`npm run verify:production-image-builds` proves that:

- production image build scripts exist,
- the CI example runs the Docker-backed gate,
- image builds target the checked API and Web Dockerfiles,
- the command remains build-only and does not push images,
- the build gate is linked from production deployment and launch docs.

It does not prove the images have been published or deployed. After deployment, continue to run:

```bash
npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```
