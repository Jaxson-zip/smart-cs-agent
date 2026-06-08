# PR57 Production Provider Write Approval Gate

This stage defines the approval package required before any real provider write pilot can be considered. It is for a narrow, human-reviewed, single-merchant pilot only. It does not call provider APIs, does not execute provider writes, does not read provider credentials, does not send customer-visible replies, and does not enable automatic commerce actions.

## Commands

Run the static gate on every release branch:

```bash
npm run verify:production-provider-write-approval
```

Run the safe evidence gate after release owners have exported a sanitized provider write approval package:

```bash
SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE=production-provider-write-approval-artifacts/production-provider-write-approval.json \
SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true \
npm run verify:production-provider-write-approval:safe
```

The evidence file must use schema `smart-cs-agent.production-provider-write-approval.v1` and must live under `production-provider-write-approval-artifacts/`. The verifier prints only the channel plus a success marker.

The `:safe` command hard-requires pass evidence. It fails closed when `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE` is missing or when the package is not approved.

Before the approval package is accepted, run `npm run verify:provider-write-dry-run-rehearsal:safe` with `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_FILE` pointing at a file under `provider-write-dry-run-rehearsal-artifacts/` and `SMARTCS_PROVIDER_WRITE_DRY_RUN_REHEARSAL_REQUIRE_PASS=true`. The approval package binds that rehearsal through `dryRunRehearsalSha256`.

Before the approval package is accepted, also run `npm run verify:provider-write-kill-switch-rehearsal:safe` with `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_FILE` pointing at a file under `provider-write-kill-switch-rehearsal-artifacts/` and `SMARTCS_PROVIDER_WRITE_KILL_SWITCH_REHEARSAL_REQUIRE_PASS=true`. The approval package binds that emergency-stop rehearsal through `providerWriteKillSwitchSha256`.

Before a launch window enables a live provider write pilot, run `npm run verify:provider-write-live-pilot-preflight:safe` with `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE` pointing at a file under `provider-write-live-pilot-preflight-artifacts/` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true`. The live pilot preflight package binds this approval through `productionProviderWriteApprovalSha256` and proves operator watch, rollback, observability, and bounded first-pilot scope for that launch window.

## Required Evidence Shape

The provider write approval package should include:

- Target: tenant fingerprint, channel, `single_merchant_pilot`, and change ticket.
- Execution mode: `human_review_required`. `auto_execute` is not allowed for the first production write pilot.
- Allowed actions: first pilot may include only `modify_address`, `issue_coupon`, and `urge_logistics`. Refunds are explicitly excluded.
- Approval: `approvalStatus=approved`, requester fingerprint, primary approver fingerprint, second reviewer fingerprint, and approval timestamp. The two reviewers must be different and must not be the requester.
- `artifactBindings`: sha256 fingerprints for the production change approval, production release evidence, production launch binding, dry-run rehearsal evidence, and provider write kill-switch rehearsal evidence.
- Controls: human approval, two-person review, idempotency, audit, provider write kill switch, customer-visible reply approval, dry-run rehearsal, and rollback owner fingerprint.
- Limits: daily write cap, coupon amount cap, and at most one address change per order.
- Safety: no secrets, raw tenant IDs, customer data, provider payloads, network execution by this verifier, provider writes by this verifier, automatic provider writes, or auto-sent customer-visible actions.

## Security Boundary

Do not put provider tokens, credential refs, operator API keys, webhook secrets, tenant IDs, customer messages, order IDs, logistics IDs, provider payloads, provider responses, signatures, raw request bodies, or API URLs with query-string secrets into provider write approval evidence.

This verifier rejects unsupported sensitive fields such as `tenantId`, `providerToken`, `credentialRef`, `providerPayload`, `providerResponse`, `orderId`, `logisticsId`, `operatorApiKey`, `token`, and `secret`. It also rejects bearer tokens, embedded credentials, secret-manager refs, and known leak sentinels.

## Workflow Placement

Run this gate after:

```bash
npm run verify:provider-write-dry-run-rehearsal:safe
npm run verify:provider-write-kill-switch-rehearsal:safe
npm run verify:production-branch-protection
npm run verify:production-launch
```

This approval gate is still not enough to execute real writes. A later implementation must add the actual provider write client, persisted write-run records, idempotency enforcement at the write endpoint, provider-specific rollback behavior, and a live kill switch check before any network call.

## Verification

Run:

```bash
npm run verify:production-provider-write-approval
npm run verify:production-launch
```

Use `npm run verify:production-provider-write-approval:safe` in release CI or a launch terminal after `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_FILE` and `SMARTCS_PRODUCTION_PROVIDER_WRITE_APPROVAL_REQUIRE_PASS=true` are injected through the environment.
