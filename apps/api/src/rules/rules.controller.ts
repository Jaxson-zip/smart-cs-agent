import { Controller, Get, Headers, Param } from '@nestjs/common';
import {
  requireRequestContext,
  requireTenantParamAccess,
  type RequestHeaders,
} from '../auth/request-context';
import { RulesService } from './rules.service';

@Controller('v1/rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  async getCurrentTenantRules(@Headers() headers: RequestHeaders) {
    return this.getRulesForTenant(headers);
  }

  @Get(':tenantId')
  async getRules(
    @Headers() headers: RequestHeaders,
    @Param('tenantId') tenantId: string,
  ) {
    return this.getRulesForTenant(headers, tenantId);
  }

  private getRulesForTenant(
    headers: RequestHeaders,
    tenantId?: string,
  ) {
    const context = requireRequestContext(headers);
    const requestedTenantId = tenantId || context.tenantId;
    requireTenantParamAccess(context, requestedTenantId);

    return this.rulesService.getRules(requestedTenantId);
  }
}
