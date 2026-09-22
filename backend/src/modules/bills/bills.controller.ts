import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { BillService } from './bill.service';
import { getPool } from '../../db/pool';

class BillLineDto {
  @IsString()
  description!: string;

  @IsString()
  quantity!: string;

  @IsString()
  unitPrice!: string;

  @IsString()
  taxRateCode!: string;
}

class CreateBillDto {
  @IsString()
  contactId!: string;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines!: BillLineDto[];
}

class IdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

@Controller('api/v1/bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillsController {
  constructor(private billService: BillService) {}

  @Post()
  @RequirePermission('bill.create')
  async create(@Req() req: any, @Body() dto: CreateBillDto) {
    const pool = getPool();
    const orgResult = await pool.query(`SELECT country_code FROM organizations WHERE id = $1`, [
      req.membership.organizationId,
    ]);
    const countryCode = orgResult.rows[0]?.country_code ?? 'AU';

    const bill = await this.billService.create(req.membership.organizationId, countryCode, {
      contactId: dto.contactId,
      issueDate: new Date(dto.issueDate),
      dueDate: new Date(dto.dueDate),
      currency: dto.currency ?? 'AUD',
      lines: dto.lines,
    });
    return { success: true, data: bill };
  }

  @Post(':id/submit')
  @RequirePermission('bill.update')
  async submit(@Req() req: any, @Param('id') id: string) {
    const result = await this.billService.submit(req.membership.organizationId, id);
    return { success: true, data: result };
  }

  @Post(':id/approve')
  @RequirePermission('bill.approve')
  async approve(@Req() req: any, @Param('id') id: string) {
    const result = await this.billService.approve(req.membership.organizationId, id);
    return { success: true, data: result };
  }

  @Post(':id/pay')
  @RequirePermission('bill.pay')
  async pay(@Req() req: any, @Param('id') id: string) {
    const result = await this.billService.pay(req.membership.organizationId, id);
    return { success: true, data: result };
  }

  @Get()
  @RequirePermission('bill.read')
  async list(@Req() req: any) {
    const bills = await this.billService.listForOrg(req.membership.organizationId);
    return { success: true, data: bills };
  }

  @Get(':id')
  @RequirePermission('bill.read')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const bill = await this.billService.getOne(req.membership.organizationId, id);
    return { success: true, data: bill };
  }

  @Post('bulk-delete')
  @RequirePermission('bill.update')
  async bulkDelete(@Req() req: any, @Body() body: IdsDto) {
    const result = await this.billService.bulkDelete(req.membership.organizationId, body.ids || []);
    return { success: true, data: result };
  }

  @Delete(':id')
  @RequirePermission('bill.update')
  async remove(@Req() req: any, @Param('id') id: string) {
    const result = await this.billService.deleteOne(req.membership.organizationId, id);
    return { success: true, data: result };
  }
}
