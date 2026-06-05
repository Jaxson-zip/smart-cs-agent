import { openai } from "@ai-sdk/openai";
import { streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { mockDb } from "../../db";
import {
  disabledLegacyDemoApiResponse,
  legacyDemoApiEnabled,
} from "../legacy-demo-guard";

export const maxDuration = 30;

type ChatRequestBody = {
  messages: ModelMessage[];
};

const shippedStatus = "已发货";
const refundedStatus = "已退款";

export async function POST(req: Request) {
  if (!legacyDemoApiEnabled()) {
    return disabledLegacyDemoApiResponse();
  }

  const { messages } = (await req.json()) as ChatRequestBody;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system:
      "你是一个电商售后客服。回答前先用工具核实订单状态；只有待发货订单可以修改地址；退款前必须先查询订单。回答要简洁、专业。",
    messages,
    tools: {
      checkOrderStatus: tool({
        description: "Get the status and details of an order by its ID.",
        inputSchema: z.object({
          orderId: z.string().describe("The ID of the order to check."),
        }),
        execute: async ({ orderId }) => {
          const order = mockDb.orders.find((item) => item.orderId === orderId);
          if (!order) return { success: false, message: "Order not found." };
          return { success: true, order };
        },
      }),
      modifyAddress: tool({
        description: "Modify the shipping address of an order.",
        inputSchema: z.object({
          orderId: z.string().describe("The ID of the order."),
          newAddress: z.string().describe("The new shipping address."),
        }),
        execute: async ({ orderId, newAddress }) => {
          const order = mockDb.orders.find((item) => item.orderId === orderId);
          if (!order) return { success: false, message: "Order not found." };
          if (String(order.status) === shippedStatus) {
            return {
              success: false,
              message: "Cannot modify address: order has already shipped.",
            };
          }

          order.address = newAddress;
          return { success: true, message: "Address updated.", order };
        },
      }),
      processRefund: tool({
        description: "Process a refund for an order.",
        inputSchema: z.object({
          orderId: z.string().describe("The ID of the order to refund."),
        }),
        execute: async ({ orderId }) => {
          const order = mockDb.orders.find((item) => item.orderId === orderId);
          if (!order) return { success: false, message: "Order not found." };

          order.status = refundedStatus as typeof order.status;
          return { success: true, message: "Refund processed.", order };
        },
      }),
    },
  });

  return result.toTextStreamResponse();
}
