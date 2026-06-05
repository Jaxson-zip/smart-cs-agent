import { Controller, Get, Param } from '@nestjs/common';
import { RulesService } from './rules.service';

@Controller('v1/rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get(':tenantId?')
  async getRules(@Param('tenantId') tenantId?: string) {
    return this.rulesService.getRules(tenantId || 'demo_tenant');
  }
}
