import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { AgentService } from "./agent.service";
import { ClassifierService } from "./classifier.service";
import { RiskService } from "../risk/risk.service";

describe("AgentService", () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService(new ClassifierService(), new RiskService());
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
});
