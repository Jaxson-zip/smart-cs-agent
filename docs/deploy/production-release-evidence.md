# PR52 Production Release Evidence Archive

This stage defines the sanitized post-deploy release evidence archive for a controlled production launch. It binds release provenance, launch manifest, production readiness, production canary, rollback owner, incident owner, operator coverage, and safety facts into one checked JSON file. It does not call the API, connect to a database, does not publish images, authenticate to a registry, does not read GitHub secrets, read a secret manager, call real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-release-evidence
```

Run the safe evidence gate after the release system has exported a sanitized production release evidence archive:

```bash
SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE=production-release-evidence-artifacts/production-release-evidence.json \
SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true \
npm run verify:production-release-evidence:safe
```

The evidence file must use schema `smart-cs-agent.production-release-evidence.v1` and must live under `production-release-evidence-artifacts/`. The verifier checks only sanitized facts and prints only the release id plus a success marker.

## Required Evidence Shape

The production release evidence archive should include:

- Source: branch and 40-character commit SHA.
- Release provenance: status, release id, image count, `signatureVerified`, `provenanceVerified`, and `sbomAttestationVerified`.
- Launch manifest: status, entry count, channel count, real-channel requirement, and provider-readonly requirement.
- Deploy health: migration, readiness, canary, alerting, channel runbook, and operator bootstrap status.
- Operations: rollback owner fingerprint, incident owner fingerprint, operator lead fingerprint, operator coverage minutes, and rollback drill inclusion.
- Safety: no real commerce writes, no customer-visible actions, no provider payload reads, no provider payloads in evidence, no customer data in evidence, no secrets in evidence, no raw tenant IDs in evidence, no network execution by this verifier, and no registry publish by this verifier.
- Artifact names: release provenance bundle, launch manifest bundle, readiness summary, canary summary, and rollback drill summary.

## Security Boundary

Do not put operator API keys, webhook secrets, provider credentials, full credential refs, tenant IDs, customer messages, provider payloads, provider responses, order IDs, logistics IDs, signatures, raw request bodies, response bodies, metric bodies, env-file paths, registry credentials, tokens, usernames, passwords, or API URLs with query-string secrets into production release evidence.

This verifier rejects unsupported sensitive fields such as `tenantId`, `webhookSecret`, `providerPayload`, `providerResponse`, `orderId`, `logisticsId`, `operatorApiKey`, `metricBody`, `responseBody`, `token`, and `secret`. It also rejects secret-looking values such as secret-manager refs, bearer tokens, embedded credentials, and known leak sentinels.

## Workflow Placement

Run this gate after:

```bash
npm run verify:production-release-provenance:safe
npm run verify:launch-manifest:safe
npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```

`docs/deploy/production-release-evidence.yml.example` assumes the release system has already exported a sanitized evidence archive to `production-release-evidence-artifacts/production-release-evidence.json`. The upload step uses an explicit file allowlist, not a whole-directory artifact upload.

## Verification

Run:

```bash
npm run verify:production-release-evidence
npm run verify:production-change-approval
npm run verify:production-launch
```

Use `npm run verify:production-release-evidence:safe` in release CI or a launch terminal after `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_FILE` and `SMARTCS_PRODUCTION_RELEASE_EVIDENCE_REQUIRE_PASS=true` are injected through the environment.

Before opening a production launch window, run `npm run verify:production-change-approval:safe` against the sanitized approval package. See `docs/deploy/production-change-approval.md` and `docs/deploy/production-change-approval.yml.example`.
