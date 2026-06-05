# Production-Readiness Baseline

本文档定义 PR1 的可部署沙盒门槛。当前目标是 deployable sandbox / production-readiness baseline，用于让团队和 GitHub 自动验证基础质量；它不代表已经接入真实淘宝、抖音或企业微信生产链路，也不声称系统已生产可用。

## 范围

- 覆盖 V1.2 售后沙盒闭环：本地/沙盒事件进入 API，生成工单、消息、动作和审计记录，并可通过客服台查看。
- GitHub Actions 只验证基础质量：依赖安装、Prisma client 生成、API 单测、TypeScript、lint、build。
- CI 不连接真实外部数据库；`DATABASE_URL` 使用 dummy Postgres URL，仅供 Prisma generate 解析 schema。
- 真实电商渠道、真实支付/退款、真实物流回写、真实客服账号鉴权均不在 PR1 范围。

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
NEXT_PUBLIC_API_URL=http://localhost:4100
NEXT_PUBLIC_WS_URL=http://localhost:4100
API_URL=http://localhost:4100
OPERATOR_API_KEY=dev_operator_key
```

如果后续新增需要数据库连接的集成测试，应显式在 CI 中启动 Postgres service，并隔离为 integration/smoke job，避免让 API 单测隐式依赖外部数据库。

## 环境变量

部署沙盒环境至少需要：

- `DATABASE_URL`：Postgres 连接串。沙盒可使用独立数据库，禁止复用生产库。
- `OPENAI_API_KEY`：PR1 可以为空；为空时不得把 LLM 能力视为已上线。
- `WEB_ORIGIN`：允许访问 API/WebSocket 的前端 origin。
- `PORT`：API 监听端口，默认 `4100`。
- `WECOM_SANDBOX_ENABLED`：沙盒入站模拟入口开关。本地演示可以为 `true`；生产环境未显式设为 `true` 时，`/v1/wecom/events` 默认不可用。
- `API_URL`：Web 服务端 BFF 访问 API 的内部地址，默认可指向 `http://localhost:4100`。
- `NEXT_PUBLIC_API_URL`：旧健康检查客户端的公开 API 地址；客服台主数据路径不应再依赖它直连 API。
- `NEXT_PUBLIC_WS_URL`：WebSocket 地址；本地可与 API 地址相同。
- `OPERATOR_API_KEYS`：PR3 沙盒客服台 API key 配置，格式为 JSON 数组，例如 `[{"key":"dev_operator_key","tenantId":"demo_tenant","operatorId":"sandbox_operator","role":"admin"}]`。配置后，`/v1/cases` 和 `/v1/rules` 等客服侧接口必须携带 `Authorization: Bearer <key>` 或 `x-api-key`。
- `OPERATOR_API_KEY`：Web 服务端 BFF 调用 API 时使用的 operator key，应匹配 `OPERATOR_API_KEYS` 中的一项。不要使用 `NEXT_PUBLIC_` 前缀。
- `OPERATOR_TENANT_ID`：Web 服务端 BFF 请求使用的租户 ID，默认 `demo_tenant`。
- `OPERATOR_ID`：Web 服务端 BFF 请求使用的操作者 ID，默认 `sandbox_operator`。
- `ALLOW_INSECURE_OPERATOR_HEADERS`：只用于本地沙盒调试，默认 `false`。生产环境未配置 `OPERATOR_API_KEYS` 时，默认拒绝只靠 `x-tenant-id` 的访问；除非显式设为 `true`。
- `ENABLE_LEGACY_WEB_DEMO_API`：早期 Web demo 的 `/api/chat` 和 `/api/db` 开关，默认应为 `false`。部署沙盒和生产环境不得打开，除非是隔离的历史演示环境。

敏感值应由部署平台 secret 管理，不应提交到 Git。

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
- `GET /v1/cases` 携带 `Authorization: Bearer <operator-key>` 后能读取该 key 所属租户的 seed 或 smoke 后售后工单。
- `GET /v1/rules/demo_tenant` 携带 `Authorization: Bearer <operator-key>` 后能读取该 key 所属租户的沙盒规则配置；请求其他租户应返回 403。
- `GET /v2/integrations`、`POST /v2/actions/execute`、`POST /v2/compensation/declined`、`POST /v2/handoffs` 等操作侧接口也必须携带 operator key。
- `POST /v1/wecom/webhook/send` 必须携带 operator key，且 key 所属租户必须与 body 中的 `merchantId` 一致。
- Web 客服台应通过同源 `/api/operator/cases`、`/api/operator/cases/:id` 和 `/api/operator/readiness` 访问 API；浏览器包中不得包含 operator key。
- Web 侧 `/api/chat` 和 `/api/db` 默认返回 404；只有显式设置 `ENABLE_LEGACY_WEB_DEMO_API=true` 才会打开旧 demo 接口。
- `npm run demo:smoke` 能向沙盒 API 发送 5 条售后消息，并验证分类、风险等级和自动化模式。

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
- `OPERATOR_API_KEY` 属于服务端 secret，不能使用 `NEXT_PUBLIC_` 前缀，也不能暴露给浏览器。
- `/api/chat`、`/api/db` 是历史 demo API，不属于当前售后闭环主路径；上线默认关闭。
