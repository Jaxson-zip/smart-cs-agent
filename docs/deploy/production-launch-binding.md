# PR54 Production Launch Binding Gate

This stage binds the sanitized launch artifacts into one release decision. It reads release provenance, production release evidence, production change approval, and launch manifest JSON files, then verifies they refer to the same `releaseId`, source commit, production target, change ticket, launch manifest counts, requirements, artifact names, and artifact SHA-256 values.

It does not call the API, connect to a database, publish images, authenticate to a registry, does not read GitHub secrets, read a secret manager, call real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-launch-binding
```

Run the safe binding gate after the release system has exported sanitized artifacts:

```bash
SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_FILE=production-release-provenance-artifacts/release-provenance.json \
SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_FILE=production-release-evidence-artifacts/production-release-evidence.json \
SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_FILE=production-change-approval-artifacts/production-change-approval.json \
SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_FILE=launch-manifest-artifacts/launch-manifest.json \
SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_PROVENANCE_SHA256=<sha256> \
SMARTCS_PRODUCTION_LAUNCH_BINDING_RELEASE_EVIDENCE_SHA256=<sha256> \
SMARTCS_PRODUCTION_LAUNCH_BINDING_CHANGE_APPROVAL_SHA256=<sha256> \
SMARTCS_PRODUCTION_LAUNCH_BINDING_LAUNCH_MANIFEST_SHA256=<sha256> \
SMARTCS_PRODUCTION_LAUNCH_BINDING_REQUIRE_PASS=true \
npm run verify:production-launch-binding:safe
```

Each file must stay in its own artifact directory:

- `production-release-provenance-artifacts/`
- `production-release-evidence-artifacts/`
- `production-change-approval-artifacts/`
- `launch-manifest-artifacts/`

The verifier prints only the release id plus binding/hash status. It must not print raw paths, expected hashes, tenant IDs, provider payloads, customer data, secrets, signatures, raw bodies, response bodies, metric bodies, or provider responses.

## Binding Rules

The binding gate verifies:

- Release identity: root `releaseId` values match across release provenance, production release evidence, production change approval, and launch manifest.
- Provenance link: production release evidence `releaseProvenance.releaseId` matches the same release id.
- Source link: release provenance and production release evidence use the same branch and commit when those fields are present.
- Production target: release provenance promotion and production change approval both target `production` when pass evidence is required.
- Change ticket: release provenance `promotion.changeTicket` equals change approval `approvals.changeTicket`.
- Approval freshness: the production change approval window is valid and not expired when pass evidence is required.
- Launch manifest: production release evidence manifest summary matches the real launch manifest entry count, channel count, real-channel/provider-readonly requirements, and sorted `tenantFingerprint/channel/evidenceFile` `scopeHash`.
- Artifact names: release evidence and change approval artifact names match the actual artifact file basenames.
- Artifact SHA-256: supplied artifact hashes match the bytes read by the verifier.

## Security Boundary

Do not put operator API keys, webhook secrets, provider credentials, full credential refs, tenant IDs, customer messages, provider payloads, provider responses, order IDs, logistics IDs, signatures, raw request bodies, response bodies, metric bodies, env-file paths, registry credentials, tokens, usernames, passwords, or API URLs with query-string secrets into launch binding artifacts or logs.

This gate is a consistency gate, not a deployment tool. It does not prove real registry publish, real image signing, real provider read/write execution, real customer-visible replies, or production traffic changes.

## Workflow Placement

Run this gate after:

```bash
npm run verify:production-release-provenance:safe
npm run verify:production-release-evidence:safe
npm run verify:production-change-approval:safe
npm run verify:launch-manifest:safe
```

`docs/deploy/production-launch-binding.yml.example` assumes those sanitized artifacts already exist and that the release system provides SHA-256 values through the CI environment.

## Verification

Run:

```bash
npm run verify:production-launch-binding
npm run verify:production-launch
```

Use `npm run verify:production-launch-binding:safe` in release CI or a launch terminal after all `SMARTCS_PRODUCTION_LAUNCH_BINDING_*` file, hash, and require-pass variables are injected through the environment.
