import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(caseId: string | null, action: string, details?: Prisma.InputJsonValue) {
    this.logger.log(`Audit [${action}] for Case [${caseId || 'N/A'}]: ${JSON.stringify(details || {})}`);
    
    // Attempt to persist if a caseId is provided or it's a general action
    try {
      await this.prisma.auditLog.create({
        data: {
          caseId,
          action,
          details: details || {},
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to persist audit log: ${(e as Error).message}`);
    }
  }
}
