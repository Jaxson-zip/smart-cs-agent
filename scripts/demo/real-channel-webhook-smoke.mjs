import { createHash, createHmac } from "node:crypto";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...rest] = arg.split("=");
  args.set(key, rest.length > 0 ? rest.join("=") : true);
}

const apiBase = String(args.get("--api") ?? process.env.API_URL ?? "http://localhost:4100").replace(/\/$/, "");
const channel = String(args.get("--channel") ?? "taobao");
const tenantId = String(args.get("--tenant") ?? "tenant_1");
const secret = String(
  args.get("--secret") ??
    process.env.REAL_CHANNEL_WEBHOOK_SMOKE_SECRET ??
    "real_channel_secret_123",
);
const eventId = String(
  args.get("--event-id") ??
    `${channel}_${tenantId}_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
);
const timeoutMs = Number(args.get("--timeout-ms") ?? 5000);

const body = JSON.stringify({
  externalOrderId: "sandbox_order_1",
  externalMessageId: eventId,
  sender: "customer",
  text: "When will my order ship?",
});
const rawBody = Buffer.from(body);
const timestamp = Math.floor(Date.now() / 1000).toString();
const bodySha256 = sha256Hex(rawBody);
const signature = signWebhook({
  secret,
  version: "v1",
  channel,
  tenantId,
  timestamp,
  eventId,
  bodySha256,
});

function signaturePayload({ version, channel, tenantId, timestamp, eventId, bodySha256 }) {
  return [version, channel, tenantId, timestamp, eventId, bodySha256].join("\n");
}

function signWebhook({ secret, version, channel, tenantId, timestamp, eventId, bodySha256 }) {
  const digest = createHmac("sha256", secret)
    .update(signaturePayload({ version, channel, tenantId, timestamp, eventId, bodySha256 }))
    .digest("hex");

  return `v1=${digest}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function postSignedWebhook() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${apiBase}/v1/channels/${encodeURIComponent(channel)}/webhook/events`;

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-smartcs-signature-version": "v1",
        "x-smartcs-tenant-id": tenantId,
        "x-smartcs-event-id": eventId,
        "x-smartcs-timestamp": timestamp,
        "x-smartcs-signature": signature,
      },
      body,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (response.status !== 202) {
      throw new Error(`Expected HTTP 202 from ${url}, got ${response.status}: ${text}`);
    }
    if (
      payload?.status !== "accepted" ||
      payload?.mode !== "security_only" ||
      payload?.channel !== channel ||
      payload?.tenantId !== tenantId ||
      payload?.eventId !== eventId
    ) {
      throw new Error(`Unexpected webhook response: ${JSON.stringify(payload, null, 2)}`);
    }

    console.log("Real channel webhook smoke accepted.");
    console.log(
      JSON.stringify(
        {
          apiBase,
          channel,
          tenantId,
          eventId,
          mode: payload.mode,
          receivedAt: payload.receivedAt,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Timed out after ${timeoutMs}ms while calling ${url}`);
    } else {
      console.error(error.message);
    }
    console.error("Server env must include:");
    console.error("  REAL_CHANNEL_WEBHOOKS_ENABLED=true");
    console.error(
      `  REAL_CHANNEL_WEBHOOK_SECRETS='[{"channel":"${channel}","tenantId":"${tenantId}","secret":"<matching-secret>"}]'`,
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

postSignedWebhook();
