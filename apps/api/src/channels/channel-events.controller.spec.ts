import assert from "node:assert";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ChannelEventsController } from "./channel-events.controller";
import type { ChannelEventReviewService } from "./channel-event-review.service";

describe("ChannelEventsController", () => {
  it("lists pending channel events through the operator tenant context", async () => {
    const calls: unknown[] = [];
    const controller = new ChannelEventsController({
      listPending: async (tenantId: string) => {
        calls.push({ method: "listPending", tenantId });
        return [{ id: "event_1" }];
      },
    } as unknown as ChannelEventReviewService);

    const result = await controller.list({
      "x-tenant-id": "tenant_1",
      "x-operator-id": "operator_1",
    });

    assert.deepStrictEqual(result, [{ id: "event_1" }]);
    assert.deepStrictEqual(calls, [
      { method: "listPending", tenantId: "tenant_1" },
    ]);
  });

  it("returns queue metrics through the operator tenant context", async () => {
    const calls: unknown[] = [];
    const controller = new ChannelEventsController({
      getQueueMetrics: async (input: unknown) => {
        calls.push(input);
        return {
          pendingCount: 3,
          processingCount: 2,
          staleProcessingCount: 1,
        };
      },
    } as unknown as ChannelEventReviewService);

    const result = await controller.metrics({
      "x-tenant-id": "tenant_1",
      "x-operator-id": "operator_1",
    });

    assert.deepStrictEqual(result, {
      pendingCount: 3,
      processingCount: 2,
      staleProcessingCount: 1,
    });
    assert.deepStrictEqual(calls, [{ tenantId: "tenant_1" }]);
  });

  it("lets admin operators list sanitized queue operation audits", async () => {
    const calls: unknown[] = [];
    const controller = new ChannelEventsController({
      listQueueOperationAudits: async (input: unknown) => {
        calls.push(input);
        return [
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
        ];
      },
    } as unknown as ChannelEventReviewService);

    const result = await controller.operationAudits({
      "x-tenant-id": "tenant_1",
      "x-operator-id": "admin_1",
    });

    assert.deepStrictEqual(calls, [{ tenantId: "tenant_1" }]);
    assert.deepStrictEqual(result, [
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
  });

  it("rejects non-admin queue operation audit requests", async () => {
    const controller = new ChannelEventsController({
      listQueueOperationAudits: async () => {
        throw new Error("audit list should not be called");
      },
    } as unknown as ChannelEventReviewService);
    const envValue = process.env.OPERATOR_API_KEYS;
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_api_key",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);

    try {
      await assert.rejects(
        () =>
          controller.operationAudits({
            authorization: "Bearer operator_api_key",
            "x-tenant-id": "tenant_1",
          }),
        ForbiddenException,
      );
    } finally {
      if (envValue === undefined) {
        delete process.env.OPERATOR_API_KEYS;
      } else {
        process.env.OPERATOR_API_KEYS = envValue;
      }
    }
  });

  it("replays an event with the authenticated operator context", async () => {
    const calls: unknown[] = [];
    const controller = new ChannelEventsController({
      replay: async (eventId: string, context: unknown) => {
        calls.push({ method: "replay", eventId, context });
        return { status: "replayed", eventId, caseId: "case_1" };
      },
    } as unknown as ChannelEventReviewService);

    const result = await controller.replay(
      "event_1",
      {
        "x-tenant-id": "tenant_1",
        "x-operator-id": "operator_1",
      },
    );

    assert.deepStrictEqual(result, {
      status: "replayed",
      eventId: "event_1",
      caseId: "case_1",
    });
    assert.deepStrictEqual(calls, [
      {
        method: "replay",
        eventId: "event_1",
        context: {
          tenantId: "tenant_1",
          operatorId: "operator_1",
          role: "admin",
        },
      },
    ]);
  });

  it("ignores an event with an optional review note", async () => {
    const calls: unknown[] = [];
    const controller = new ChannelEventsController({
      ignore: async (eventId: string, input: unknown) => {
        calls.push({ method: "ignore", eventId, input });
        return { status: "ignored", eventId };
      },
    } as unknown as ChannelEventReviewService);

    const result = await controller.ignore(
      "event_1",
      {
        note: "duplicate",
      },
      {
        "x-tenant-id": "tenant_1",
        "x-operator-id": "operator_1",
      },
    );

    assert.deepStrictEqual(result, { status: "ignored", eventId: "event_1" });
    assert.deepStrictEqual(calls, [
      {
        method: "ignore",
        eventId: "event_1",
        input: {
          tenantId: "tenant_1",
          operatorId: "operator_1",
          note: "duplicate",
        },
      },
    ]);
  });

  it("lets admin operators recover stale processing events", async () => {
    const calls: unknown[] = [];
    const controller = new ChannelEventsController({
      recoverStaleProcessing: async (input: unknown) => {
        calls.push(input);
        return { status: "recovered", recoveredCount: 2 };
      },
    } as unknown as ChannelEventReviewService);

    const result = await controller.recoverStale(
      {
        olderThanMinutes: 20,
        limit: 25,
      },
      {
        "x-tenant-id": "tenant_1",
        "x-operator-id": "admin_1",
      },
    );

    assert.deepStrictEqual(result, { status: "recovered", recoveredCount: 2 });
    assert.deepStrictEqual(calls, [
      {
        tenantId: "tenant_1",
        operatorId: "admin_1",
        olderThanMinutes: 20,
        limit: 25,
      },
    ]);
  });

  it("rejects non-admin stale recovery requests", async () => {
    const controller = new ChannelEventsController({
      recoverStaleProcessing: async () => {
        throw new Error("recover should not be called");
      },
    } as unknown as ChannelEventReviewService);
    const envValue = process.env.OPERATOR_API_KEYS;
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "operator_api_key",
        tenantId: "tenant_1",
        operatorId: "operator_1",
        role: "operator",
      },
    ]);

    try {
      await assert.rejects(
        () =>
          controller.recoverStale(
            { olderThanMinutes: 20 },
            {
              authorization: "Bearer operator_api_key",
              "x-tenant-id": "tenant_1",
            },
          ),
        ForbiddenException,
      );
    } finally {
      if (envValue === undefined) {
        delete process.env.OPERATOR_API_KEYS;
      } else {
        process.env.OPERATOR_API_KEYS = envValue;
      }
    }
  });

  it("rejects malformed ignore bodies with a bad request error", async () => {
    const controller = new ChannelEventsController({
      ignore: async () => {
        throw new Error("ignore should not be called");
      },
    } as unknown as ChannelEventReviewService);

    await assert.rejects(
      () =>
        controller.ignore(
          "event_1",
          { note: 123 },
          {
            "x-tenant-id": "tenant_1",
            "x-operator-id": "operator_1",
          },
        ),
      BadRequestException,
    );
  });

  it("does not allow viewer operators to replay or ignore events", async () => {
    const controller = new ChannelEventsController({
      replay: async () => {
        throw new Error("replay should not be called");
      },
      ignore: async () => {
        throw new Error("ignore should not be called");
      },
    } as unknown as ChannelEventReviewService);
    const headers = {
      authorization: "Bearer viewer_api_key",
      "x-tenant-id": "tenant_1",
    };
    const envValue = process.env.OPERATOR_API_KEYS;
    process.env.OPERATOR_API_KEYS = JSON.stringify([
      {
        key: "viewer_api_key",
        tenantId: "tenant_1",
        operatorId: "viewer_1",
        role: "viewer",
      },
    ]);

    try {
      await assert.rejects(
        () => controller.replay("event_1", headers),
        ForbiddenException,
      );
      await assert.rejects(
        () => controller.ignore("event_1", {}, headers),
        ForbiddenException,
      );
    } finally {
      if (envValue === undefined) {
        delete process.env.OPERATOR_API_KEYS;
      } else {
        process.env.OPERATOR_API_KEYS = envValue;
      }
    }
  });
});
