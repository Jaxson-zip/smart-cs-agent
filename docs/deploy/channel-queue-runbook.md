# Channel Queue Operations Runbook

This runbook is for operators and on-call engineers who need to keep the real-channel review queue healthy. It covers the queue created by signed real-channel webhooks and the manual review bridge into after-sales cases.

The goal is simple: detect backlog or stuck `processing` claims early, recover safely, and avoid exposing tenant or customer data while doing it.

## Public Signals

Use these signals during deploy checks, incident triage, and daily operations:

| Signal | Purpose | Access |
| --- | --- | --- |
| `GET /health/ready` | Public readiness with database, webhook config, and source-wide aggregate channel queue health | No operator session required; no tenant data |
| `GET /v1/channel-events/metrics` | Tenant-scoped real-channel queue metrics | Operator API key required |
| `GET /api/operator/channel-events/metrics` | Same metrics through the Web BFF | Operator session required |
| `GET /v1/channel-events/operation-audits` | Tenant-scoped recent queue recovery records | Admin operator API key required |
| `GET /api/operator/channel-events/operation-audits` | Same recovery records through the Web BFF | Admin operator session required |
| `GET /v1/channel-events/audit-summary` | Tenant-scoped queue review and recovery totals over a bounded window | Admin operator API key required |
| `GET /api/operator/channel-events/audit-summary` | Same queue audit summary through the Web BFF | Admin operator session required |
| `POST /v1/channel-events/recover-stale` | Admin recovery for stale `processing` claims | Admin operator API key required |
| `POST /api/operator/channel-events/recover-stale` | Same recovery through the Web BFF | Admin operator session required |
| `POST /v1/channels/:channel/webhook/events` | Signed real-channel webhook intake | Disabled by default; HMAC and `REAL_CHANNEL_WEBHOOK_ALLOWLIST` required; optional per-process rate limit |

## Queue States

- `pending`: a normalized real-channel event is waiting for an operator to generate a reviewed after-sales case or ignore it.
- `processing`: an internal claim is in progress after replay starts. This should usually be short-lived.
- `replayed`: the event has created an internal after-sales case.
- `ignored`: an operator intentionally marked the event as not handled.

## Readiness States

- `ok`: database is reachable and aggregate queue thresholds are not exceeded.
- `degraded`: database is reachable, but queue pressure needs operator attention. `/health/ready` still returns HTTP 200.
- `unhealthy`: database readiness failed. `/health/ready` returns HTTP 503.

`degraded` means the service can still respond, but the team should inspect queue pressure before it becomes customer-visible delay.

## Threshold Configuration

Configure queue pressure through environment variables:

| Variable | Meaning | Default behavior |
| --- | --- | --- |
| `CHANNEL_QUEUE_PENDING_WARN_THRESHOLD` | Degrade readiness when pending count is greater than this value | Empty disables this warning |
| `CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS` | Degrade readiness when the oldest pending event age is greater than this value | Empty disables this warning |
| `CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD` | Degrade readiness when stale processing count is greater than this value | Empty disables this warning |
| `CHANNEL_QUEUE_STALE_AFTER_MINUTES` | Age at which `processing` is considered stale | Defaults to `15` |
| `REAL_CHANNEL_WEBHOOK_ALLOWLIST` | JSON array of tenant/channel pairs that may enter real-channel intake | Empty fails closed when real webhooks are enabled |
| `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE` | Per-process signed webhook intake limit for each `channel:tenantId` pair | `0` disables the application-level limit |

Readiness can report these degraded reasons:

- `pending_count_above_threshold`
- `oldest_pending_age_above_threshold`
- `stale_processing_above_threshold`

## Intake Rate Limit

Signed real-channel webhook intake can be protected with `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE`. The limit is checked after HMAC verification and before any replay receipt or normalized event is written. When a tenant/channel pair exceeds the configured per-minute limit, the API returns HTTP 429 and does not persist the webhook.

This is an application-level protection for the API process. Production deployments should still add gateway, CDN, or load-balancer rate limits because multi-process deployments do not share this in-memory counter.

## Gray-Release Allowlist

Signed real-channel webhook intake must also pass `REAL_CHANNEL_WEBHOOK_ALLOWLIST`. The allowlist is a JSON array of exact tenant/channel pairs, for example `[{"channel":"taobao","tenantId":"tenant_1"}]`. A webhook that is correctly signed but not allowlisted returns HTTP 403 after signature verification and before rate limiting, replay receipt writes, normalized event writes, case creation, action execution, or customer-visible replies.

Readiness may expose `allowlistedChannels` and `allowlistedPairCount`, but it must not expose tenant IDs. To roll back one merchant without closing the endpoint globally, remove that pair from `REAL_CHANNEL_WEBHOOK_ALLOWLIST` and redeploy/restart the API. To close all real-channel intake, set `REAL_CHANNEL_WEBHOOKS_ENABLED=false`.

## Production Intake Gates

When `NODE_ENV=production` and `REAL_CHANNEL_WEBHOOKS_ENABLED=true`, the API must fail closed unless all production intake gates are configured:

- `REAL_CHANNEL_WEBHOOK_SECRETS`: at least one tenant/channel secret.
- `REAL_CHANNEL_WEBHOOK_ALLOWLIST`: at least one tenant/channel pair, and every pair must have a matching secret.
- `REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE`: a positive per-minute application limit.
- `REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS`: an explicit positive freshness window.
- `CHANNEL_QUEUE_PENDING_WARN_THRESHOLD`: a backlog warning threshold.
- `CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS`: an oldest-pending-age threshold.
- `CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD`: a stale-processing warning threshold.
- `CHANNEL_QUEUE_STALE_AFTER_MINUTES`: a stale-processing age window.

