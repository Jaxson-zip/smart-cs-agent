import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ApiError,
  fetchApiReadiness,
  fetchChannelEvents,
  fetchChannelEventOperationAudits,
  fetchChannelEventMetrics,
  fetchOperatorAccounts,
  ignoreChannelEvent,
  replayChannelEvent,
  recoverStaleChannelEvents,
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
  it("keeps degraded readiness queue details for operator operations", async () => {
    mockJsonResponse({
      status: 200,
      body: {
        status: "degraded",
        service: "smart-cs-agent-api",
        timestamp: "2026-06-06T08:00:00.000Z",
        checks: {
          channelQueue: {
            status: "degraded",
            pendingCount: 12,
            processingCount: 2,
            staleProcessingCount: 1,
            oldestPendingAgeSeconds: 1800,
            thresholds: {
              pendingWarnThreshold: 10,
              oldestPendingWarnSeconds: 900,
              staleProcessingWarnThreshold: 0,
              staleAfterMinutes: 15,
            },
            reasons: [
              "pending_count_above_threshold",
              "oldest_pending_age_above_threshold",
              "stale_processing_above_threshold",
            ],
          },
        },
      },
    });

    const readiness = await fetchApiReadiness();

    assert.equal(readiness.status, "degraded");
    assert.deepEqual(readiness.channelQueue, {
      status: "degraded",
      pendingCount: 12,
      processingCount: 2,
      staleProcessingCount: 1,
      oldestPendingAgeSeconds: 1800,
      reasons: [
        "pending_count_above_threshold",
        "oldest_pending_age_above_threshold",
        "stale_processing_above_threshold",
      ],
    });
  });

  it("maps channel event queue metrics without leaking internal fields", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockJsonResponse({
      status: 200,
      body: {
        pendingCount: 3,
        processingCount: 2,
        staleProcessingCount: 1,
        replayedCount: 8,
        ignoredCount: 5,
        oldestPendingReceivedAt: "2026-06-06T07:00:00.000Z",
        oldestPendingAgeSeconds: 1800,
        staleAfterMinutes: 15,
        measuredAt: "2026-06-06T07:30:00.000Z",
        tenantId: "must_not_leak",
        source: "must_not_leak",
        externalMessageId: "must_not_leak",
      },
      requests,
    });

    const metrics = await fetchChannelEventMetrics();

    assert.equal(requests[0]?.url, "/api/operator/channel-events/metrics");
    assert.deepEqual(metrics, {
      pendingCount: 3,
      processingCount: 2,
      staleProcessingCount: 1,
      replayedCount: 8,
      ignoredCount: 5,
      oldestPendingReceivedAt: "2026-06-06T07:00:00.000Z",
      oldestPendingAgeSeconds: 1800,
      staleAfterMinutes: 15,
      measuredAt: "2026-06-06T07:30:00.000Z",
    });
  });

  it("recovers stale channel event claims through the operator BFF", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockJsonResponse({
      status: 200,
      body: {
        status: "recovered",
        recoveredCount: 2,
        recoveredBefore: "2026-06-06T07:15:00.000Z",
        eventIds: ["event_1", "event_2"],
      },
      requests,
    });

    const result = await recoverStaleChannelEvents({
      olderThanMinutes: 20,
      limit: 25,
    });

    assert.equal(requests[0]?.url, "/api/operator/channel-events/recover-stale");
    assert.equal(requests[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      olderThanMinutes: 20,
      limit: 25,
    });
    assert.deepEqual(result, {
      status: "recovered",
      recoveredCount: 2,
      recoveredBefore: "2026-06-06T07:15:00.000Z",
      eventIds: ["event_1", "event_2"],
    });
  });

  it("maps queue operation audits without leaking internal audit details", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    mockJsonResponse({
      status: 200,
      body: [
        {
          id: "audit_1",
          type: "stale_processing_recovered",
          operatorId: "admin_1",
          recoveredCount: 2,
          recoveredBefore: "2026-06-06T07:15:00.000Z",
          queueHealthyAfter: true,
          queueAfter: {
            pendingCount: 4,
            staleProcessingCount: 0,
          },
          createdAt: "2026-06-06T07:31:00.000Z",
          tenantId: "must_not_leak",
          eventIds: ["must_not_leak"],
          details: { payload: "must_not_leak" },
        },
      ],
      requests,
    });

    const audits = await fetchChannelEventOperationAudits();

    assert.equal(
      requests[0]?.url,
      "/api/operator/channel-events/operation-audits",
    );
    assert.deepEqual(audits, [
      {
        id: "audit_1",
        type: "stale_processing_recovered",
        operatorId: "admin_1",
        recoveredCount: 2,
        recoveredBefore: "2026-06-06T07:15:00.000Z",
        queueHealthyAfter: true,
        queueAfter: {
          pendingCount: 4,
          staleProcessingCount: 0,
        },
        createdAt: "2026-06-06T07:31:00.000Z",
      },
    ]);
    assert.ok(!JSON.stringify(audits).includes("must_not_leak"));
  });

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
