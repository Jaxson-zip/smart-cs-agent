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

  await prisma.caseAction.deleteMany();
  await prisma.caseMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.afterSalesCase.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.ruleConfig.deleteMany();

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

  // 1. Address change
  const case1 = await prisma.afterSalesCase.create({
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
    },
  });

  await prisma.caseMessage.create({
    data: {
      caseId: case1.id,
      senderType: "customer",
      text: "你好，我刚拍下的衣服可以改一下地址吗？",
    },
  });

  await prisma.caseAction.create({
    data: {
      caseId: case1.id,
      type: "change_address",
      status: "success",
      params: { newAddress: "北京市朝阳区某某路" },
    },
  });

  // 2. Logistics inquiry
  const case2 = await prisma.afterSalesCase.create({
    data: {
      id: "case_002",
      merchantId: "demo_tenant",
      channel: "taobao",
      customerName: "林女士",
      orderId: "ORDER_12345",
      category: "logistics",
      riskLevel: "low",
      automationMode: "auto_execute",
      customerMessage: "帮我查一下我的快递到哪里了？",
      customerReply: "您的快递正在派送中。",
    },
  });

  await prisma.caseMessage.create({
    data: {
      caseId: case2.id,
      senderType: "customer",
      text: "帮我查一下我的快递到哪里了？",
    },
  });

  await prisma.caseAction.create({
    data: {
      caseId: case2.id,
      type: "query_logistics",
      status: "success",
      result: { status: "delivering" },
    },
  });

  // 3. Damage compensation low
  const case3 = await prisma.afterSalesCase.create({
    data: {
      id: "case_003",
      merchantId: "demo_tenant",
      channel: "douyin",
      customerName: "张先生",
      orderId: "ORDER_67890",
      category: "damage_compensation",
      riskLevel: "low",
      automationMode: "auto_execute",
      customerMessage: "鞋盒压坏了，鞋子没问题，但是送人的，能不能补偿一下？",
      customerReply: "非常抱歉影响您的体验。我们可以为您补偿一张优惠券，稍后会发放到您的账户。",
    },
  });

  await prisma.caseMessage.create({
    data: {
      caseId: case3.id,
      senderType: "customer",
      text: "鞋盒压坏了，鞋子没问题，但是送人的，能不能补偿一下？",
    },
  });

  await prisma.caseAction.create({
    data: {
      caseId: case3.id,
      type: "issue_coupon",
      status: "success",
      params: { amount: 20 },
    },
  });

  // 4. Compensation rejected medium
  const case4 = await prisma.afterSalesCase.create({
    data: {
      id: "case_004",
      merchantId: "demo_tenant",
      channel: "douyin",
      customerName: "张先生",
      orderId: "ORDER_67890",
      category: "compensation_rejected",
      riskLevel: "medium",
      automationMode: "human_confirm",
      customerMessage: "30 元太少了吧，鞋盒都这样了我还怎么送人？我不接受。",
      customerReply: "我理解您觉得 30 元补偿不够。我们可以为您升级到 50 元无门槛券，确认后会发放到您的淘宝账户。",
    },
  });

  await prisma.caseMessage.create({
    data: {
      caseId: case4.id,
      senderType: "customer",
      text: "30 元太少了吧，鞋盒都这样了我还怎么送人？我不接受。",
    },
  });

  await prisma.caseAction.create({
    data: {
      caseId: case4.id,
      type: "issue_coupon",
      status: "pending",
      params: { amount: 50 },
    },
  });

  // 5. Complaint escalation high
  const case5 = await prisma.afterSalesCase.create({
    data: {
      id: "case_005",
      merchantId: "demo_tenant",
      channel: "taobao",
      customerName: "王女士",
      orderId: "ORDER_54321",
      category: "complaint_escalation",
      riskLevel: "high",
      automationMode: "human_takeover",
      customerMessage: "我要投诉你们，给我退款！不退款就差评！",
    },
  });

  await prisma.caseMessage.create({
    data: {
      caseId: case5.id,
      senderType: "customer",
      text: "我要投诉你们，给我退款！不退款就差评！",
    },
  });

  await prisma.caseAction.create({
    data: {
      caseId: case5.id,
      type: "create_handoff",
      status: "pending",
      params: { reason: "Customer threatens complaint" },
    },
  });

  console.log(`Seeded 5 AfterSalesCases`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
