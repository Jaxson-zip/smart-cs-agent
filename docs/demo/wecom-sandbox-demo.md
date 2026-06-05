# V1.2 企微沙盒售后 Demo

这是一套 V1.2 本地沙盒演示，不是真实淘宝、抖音、支付、退款或企业微信生产接入。它只验证一个可商业化沟通的最小闭环：

```text
企微形态 payload
-> 标准化渠道事件
-> 售后分类
-> 风险判断
-> 自动化模式
-> 模拟动作 / 人工队列
-> 客服台展示
```

## 前置条件

- Node.js 20+ 和 npm。
- Docker Desktop 已启动。
- 本地 Postgres 使用 `docker-compose.yml` 中的 `postgres` 服务，端口为 `5433`。
- `.env` 至少包含 `.env.example` 中的 `DATABASE_URL` 和 `PORT=4100`。
- `.env.example` 已内置沙盒客服台 key：`dev_operator_key`，以及 Web 客服台登录账号 `demo / demo123456`。如果你修改了 `OPERATOR_API_KEYS`，也要同步 `OPERATOR_SESSION_ACCOUNTS[*].apiKey`、服务端 `OPERATOR_API_KEY` 或 smoke 脚本的 `--operator-api-key`。

首次启动：

```powershell
copy .env.example .env
npm.cmd install
docker compose up -d postgres
npm.cmd run db:migrate
npm.cmd run db:seed
```

重复演示前如果想恢复到干净样例数据，可以重新运行：

```powershell
npm.cmd run db:seed
```

## 启动 API 和 Web

开两个终端。

终端 A：启动 API。

```powershell
npm.cmd run dev:api
```

API 地址：

```text
http://localhost:4100
```

终端 B：启动客服台 Web。默认端口 3000 与 `.env.example` 的 `WEB_ORIGIN` 匹配。

```powershell
npm.cmd run dev:web
```

打开：

```text
http://localhost:3000
```

默认登录：

```text
账号：demo
密码：demo123456
```

本地沙盒默认账号是 `admin` 权限。若要演示只读客服，可在 `.env` 的 `OPERATOR_SESSION_ACCOUNTS` 中增加 `role: "viewer"` 的账号；只读账号可以查看工单，但不能确认回复或接管工单。生产环境不要使用明文 `password`，应改用 `passwordHash`；把账号设为 `disabled: true` 或提升 `sessionVersion` 会让已有登录态失效。

如果 3000 被占用，可以改用 3100：

```powershell
npm.cmd run dev:web -- --port 3100
```

此时建议把 API 终端的环境变量同步成 `WEB_ORIGIN=http://localhost:3100` 后重启 API，否则浏览器侧实时连接可能被 CORS 拦截。

## 一键 Smoke

API 启动后运行：

```powershell
npm.cmd run demo:smoke
```

脚本会执行：

1. `GET /health`，确认 API 在 `4100` 可用。
2. `GET /v1/rules/demo_tenant`，优先携带 `Authorization: Bearer dev_operator_key`，确认规则接口可读。
3. 读取 `docs/demo/wecom-sandbox-payloads/*.json` 的 5 个 payload。
4. 逐个 `POST /v1/wecom/events`。该 webhook 路径按 payload body 中的 `merchantId` 路由，不需要 operator header。
5. 输出每个场景的 `category`、`riskLevel`、`automationMode` 是否符合预期。

脚本默认会给 `externalConversationId` 和 `externalMessageId` 添加运行后缀，让每次 smoke 都生成一组新的演示工单。如果需要按文件原始 ID 发送并验证幂等复用，可运行：

```powershell
npm.cmd run demo:smoke -- --keep-ids
```

可选 API 地址：

```powershell
npm.cmd run demo:smoke -- --api=http://localhost:4100
```

如果你换了沙盒客服台 key：

```powershell
npm.cmd run demo:smoke -- --operator-api-key=your_key
```

## 手动发送单个场景

Windows PowerShell / CMD：

```powershell
curl.exe -X POST http://localhost:4100/v1/wecom/events ^
  -H "Content-Type: application/json" ^
  --data-binary "@docs/demo/wecom-sandbox-payloads/03-damage-compensation-low.json"
```

期望响应结构：

```json
{
  "status": "received",
  "normalizedEvent": {},
  "afterSalesCase": {
    "caseId": "case_msg_003",
    "category": "damage_compensation",
    "riskLevel": "low",
    "automationMode": "auto_execute",
    "actions": []
  }
}
```

