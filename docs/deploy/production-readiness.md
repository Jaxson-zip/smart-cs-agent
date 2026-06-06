# Production-Readiness Baseline

## PR22 Operator Queue Operations Status

The operator workbench now reads API readiness and real-channel queue metrics through the same-origin BFF. Operators see a compact product-language queue status for normal intake, backlog, unavailable queue status, and stale processing claims. Admin operators can recover stale processing claims from the workbench without exposing operator API keys or raw channel-event internals to the browser.

The Web API client keeps queue metrics sanitized to counts, timestamps, and age values. It must not surface tenant IDs, source names, provider payloads, external conversation IDs, external message IDs, operator API keys, or secrets.

## PR21 Channel Queue Operations Runbook

Channel queue operations are now documented in `docs/deploy/channel-queue-runbook.md`. The runbook covers `/health/ready`, `GET /v1/channel-events/metrics`, `POST /v1/channel-events/recover-stale`, the Web BFF equivalents, threshold env vars, degraded reason codes, triage steps, and safety boundaries.

The runbook is guarded by `npm run verify:channel-runbook`, which checks the runbook, `.env.example`, `docs/deploy/public-api-surface.md`, and the relevant API source files for required operational facts. Any future change to readiness, queue metrics, stale recovery, or the public API surface should update the runbook and keep this verifier passing.

## PR20 Queue Readiness Thresholds

`GET /health/ready` now includes aggregate real-channel queue health. Database failure still returns HTTP 503 with `status=unhealthy`; queue pressure returns HTTP 200 with `status=degraded` so deploy platforms can distinguish "service is up but needs operator attention" from "service cannot serve".

Queue degraded thresholds are configured with `CHANNEL_QUEUE_PENDING_WARN_THRESHOLD`, `CHANNEL_QUEUE_OLDEST_PENDING_WARN_SECONDS`, `CHANNEL_QUEUE_STALE_PROCESSING_WARN_THRESHOLD`, and `CHANNEL_QUEUE_STALE_AFTER_MINUTES`. Empty threshold values disable the corresponding warning. Readiness queue checks are source-wide aggregates and must not expose tenant IDs, customer messages, provider payloads, external conversation IDs, or external message IDs.

## PR19 Queue Metrics

Real-channel review operations now expose a tenant-scoped queue metrics snapshot through `GET /v1/channel-events/metrics` and the same-origin BFF route `GET /api/operator/channel-events/metrics`. The response includes counts for `pending`, `processing`, stale `processing`, `replayed`, and `ignored`, plus the oldest pending receive time and age in seconds.

The metrics route is read-only and must not expose customer message text, tenant identifiers, provider payloads, source names, external conversation IDs, external message IDs, operator API keys, or secrets to the browser.

## PR18 Processing Recovery

Admin operators can recover stale real-channel review events through `POST /v1/channel-events/recover-stale` or the same-origin BFF route `POST /api/operator/channel-events/recover-stale`. Recovery only touches the current tenant, `source=real_channel_webhook`, `reviewStatus=processing`, and rows whose `reviewedAt` is older than the requested cutoff.

This is an operations safety valve for interrupted replay attempts. It moves stale claims back to `pending`, clears `reviewedBy` and `reviewedAt`, records a non-secret audit log, and does not call AgentService, create cases, execute actions, or send customer-visible replies.

## PR17 Channel Review Concurrency

Real-channel review replay now uses a server-side `pending -> processing -> replayed` lifecycle. The `processing` status is an internal claim state, not an operator-facing product state. Its purpose is to prevent two operators from generating duplicate after-sales cases from the same pending real-channel message.

If replay or ignore loses the claim because the event has already been reviewed, the API returns HTTP 409 Conflict. If the event does not belong to the operator tenant or real-channel source, the API returns 404. Replay still forces `human_confirm` or `human_takeover`; it must not execute commerce actions or send real customer replies.

本文档定义 PR1 的可部署沙盒门槛。当前目标是 deployable sandbox / production-readiness baseline，用于让团队和 GitHub 自动验证基础质量；它不代表已经接入真实淘宝、抖音或企业微信生产链路，也不声称系统已生产可用。

## 范围

- 覆盖 V1.2 售后沙盒闭环：本地/沙盒事件进入 API，生成工单、消息、动作和审计记录，并可通过客服台查看。
- PR13/PR14 增加真实渠道 webhook 的安全接收和归一化边界：默认关闭，启用后只做 raw-body HMAC、时间窗、租户密钥、replay receipt 校验和 `NormalizedChannelEvent` 入库；不创建工单、不触发 Agent、不发送客户可见回复、不执行真实退款/改地址/补偿。
- GitHub Actions 只验证基础质量：依赖安装、Prisma client 生成、API 单测、TypeScript、lint、build。
- CI 不连接真实外部数据库；`DATABASE_URL` 使用 dummy Postgres URL，仅供 Prisma generate 解析 schema。
- 真实电商渠道、真实支付/退款、真实物流回写、正式 SSO/RBAC/账号后台均不在 PR1 范围。

