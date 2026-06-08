# PR68 Provider Write Live Pilot Preflight Gate

PR68 adds a sanitized no-network evidence gate for the first real provider write pilot. It validates `smart-cs-agent.provider-write-live-pilot-preflight.v1` packages before a launch window may enable live provider write execution.

## Commands

Static repository verification:

```bash
npm run verify:provider-write-live-pilot-preflight
```

Safe evidence verification:

```bash
set SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE=provider-write-live-pilot-preflight-artifacts/provider-write-live-pilot-preflight.json
set SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true
npm run verify:provider-write-live-pilot-preflight:safe
```

## Evidence Shape

Evidence must use `schemaVersion=smart-cs-agent.provider-write-live-pilot-preflight.v1` and include:

- `target`: tenant fingerprint, channel, `single_merchant_pilot`, and change ticket.
- `pilot`: first-pilot action, low risk, live executor disabled at verification, max pilot writes, and one write per order.
- `runtimeControls`: kill switch engaged before the window, human confirmation, idempotency, audit, sealed metadata only, no automatic customer-visible replies, and no provider mutation during verification.
- `operatorCoverage`: primary operator, backup operator, release owner, rollback owner, and at least 60 minutes of live watch.
- `rollback`: rollback drill passed, live executor disable time within 15 minutes, two-person kill-switch release, and queue drain plan.
- `observability`: canary, dashboard, alert routes, and audit export readiness.
- `launchWindow`: bounded production window with an active freeze window.
- `evidence`: dry-run rehearsal, kill-switch rehearsal, provider write approval, live executor startup guard, live executor control plane, kill-switch control plane, and production launch verifier pass booleans.
- `artifactBindings`: SHA-256 bindings for the referenced evidence artifacts: `providerWriteDryRunRehearsalSha256`, `providerWriteKillSwitchRehearsalSha256`, `productionProviderWriteApprovalSha256`, `providerWriteLiveExecutorStartupGuardSha256`, `providerWriteLiveExecutorControlPlaneSha256`, `providerWriteKillSwitchControlPlaneSha256`, and `productionLaunchSha256`.
- `safety`: all false for secrets, raw tenant/customer/provider data, network execution, provider writes, payload escrow opening, credential reads, and customer-visible actions.

## Safety Boundary

This verifier:

- does not call provider APIs;
- does not execute provider writes;
- does not read provider credentials;
- does not read operator API keys;
- does not read production databases;
- does not open payload escrow;
- does not open or decrypt payload escrow;
- does not store raw provider/customer payloads;
- does not expose raw idempotency keys;
- does not send customer-visible replies;
- does not enable `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`.

The preflight package proves launch readiness only. It is not proof that a real address change, coupon, logistics edit, refund, or customer reply has run.

## Launch Placement

Run this safe gate after:

```bash
npm run verify:provider-write-dry-run-rehearsal:safe
npm run verify:provider-write-kill-switch-rehearsal:safe
npm run verify:production-provider-write-approval:safe
```

Run it before any launch window that enables a live provider write executor.
