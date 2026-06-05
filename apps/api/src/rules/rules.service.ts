import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SandboxRules {
  couponCompensationLimit: number;
  highRiskKeywords: string[];
  channelCapabilities: Record<string, string[]>;
}

const DEFAULT_RULES: SandboxRules = {
  couponCompensationLimit: 50,
  highRiskKeywords: ["投诉", "差评", "消协", "退款", "退货", "不要券", "不接受", "拒绝"],
  channelCapabilities: {
    taobao: ["change_address", "query_logistics", "issue_coupon"],
    douyin: ["change_address", "query_logistics", "issue_coupon"],
  },
};

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getRules(tenantId: string = 'demo_tenant'): Promise<SandboxRules> {
    try {
      const config = await this.prisma.ruleConfig.findUnique({
        where: {
          tenantId_key: {
            tenantId,
            key: 'sandbox_rules',
          },
        },
      });

      if (config && config.value) {
        return { ...DEFAULT_RULES, ...(config.value as any) };
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch rules, using defaults: ${(e as Error).message}`);
    }

    return DEFAULT_RULES;
  }
}