## CI Gate

PR1 合入前必须通过质量门禁。当前仓库提供 `docs/deploy/sandbox-ci.yml.example` 作为 GitHub Actions 模板；安装时将它复制到 `.github/workflows/sandbox-ci.yml`。注意：推送 `.github/workflows/*` 需要 GitHub token 具备 `workflow` scope。

```bash
npm ci
npm run db:generate
npm run test --workspace @smart-cs-agent/api
npm run typecheck --workspaces --if-present -- --pretty false
npm run lint --workspaces --if-present -- --max-warnings=0
npm run build --workspaces --if-present
```

CI 环境变量使用沙盒默认值：

```bash
DATABASE_URL=postgresql://smartcs_ci:smartcs_ci@localhost:5432/smartcs_ci?schema=public
OPENAI_API_KEY=
WEB_ORIGIN=http://localhost:3000
PORT=4100
WECOM_SANDBOX_ENABLED=true
REAL_CHANNEL_WEBHOOKS_ENABLED=false
REAL_CHANNEL_WEBHOOK_SECRETS=[]
REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS=300
NEXT_PUBLIC_API_URL=http://localhost:4100
NEXT_PUBLIC_WS_URL=http://localhost:4100
NEXT_PUBLIC_ENABLE_OFFLINE_DEMO=false
API_URL=http://localhost:4100
OPERATOR_API_KEY=dev_operator_key
OPERATOR_SESSION_SECRET=replace_with_a_long_random_secret
OPERATOR_IDENTITY_PROVIDER=database
OPERATOR_ACCOUNT_SOURCE=database
OPERATOR_SESSION_ACCOUNTS=[{"username":"demo","passwordHash":"scrypt:<salt>:<hash>","tenantId":"demo_tenant","operatorId":"sandbox_operator","role":"admin","apiKey":"dev_operator_key","sessionVersion":1}]
```

如果后续新增需要数据库连接的集成测试，应显式在 CI 中启动 Postgres service，并隔离为 integration/smoke job，避免让 API 单测隐式依赖外部数据库。

## 环境变量

部署沙盒环境至少需要：

