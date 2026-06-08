# PR68 Provider Write Live Pilot Preflight Design

## Goal

PR68 adds a no-network preflight evidence gate for the first real provider write pilot. It proves that a single merchant, single channel, low-risk write pilot has operator coverage, rollback ownership, observability, approval, dry-run rehearsal, kill-switch rehearsal, and live executor guard evidence before any launch window can enable real write execution.

## Scope

The preflight verifier validates sanitized `smart-cs-agent.provider-write-live-pilot-preflight.v1` JSON packages under `provider-write-live-pilot-preflight-artifacts/`. Static verification may pass without evidence so local CI can stay no-secret and no-network; safe mode requires evidence through `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_PREFLIGHT_REQUIRE_PASS=true`.

The first pilot remains deliberately narrow: `single_merchant_pilot`, `taobao` or `douyin`, low risk only, and first-pilot actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`. Refunds, broad rollouts, auto replies, and provider writes during verification are rejected.

## Architecture

PR68 follows the existing production gate pattern:

- `scripts/verify-provider-write-live-pilot-preflight.mjs` performs static repository checks and optional sanitized evidence validation.
- `scripts/verify-provider-write-live-pilot-preflight.test.mjs` covers pass evidence, safe-mode failure, path confinement, sensitive data rejection, rollout/action limits, runtime controls, observability, rollback, and placeholder artifact hashes.
- `docs/deploy/provider-write-live-pilot-preflight.md` documents the evidence schema, workflow placement, and safety boundary.
- `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs` wire the new gate into the launch sequence.

## Data Shape

The evidence package includes only fingerprints, booleans, bounded counts, timestamps, controlled action names, and artifact hashes. It must not contain raw tenant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, raw idempotency keys, provider credentials, operator API keys, tokens, secrets, vault paths, or URLs with embedded credentials.

The package binds prior gates through SHA-256 fields for dry-run rehearsal, kill-switch rehearsal, production provider write approval, live executor startup guard, live executor control plane, kill-switch control plane, and production launch verification.

## Safety

The verifier must not call provider APIs, call app APIs, read databases, read credential stores, open payload escrow, mutate provider state, send customer-visible replies, or enable `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`. The preflight package proves readiness to enter a manually approved launch window; it is not proof that a provider write has run.

## Verification

PR68 is complete only when these pass from the repository root:

- `node --test scripts/verify-provider-write-live-pilot-preflight.test.mjs`
- `npm.cmd run verify:provider-write-live-pilot-preflight`
- `npm.cmd run verify:production-static-ci`
- `npm.cmd run verify:production-launch`
- aggregate API/Web/typecheck/lint/build/script tests before commit

## Self-Review

- Placeholder scan: no TBD/TODO markers remain.
- Scope check: PR68 is one gate only, not a live provider write executor.
- Ambiguity check: safe mode requires sanitized evidence; static mode may skip evidence; both modes remain no-network.
