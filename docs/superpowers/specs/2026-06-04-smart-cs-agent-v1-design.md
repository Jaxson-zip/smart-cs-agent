# Smart CS Agent v1 设计文档

日期：2026-06-04

## 产品目标

Smart CS Agent v1 是一个 **渠道型电商售后 AI Agent 系统**。

目标是把当前本地 demo 升级成一个具备商用可信度的电商售后全闭环工作台。客户从淘宝、抖店、Shopify、微信、邮件等外部渠道发来消息。Smart CS Agent 接收这些消息，标准化成内部会话，让 AI Agent 自动处理低风险售后，把高风险售后转入审批或人工接管，再把回复发回原渠道，并记录完整决策链路。

v1 先使用模拟渠道、模拟业务 Provider 和模拟业务数据，但所有接口边界都必须按真实系统设计。未来接真实平台时，应优先替换 Provider，而不是重写产品主流程。

## 北极星目标

第一版商用原型必须证明三件事：

1. AI 可以独立解决低风险售后问题。
2. AI 不会在没有规则、审批或人工接管的情况下执行高风险动作。
3. 每一步都有可审计证据链：客户原始消息、上下文、政策命中、风控判断、工具调用、审批结果、外发回复和最终案件状态。

## 范围

### v1 要做

- 渠道消息接入。
- 模拟淘宝、抖店、Shopify 渠道 Provider。
- 统一会话和消息模型。
- 电商客户、商品、订单、订单明细、物流和售后案件。
- 后端 AI Agent 调度和工具调用。
- 售后政策检索和风控规则判断。
- 查订单、查物流、改地址、优惠券补偿、现金退款/现金补偿审批、不可退商品拦截等完整闭环。
- 人工审批中心。
- 客户回复策略：快速确认、处理中回复、最终结果回复、审批等待回复。
- 内部工作台通过 WebSocket 实时展示 Agent 过程。
- 审计日志和运营分析。
- 电商、优惠券、退款、物流、通知、知识库等 Mock Provider。
- 预留真实平台 Provider 接口。

### v1 不做

- 真实淘宝、抖店、Shopify、支付、短信或物流 API 接入。
- 企业内部工单模板。
- 多租户计费。
- 复杂角色权限系统。
- 完整知识库上传和向量库管理。
- 真实支付退款打款。
- 重型后台任务系统。v1 只保留 JobProvider / Notification retry 的接口和轻量实现。

## 产品形态

产品不是“客户聊天页面”，而是 **客服运营后台**。

客户消息来自外部渠道。工作台负责展示会话、Agent 决策、工具调用、风控判断、审批状态和最终回复。客服或主管可以在工作台里查看、审批、拒绝、接管或复盘。

## 视觉方向

v1 已确定采用 **浅色商用 SaaS** 作为主视觉方向。

界面应该可信、专业、清爽、信息密度高，适合客服团队长时间使用。它不应该像纯黑科技 demo，也不应该像模板后台。

视觉模型：

- 主体风格：浅色、专业、商用 SaaS。
- Agent 表达：局部高质量动效。
- 风控和审计表达：清晰的证据面板和时间线。

GSAP 用于关键状态变化，比如消息进入、工具卡片状态变化、决策轨迹展开、审批状态流转、运营数字增长等。不要为了炫技做满屏动画。

## 技术栈

### 前端

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- lucide-react
- GSAP
- @gsap/react
- framer-motion 可以保留现有部分，但后续核心动画优先使用 GSAP。

### 后端

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- REST API 负责常规数据和业务操作
- WebSocket Gateway 负责内部工作台实时事件

### AI 层

- OpenAI 优先
- LLMProvider 抽象层，后续可替换 DeepSeek、Claude 或本地模型
- 类型化 Tool Registry
- Agent Orchestration 放在后端

### 共享包

- `packages/shared`
- Zod schemas
- 共享 TypeScript 类型
- API 请求/响应类型
- WebSocket 事件类型
- Tool 参数 schema

