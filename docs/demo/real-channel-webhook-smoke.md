# Real-Channel Webhook Security Smoke

This smoke verifies the PR13 real-channel intake security boundary only. It proves the API can accept one signed webhook receipt and reject replay/invalid requests through the tested service path. It does not create after-sales cases, call AgentService, send customer-visible replies, or execute real commerce actions.

## Server Environment

Run the API with matching real-channel webhook settings:

```bash
REAL_CHANNEL_WEBHOOKS_ENABLED=true
REAL_CHANNEL_WEBHOOK_SECRETS='[{"channel":"taobao","tenantId":"tenant_1","secret":"real_channel_secret_123"}]'
REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS=300
```

The API must also have the PR13 migration applied because replay protection writes `ChannelWebhookReceipt`.

```bash
npm run db:migrate:deploy
npm run dev:api
```

## Smoke Command

```bash
npm run demo:real-channel-smoke -- --api=http://localhost:4100 --channel=taobao --tenant=tenant_1 --secret=real_channel_secret_123
```

Expected result:

- HTTP `202 Accepted`.
- Response `status` is `accepted`.
- Response `mode` is `security_only`.
- Response does not include secrets, signatures, or raw request body.

## Signature Contract

Headers:

- `x-smartcs-signature-version: v1`
- `x-smartcs-tenant-id`
- `x-smartcs-event-id`
- `x-smartcs-timestamp`
- `x-smartcs-signature: v1=<hex-hmac>`

The v1 HMAC-SHA256 payload is:

```text
v1
<channel>
<tenantId>
<timestamp>
<eventId>
<sha256(rawBody)>
```

The raw request body bytes are mandatory. If raw-body capture is unavailable, the API must fail closed instead of re-stringifying parsed JSON.

## Production Boundary

PR13 is not a real Taobao/Douyin business integration. The next stage must add provider-specific adapters, schema normalization, sandbox replay, allowlisted tenants, human-review gates, and rollback controls before any event can reach automated after-sales actions.
