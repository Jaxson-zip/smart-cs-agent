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
| `GET /` | Public web shell | Reads operator data from API only through configured sandbox boundary |
| `GET /api/operator/cases` | Operator BFF | Server-side `OPERATOR_API_KEY`; browser does not receive the key |
| `GET /api/operator/cases/:id` | Operator BFF | Server-side `OPERATOR_API_KEY`; browser does not receive the key |
| `GET /api/operator/readiness` | Operator BFF readiness | Proxies API readiness without tenant data |
| `POST /api/chat` | Legacy demo API | Disabled by default; only enabled with `ENABLE_LEGACY_WEB_DEMO_API=true` |
| `GET /api/db` | Legacy demo API | Disabled by default; only enabled with `ENABLE_LEGACY_WEB_DEMO_API=true` |

## Rules

- No route that returns merchant/customer/order/case data should be public.
- Browser-public env vars are not secrets. Operator keys must stay in server-side env vars such as `OPERATOR_API_KEY`.
- Legacy demo APIs are not part of the production product path and must stay disabled in deployable environments.
- Real production channel webhooks must add provider signature verification before replacing the sandbox intake.
