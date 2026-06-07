# PR51 Production Release Provenance And Promotion Boundary

This stage defines the release provenance and promotion evidence required before API and Web container images become eligible for production deployment. It does not publish images, does not authenticate to a registry, does not sign artifacts, does not read GitHub secrets, call real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-release-provenance
```

Run the safe evidence gate after CI has produced a sanitized release provenance bundle:

```bash
SMARTCS_RELEASE_PROVENANCE_FILE=<release-provenance-json> \
SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true \
npm run verify:production-release-provenance:safe
```

The evidence file must use schema `smart-cs-agent.release-provenance.v1`. The verifier checks image digests, signed provenance facts, SBOM attestation facts, prior image gates, and promotion approval without printing file paths, image digests, registry credentials, or scanner output.

## Required Evidence Shape

The release provenance bundle should include only sanitized facts:

- Source: repository name, branch, 40-character commit SHA, workflow name, and workflow run id.
- Images: API and Web image repositories plus immutable `sha256` image digests.
- Security artifacts: artifact file names for API/Web SBOM and vulnerability reports.
- Verification booleans: `signatureVerified`, `provenanceVerified`, and `sbomAttestationVerified` for both images.
- Prior gates: `productionImageBuilds`, `productionContainerSmoke`, and `productionImageSecurity` set to `passed`.
- Attestations: keyless OIDC signer mode, provenance predicate, SBOM format, and build type.
- Promotion: source environment, target environment, promotion approval, approver fingerprint, and change ticket.
- Safety: `registryPublishedByVerifier=false`, `networkExecutedByVerifier=false`, `secretsInEvidence=false`, `rawTenantIdsInEvidence=false`, `providerPayloadsInEvidence=false`, `customerDataInEvidence=false`, `realCommerceWritesEnabled=false`, `customerVisibleActionsEnabled=false`, and `providerPayloadReadsEnabled=false`.

## Promotion Boundary

Production promotion must deploy by immutable image digests, not mutable tags. The approval record should point to the release provenance bundle and the image security artifact bundle. The deploy ticket may include release id, commit SHA, gate status, image count, and artifact names only.

This verifier intentionally does not call registry authentication commands, image publish commands, registry APIs, Cosign, Rekor, a secret manager, the API service, the database, Taobao, Douyin, WeCom, or any provider network. If a later workflow performs registry publish, signing, or attestation upload, it must run in a separate reviewed CI stage and pass only sanitized evidence into this verifier.

## Security Boundary

Do not put operator API keys, webhook secrets, provider credentials, full credential refs, tenant IDs, customer messages, provider payloads, provider responses, order IDs, logistics IDs, signatures, raw request bodies, env-file paths, registry credentials, tokens, usernames, passwords, or API URLs with query-string secrets into release provenance evidence.

The verifier rejects unsupported fields such as `tenantId`, `webhookSecret`, `providerPayload`, `providerResponse`, `orderId`, `logisticsId`, `operatorApiKey`, `token`, and `secret`. It also rejects secret-looking values such as secret-manager refs, bearer tokens, embedded credentials, and known leak sentinels.

## Workflow Placement

`docs/deploy/production-release-provenance.yml.example` assumes the release system has already exported a sanitized provenance bundle to `production-release-provenance-artifacts/release-provenance.json`. The verifier consumes that file only after the image build, container smoke, and image security gates have run.

Run this gate after:

```bash
npm run verify:production-image-builds:docker
npm run verify:production-container-smoke:docker
npm run verify:production-image-security:docker
```

Then run:

```bash
npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```

Add `--require-real-channel` to readiness/canary only for a launch window where signed real-channel intake must be open.

## Verification

Run:

```bash
npm run verify:production-release-provenance
npm run verify:production-launch
```

Use `npm run verify:production-release-provenance:safe` in release CI or a launch terminal after the sanitized provenance file has been injected through `SMARTCS_RELEASE_PROVENANCE_FILE` and `SMARTCS_RELEASE_PROVENANCE_REQUIRE_PASS=true`.
