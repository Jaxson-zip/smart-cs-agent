# PR33 Production Alerting Pack

This pack turns the public production signals from `/health/ready` and `/metrics` into deploy and on-call checks. It is a starting point for a commercial rollout, not a replacement for provider dashboards, database monitoring, or human review of high-risk after-sales cases.

## Prometheus alert rules

Use `docs/deploy/production-alerts.prometheus.yml.example` as the first Prometheus rule group for the API. The scrape target should point at public `GET /metrics` and should use the Prometheus job label `job="smart-cs-agent"` unless your deployment rewrites the `SmartCsAgentApiDown` expression.

Recommended routing:

| Alert | Severity | First response |
| --- | --- | --- |
| `SmartCsAgentApiDown` | critical | Check deploy status, process health, and ingress routing. |
| `SmartCsAgentDatabaseDown` | critical | Check database availability before queue recovery. |
| `SmartCsAgentRealChannelMisconfigured` | critical | Close real-channel intake, check secrets and allowlist config, then redeploy. |
| `SmartCsAgentRealChannelKillSwitchEnabled` | warning | Confirm whether the emergency stop is intentional. Escalate if launch requires real intake. |
| `SmartCsAgentChannelQueueDegraded` | warning | Check queue pressure and operator capacity. |
| `SmartCsAgentStaleProcessingClaims` | warning | Run admin stale-processing recovery only after confirming stuck claims. |
| `SmartCsAgentOldestPendingTooOld` | warning | Reduce intake or add operator coverage before delay becomes customer-visible. |

Do not page on customer-visible automation from these alerts alone. These alerts prove operational pressure or configuration risk; they do not prove that a refund, address change, coupon, or customer reply was safely executed.

## Canary schedule

Use `docs/deploy/production-canary-schedule.yml.example` when GitHub Actions is the easiest place to run an external canary. It runs every five minutes and can also be triggered manually.

The scheduled job calls:

```bash
npm run verify:production-canary -- --api="$SMART_CS_API_URL" --require-real-channel --timeout-ms=5000 --max-stale-processing=0 --max-oldest-pending-age-seconds=900
```

Use `--require-real-channel` only for launch windows where real signed webhook intake must be open. For an operator-workbench-only deployment, remove that flag or run a second non-real-channel canary.

No operator API key is needed. The canary reads only public readiness and metrics.

## Safety Boundary

Alert rules, canary logs, and alert routing labels must not include tenant IDs.
They must not include customer messages.
They must not include provider payloads.
They must not include external conversation IDs or external message IDs.
They must not include operator API keys.
They must not include webhook secrets.
They must not include request signatures, raw request bodies, or full metric bodies.

The API URL should be stored as `SMART_CS_API_URL` in the scheduler secret store. Do not place API URLs with credentials or query-string secrets in workflow files, Prometheus labels, or alert annotations.

## Verification

Run this whenever changing production alerting, canary scheduling, public metrics, or readiness behavior:

```bash
npm run verify:production-alerting
```

Then run the existing production gates:

```bash
npm run verify:production-canary -- --api=https://api.example.com --require-real-channel
npm run verify:channel-runbook
```
