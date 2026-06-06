import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ApiError,
  fetchChannelEvents,
  fetchOperatorAccounts,
  ignoreChannelEvent,
  replayChannelEvent,
} from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("operator account API client", () => {
  it("rejects malformed account list responses instead of treating them as empty", async () => {
    mockJsonResponse({ status: 200, body: {} });

    await assert.rejects(
      fetchOperatorAccounts(),
      (error) => error instanceof ApiError && error.status === 502,
    );
  });

  it("keeps only sanitized account fields from list responses", async () => {
    mockJsonResponse({
      status: 200,
      body: {
        operators: [
          {
            username: "demo",
            tenantId: "demo_tenant",
            operatorId: "op_demo",
            role: "admin",
            disabled: false,
            sessionVersion: 2,
            apiKey: "server-secret",
            passwordHash: "hash-secret",
          },
        ],
      },
    });

    const accounts = await fetchOperatorAccounts();

    assert.deepEqual(accounts, [
      {
        username: "demo",
        tenantId: "demo_tenant",
        operatorId: "op_demo",
        role: "admin",
        disabled: false,
        sessionVersion: 2,
      },
    ]);
  });
});

describe("channel event API client", () => {
  it("rejects malformed channel event list responses", async () => {
    mockJsonResponse({ status: 200, body: { events: [] } });

    await assert.rejects(
      fetchChannelEvents(),
      (error) => error instanceof ApiError && error.status === 502,
    );
  });

  it("keeps only customer-safe channel event fields from list responses", async () => {
    mockJsonResponse({
      status: 200,
      body: [
        {
          id: "event_1",
          channel: "taobao",
          senderName: "林女士",
          text: "鞋盒压坏了",
          receivedAt: "2026-06-06T06:00:00.000Z",
          createdAt: "2026-06-06T06:01:00.000Z",
          reviewStatus: "pending",
          rawPayload: { must: "not leak" },
          webhookSecret: "must_not_leak",
        },
      ],
    });

    const events = await fetchChannelEvents();

    assert.deepEqual(events, [
      {
        id: "event_1",
        channel: "taobao",
        senderName: "林女士",
        text: "鞋盒压坏了",
        receivedAt: "2026-06-06T06:00:00.000Z",
        createdAt: "2026-06-06T06:01:00.000Z",
        reviewStatus: "pending",
      },
    ]);
  });

  it("replays one channel event through the operator BFF", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockJsonResponse({
      status: 200,
      body: {
        status: "replayed",
        eventId: "event_1",
        caseId: "case_1",
        automationMode: "human_confirm",
      },
      requests,
    });

    const result = await replayChannelEvent("event_1");

    assert.deepEqual(result, {
      status: "replayed",
      eventId: "event_1",
      caseId: "case_1",
      automationMode: "human_confirm",
    });
    assert.equal(
      requests[0]?.url,
      "/api/operator/channel-events/event_1/replay",
    );
    assert.equal(requests[0]?.init?.method, "POST");
  });

  it("ignores one channel event with an optional note", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockJsonResponse({
      status: 200,
      body: {
        status: "ignored",
        eventId: "event_1",
      },
      requests,
    });

    const result = await ignoreChannelEvent("event_1", "重复消息");

    assert.deepEqual(result, {
      status: "ignored",
      eventId: "event_1",
    });
    assert.equal(
      requests[0]?.url,
      "/api/operator/channel-events/event_1/ignore",
    );
    assert.equal(requests[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      note: "重复消息",
    });
  });
});

function mockJsonResponse({
  status,
  body,
  requests,
}: {
  status: number;
  body: unknown;
  requests?: Array<{ url: string; init?: RequestInit }>;
}) {
  globalThis.fetch = async (input, init) => {
    requests?.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}