- `DATABASE_URL`：Postgres 连接串。沙盒可使用独立数据库，禁止复用生产库。
- `OPENAI_API_KEY`：PR1 可以为空；为空时不得把 LLM 能力视为已上线。
- `WEB_ORIGIN`：允许访问 API/WebSocket 的前端 origin。
- `PORT`：API 监听端口，默认 `4100`。
- `WECOM_SANDBOX_ENABLED`：沙盒入站模拟入口开关。本地演示可以为 `true`；生产环境未显式设为 `true` 时，`/v1/wecom/events` 默认不可用。
- `REAL_CHANNEL_WEBHOOKS_ENABLED`：真实渠道 webhook 安全接收入口开关，默认必须为 `false`。只有在完成渠道密钥配置、迁移和安全 smoke 后才可显式设为 `true`。
- `REAL_CHANNEL_WEBHOOK_SECRETS`：真实渠道 webhook 租户密钥 JSON 数组，格式为 `[{"channel":"taobao","tenantId":"tenant_1","secret":"long-random-secret"}]`。该值只能放在服务端 secret 管理中，不得提交到 Git，不得暴露给浏览器。
- `REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS`：真实渠道 webhook 时间窗，默认 `300` 秒。过期、未来偏移过大、重复 `eventId` 都应拒绝。
- `REAL_CHANNEL_WEBHOOK_SMOKE_SECRET`：本地 `npm run demo:real-channel-smoke` 使用的测试密钥，必须与服务端 `REAL_CHANNEL_WEBHOOK_SECRETS` 中同租户/渠道 secret 一致；不要用于真实商户。
- `API_URL`：Web 服务端 BFF 访问 API 的内部地址，默认可指向 `http://localhost:4100`。
- `NEXT_PUBLIC_API_URL`：旧健康检查客户端的公开 API 地址；客服台主数据路径不应再依赖它直连 API。
- `NEXT_PUBLIC_WS_URL`：WebSocket 地址；本地可与 API 地址相同。
- `NEXT_PUBLIC_ENABLE_OFFLINE_DEMO`：离线演示工单开关，默认必须为 `false`。生产和可部署沙盒不得用假工单掩盖 403/503/配置错误。
- `OPERATOR_API_KEYS`：PR3 沙盒客服台 API key 配置，格式为 JSON 数组，例如 `[{"key":"dev_operator_key","tenantId":"demo_tenant","operatorId":"sandbox_operator","role":"admin"}]`。配置后，`/v1/cases` 和 `/v1/rules` 等客服侧接口必须携带 `Authorization: Bearer <key>` 或 `x-api-key`。
- `OPERATOR_API_KEY`：本地 smoke 脚本或直连 API 验证时使用的 operator key，应匹配 `OPERATOR_API_KEYS` 中的一项。Web 客服台 BFF 不再直接使用该变量，也不要使用 `NEXT_PUBLIC_` 前缀。
- `OPERATOR_SESSION_SECRET`：Web 客服台签发 HttpOnly 登录 cookie 的服务端密钥。部署环境必须使用长随机值，并通过 secret 管理；生产环境会拒绝占位值和过短密钥。
- `OPERATOR_SESSION_ACCOUNTS`：Web 客服台沙盒账号配置，格式为 JSON 数组，例如 `[{"username":"demo","passwordHash":"scrypt:<salt>:<hash>","tenantId":"demo_tenant","operatorId":"sandbox_operator","role":"admin","apiKey":"dev_operator_key","sessionVersion":1}]`。登录后 BFF 会从该账号派生 `apiKey`、`tenantId` 和 `operatorId` 调用 API；生产环境会拒绝默认 demo 账号和明文 `password`。`role` 当前支持 `admin`、`operator`、`viewer`，并映射为 Web 侧权限。`disabled: true` 会禁止登录并让已有 session 失效；提升 `sessionVersion` 可撤销旧 session。
- `ALLOW_INSECURE_OPERATOR_HEADERS`：只用于本地沙盒调试，默认 `false`。生产环境未配置 `OPERATOR_API_KEYS` 时，默认拒绝只靠 `x-tenant-id` 的访问；除非显式设为 `true`。
- `ENABLE_LEGACY_WEB_DEMO_API`：早期 Web demo 的 `/api/chat` 和 `/api/db` 开关，默认应为 `false`。部署沙盒和生产环境不得打开，除非是隔离的历史演示环境。

敏感值应由部署平台 secret 管理，不应提交到 Git。

生产账号应使用 `passwordHash`，当前支持 `scrypt:<salt>:<hash>` 格式。可用下面的 Node 命令生成单个账号 hash：

```bash
node -e "const { randomBytes, scryptSync } = require('node:crypto'); const p = process.argv[1]; const s = randomBytes(16).toString('base64url'); console.log('scrypt:' + s + ':' + scryptSync(p, s, 32).toString('base64url'))" "replace-password"
```

API 进程在本地和测试环境会尝试读取项目 `.env`；`NODE_ENV=production` 或 `CI=true` 时默认只信任真实环境变量。若确实需要在特殊环境读取 `.env`，可以显式设置 `SMART_CS_LOAD_DOTENV=true`，但生产部署不建议这样做。

## Postgres、迁移和 Seed

PR1 的可部署沙盒需要独立 Postgres 实例：

1. 创建空数据库和受限账号，账号仅授予该沙盒数据库权限。
2. 设置 `DATABASE_URL` 指向沙盒数据库。
3. 运行 `npm run db:generate` 生成 Prisma client。
4. 运行迁移命令。部署环境应使用 Prisma deploy 语义，例如 `npx prisma migrate deploy`。
5. 运行 `npm run db:seed` 写入演示租户、规则、订单和售后案例基础数据。

迁移前应确认目标库不是生产库。Seed 数据只用于沙盒演示，不应导入真实客户、订单或售后记录。

## Health、Readiness 和 Smoke

当前 API 提供 `GET /health`，用于确认 API 进程可响应：

```bash
curl http://localhost:4100/health
```

PR1 的 readiness baseline 还应通过数据库路径验证，而不是只看 `/health`：

