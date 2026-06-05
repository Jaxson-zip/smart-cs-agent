import { describe, it } from "node:test";
import assert from "node:assert";
import { CasesService } from "./cases.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CasesService", () => {
  it("maps persisted cases to the shared case shape with UI details", async () => {
    const createdAt = new Date("2026-06-05T12:00:00.000Z");
    const updatedAt = new Date("2026-06-05T12:01:00.000Z");
    const prisma = {
      afterSalesCase: {
        findMany: async (query: unknown) => {
          assert.deepStrictEqual(query, {
            where: { merchantId: "demo" },
            orderBy: { createdAt: "desc" },
            include: {
              messages: { orderBy: { createdAt: "asc" } },
              caseActions: { orderBy: { createdAt: "asc" } },
              auditLogs: { orderBy: { createdAt: "asc" } },
            },
          });

          return [
          {
            id: "case_1",
            merchantId: "demo",
            channel: "taobao",
            customerName: "Ada",
            orderId: null,
            category: "address_change",
            riskLevel: "low",
            automationMode: "auto_execute",
            customerMessage: "change my address",
            customerReply: "address updated",
            actions: null,
            createdAt,
            updatedAt,
            messages: [
              {
                id: "message_1",
                caseId: "case_1",
                senderType: "customer",
                text: "change my address",
                createdAt,
              },
            ],
            caseActions: [
              {
                id: "action_1",
                caseId: "case_1",
                type: "change_address",
                status: "success",
                params: { type: "change_address", status: "success" },
                result: null,
                createdAt,
                updatedAt,
              },
            ],
            auditLogs: [
              {
                id: "audit_1",
                caseId: "case_1",
                action: "event_received",
                details: { text: "change my address" },
                createdAt,
              },
            ],
          },
        ];
        },
      },
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    const cases = await service.findAll("demo");

    assert.strictEqual(cases[0]?.caseId, "case_1");
    assert.deepStrictEqual(cases[0]?.actions, [
      { type: "change_address", status: "success" },
    ]);
    assert.deepStrictEqual(cases[0]?.messages, [
      {
        id: "message_1",
        caseId: "case_1",
        senderType: "customer",
        text: "change my address",
        createdAt: "2026-06-05T12:00:00.000Z",
      },
    ]);
    assert.deepStrictEqual(cases[0]?.auditLogs, [
      {
        id: "audit_1",
        caseId: "case_1",
        action: "event_received",
        details: { text: "change my address" },
        createdAt: "2026-06-05T12:00:00.000Z",
      },
    ]);
  });

  it("only finds a case inside the requested tenant", async () => {
    const createdAt = new Date("2026-06-05T12:00:00.000Z");
    const prisma = {
      afterSalesCase: {
        findFirst: async (query: unknown) => {
          assert.deepStrictEqual(query, {
            where: { id: "case_1", merchantId: "demo" },
            include: {
              messages: { orderBy: { createdAt: "asc" } },
              caseActions: { orderBy: { createdAt: "asc" } },
              auditLogs: { orderBy: { createdAt: "asc" } },
            },
          });

          return {
            id: "case_1",
            merchantId: "demo",
            channel: "taobao",
            customerName: "Ada",
            orderId: null,
            category: "address_change",
            riskLevel: "low",
            automationMode: "auto_execute",
            customerMessage: "change my address",
            customerReply: "address updated",
            actions: [{ type: "change_address", status: "success" }],
            createdAt,
            updatedAt: createdAt,
            messages: [],
            caseActions: [],
            auditLogs: [],
          };
        },
      },
    };
    const service = new CasesService(prisma as unknown as PrismaService);

    const result = await service.findOne("case_1", "demo");

    assert.strictEqual(result.caseId, "case_1");
    assert.strictEqual(result.merchantId, "demo");
  });
});
