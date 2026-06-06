# Public API Surface

Operational runbook: `docs/deploy/channel-queue-runbook.md` covers channel queue readiness, metrics, stale recovery, degraded reasons, and safety boundaries. Keep it in sync with this API surface.

本文档记录当前沙盒/预生产阶段允许暴露的 HTTP API 面。新增路由时必须更新本表，并补对应测试。

## API Service

| Route | Exposure | Required Boundary |
| --- | --- | --- |
| `GET /health` | Public liveness | No tenant data, no database details |
| `GET /health/ready` | Public readiness | No tenant data; may return `ok`, `degraded`, or 503 `unhealthy` when DB unavailable |
| `GET /v1/cases` | Operator API | `Authorization: Bearer <operator-key>` or `x-api-key`; tenant derived from key |
| `GET /v1/cases/:id` | Operator API | Same as `/v1/cases`; service filters by tenant |
| `GET /v1/rules/:tenantId?` | Operator API | Same as `/v1/cases`; path tenant must match key tenant |
| `GET /v1/channel-events` | Operator API | Operator key required; lists only `source=real_channel_webhook` pending normalized events for the key tenant |
| `GET /v1/channel-events/metrics` | Operator API | Operator key required; returns tenant-scoped real-channel queue counts and age metrics without customer message details |
| `POST /v1/channel-events/recover-stale` | Operator API admin | Admin operator key required; recovers stale `processing` real-channel review events for the key tenant back to `pending` and writes an audit record |
| `POST /v1/channel-events/:id/replay` | Operator API | Operator key required; replays one pending normalized event into a human-reviewed after-sales case without executing actions or sending replies |
| `POST /v1/channel-events/:id/ignore` | Operator API | Operator key required; marks one pending normalized event ignored for the key tenant |
| `POST /v1/wecom/events` | Sandbox channel intake | Controlled by `WECOM_SANDBOX_ENABLED`; production disabled unless explicitly enabled |
| `POST /v1/wecom/webhook/send` | Operator API | Operator key required; body `merchantId` must match key tenant |
| `POST /v1/channels/:channel/webhook/events` | Real-channel normalization intake | Disabled unless `REAL_CHANNEL_WEBHOOKS_ENABLED=true`; requires raw-body HMAC headers, timestamp freshness, configured tenant secret, and replay receipt uniqueness; writes a `NormalizedChannelEvent`; returns `mode: normalized_only` and does not create cases or execute actions |
| `GET /v2/integrations` | Legacy operator API | Operator key required |
| `POST /v2/channel-events` | Legacy operator API | Operator key required |
| `POST /v2/actions/execute` | Legacy operator API | Operator key required; server context overrides body `operatorId` |
| `POST /v2/compensation/declined` | Legacy operator API | Operator key required |
| `POST /v2/handoffs` | Legacy operator API | Operator key required |

## Web Service

| Route | Exposure | Required Boundary |
| --- | --- | --- |
| `GET /` | Public web shell | Shows login state before loading operator data |
| `POST /api/operator/login` | Operator BFF auth | Authenticates through the configured `OPERATOR_IDENTITY_PROVIDER`; the current deployable providers are DB-backed operator accounts and explicit local env fallback, both issuing HttpOnly signed session cookies |
| `POST /api/operator/logout` | Operator BFF auth | Clears HttpOnly session cookie |
| `GET /api/operator/me` | Operator BFF auth | Requires HttpOnly operator session; returns sanitized operator profile and role permissions |
| `GET /api/operator/operators` | Operator BFF admin | Requires HttpOnly admin session; returns sanitized operator account summaries for the session tenant |
| `POST /api/operator/operators` | Operator BFF admin | Requires HttpOnly admin session; creates a tenant-scoped operator account with a server-side password hash |
| `PATCH /api/operator/operators/:operatorId` | Operator BFF admin | Requires HttpOnly admin session; updates role/disabled status and can revoke sessions by incrementing `sessionVersion` |
| `GET /api/operator/cases` | Operator BFF | Requires HttpOnly operator session; BFF derives API key, tenant, and operator from server-side account config |
| `GET /api/operator/cases/:id` | Operator BFF | Same as `/api/operator/cases`; browser does not receive operator key |
| `GET /api/operator/channel-events` | Operator BFF | Requires HttpOnly operator session; lists pending real-channel review messages through the server-side API key and returns only UI-safe fields |
| `GET /api/operator/channel-events/metrics` | Operator BFF | Requires HttpOnly operator session; proxies queue metrics and strips tenant/source/internal fields before returning to the browser |
| `POST /api/operator/channel-events/recover-stale` | Operator BFF admin | Requires HttpOnly admin session; proxies stale review recovery without exposing operator keys |
| `POST /api/operator/channel-events/:id/replay` | Operator BFF | Requires HttpOnly operator/operator-admin session; viewer sessions are blocked before proxying; creates an internal human-reviewed case only |
| `POST /api/operator/channel-events/:id/ignore` | Operator BFF | Requires HttpOnly operator/operator-admin session; viewer sessions are blocked before proxying; marks a pending review message not handled |
| `GET /api/operator/readiness` | Operator BFF readiness | Proxies API readiness without tenant data |
| `POST /api/chat` | Legacy demo API | Disabled by default; only enabled with `ENABLE_LEGACY_WEB_DEMO_API=true` |
| `GET /api/db` | Legacy demo API | Disabled by default; only enabled with `ENABLE_LEGACY_WEB_DEMO_API=true` |

