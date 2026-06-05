import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.afterSalesCase.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        messages: true,
        caseActions: true,
        auditLogs: true,
      },
    });
  }

  async findOne(id: string) {
    const caseItem = await this.prisma.afterSalesCase.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        caseActions: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException(`Case with ID ${id} not found`);
    }

    return caseItem;
  }
}