手动重复发送同一个 payload 会复用同一个 `case_${externalMessageId}` 工单，并刷新该工单的消息、动作和审计记录。smoke 脚本默认仍会给消息 ID 加运行后缀，方便每次演示都生成一组新的工单；如需专门验证幂等行为，可使用 `--keep-ids`。

## 场景矩阵

| 文件 | 期望分类 | 期望风险 | 期望自动化模式 | 期望客服台结果 |
| --- | --- | --- | --- | --- |
| `01-address-change-low.json` | `address_change` | `low` | `auto_execute` | 自动处理，进入已处理/历史类状态 |
| `02-logistics-inquiry-low.json` | `logistics` | `low` | `auto_execute` | 自动处理，生成物流查询类回复 |
| `03-damage-compensation-low.json` | `damage_compensation` | `low` | `auto_execute` | 自动处理，执行模拟补偿动作 |
| `04-compensation-rejected-medium.json` | `compensation_rejected` | `medium` | `human_confirm` | 进入待确认，需要客服确认回复或动作 |
| `05-complaint-escalation-high.json` | `complaint_escalation` | `high` | `human_takeover` | 进入人工接管，不应自动执行补偿 |

## 验证接口

规则接口：

```powershell
curl.exe http://localhost:4100/v1/rules/demo_tenant ^
  -H "Authorization: Bearer dev_operator_key" ^
  -H "x-tenant-id: demo_tenant" ^
  -H "x-operator-id: sandbox_operator"
```

应看到类似字段：

```json
{
  "couponCompensationLimit": 50,
  "highRiskKeywords": [],
  "channelCapabilities": {
    "taobao": ["change_address", "query_logistics", "issue_coupon"],
    "douyin": ["change_address", "query_logistics", "issue_coupon"]
  }
}
```

案件列表：

```powershell
curl.exe http://localhost:4100/v1/cases ^
  -H "Authorization: Bearer dev_operator_key" ^
  -H "x-tenant-id: demo_tenant" ^
  -H "x-operator-id: sandbox_operator"
```

应能看到 seed 数据和 smoke 新增的 5 个 case。Web 客服台应展示相同的售后队列、风险等级、自动化模式和审计信息。

## 常见失败

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| `API is not reachable at http://localhost:4100` | API 没启动或端口不是 4100 | 运行 `npm.cmd run dev:api`，确认 `.env` 中 `PORT=4100` |
| Prisma 连接失败、`P1001`、`ECONNREFUSED 5433` | Docker Desktop 或 Postgres 容器没启动 | 运行 `docker compose up -d postgres` |
| `relation does not exist` 或事件 POST 返回 500 | 迁移未执行 | 运行 `npm.cmd run db:migrate` |
| `/v1/cases` 返回 401 | 配置了 `OPERATOR_API_KEYS` 但请求没有带 key，或 key 不匹配 | 按上方 curl 示例带上 `Authorization: Bearer dev_operator_key`，或确认 `.env` 中的 key 一致 |
| `/v1/cases` 返回 403 | key 所属租户和请求的 `x-tenant-id` 不一致 | 确认 `OPERATOR_API_KEYS[*].tenantId`、`OPERATOR_SESSION_ACCOUNTS[*].tenantId` 和 curl 请求租户一致 |
| `/v1/cases` 没有演示数据 | seed 未执行、被清空或 tenant header 不匹配 | 运行 `npm.cmd run db:seed`，并确认 `x-tenant-id` 是 `demo_tenant` |
| 手动 curl 第二次发送同一文件后只看到一张工单 | 这是幂等复用行为，系统会刷新同一张 `case_${externalMessageId}` 工单 | 若想每次生成新工单，使用 `npm.cmd run demo:smoke` 的默认运行后缀 |
| Web 使用 3100 时实时连接失败 | API CORS 仍允许 3000 | 设置 `WEB_ORIGIN=http://localhost:3100` 后重启 API |

## Demo 边界

- 企微 payload 是沙盒形态，不包含生产回调签名校验。
- 淘宝/抖音动作是 mock adapter，不会真实改地址、查物流、发券、退款。
- 规则是本地数据库配置，适合演示可配置性，不代表生产风控策略。
- V1.2 目标是证明售后 Agent 的本地闭环和验收路径，不是生产可用性认证。
