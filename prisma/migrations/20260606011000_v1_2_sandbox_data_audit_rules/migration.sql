-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "level" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "shippingAddress" TEXT,
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "messages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSalesCase" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "orderId" TEXT,
    "category" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "automationMode" TEXT NOT NULL,
    "customerMessage" TEXT NOT NULL,
    "customerReply" TEXT,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSalesCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedChannelEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalConversationId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedChannelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "params" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuleConfig_tenantId_key_key" ON "RuleConfig"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AfterSalesCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAction" ADD CONSTRAINT "CaseAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AfterSalesCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AfterSalesCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