### 集成模式

采用 Provider Adapter 模式。

v1 使用 Mock Provider：

- MockTaobaoChannelProvider
- MockDouyinChannelProvider
- MockShopifyChannelProvider
- MockCommerceProvider
- MockRefundProvider
- MockCouponProvider
- MockLogisticsProvider
- MockNotificationProvider
- MockKnowledgeProvider

未来真实 Provider 实现同一套接口：

- TaobaoChannelProvider
- DouyinChannelProvider
- ShopifyChannelProvider
- WeChatChannelProvider
- EmailChannelProvider
- ShopifyCommerceProvider
- DouyinCommerceProvider
- TaobaoCommerceProvider
- ERPProvider
- PaymentProvider
- LogisticsProvider
- SMS / Email / WeChat Notification Provider

## 仓库结构

项目应逐步迁移为 monorepo：

```text
smart-cs-agent
├─ apps
│  ├─ web
│  └─ api
├─ packages
│  └─ shared
├─ prisma
│  ├─ schema.prisma
│  └─ seed.ts
├─ docker-compose.yml
└─ docs
```

`apps/web` 是 Next.js 前端。`apps/api` 是 NestJS 后端。`packages/shared` 存放共享 schema 和类型。`prisma` 负责 PostgreSQL 数据模型和种子数据。

## 后端架构

后端主链路：

```text
Channel Provider
-> Message Ingestion
-> Conversation Service
-> Agent Service
-> Tool Registry
-> Business Services
-> Risk Service
-> Provider Adapters
-> Database
-> Audit Service
-> Notification / Channel Reply
-> WebSocket Events
```

Agent 不允许直接修改订单、发券、退款或发渠道消息。Agent 只负责判断意图、选择工具和生成结构化动作。所有业务动作必须经过 Service、Risk 和 Provider。

### 后端模块

```text
agent
channels
conversations
customers
orders
products
shipments
policies
risk
tools
after-sales
approvals
compensations
notifications
audit
analytics
providers
```

### 核心模块职责

`channels`：接收外部平台事件，校验事件，标准化消息，并把回复发回原渠道。

`conversations`：管理内部会话和消息。

`agent`：判断意图、构建上下文、检索政策、选择工具、生成最终或中间回复。

`tools`：暴露 Agent 可调用的类型化、可审计工具。

`risk`：判断动作是允许、拦截，还是需要审批。

`after-sales`：管理售后案件主状态机。

`approvals`：创建并处理人工审批请求。

`notifications`：记录和发送客户通知，包括重试和失败状态。

`audit`：记录每个重要系统判断和动作。

`analytics`：计算运营指标。

## 数据模型

`AfterSaleCase` 是售后业务主线。所有售后动作都应该挂到这个案件上。

### 核心实体

- Tenant
- Shop
- ChannelAccount
- Customer
- Product
- Order
- OrderItem
- Shipment
- Conversation
- Message
- ExternalConversation
- ExternalMessage
- AfterSaleCase
- Policy
- RiskRule
- ToolCall
- ApprovalRequest
- Compensation
- Notification
- AuditLog

### 为什么需要 AfterSaleCase

不要让改地址、退款、补偿、投诉、审批和通知变成彼此孤立的记录。售后案件是单个客户问题的完整证据链。

案件关联：

```text
Messages
ToolCalls
Approvals
Compensations
Notifications
AuditLogs
Order
Customer
Policy matches
Risk decisions
```

### 售后案件状态

```text
open
triaging
action_required
pending_approval
resolved
rejected
closed
```

### 审批状态

```text
pending
approved
rejected
executed
customer_notified
```

### 工具调用状态

```text
pending
running
success
failed
blocked
```

### 订单售后状态

```text
none
in_progress
compensated
refund_pending
refunded
rejected
```

## 渠道消息接入

客户消息来自外部渠道，不是来自工作台输入框。

示例流程：

