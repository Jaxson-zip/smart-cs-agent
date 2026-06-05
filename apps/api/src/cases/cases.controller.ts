import { Controller, Get, Param } from '@nestjs/common';
import { CasesService } from './cases.service';

@Controller('v1/cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  async getCases() {
    return this.casesService.findAll();
  }

  @Get(':id')
  async getCase(@Param('id') id: string) {
    return this.casesService.findOne(id);
  }
}
