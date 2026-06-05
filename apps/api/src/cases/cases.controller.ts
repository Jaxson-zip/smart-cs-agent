import { Controller, Get, Headers, Param } from '@nestjs/common';
import {
  requireRequestContext,
  type RequestHeaders,
} from '../auth/request-context';
import { CasesService } from './cases.service';

@Controller('v1/cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  async getCases(@Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    return this.casesService.findAll(context.tenantId);
  }

  @Get(':id')
  async getCase(@Param('id') id: string, @Headers() headers: RequestHeaders) {
    const context = requireRequestContext(headers);
    return this.casesService.findOne(id, context.tenantId);
  }
}
