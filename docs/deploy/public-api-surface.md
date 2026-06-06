# Public API Surface

本文档记录当前沙盒/预生产阶段允许暴露的 HTTP API 面。新增路由时必须更新本表，并补对应测试。

## API Service

| Route | Exposure | Required Boundary |
| --- | --- | --- |
| `GET /health` | Public liveness | No tenant data, no database details |
| `GET /health/ready` | Public readiness | No tenant data; may return 503 when DB unavailable |
| `GET /v1/cases` | Operator API | `Authorization: Bearer <operator-key>` or `x-api-key`; tenant derived from key |
| `GET /v1/cases/:id` | Operator API | Same as `/v1/cases`; service filters by tenant |
| `GET /v1/rules/:tenantId?` | Operator API | Same as `/v1/cases`; path tenant must match key tenant |
| `POST /v1/wecom/events` | Sandbox channel intake | Controlled by `WECOM_SANDBOX_ENABLED`; production disabled unless explicitly enabled |
| `POST /v1/wecom/webhook/send` | Operator API | Operator key required; body `merchantId` must match key tenant |
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
| `GET /api/operator/readiness` | Operator BFF readiness | Proxies API readiness without tenant data |
| `POST /api/chat` | Legacy demo API | Disabled by default; only enabled with `ENABLE_LEGACY_WEB_DEMO_API=true` |
| `GET /api/db` | Legacy demo API | Disabled by default; only enabled with `ENABLE_LEGACY_WEB_DEMO_API=true` |

## Rules

- No route that returns merchant/customer/order/case data should be public.
- Browser-public env vars are not secrets. Operator keys must stay server-side, either in the DB-backed operator account store or protected service env vars such as `OPERATOR_API_KEYS`; Web code must never use `NEXT_PUBLIC_OPERATOR_API_KEY`.
- Web BFF auth responses must never expose account passwords or operator API keys. `/api/operator/me` may return `username`, `tenantId`, `operatorId`, `role`, and derived permission booleans only.
- Web BFF account-management responses must never expose `passwordHash` or `apiKey`; they may return account identity, role, disabled state, and `sessionVersion`.
- Production operator accounts must use the `OperatorAccount` table with `passwordHash`; disabled accounts and mismatched `sessionVersion` values must invalidate sessions before any operator data is proxied.
- Operator account creation and updates must be tenant-scoped from the admin session and must write an audit record without secrets.
- `OPERATOR_IDENTITY_PROVIDER` is the Web BFF identity boundary. Supported deployable values are `database` and `env`; reserved values such as `oidc` and `sso` fail closed until a real provider adapter is implemented.
- `OPERATOR_SESSION_ACCOUNTS` is only a local/sandbox fallback. Deployable environments should set `OPERATOR_IDENTITY_PROVIDER=database` after migrations and seed/bootstrap have created operator accounts. `OPERATOR_IDENTITY_PROVIDER` takes precedence over `OPERATOR_ACCOUNT_SOURCE`; the legacy `OPERATOR_ACCOUNT_SOURCE` switch is only consulted when the new provider variable is unset.
- The current Web login is a first account-service boundary, not full commercial SSO/RBAC. A later production stage should add a real OIDC/SSO adapter behind this boundary.
- Legacy demo APIs are not part of the production product path and must stay disabled in deployable environments.
- Real production channel webhooks must add provider signature verification before replacing the sandbox intake.