## Rules

- No route that returns merchant/customer/order/case data should be public.
- Browser-public env vars are not secrets. Operator keys must stay server-side, either in the DB-backed operator account store or protected service env vars such as `OPERATOR_API_KEYS`; Web code must never use `NEXT_PUBLIC_OPERATOR_API_KEY`.
- Web BFF auth responses must never expose account passwords or operator API keys. `/api/operator/me` may return `username`, `tenantId`, `operatorId`, `role`, and derived permission booleans only.
- Web BFF account-management responses must never expose `passwordHash` or `apiKey`; they may return account identity, role, disabled state, and `sessionVersion`.
- Web BFF channel-event responses must be sanitized before reaching the browser. The operator UI may receive customer name, channel, message text, and received time, but must not receive or render webhook, normalized event, source, payload, tenant, API key, or external message identifiers.
- Production operator accounts must use the `OperatorAccount` table with `passwordHash`; disabled accounts and mismatched `sessionVersion` values must invalidate sessions before any operator data is proxied.
- Operator account creation and updates must be tenant-scoped from the admin session and must write an audit record without secrets.
- `OPERATOR_IDENTITY_PROVIDER` is the Web BFF identity boundary. Supported deployable values are `database` and `env`; reserved values such as `oidc` and `sso` fail closed until a real provider adapter is implemented.
- `OPERATOR_SESSION_ACCOUNTS` is only a local/sandbox fallback. Deployable environments should set `OPERATOR_IDENTITY_PROVIDER=database` after migrations and seed/bootstrap have created operator accounts. `OPERATOR_IDENTITY_PROVIDER` takes precedence over `OPERATOR_ACCOUNT_SOURCE`; the legacy `OPERATOR_ACCOUNT_SOURCE` switch is only consulted when the new provider variable is unset.
- The current Web login is a first account-service boundary, not full commercial SSO/RBAC. A later production stage should add a real OIDC/SSO adapter behind this boundary.
- Legacy demo APIs are not part of the production product path and must stay disabled in deployable environments.
- Real-channel webhook intake is a normalization boundary only. It accepts signed receipts and writes `NormalizedChannelEvent`, but must not route into Agent/Action/customer replies until a later sandbox replay and provider adapter stage is separately reviewed.
- Real-channel webhook signatures use `x-smartcs-signature-version: v1`, `x-smartcs-tenant-id`, `x-smartcs-event-id`, `x-smartcs-timestamp`, and `x-smartcs-signature`. The HMAC payload is `version + channel + tenantId + timestamp + eventId + sha256(rawBody)`, joined by newline characters.
- Real-channel readiness may expose configured channel names, but must never expose webhook secrets, signatures, or raw request bodies.
- Real-channel replay APIs are operator-gated review controls over `NormalizedChannelEvent.source=real_channel_webhook` only. Replay may create an after-sales case, customer message, pending action rows, and audit logs, but must force `human_confirm` or `human_takeover`; it must never return `auto_execute`, call channel `sendMessage()`, or run action execution.
- Real-channel metrics are read-only and tenant-scoped. They may expose counts, timestamps, and age seconds, but must not expose customer message text, tenant identifiers, source names, webhook payloads, external conversation IDs, or external message IDs to the browser.
- Readiness may include aggregate real-channel queue health. It may report `degraded` when configured queue thresholds are exceeded, but it must not expose tenant identifiers, customer message text, payloads, external conversation IDs, or external message IDs.
- Real-channel stale recovery is admin-only. It may move old `processing` events back to `pending` for the same tenant/source after a crash or interrupted replay, but it must not call AgentService, create cases, execute actions, or send customer replies.
