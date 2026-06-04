import { Test, TestingModule } from "@nestjs/testing";
import { AgentService } from "./agent.service";
import { ClassifierService } from "./classifier.service";
import { RiskService } from "../risk/risk.service";
import { ActionModule } from "../actions/action.module";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

describe("AgentService", () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService(new ClassifierService(), new RiskService());
  });

  it("should auto_execute for low risk address change", async () => {
    const result = await service.decide("你好，我可以改一下地址吗");
    assert.strictEqual(result.automationMode, "auto_execute");
    assert.strictEqual(result.category, "address_change");
    assert.strictEqual(result.riskLevel, "low");
  });

  it("should human_confirm for medium risk compensation over limit", async () => {
    const result = await service.decide("压坏了，需要补偿", { amount: 60 });
    assert.strictEqual(result.automationMode, "human_confirm");
    assert.strictEqual(result.category, "damage_compensation");
    assert.strictEqual(result.riskLevel, "medium");
  });

  it("should human_takeover for high risk complaint", async () => {
    const result = await service.decide("太生气了，我要投诉你们");
    assert.strictEqual(result.automationMode, "human_takeover");
    assert.strictEqual(result.category, "complaint_escalation");
    assert.strictEqual(result.riskLevel, "high");
  });
});
