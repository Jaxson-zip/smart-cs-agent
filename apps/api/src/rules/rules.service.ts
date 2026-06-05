import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
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

const sandboxRulesSchema = z.object({
  couponCompensationLimit: z.number().positive().optional(),
  highRiskKeywords: z.array(z.string()).optional(),
  channelCapabilities: z.record(z.string(), z.array(z.string())).optional(),
});

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
        const parsed = sandboxRulesSchema.safeParse(config.value);
        if (parsed.success) {
          return { ...DEFAULT_RULES, ...parsed.data };
        }
        this.logger.warn(`Invalid sandbox rules config, using defaults: ${parsed.error.message}`);
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch rules, using defaults: ${(e as Error).message}`);
    }

    return DEFAULT_RULES;
  }
}
