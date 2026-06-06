-- CreateTable
CREATE TABLE "ChannelWebhookReceipt" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelWebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelWebhookReceipt_channel_tenantId_eventId_key" ON "ChannelWebhookReceipt"("channel", "tenantId", "eventId");

-- CreateIndex
CREATE INDEX "ChannelWebhookReceipt_receivedAt_idx" ON "ChannelWebhookReceipt"("receivedAt");
