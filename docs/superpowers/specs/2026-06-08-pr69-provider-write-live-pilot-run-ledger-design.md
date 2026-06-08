# PR69 Provider Write Live Pilot Run Ledger Design

## Goal

PR69 adds a no-network closeout evidence gate for the first real provider write pilot. It proves that a bounded `single_merchant_pilot` window produced a sanitized ledger of every run, every run was reviewed, failures and rollbacks were closed out, and no automatic customer-visible reply was sent.

## Scope

The run ledger verifier validates sanitized `smart-cs-agent.provider-write-live-pilot-run-ledger.v1` JSON packages under `provider-write-live-pilot-run-ledger-artifacts/`. Static verification may pass without evidence so repository CI stays no-secret and no-network; safe mode requires evidence through `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_FILE` and `SMARTCS_PROVIDER_WRITE_LIVE_PILOT_RUN_LEDGER_REQUIRE_PASS=true`.

The closeout stays deliberately narrow: `single_merchant_pilot`, `taobao` or `douyin`, at least one run record, low risk only, timestamps inside the declared pilot window, and first-pilot actions limited to `modify_address`, `issue_coupon`, and `urge_logistics`. Refunds, broad rollout, high-risk runs, empty ledgers, out-of-window runs, unreviewed runs, missing incident notes, failed provider mutations without rollback verification, customer-visible auto replies, raw provider/customer data, and verifier-side network execution are rejected.

## Architecture

PR69 follows the existing production gate pattern:

- `scripts/verify-provider-write-live-pilot-run-ledger.mjs` performs static repository checks and optional sanitized evidence validation.
- `scripts/verify-provider-write-live-pilot-run-ledger.test.mjs` covers pass evidence, safe-mode failure, path confinement, sensitive data rejection, rollout/action limits, summary consistency, run-record safety, artifact binding strength, and argument redaction.
- `docs/deploy/provider-write-live-pilot-run-ledger.md` documents the evidence schema, workflow placement, and safety boundary.
- `package.json`, `.github/workflows/production-static-gates.yml`, `scripts/verify-production-static-ci.mjs`, and `scripts/verify-production-launch.mjs` wire the new gate into static and launch checks.

## Data Shape

The evidence package includes only fingerprints, booleans, bounded counts, timestamps, controlled action names, controlled statuses, network execution facts, provider mutation facts, audit hashes, and artifact hashes. It must not contain raw tenant IDs, order IDs, logistics IDs, addresses, customer messages, provider payloads, provider responses, raw idempotency keys, provider credentials, operator API keys, tokens, secrets, vault paths, or URLs with embedded credentials.

The package binds prior and closeout gates through SHA-256 fields for live pilot preflight, production provider write approval, live executor startup guard, live executor control plane, kill-switch control plane, production launch verification, and audit export evidence.

## Safety

The verifier must not call provider APIs, call app APIs, read production databases, read credential stores, open payload escrow, mutate provider state, send customer-visible replies, or enable `PROVIDER_WRITE_LIVE_EXECUTOR_ENABLED`. The ledger package may attest that an approved runtime called a provider API during a bounded pilot window, but this verifier only validates sanitized evidence after the window closes.

## Verification

PR69 is complete only when these pass from the repository root:

- `node --test scripts/verify-provider-write-live-pilot-run-ledger.test.mjs`
- `npm.cmd run verify:provider-write-live-pilot-run-ledger`
- `npm.cmd run verify:production-static-ci`
- `npm.cmd run verify:production-launch`
- aggregate API/Web/typecheck/lint/build/script tests before commit

## Self-Review

- Placeholder scan: no TBD/TODO markers remain.
- Scope check: PR69 is one post-window evidence gate only, not a live provider write executor.
- Ambiguity check: safe mode requires sanitized evidence; static mode may skip evidence; both modes remain no-network.
