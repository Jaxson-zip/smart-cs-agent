# Owner 2: WeCom Sandbox Channel

## Mission

Build the sandbox channel adapter. It should let us simulate Taobao/Douyin after-sales messages through a WeCom-shaped endpoint without needing real Taobao, Douyin, or production WeCom credentials.

## Write Scope

You own:

- `apps/api/src/wecom/*`
- `apps/api/src/channels/*`
- `apps/api/src/app.module.ts`
- `.env.example`

Coordinate before touching:

- `packages/shared/src/wecom-contracts.ts`
- `packages/shared/src/after-sales-contracts.ts`

Do not touch:

- `apps/web/src/app/page.tsx`
- `apps/api/src/agent/*`
- `prisma/schema.prisma`

## Required API

Implement:

```http
POST /v1/wecom/events
```

Request body:

```json
{
  "source": "wecom_sandbox",
  "merchantId": "merchant_demo_001",
  "channel": "taobao",
  "externalConversationId": "wecom-room-001",
  "externalMessageId": "msg-001",
  "senderName": "林女士",
  "text": "鞋盒压坏了，鞋子没问题，但是送人的，能不能补偿一下？",
  "receivedAt": "2026-06-04T10:00:00.000Z"
}
```

Response body should return the normalized event or created case summary.

## Important Product Rule

Ordinary WeCom group robot webhook is mainly outbound. Receiving messages needs callback/API-mode style shape. Implement the local callback shape now and leave real credential verification as a clearly named placeholder.

## Provider Interface

Create a provider interface similar to:

```ts
export interface ChannelProvider {
  normalizeIncoming(input: unknown): Promise<NormalizedChannelEvent>;
  sendMessage(input: SendChannelMessageInput): Promise<SendChannelMessageResult>;
}
```

The sandbox provider must not call the real WeCom network.

## Acceptance

Run a local request:

```bash
curl -X POST http://localhost:4100/v1/wecom/events ^
  -H "Content-Type: application/json" ^
  -d "{\"source\":\"wecom_sandbox\",\"merchantId\":\"merchant_demo_001\",\"channel\":\"taobao\",\"externalConversationId\":\"wecom-room-001\",\"externalMessageId\":\"msg-001\",\"senderName\":\"林女士\",\"text\":\"鞋盒压坏了，鞋子没问题，但是送人的，能不能补偿一下？\",\"receivedAt\":\"2026-06-04T10:00:00.000Z\"}"
```

Expected:

- HTTP 200 or 201.
- Response contains normalized event/case data.
- No real external request is made.