- `GET /health/ready` 能确认 API 到数据库的路径是否可用；数据库不可用时应返回 HTTP 503。
- `GET /health/ready` 的 `checks.channelWebhooks` 会展示真实渠道 webhook 的 readiness：默认 `disabled`，启用但缺少/损坏密钥时为 `misconfigured`，配置正确时为 `ok`。该响应只能出现渠道名，不得出现 secret、signature、raw body。
- `POST /v1/channels/:channel/webhook/events` 是真实渠道安全接收和归一化入口。启用后必须携带 `x-smartcs-signature-version: v1`、`x-smartcs-tenant-id`、`x-smartcs-event-id`、`x-smartcs-timestamp` 和 `x-smartcs-signature`；签名 payload 为 `version/channel/tenantId/timestamp/eventId/sha256(rawBody)` 逐行拼接后做 HMAC-SHA256。成功返回 `202`、`mode: normalized_only` 和 `normalizedEventId`，但不回显客户消息文本。
- 真实渠道入口会先完成签名验证和 payload 归一化，再在同一事务中写入 replay receipt 与 `NormalizedChannelEvent`。归一化失败时不应写 replay receipt，以免合法重试被重复事件保护误拦截。
- `GET /v1/cases` 携带 `Authorization: Bearer <operator-key>` 后能读取该 key 所属租户的 seed 或 smoke 后售后工单。
- `GET /v1/channel-events` 携带 `Authorization: Bearer <operator-key>` 后只能读取该 key 所属租户仍处于 `pending` 且 `source=real_channel_webhook` 的真实渠道归一化事件。
- `POST /v1/channel-events/:id/replay` 携带 operator key 后，可将一个 pending 归一化事件转成售后工单，但必须强制进入 `human_confirm` 或 `human_takeover`，不得自动执行动作、不得真实回传、不得创建 agent 已发送消息。
- `POST /v1/channel-events/:id/ignore` 携带 operator key 后，可将一个 pending 归一化事件标记为 `ignored`，用于重复、噪音或暂不处理的真实渠道消息。
- `GET /v1/rules/demo_tenant` 携带 `Authorization: Bearer <operator-key>` 后能读取该 key 所属租户的沙盒规则配置；请求其他租户应返回 403。
- `GET /v2/integrations`、`POST /v2/actions/execute`、`POST /v2/compensation/declined`、`POST /v2/handoffs` 等操作侧接口也必须携带 operator key。
- `POST /v1/wecom/webhook/send` 必须携带 operator key，且 key 所属租户必须与 body 中的 `merchantId` 一致。
- Web 客服台应先通过 `/api/operator/login` 获取 HttpOnly session cookie，再通过同源 `/api/operator/me`、`/api/operator/cases`、`/api/operator/cases/:id` 和 `/api/operator/readiness` 访问 API；浏览器包中不得包含 operator key。
- `/api/operator/me` 应返回脱敏身份和权限：`admin` 可查看、确认、接管、管理规则和管理客服；`operator` 可查看、确认、接管；`viewer` 只可查看。
- Web 侧 `/api/chat` 和 `/api/db` 默认返回 404；只有显式设置 `ENABLE_LEGACY_WEB_DEMO_API=true` 才会打开旧 demo 接口。
- `npm run demo:smoke` 能向沙盒 API 发送 5 条售后消息，并验证分类、风险等级和自动化模式。
- `npm run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=tenant_1 --secret=<matching-secret>` 能验证真实渠道安全入口可以接受一条签名事件并归一化入库。运行前服务端必须显式设置 `REAL_CHANNEL_WEBHOOKS_ENABLED=true` 和匹配的 `REAL_CHANNEL_WEBHOOK_SECRETS`。该 smoke 不会触发 Agent、Action 或客户消息回传。
- `npm run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=tenant_1 --secret=<matching-secret> --replay --operator-api-key=<operator-key>` 会继续验证归一化事件可被 operator 手动回放为人工审核工单；该 smoke 仍应证明 `automationMode` 不是 `auto_execute`。

公开路由清单见 `docs/deploy/public-api-surface.md`。新增任何 HTTP 路由时，应同步更新该清单和对应测试。

真实渠道鉴权状态未来应作为独立 channel readiness 展示，不应阻塞当前沙盒 readiness。

## 回滚

PR1 的回滚边界是应用版本和沙盒数据库 schema：

- 应用回滚：回退到上一版本镜像或上一部署 artifact。
- 数据库回滚：优先恢复沙盒数据库备份；不要在未知状态下手写反向 SQL。
- Seed 回滚：可清空并重建沙盒数据库，再重新执行迁移和 `npm run db:seed`。
- 配置回滚：恢复上一组部署平台环境变量。

任何涉及真实客户数据、真实退款动作或真实渠道 webhook 的变更，都必须另起生产变更流程，不得混入 PR1 的沙盒回滚策略。

## 风险边界