These gates protect the real-channel intake from being enabled without a controlled merchant rollout, rate limiting, and queue observability. They do not replace provider allowlists, gateway/CDN rate limits, or the later production readiness verifier.

## Triage Steps

### 1. Check readiness

```bash
curl -sS http://localhost:4100/health/ready
```

If `status` is `unhealthy`, treat this as database or readiness dependency availability first. Queue recovery cannot help until the readiness path works.

If `status` is `degraded`, inspect `checks.channelQueue.reasons`.

### 2. Check queue metrics

```bash
curl -sS \
  -H "Authorization: Bearer <operator-key>" \
  http://localhost:4100/v1/channel-events/metrics
```

Look at:

- `pendingCount`: current unreviewed real-channel events for the operator tenant.
- `processingCount`: events currently claimed by replay.
- `staleProcessingCount`: claimed events older than the stale cutoff.
- `oldestPendingAgeSeconds`: how long the oldest pending customer message has waited.

### 3. Recover stale processing claims

Use this only when `staleProcessingCount` is above the threshold or an interrupted replay left events stuck in `processing`.

```bash
curl -sS \
  -X POST \
  -H "Authorization: Bearer <admin-operator-key>" \
  -H "Content-Type: application/json" \
  -d '{"olderThanMinutes":15,"limit":50}' \
  http://localhost:4100/v1/channel-events/recover-stale
```

Expected result:

```json
{
  "status": "recovered",
  "recoveredCount": 0,
  "recoveredBefore": "2026-06-06T07:15:00.000Z",
  "eventIds": []
}
```

Recovery moves old `processing` events back to `pending`, clears the processing claim, and writes an audit record.

### 4. Review recent recovery records

Use this after recovery to confirm who ran it, how many claims were restored, and whether stale processing claims were cleared afterward.

```bash
curl -sS \
  -H "Authorization: Bearer <admin-operator-key>" \
  http://localhost:4100/v1/channel-events/operation-audits
```

Expected result:

```json
[
  {
    "id": "audit_1",
    "type": "stale_processing_recovered",
    "operatorId": "admin_1",
    "recoveredCount": 2,
    "recoveredBefore": "2026-06-06T07:15:00.000Z",
    "queueHealthyAfter": true,
    "queueAfter": {
      "pendingCount": 4,
      "staleProcessingCount": 0
    },
    "createdAt": "2026-06-06T07:31:00.000Z"
  }
]
```

### 5. Recheck readiness

```bash
curl -sS http://localhost:4100/health/ready
```

If the only degraded reason was `stale_processing_above_threshold`, readiness should return to `ok` after recovery and the next metrics check.

If `pending_count_above_threshold` or `oldest_pending_age_above_threshold` remains, recovery is not the fix. Pause or reduce real-channel intake where possible, add operator capacity, and continue reviewing pending messages.

### 6. Review queue audit summary

Use this during daily operations or incident follow-up to see how many real-channel review messages became cases, were intentionally not handled, or were recovered from stale processing.

```bash
curl -sS \
  -H "Authorization: Bearer <admin-operator-key>" \
  "http://localhost:4100/v1/channel-events/audit-summary?from=2026-06-06T00:00:00.000Z&to=2026-06-06T23:59:59.999Z"
```

When `from` and `to` are omitted, the API returns the last 24 hours. Custom windows must be ordered and no longer than 24 hours.

Expected result:

```json
{
  "measuredAt": "2026-06-06T08:00:00.000Z",
  "window": {
    "from": "2026-06-05T08:00:00.000Z",
    "to": "2026-06-06T08:00:00.000Z"
  },
  "totals": {
    "replayedCount": 5,
    "ignoredCount": 3,
    "recoveryRunCount": 2,
    "recoveredEventCount": 5
  },
  "byOperator": [
    {
      "operatorId": "admin_1",
      "replayedCount": 2,
      "ignoredCount": 1,
      "recoveryRunCount": 1,
      "recoveredEventCount": 4,
      "lastActivityAt": "2026-06-06T07:45:00.000Z"
    }
  ]
}
```

## Safety Boundaries

Recovery is an operations safety valve, not a customer action.

It must not call AgentService, must not create cases, must not execute actions, and must not send customer-visible replies.

Metrics and readiness must not expose tenant IDs, must not expose customer messages, must not expose provider payloads, must not expose external conversation IDs, must not expose external message IDs, must not expose operator API keys, and must not expose secrets.

The Web BFF route may return tenant-scoped counts, timestamps, and age seconds to the browser. It must strip tenant/source/internal fields before responding.

Queue operation audit records are admin-only and read-only. They may return sanitized recovery counts, operator identity, timestamps, and queue-after counts. They must not expose raw audit JSON, tenant IDs, event ID lists, normalized event IDs, source names, provider payloads, external conversation IDs, external message IDs, operator API keys, or secrets.

Queue audit summaries are admin-only and read-only. They may return bounded windows up to 24 hours, aggregate counts, operator IDs, and last activity timestamps. They must not expose raw audit JSON, tenant IDs, event ID lists, normalized event IDs, source names, provider payloads, customer messages, external conversation IDs, external message IDs, operator API keys, or secrets.

Real-channel webhook rate limiting must run after signature verification and before persistence. A 429 response must not write replay receipts, must not write normalized channel events, after-sales cases, actions, audit records with payloads, or customer-visible replies.

## Verification

Run the documentation verifier after changing readiness, channel-event metrics, recovery, or the public API surface:

```bash
npm run verify:channel-runbook
```

The verifier checks this runbook, `.env.example`, `docs/deploy/public-api-surface.md`, and the relevant API source files for the required endpoints, threshold variables, degraded reasons, and safety boundaries.
