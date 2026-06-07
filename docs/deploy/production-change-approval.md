# PR53 Production Change Approval Gate

This stage defines the sanitized production change approval package required before a release window can open. It verifies release owners, approval status, rollback owner, rollback drill, operator coverage, freeze window, communication readiness, and safety controls in one local JSON file. It does not call the API, connect to a database, does not publish images, authenticate to a registry, does not read GitHub secrets, read a secret manager, call real channels, execute provider reads or writes, issue refunds, change addresses, edit logistics, or send customer-visible replies.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-change-approval
```

Run the safe evidence gate after the release system has exported a sanitized change approval package:

```bash
SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE=production-change-approval-artifacts/production-change-approval.json \
SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true \
npm run verify:production-change-approval:safe
```

The evidence file must use schema `smart-cs-agent.production-change-approval.v1` and must live under `production-change-approval-artifacts/`. The verifier checks only sanitized facts and prints only the release id plus a success marker.

## Required Evidence Shape

The production change approval package should include:

- Change window: target environment, start/end timestamps, expected duration, and freeze window confirmation.
- Approvals: approval status, approval timestamp, change ticket, product owner fingerprint, engineering owner fingerprint, security owner fingerprint, and operations owner fingerprint.
- Rollback: rollback owner fingerprint, incident owner fingerprint, rollback plan link flag, kill-switch readiness, rollback drill status, and maximum rollback minutes.
- Risk controls: launch manifest verified, release provenance verified, release evidence required, production canary required, alerting routes confirmed, operator coverage confirmed, provider writes disabled, and customer-visible actions disabled.
- Communications: incident channel fingerprint, operator briefing status, customer support briefing status, and escalation policy status.
- Safety: no secrets, raw tenant IDs, customer data, provider payloads, network execution, registry publish, real commerce writes, or customer-visible actions in the approval evidence.
- Artifact names: change approval bundle, release evidence bundle, rollback drill summary, and operator coverage summary.

## Security Boundary

Do not put operator API keys, webhook secrets, provider credentials, full credential refs, tenant IDs, customer messages, provider payloads, provider responses, order IDs, logistics IDs, signatures, raw request bodies, response bodies, metric bodies, env-file paths, registry credentials, tokens, usernames, passwords, or API URLs with query-string secrets into production change approval evidence.

This verifier rejects unsupported sensitive fields such as `tenantId`, `webhookSecret`, `providerPayload`, `providerResponse`, `orderId`, `logisticsId`, `operatorApiKey`, `metricBody`, `responseBody`, `token`, and `secret`. It also rejects secret-looking values such as secret-manager refs, bearer tokens, embedded credentials, and known leak sentinels.

## Workflow Placement

Run this gate after:

```bash
npm run verify:production-release-evidence:safe
npm run verify:production-launch
```

`docs/deploy/production-change-approval.yml.example` assumes the release system has already exported a sanitized approval package to `production-change-approval-artifacts/production-change-approval.json`. The upload step uses an explicit file allowlist, not a whole-directory artifact upload.

## Verification

Run:

```bash
npm run verify:production-change-approval
npm run verify:production-launch
```

Use `npm run verify:production-change-approval:safe` in release CI or a launch terminal after `SMARTCS_PRODUCTION_CHANGE_APPROVAL_FILE` and `SMARTCS_PRODUCTION_CHANGE_APPROVAL_REQUIRE_PASS=true` are injected through the environment.
