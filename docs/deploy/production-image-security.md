# PR50 Production Image Security Evidence Gate

This stage adds a local evidence gate for production image SBOM and vulnerability reports. It does not publish images, deploy traffic, authenticate to a registry, read GitHub secrets, connect real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-image-security
```

Run the Docker-backed evidence gate in CI or another Docker-enabled environment after image build and runtime smoke:

```bash
npm run verify:production-image-builds:docker
npm run verify:production-container-smoke:docker
npm run verify:production-image-security:docker -- --artifacts-dir=production-image-security-artifacts
```

The Docker-backed gate uses Syft to generate SPDX JSON SBOM files and Trivy to generate JSON vulnerability reports for:

- `smart-cs-agent-api:verify`,
- `smart-cs-agent-web:verify`.

The default vulnerability threshold fails on `HIGH,CRITICAL` findings. The command writes these local evidence files:

- `api.sbom.spdx.json`,
- `web.sbom.spdx.json`,
- `api.trivy.json`,
- `web.trivy.json`.

## Security Boundary

The scanner containers receive image tags and a local artifacts directory only. They must not receive operator API keys, webhook secrets, provider credentials, tenant IDs, customer payloads, provider payloads, raw order IDs, raw logistics IDs, customer messages, signatures, raw request bodies, env files, or full credential references.

The verifier does not print scanner stdout, scanner stderr, report bodies, response bodies, metric bodies, or generated evidence paths. Failure output uses fixed labels so a future scanner output cannot leak sensitive values into CI logs.

The workflow example does not read GitHub secrets, does not authenticate to a registry, does not publish images, and does not promote artifacts. Release provenance and promotion-readiness checks belong to `npm run verify:production-release-provenance` and `docs/deploy/production-release-provenance.yml.example`, which still consume only sanitized evidence and do not publish images.

## Scanner Inputs

Default scanner images:

- `anchore/syft:latest`,
- `aquasec/trivy:latest`.

Production teams may replace them with digest-pinned scanner images by passing:

```bash
npm run verify:production-image-security:docker -- --syft-image=<scanner-image@sha256:digest> --trivy-image=<scanner-image@sha256:digest>
```

Do not include tokens, usernames, passwords, registry credentials, query strings, or secret manager paths in scanner image arguments.

## Next Gates

After image security evidence passes, continue to run:

```bash
npm run verify:production-release-provenance
npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```

Those gates prove release provenance and deployment-specific readiness. PR50 only proves the local release images have SBOM and vulnerability evidence before they are eligible for publishing or deployment.
