import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "demo_tenant" },
    update: {},
    create: {
      id: "demo_tenant",
      name: "Demo Ecommerce Tenant",
      shops: {
        create: {
          id: "demo_shop",
          name: "Demo Fashion Store",
        },
      },
    },
  });

  console.log(`Seeded tenant ${tenant.name}`);

  await prisma.afterSalesCase.deleteMany();

  await prisma.afterSalesCase.create({
    data: {
      id: "case_001",
      merchantId: "demo_tenant",
      channel: "taobao",
      customerName: "林女士",
      orderId: "ORDER_12345",
      category: "address_change",
      riskLevel: "low",
      automationMode: "auto_execute",
      customerMessage: "你好，我刚拍下的衣服可以改一下地址吗？",
      customerReply: "没问题，已经为您修改地址为：[新地址]。",
      actions: [
        {
          type: "change_address",
          status: "success",
          newAddress: "北京市朝阳区某某路",
        },
      ],
    },
  });

  await prisma.afterSalesCase.create({
    data: {
      id: "case_002",
      merchantId: "demo_tenant",
      channel: "douyin",
      customerName: "张先生",
      orderId: "ORDER_67890",
      category: "damage_compensation",
      riskLevel: "medium",
      automationMode: "human_confirm",
      customerMessage: "鞋盒有点压坏了，能补偿点吗？",
      actions: [
        {
          type: "issue_coupon",
          status: "pending",
          amount: 20,
        },
      ],
    },
  });

  await prisma.afterSalesCase.create({
    data: {
      id: "case_003",
      merchantId: "demo_tenant",
      channel: "taobao",
      customerName: "王女士",
      orderId: "ORDER_54321",
      category: "complaint_escalation",
      riskLevel: "high",
      automationMode: "human_takeover",
      customerMessage: "我要投诉你们，给我退款！不退款就差评！",
      actions: [
        {
          type: "create_handoff",
          status: "pending",
          reason: "Customer threatens complaint",
        },
      ],
    },
  });

  console.log(`Seeded AfterSalesCases`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
