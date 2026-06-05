-- CreateTable
CREATE TABLE "OperatorAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAccount_username_key" ON "OperatorAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAccount_tenantId_operatorId_key" ON "OperatorAccount"("tenantId", "operatorId");

-- CreateIndex
CREATE INDEX "OperatorAccount_tenantId_role_idx" ON "OperatorAccount"("tenantId", "role");
