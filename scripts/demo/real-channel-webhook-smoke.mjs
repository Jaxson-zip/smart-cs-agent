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
    `${channel}_${tenantId}_${new Date().toISOString().replace(/[-:.TZ]/g, "")}_${Math.random().toString(36).slice(2, 8)}`,
);
const timeoutMs = Number(args.get("--timeout-ms") ?? 5000);
const replay = args.has("--replay");
const operatorApiKey = args.get("--operator-api-key") ?? process.env.OPERATOR_API_KEY;

const body = JSON.stringify(buildPayload({ channel, tenantId, eventId }));
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
      payload?.status !== "sandbox_queued" ||
      payload?.mode !== "normalized_only" ||
      payload?.channel !== channel ||
      payload?.tenantId !== tenantId ||
      payload?.eventId !== eventId ||
      typeof payload?.normalizedEventId !== "string"
    ) {
      throw new Error(`Unexpected webhook response: ${JSON.stringify(payload, null, 2)}`);
    }

    console.log("Real channel webhook smoke normalized.");
    console.log(
      JSON.stringify(
        {
          apiBase,
          channel,
          tenantId,
          eventId,
          normalizedEventId: payload.normalizedEventId,
          mode: payload.mode,
          receivedAt: payload.receivedAt,
        },
        null,
        2,
      ),
    );

    if (replay) {
      await replayNormalizedEvent({
        normalizedEventId: payload.normalizedEventId,
        eventId,
      });
    }
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
    console.error(
      `  REAL_CHANNEL_WEBHOOK_ALLOWLIST='[{"channel":"${channel}","tenantId":"${tenantId}"}]'`,
    );
    if (replay) {
      console.error("Replay smoke also requires:");
      console.error("  OPERATOR_API_KEYS with an operator key for the same tenant");
      console.error("  --operator-api-key=<matching-operator-key>");
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

async function replayNormalizedEvent({ normalizedEventId, eventId }) {
  if (!operatorApiKey) {
    throw new Error("--replay requires --operator-api-key or OPERATOR_API_KEY");
  }

  const eventList = await requestJson(`${apiBase}/v1/channel-events`, {
    headers: operatorHeaders(),
  });
  if (!Array.isArray(eventList) || !eventList.some((event) => event.id === normalizedEventId)) {
    throw new Error(`Normalized event ${normalizedEventId} was not visible in the pending review pool`);
  }

  const replayResult = await requestJson(
    `${apiBase}/v1/channel-events/${encodeURIComponent(normalizedEventId)}/replay`,
    {
      method: "POST",
      headers: operatorHeaders(),
    },
  );
  if (
    replayResult?.status !== "replayed" ||
    replayResult?.eventId !== normalizedEventId ||
    typeof replayResult?.caseId !== "string" ||
    replayResult?.automationMode === "auto_execute"
  ) {
    throw new Error(`Unexpected replay response: ${JSON.stringify(replayResult, null, 2)}`);
  }

  console.log("Real channel replay smoke created a human-reviewed case.");
  console.log(
    JSON.stringify(
      {
        eventId,
        normalizedEventId,
        caseId: replayResult.caseId,
        automationMode: replayResult.automationMode,
      },
      null,
      2,
    ),
  );
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function operatorHeaders() {
  return {
    Authorization: `Bearer ${operatorApiKey}`,
    "x-tenant-id": tenantId,
  };
}

function buildPayload({ channel, tenantId, eventId }) {
  if (channel === "douyin") {
    return {
      event: "im.message.receive",
      shop_id: tenantId,
      order_id: "dy_sandbox_order_1",
      conversation_id: `dy_conv_${eventId}`,
      message_id: eventId,
      user_nickname: "Sandbox Customer",
      text: "Please check my logistics.",
      create_time: Math.floor(Date.now() / 1000),
    };
  }

  return {
    topic: "taobao.im.message.received",
    seller_id: tenantId,
    tid: "tb_sandbox_order_1",
    conversation_id: `tb_conv_${eventId}`,
    message_id: eventId,
    buyer_nick: "Sandbox Customer",
    content: "When will my order ship?",
    send_time: new Date().toISOString(),
  };
}

postSignedWebhook();
