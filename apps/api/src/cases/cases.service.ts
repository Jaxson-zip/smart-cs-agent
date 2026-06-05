import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  afterSalesCaseSchema,
  type AfterSalesAction,
} from '@smart-cs-agent/shared';
import { PrismaService } from '../prisma/prisma.service';

type CaseWithDetails = Prisma.AfterSalesCaseGetPayload<{
  include: {
    messages: true;
    caseActions: true;
    auditLogs: true;
  };
}>;

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const toIsoMessage = (message: CaseWithDetails['messages'][number]) => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
});

const toIsoAction = (action: CaseWithDetails['caseActions'][number]) => ({
  ...action,
  createdAt: action.createdAt.toISOString(),
  updatedAt: action.updatedAt.toISOString(),
});

const toIsoAuditLog = (auditLog: CaseWithDetails['auditLogs'][number]) => ({
  ...auditLog,
  details: toRecord(auditLog.details),
  createdAt: auditLog.createdAt.toISOString(),
});

const deriveActions = (caseItem: CaseWithDetails): AfterSalesAction[] => {
  if (Array.isArray(caseItem.actions)) {
    return afterSalesCaseSchema.parse({
      caseId: caseItem.id,
      merchantId: caseItem.merchantId,
      channel: caseItem.channel,
      customerName: caseItem.customerName,
      orderId: caseItem.orderId ?? undefined,
      category: caseItem.category,
      riskLevel: caseItem.riskLevel,
      automationMode: caseItem.automationMode,
      customerMessage: caseItem.customerMessage,
      customerReply: caseItem.customerReply ?? undefined,
      actions: caseItem.actions,
    }).actions ?? [];
  }

  return caseItem.caseActions.map((action) => ({
    ...toRecord(action.params),
    type: action.type,
    status: action.status,
  })) as AfterSalesAction[];
};

const mapCase = (caseItem: CaseWithDetails) => {
  const actions = deriveActions(caseItem);
  const parsedCase = afterSalesCaseSchema.parse({
    caseId: caseItem.id,
    merchantId: caseItem.merchantId,
    channel: caseItem.channel,
    customerName: caseItem.customerName,
    orderId: caseItem.orderId ?? undefined,
    category: caseItem.category,
    riskLevel: caseItem.riskLevel,
    automationMode: caseItem.automationMode,
    customerMessage: caseItem.customerMessage,
    customerReply: caseItem.customerReply ?? undefined,
    actions,
    createdAt: caseItem.createdAt,
    updatedAt: caseItem.updatedAt,
  });

  return {
    ...parsedCase,
    messages: caseItem.messages.map(toIsoMessage),
    caseActions: caseItem.caseActions.map(toIsoAction),
    auditLogs: caseItem.auditLogs.map(toIsoAuditLog),
  };
};

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const cases = await this.prisma.afterSalesCase.findMany({
      where: { merchantId: tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        caseActions: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    return cases.map(mapCase);
  }

  async findOne(id: string, tenantId: string) {
    const caseItem = await this.prisma.afterSalesCase.findFirst({
      where: { id, merchantId: tenantId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        caseActions: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException(`Case with ID ${id} not found`);
    }

    return mapCase(caseItem);
  }
}