```text
客户在淘宝发消息
-> MockTaobaoChannelProvider 接收事件
-> MessageIngestionService 标准化 payload
-> ConversationService 创建或找到会话
-> 保存 Message
-> 触发 AgentService
-> Agent 处理消息
-> ResponsePolicyService 判断回复时机
-> ChannelProvider 把回复发回淘宝
-> AuditLog 记录完整流程
```

### Channel Provider 接口

```ts
interface ChannelProvider {
  receiveWebhook(payload: unknown, headers: unknown): Promise<IncomingChannelEvent>;
  verifyWebhook(payload: unknown, headers: unknown): Promise<boolean>;
  normalizeMessage(event: IncomingChannelEvent): Promise<NormalizedMessage>;
  sendMessage(input: SendChannelMessageInput): Promise<SendChannelMessageResult>;
  markRead(input: MarkReadInput): Promise<void>;
  getConversationHistory(input: HistoryInput): Promise<NormalizedMessage[]>;
}
```

v1 需要支持模拟淘宝、抖店、Shopify 的入站消息和出站回复。

## 回复等待时间策略

系统不能让客户在外部平台里无声等待，也不能为了快而不安全地乱回复。

### 回复类型

快速最终回复：

- 目标：1 到 3 秒。
- 适用于查订单、查物流、低风险改地址、低风险优惠券补偿。

先确认，再最终回复：

- 目标：1 秒内确认，5 到 15 秒内最终回复。
- 适用于多步骤检查、多订单匹配、工具较慢、渠道发送不稳定等情况。

审批或人工等待回复：

- 目标：1 秒内确认已受理。
- 适用于现金退款、高额补偿、不可退商品争议、低置信度、投诉升级。
- 不等待审批完成后才第一次回复客户。

### v1 时间规则

```text
0-1s:
创建消息、会话和案件上下文。判断是否需要发送确认回复。

1s:
如果预计 3 秒内无法完成最终处理，先发送“正在处理”。

3s:
低风险流程尽量发送最终回复。

8s:
如果工具仍未完成，发送“仍在处理，稍后通知”的延迟回复，并保持案件打开。

需要审批:
立即通知客户“已提交审核”。

发送失败:
NotificationService 重试，记录失败，并在工作台提示人工处理。
```

内部 WebSocket 展示详细实时过程。外部渠道只接收适合客户看的必要话术。

## WebSocket 事件

REST 负责常规数据访问和业务动作。WebSocket 负责内部工作台实时更新。

核心事件：

```text
conversation.message.received
agent.thought.created
agent.intent.detected
policy.search.completed
risk.evaluation.completed
tool.call.started
tool.call.completed
approval.created
approval.updated
case.status.updated
notification.sent
notification.failed
agent.response.completed
human.takeover.started
human.takeover.ended
```

## 前端信息架构

### Inbox 渠道收件箱

统一展示淘宝、抖店、Shopify、微信、邮件等渠道消息。

筛选：

- 自动处理中
- 需要人工
- 待审批
- 已解决
- 发送失败

### Workbench 工作台

v1 第一主界面。

布局：

```text
左侧：导航和会话列表
中间：当前会话和人工回复输入框
右侧上：客户和订单摘要
右侧中：Agent 决策轨迹
右侧下：工具调用、风控结果和案件状态
底部或抽屉：案件时间线和审计证据
```

输入框不是唯一客户入口。它用于人工接管、人工回复和演示/测试消息注入。

### After-Sale Cases 售后案件

案件列表和案件详情。展示状态、类型、客户、订单、渠道、负责人、SLA 和时间线。

### Approvals 审批中心

处理现金退款、高额补偿、不可退商品复核和投诉升级。

### Policies 策略中心

配置政策和规则：

- 退款政策
- 物流规则
- 优惠券补偿上限
- 不可退商品规则
- 渠道话术模板

### Orders and Customers 订单客户

订单、客户资料、商品属性、物流状态和售后历史。

### Audit 审计日志

可搜索的决策和动作日志。

### Analytics 运营分析

指标：

