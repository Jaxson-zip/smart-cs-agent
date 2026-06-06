import assert from "node:assert";
import { describe, it } from "node:test";
import type { AfterSalesAction } from "@smart-cs-agent/shared";
import { MockDouyinAdapter } from "../adapters/mock-douyin.adapter";
import { MockTaobaoAdapter } from "../adapters/mock-taobao.adapter";
import type { AuditService } from "../audit/audit.service";
import { ActionService } from "./action.service";

describe("ActionService sandbox execution", () => {
  it("marks mock provider actions as simulated instead of real success", async () => {
    const service = new ActionService(
      { log: async () => undefined } as unknown as AuditService,
      new MockTaobaoAdapter(),
      new MockDouyinAdapter(),
    );
    const mockProviderActions: AfterSalesAction[] = [
      { type: "change_address", newAddress: "demo address", status: "pending" },
      { type: "query_logistics", status: "pending" },
      { type: "issue_coupon", amount: 20, status: "pending" },
      { type: "send_channel_reply", replyText: "demo reply", status: "pending" },
    ];

    for (const action of mockProviderActions) {
      const result = await service.executeMockAction(action, "case_1");

      assert.strictEqual(result.status, "simulated", action.type);
    }
  });

  it("keeps human workflow actions pending", async () => {
    const service = new ActionService(
      { log: async () => undefined } as unknown as AuditService,
      new MockTaobaoAdapter(),
      new MockDouyinAdapter(),
    );

    const handoff = await service.executeMockAction({
      type: "create_handoff",
      reason: "needs operator",
      status: "pending",
    });
    const supervisorReview = await service.executeMockAction({
      type: "create_supervisor_review",
      reason: "needs supervisor",
      status: "pending",
    });

    assert.strictEqual(handoff.status, "pending");
    assert.strictEqual(supervisorReview.status, "pending");
  });
});