- 当前基线验证的是可部署沙盒质量，不验证真实淘宝/抖音/企业微信接入。
- CI 的 `DATABASE_URL` 是 dummy 值；它证明 Prisma schema 可生成 client，不证明数据库可连接。
- API 单测使用本地 mock/in-memory 路径，不覆盖真实数据库并发、锁、索引或网络抖动。
- `/health` 只说明进程存活；沙盒发布前仍需执行 readiness 检查和 smoke。
- `OPENAI_API_KEY` 为空时，任何依赖真实模型调用的能力都应视为未启用。
- 沙盒 smoke payload 是演示数据，不可作为真实售后判责、退款或客服绩效依据。
- 真实渠道 webhook PR13/PR14 只证明“可安全接收签名事件并归一化入库”，不证明已经能生产处理淘宝/抖音售后。进入自动处理前还需要沙盒回放、人工审核开关、provider-specific 错误处理和真实小流量灰度。
- PR15 的回放池只证明“人工可控地把真实渠道归一化事件转成内部售后工单”。它只接受 `source=real_channel_webhook` 的事件，仍不代表真实客户回复、真实退款、真实改地址或真实补偿动作已经上线。
- `ChannelWebhookReceipt` 只保存 `channel`、`tenantId`、`eventId`、`bodySha256` 和时间信息；不得保存 raw body、signature 或密钥。
- `OPERATOR_API_KEY` 和 `OPERATOR_SESSION_ACCOUNTS[*].apiKey` 属于服务端 secret，不能使用 `NEXT_PUBLIC_` 前缀，也不能暴露给浏览器。
- `OPERATOR_SESSION_ACCOUNTS[*].password` 当前仅适用于本地沙盒登录演示；生产环境必须使用 `passwordHash`。真正上线前仍建议替换为 SSO、OIDC 或独立账号服务，并补 RBAC 管理界面。
- `/api/chat`、`/api/db` 是历史 demo API，不属于当前售后闭环主路径；上线默认关闭。

## PR9 Operator Accounts

PR9 将 Web 客服台账号来源从静态 `OPERATOR_SESSION_ACCOUNTS` 迁移到数据库 `OperatorAccount` 表。部署环境建议设置 `OPERATOR_ACCOUNT_SOURCE=database`，并在执行 `npm run db:migrate:deploy` 后通过 seed 或后续账号管理流程创建客服账号。

`OperatorAccount` 保存 `username`、`tenantId`、`operatorId`、`role`、`passwordHash`、`apiKey`、`disabled` 和 `sessionVersion`。登录和 session 校验都会重新读取账号状态；账号被禁用或 `sessionVersion` 提升后，旧 cookie 会失效。`/api/operator/login` 和 `/api/operator/me` 仍只返回脱敏身份与权限，不暴露 `apiKey` 或 `passwordHash`。

`OPERATOR_SESSION_ACCOUNTS` 现在只作为本地/沙盒兜底来源。若显式设置 `OPERATOR_ACCOUNT_SOURCE=env`，Web BFF 会继续使用旧 JSON 账号；否则存在 `OPERATOR_SESSION_ACCOUNTS` 时仍会兼容旧本地配置。正式部署不要依赖该 JSON 作为主账号系统。

本地开发继续使用 `npm run db:migrate`；部署环境使用 `npm run db:migrate:deploy`，避免在生产执行 Prisma dev migration 语义。

## PR10 Operator Management

PR10 增加管理员账号管理 BFF：`GET /api/operator/operators`、`POST /api/operator/operators` 和 `PATCH /api/operator/operators/:operatorId`。这些接口只接受带 HttpOnly session 的 `admin` 账号访问，普通 `operator` 和 `viewer` 会返回 403。

创建账号时，BFF 使用管理员 session 的租户和服务端 API key 派生新账号上下文，浏览器不需要也不能提交 `apiKey`。密码只以 `scrypt:<salt>:<hash>` 形式写入数据库，响应只返回 `username`、`tenantId`、`operatorId`、`role`、`disabled` 和 `sessionVersion`。

更新账号时，管理员可以调整 `role`、设置 `disabled`，或通过 `revokeSessions` 提升 `sessionVersion` 来撤销旧 cookie。创建和更新都会写入 `AuditLog`，审计详情只包含 actor、target、tenant、role/disabled/revokedSessions 等非 secret 字段。

## PR11 Operator Management UI

PR11 在客服工作台中为 `admin` 账号增加“客服账号”入口。该入口以右侧抽屉打开，不改变一屏客服处理台的主布局。管理员可以查看当前租户账号、创建新客服、切换角色、停用/启用账号，并执行“撤销登录”来提升目标账号的 `sessionVersion`。

该 UI 只调用同源 `/api/operator/operators` BFF 路由；浏览器仍不会接触 `apiKey` 或 `passwordHash`。非管理员不会看到入口，即使直接访问 BFF 也会由 PR10 的权限边界返回 403。
