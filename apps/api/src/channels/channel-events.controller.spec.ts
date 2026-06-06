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