- 自动解决率
- 人工接管率
- 审批率
- 风控拦截次数
- 平均首次响应时间
- 平均解决时长
- 优惠券金额
- 现金退款金额
- 渠道表现

## v1 核心闭环流程

### 查订单和查物流

客户询问订单或物流。系统匹配客户和订单上下文，查询订单和物流 Provider，发送最终回复，并写入审计日志。

### 改地址

客户要求修改地址。系统检查订单状态和物流状态。若订单未发货，则通过 CommerceProvider 更新地址，并回复成功。若已发货，则拦截自动修改，解释原因，并建议联系配送方或创建人工案件。

### 优惠券补偿

客户反馈商品损坏或体验差，并要求补偿。系统评估政策和风控规则。如果金额在自动补偿范围内，则发放优惠券，记录补偿，发送回复，并解决案件。如果超过上限，则创建审批或建议最大可自动补偿额度。

### 现金退款或现金补偿审批

客户要求现金退款或现金补偿。系统将其视为高风险，创建审批请求，发送受理回复，并等待人工决定。审批通过或拒绝后，更新案件，通知客户，并记录审计日志。

### 不可退商品拦截

客户要求退定制或不可退商品。系统匹配商品规则和售后政策，拦截自动退款。必要时创建人工复核，回复清晰原因，并记录政策证据。

## 人工接管

以下情况会触发人工接管：

- Agent 置信度低。
- RiskService 要求人工处理。
- 客户情绪严重。
- 渠道发送失败。
- 审批需要人工决定。
- 操作员手动接管。

人工接管开始后，除非操作员允许，否则 Agent 不应继续向客户发送最终回复。

## 开发策略

先完成总规划，再按领域并行开发。

### 建议工作流

- 产品和信息架构。
- 后端架构和 Prisma schema。
- Agent 工作流和 Tool Registry。
- 前端工作台和实时 UI。
- 测试、种子数据和验收流程。

### v1 里程碑

Milestone 1：Monorepo 和技术底座。

- 迁移到 `apps/web`、`apps/api`、`packages/shared`。
- 新增 NestJS 后端。
- 新增 Prisma 和 PostgreSQL 开发环境。
- 新增共享 schema 和事件类型。

Milestone 2：渠道和会话闭环。

- 新增 Mock Channel Providers。
- 新增消息接入。
- 新增 Conversation 和 Message。
- 新增 WebSocket 事件流。

Milestone 3：业务数据和售后案件闭环。

- 新增客户、订单、商品、物流、政策、风控规则和售后案件。
- 填充真实感电商种子数据。
- 实现案件状态流转。

Milestone 4：Agent、工具和回复策略。

- 实现后端 AgentService。
- 实现 Tool Registry。
- 实现回复时间策略。
- 实现 Mock 业务 Provider。

Milestone 5：工作台 UI。

- 实现浅色商用 SaaS 布局。
- 新增 Inbox、会话工作台、决策轨迹、工具卡、风控卡和案件时间线。
- 用 GSAP 实现关键状态动效。

Milestone 6：审批、审计和运营分析。

- 实现审批中心。
- 实现审计日志视图。
- 实现运营分析 summary。
- 完成端到端验收流程。

## 验收标准

v1 完成时必须满足：

1. 模拟淘宝、抖店或 Shopify 消息可以通过 Channel Provider 进入系统。
2. 消息可以创建或更新统一会话。
3. Agent 可以识别售后意图。
4. 系统可以匹配客户、订单、商品、物流、政策和风控上下文。
5. 低风险动作可以通过工具和 Mock Provider 执行。
6. 高风险动作会创建审批请求，而不是直接执行。
7. 回复会通过模拟原渠道发送回客户。
8. 内部工作台可以收到 WebSocket 实时事件。
9. 每个重要判断和动作都能在审计日志中看到。
10. 运营分析可以展示处理结果。
11. UI 符合已确认的浅色商用 SaaS 方向。
12. Provider 边界可以支撑未来接真实渠道和真实电商平台。
