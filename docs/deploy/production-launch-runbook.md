# PR34 Production Launch And Rollback Runbook

This runbook turns the existing readiness, canary, alerting, and queue recovery tools into a launch rehearsal. It is for a controlled commercial rollout where the operator workbench can be deployed and real-channel signed intake may be opened for a limited allowlist.

It does not prove that real refunds, address changes, coupons, logistics edits, or customer-visible replies are safe to automate. Real customer actions still require separate provider-specific sandbox evidence, approval policies, and human review.

`POST /v2/provider-reads/execute` is also contract-only in this launch track: accepted readonly policy responses must keep `networkExecution=not_implemented` and `providerDataReturned=false`, so the route does not prove live provider order or logistics reads.

Provider read attempts may persist sanitized `ProviderReadRun` rows for audit and idempotency only after the case is verified inside the authenticated tenant. Launch evidence may reference run counts and hashes, but must not include raw order IDs, logistics IDs, provider payloads, provider responses, customer data, operator API keys, or provider tokens.

## Launch Decision

Use this runbook before every production launch or gray release that changes real-channel intake, queue handling, identity, readiness, metrics, alerting, or operator review behavior.

Launch may proceed only when all of these are true:

- A rollback owner, incident owner, and operator lead are named in the deploy ticket.
- Database migrations have been reviewed and `npm run db:migrate:deploy` has completed in the target environment.
- `npm run verify:production-readiness -- --env-file=<secure-production-env> --require-real-channel --api=<public-api-url>` passes for real-channel launch windows.
- `npm run verify:production-canary -- --api=<public-api-url> --require-real-channel --max-stale-processing=0 --max-oldest-pending-age-seconds=900` passes.
- `npm run verify:production-alerting` and `npm run verify:channel-runbook` pass from the release branch.
- `npm run verify:provider-adapters` passes, and the Provider adapter contract still shows no real provider network calls, no real commerce writes, and no customer-visible actions for current Taobao/Douyin adapters.
- `npm run verify:provider-readonly` passes when `PROVIDER_READONLY_ADAPTERS` or provider contract projection changes.
- `npm run verify:provider-read-contract` passes when `POST /v2/provider-reads/execute`, provider read policy, or readonly response shape changes.
- `npm run verify:provider-read-audit` passes when provider read persistence, idempotency, or audit behavior changes.
- Alert routes for API down, database down, real-channel misconfiguration, queue degradation, stale processing, and oldest pending age are enabled.
- Alert routes for `SmartCsAgentApiDown`, `SmartCsAgentDatabaseDown`, `SmartCsAgentRealChannelMisconfigured`, `SmartCsAgentRealChannelKillSwitchEnabled`, `SmartCsAgentChannelQueueDegraded`, `SmartCsAgentStaleProcessingClaims`, and `SmartCsAgentOldestPendingTooOld` are enabled and have owners.
- The first launch allowlist is intentionally small and every allowlisted pair has a matching webhook secret.

If real-channel intake is not part of the launch, omit `--require-real-channel` and keep `REAL_CHANNEL_WEBHOOKS_ENABLED=false` or `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true`.

## Preflight Commands

Run these from the release branch before deploy:

```bash
npm run db:generate
npm run test --workspace @smart-cs-agent/api
npm run test --workspace @smart-cs-agent/web
npm run typecheck --workspaces --if-present -- --pretty false
npm run lint --workspaces --if-present -- --max-warnings=0
npm run build --workspaces --if-present
npm run verify:production-readiness -- --env-file=<secure-production-env> --require-real-channel --api=<public-api-url>
npm run verify:production-canary -- --api=<public-api-url> --require-real-channel --max-stale-processing=0 --max-oldest-pending-age-seconds=900
npm run verify:production-alerting
npm run verify:provider-adapters
npm run verify:provider-readonly
npm run verify:provider-read-contract
npm run verify:provider-read-audit
npm run verify:channel-runbook
```

Do not put operator API keys, webhook secrets, signatures, raw request bodies, customer messages, provider payloads, tenant IDs, or API URLs with query-string secrets into the deploy ticket, CI logs, Prometheus labels, alert annotations, or this repository.

## Deploy Sequence

1. Deploy migrations with `npm run db:migrate:deploy`.
2. Deploy the API and Web artifacts.
3. Confirm `GET /health/ready` is `ok` or intentionally `degraded` only under an accepted incident note.
4. Confirm `GET /metrics` is scrapeable and contains aggregate service, database, real-channel, and queue gauges only.
5. Run the production canary.
6. Confirm the operator workbench login works through the database-backed identity provider.
7. If real-channel intake is launching, enable the smallest allowlist first.
8. Keep the first window under active operator coverage until the oldest pending age and stale processing counts remain below thresholds.

## Rollback Triggers

Rollback or pause the launch immediately when any of these happen:

