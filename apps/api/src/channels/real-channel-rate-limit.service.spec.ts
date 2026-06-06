import assert from "node:assert";
import { HttpException } from "@nestjs/common";
import { describe, it } from "node:test";
import { RealChannelRateLimitService } from "./real-channel-rate-limit.service";

describe("RealChannelRateLimitService", () => {
  it("allows repeated webhooks when the limit is disabled", () => {
    const service = new RealChannelRateLimitService();
    const env = { REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "0" };

    service.assertAllowed({ channel: "taobao", tenantId: "tenant_1", env });
    service.assertAllowed({ channel: "taobao", tenantId: "tenant_1", env });
  });

  it("limits per channel and tenant within the same minute", () => {
    const service = new RealChannelRateLimitService();
    const env = { REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "1" };
    const now = new Date("2026-06-06T08:00:15.000Z");

    service.assertAllowed({ channel: "taobao", tenantId: "tenant_1", now, env });
    service.assertAllowed({ channel: "douyin", tenantId: "tenant_1", now, env });
    service.assertAllowed({ channel: "taobao", tenantId: "tenant_2", now, env });

    assert.throws(
      () =>
        service.assertAllowed({
          channel: "taobao",
          tenantId: "tenant_1",
          now,
          env,
        }),
      (error) =>
        error instanceof HttpException && error.getStatus() === 429,
    );
  });

  it("starts a fresh bucket in the next minute window", () => {
    const service = new RealChannelRateLimitService();
    const env = { REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "1" };

    service.assertAllowed({
      channel: "taobao",
      tenantId: "tenant_1",
      now: new Date("2026-06-06T08:00:15.000Z"),
      env,
    });
    service.assertAllowed({
      channel: "taobao",
      tenantId: "tenant_1",
      now: new Date("2026-06-06T08:01:00.000Z"),
      env,
    });
  });

  it("does not collide when channel or tenant IDs contain separators", () => {
    const service = new RealChannelRateLimitService();
    const env = { REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "1" };
    const now = new Date("2026-06-06T08:00:15.000Z");

    service.assertAllowed({ channel: "a:b", tenantId: "c", now, env });
    service.assertAllowed({ channel: "a", tenantId: "b:c", now, env });

    assert.throws(
      () => service.assertAllowed({ channel: "a:b", tenantId: "c", now, env }),
      (error) =>
        error instanceof HttpException && error.getStatus() === 429,
    );
  });

  it("prunes old minute buckets when a new window starts", () => {
    const service = new RealChannelRateLimitService();
    const env = { REAL_CHANNEL_WEBHOOK_RATE_LIMIT_PER_MINUTE: "1" };
    const buckets = (service as unknown as { buckets: Map<string, unknown> })
      .buckets;

    service.assertAllowed({
      channel: "taobao",
      tenantId: "tenant_1",
      now: new Date("2026-06-06T08:00:15.000Z"),
      env,
    });
    assert.strictEqual(buckets.size, 1);

    service.assertAllowed({
      channel: "douyin",
      tenantId: "tenant_2",
      now: new Date("2026-06-06T08:01:00.000Z"),
      env,
    });
    assert.strictEqual(buckets.size, 1);
  });
});
