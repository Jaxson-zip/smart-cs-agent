import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { AgentService } from "./agent.service";
import { ClassifierService } from "./classifier.service";
import { RiskService } from "../risk/risk.service";
import { AuditService } from "../audit/audit.service";
import { RulesService } from "../rules/rules.service";

describe("AgentService", () => {
  let service: AgentService;
  let requestedTenantIds: string[];

  beforeEach(() => {
    requestedTenantIds = [];
    const mockAuditService = { log: async () => {} } as unknown as AuditService;
    const mockRulesService = {
      getRules: async (tenantId: string) => {
        requestedTenantIds.push(tenantId);
        return {
          couponCompensationLimit: 50,
          highRiskKeywords: ["投诉", "差评", "消协", "退款", "退货", "不要券", "不接受", "拒绝"],
          channelCapabilities: {},
        };
      },
    } as unknown as RulesService;

    service = new AgentService(
      new ClassifierService(mockRulesService),
      new RiskService(mockRulesService),
      mockAuditService,
    );
  });

  it("auto-executes low-risk address changes", async () => {
    const result = await service.decide("你好，我可以改一下地址吗？");

    assert.strictEqual(result.automationMode, "auto_execute");
    assert.strictEqual(result.category, "address_change");
    assert.strictEqual(result.riskLevel, "low");
  });

  it("requires confirmation for compensation over the auto limit", async () => {
    const result = await service.decide("包装压坏了，需要补偿", { amount: 60 });

    assert.strictEqual(result.automationMode, "human_confirm");
    assert.strictEqual(result.category, "damage_compensation");
    assert.strictEqual(result.riskLevel, "medium");
  });

  it("hands over high-risk complaint cases", async () => {
    const result = await service.decide("太生气了，我要投诉你们");

    assert.strictEqual(result.automationMode, "human_takeover");
    assert.strictEqual(result.category, "complaint_escalation");
    assert.strictEqual(result.riskLevel, "high");
  });

  it("loads classification and risk rules for the request tenant", async () => {
    await service.decide("你好，我可以改一下地址吗？", {
      tenantId: "tenant_a",
    });

    assert.deepStrictEqual(requestedTenantIds, ["tenant_a", "tenant_a"]);
  });
});
