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
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.conversation.deleteMany();

  // Seed Customers
  const customer1 = await prisma.customer.create({
    data: {
      id: "CUST_001",
      tenantId: "demo_tenant",
      name: "林女士",
      phone: "13800138000",
      level: "VIP",
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      id: "CUST_002",
      tenantId: "demo_tenant",
      name: "张先生",
      phone: "13900139000",
      level: "Normal",
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      id: "CUST_003",
      tenantId: "demo_tenant",
      name: "王女士",
      phone: "13700137000",
      level: "Normal",
    },
  });

  console.log(`Seeded customers`);

  // Seed Orders
  await prisma.order.create({
    data: {
      id: "ORDER_12345",
      tenantId: "demo_tenant",
      shopId: "demo_shop",
      customerId: "CUST_001",
      platform: "taobao",
      status: "paid",
      totalAmount: 199.0,
      shippingAddress: "北京市海淀区中关村大街1号",
      items: [
        {
          productId: "PROD_1",
          name: "春季新款连衣裙",
          quantity: 1,
          price: 199.0,
        },
      ],
    },
  });

  await prisma.order.create({
    data: {
      id: "ORDER_67890",
      tenantId: "demo_tenant",
      shopId: "demo_shop",
      customerId: "CUST_002",
      platform: "douyin",
      status: "delivered",
      totalAmount: 299.0,
      shippingAddress: "上海市浦东新区世纪大道1号",
      items: [
        {
          productId: "PROD_2",
          name: "男士运动跑鞋",
          quantity: 1,
          price: 299.0,
        },
      ],
    },
  });

  await prisma.order.create({
    data: {
      id: "ORDER_54321",
      tenantId: "demo_tenant",
      shopId: "demo_shop",
      customerId: "CUST_003",
      platform: "taobao",
      status: "delivered",
      totalAmount: 99.0,
      shippingAddress: "广州市天河区天河路1号",
      items: [
        {
          productId: "PROD_3",
          name: "纯棉基础T恤",
          quantity: 1,
          price: 99.0,
        },
      ],
    },
  });

  console.log(`Seeded orders`);

  // Seed Policies
  await prisma.policy.create({
    data: {
      id: "POL_1",
      tenantId: "demo_tenant",
      name: "默认发货前改地址规则",
      content: "未发货状态下，低风险收件信息修改请求自动执行。",
      category: "address_change",
    },
  });

  await prisma.policy.create({
    data: {
      id: "POL_2",
      tenantId: "demo_tenant",
      name: "小额破损补偿规则",
      content: "商品签收7天内，反馈包装破损但不影响使用的，可最高补偿30元无门槛券。",
      category: "damage_compensation",
    },
  });

  console.log(`Seeded policies`);

  // Seed Conversations
  await prisma.conversation.create({
    data: {
      id: "CONV_1",
      tenantId: "demo_tenant",
      platform: "wecom_sandbox",
      externalId: "wecom-room-001",
      messages: [
        {
          senderName: "林女士",
          text: "你好，我刚拍下的衣服可以改一下地址吗？",
          receivedAt: new Date().toISOString(),
        },
      ],
    },
  });

  console.log(`Seeded conversations`);

  // Seed AfterSalesCases
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