- `SmartCsAgentApiDown`, `SmartCsAgentDatabaseDown`, `SmartCsAgentRealChannelMisconfigured`, `SmartCsAgentRealChannelKillSwitchEnabled`, `SmartCsAgentChannelQueueDegraded`, `SmartCsAgentStaleProcessingClaims`, or `SmartCsAgentOldestPendingTooOld` fires.
- `npm run verify:production-canary` fails without an accepted degraded-rollout reason.
- `checks.channelWebhooks.status` is `misconfigured` or `disabled_by_kill_switch` during a real-channel-required launch.
- `staleProcessingCount` is above the launch threshold.
- `oldestPendingAgeSeconds` is above the launch threshold.
- Operators report duplicate cases, missing pending messages, unauthorized access, or customer-visible actions that bypass human review.

## Rollback Sequence

Use the smallest rollback that stops the risk:

1. Set `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true` to stop all real-channel signed intake without changing secrets.
2. Remove the affected pair from `REAL_CHANNEL_WEBHOOK_ALLOWLIST` if one merchant/channel must be paused.
3. Set `REAL_CHANNEL_WEBHOOKS_ENABLED=false` if the launch should return to operator-workbench-only mode.
4. Revert the application artifact only after intake is stopped or confirmed safe.
5. Run `npm run verify:production-readiness -- --env-file=<secure-production-env> --api=<public-api-url>` without `--require-real-channel` if real intake is intentionally closed.
6. Run `npm run verify:production-canary -- --api=<public-api-url> --allow-degraded` only when the incident owner has accepted queue pressure.
7. Check queue metrics and recover stale processing claims only when stale claims remain.

Rollback must not execute real refunds, address changes, coupons, logistics edits, or customer-visible replies. It should stop intake, preserve review data, and keep operator recovery explicit.

## Stale Claim Recovery

Use recovery only after confirming stuck `processing` claims:

```bash
curl -sS \
  -X POST \
  -H "Authorization: Bearer <admin-operator-key>" \
  -H "Content-Type: application/json" \
  -d '{"olderThanMinutes":15,"limit":50}' \
  https://api.example.com/v1/channel-events/recover-stale
```

After recovery:

- Check `GET /v1/channel-events/metrics` for `staleProcessingCount=0`.
- Check `GET /v1/channel-events/operation-audits` for a sanitized recovery record.
- Check `GET /v1/channel-events/audit-summary` for bounded totals.
- Confirm no audit response exposes raw audit JSON, event ID lists, normalized event IDs, tenant IDs, provider payloads, external IDs, customer messages, operator API keys, or secrets.

## Post-Launch Evidence

Collect these facts in the launch ticket without copying sensitive values:

- Git commit SHA and deployed artifact version.
- Migration status and whether there were pending migrations.
- Production readiness verifier result.
- Production canary result.
- Alert route confirmation.
- Real-channel intake state: closed, kill-switch enabled, or allowlist-open.
- Queue metrics summary: pending count, stale processing count, and oldest pending age.
- Operator coverage window and incident owner.
- Rollback decision: not needed, partial allowlist pause, kill switch, intake disabled, or artifact reverted.

Do not paste response bodies, metric bodies, customer messages, provider payloads, tenant IDs, external conversation IDs, external message IDs, operator API keys, webhook secrets, signatures, or raw request bodies.

## Rehearsal

Before opening real-channel traffic for a new merchant, rehearse these paths in a sandbox or staging environment:

- Healthy launch: readiness passes, canary passes, no queue pressure.
- Kill-switch rollback: `REAL_CHANNEL_WEBHOOK_KILL_SWITCH=true` closes intake and readiness reports `disabled_by_kill_switch`.
- Allowlist rollback: removing one allowlist pair blocks that merchant/channel while other pairs remain configured.
- Queue recovery: a stale processing claim returns to pending and leaves a sanitized recovery audit.
- Alert response: each critical alert has an owner and a runbook link.

The rehearsal is complete only when the team can stop intake, prove recovery, and continue the operator workbench without exposing secrets or executing customer-visible actions.

## Verification

Run:

```bash
npm run verify:production-launch
```

This checks that the launch runbook stays connected to readiness, canary, alerting, channel queue operations, rollback controls, recovery evidence, and no-secret/no-customer-action boundaries. Run `npm run verify:provider-adapters` alongside it when provider adapter contracts or action execution policy change.

Run `npm run verify:provider-readonly` alongside it when `PROVIDER_READONLY_ADAPTERS`, provider readonly config parsing, or `readCapabilities` changes.

Run `npm run verify:provider-read-contract` alongside it when `POST /v2/provider-reads/execute`, provider read policy, or readonly response fields change.

Run `npm run verify:provider-read-audit` alongside it when `ProviderReadRun`, provider read idempotency, lookup hashing, or sanitized audit behavior changes.
