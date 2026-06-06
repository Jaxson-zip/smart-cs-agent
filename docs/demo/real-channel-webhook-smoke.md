# Real-Channel Webhook Normalization Smoke

This smoke verifies the PR14 real-channel intake and normalization boundary. It proves the API can accept one signed webhook, write the replay receipt, normalize a Taobao/Douyin-shaped sandbox payload into `NormalizedChannelEvent`, and stop before customer-visible business processing. It does not create after-sales cases, call AgentService, send replies, or execute real commerce actions.

## Server Environment

Run the API with matching real-channel webhook settings:

```bash
REAL_CHANNEL_WEBHOOKS_ENABLED=true
REAL_CHANNEL_WEBHOOK_SECRETS='[{"channel":"taobao","tenantId":"tenant_1","secret":"real_channel_secret_123"}]'
REAL_CHANNEL_WEBHOOK_MAX_AGE_SECONDS=300
```

The API must also have migrations applied because replay protection writes `ChannelWebhookReceipt` and normalization writes `NormalizedChannelEvent`.

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
- Response `status` is `sandbox_queued`.
- Response `mode` is `normalized_only`.
- Response includes `normalizedEventId`.
- Response does not include secrets, signatures, raw request body, or customer message text.

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

PR14 is still not a real Taobao/Douyin business integration. The next stage must add sandbox replay controls, allowlisted tenants, human-review gates, provider-specific error handling, and rollback controls before any normalized event can reach automated after-sales actions.
