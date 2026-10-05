import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { InvoiceService } from './invoice.service';
import { getPool } from '../../db/pool';
import { getInvoiceBalance } from '../payments/balance.util';

class InvoiceLineDto {
  @IsString()
  description!: string;

  @IsString()
  quantity!: string;

  @IsString()
  unitPrice!: string;

  @IsString()
  taxRateCode!: string;
}

class CreateInvoiceDto {
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
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class IdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

@Controller('api/v1/invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private invoiceService: InvoiceService) {}

  @Post()
  @RequirePermission('invoice.create')
  async create(@Req() req: any, @Body() dto: CreateInvoiceDto) {
    const pool = getPool();
    const orgResult = await pool.query(
      `SELECT country_code FROM organizations WHERE id = $1`,
      [req.membership.organizationId],
    );
    const countryCode = orgResult.rows[0]?.country_code ?? 'AU';

    const invoice = await this.invoiceService.create(req.membership.organizationId, countryCode, {
      contactId: dto.contactId,
      issueDate: new Date(dto.issueDate),
      dueDate: new Date(dto.dueDate),
      currency: dto.currency ?? 'AUD',
      lines: dto.lines,
      notes: dto.notes,
    });
    return { success: true, data: invoice };
  }

  @Post('bulk-delete')
  @RequirePermission('invoice.update')
  async bulkDelete(@Req() req: any, @Body() body: IdsDto) {
    const result = await this.invoiceService.bulkDelete(req.membership.organizationId, body.ids || []);
    return { success: true, data: result };
  }

  @Post('bulk-void')
  @RequirePermission('invoice.void')
  async bulkVoid(@Req() req: any, @Body() body: IdsDto & { reason?: string }) {
    const result = await this.invoiceService.bulkVoid(
      req.membership.organizationId,
      body.ids || [],
      body.reason,
    );
    return { success: true, data: result };
  }

  @Post(':id/send')
  @RequirePermission('invoice.send')
  async send(@Req() req: any, @Param('id') id: string) {
    const result = await this.invoiceService.send(req.membership.organizationId, id);
    return { success: true, data: result };
  }

  @Get()
  @RequirePermission('invoice.read')
  async list(@Req() req: any) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT i.id, i.invoice_number, i.status, i.subtotal, i.tax_total, i.total,
              (i.total - COALESCE(p.paid, 0))::numeric(20,2) AS balance_remaining
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
         ON p.invoice_id = i.id
       WHERE i.organization_id = $1 ORDER BY i.created_at DESC`,
      [req.membership.organizationId],
    );
    return { success: true, data: result.rows };
  }

  @Get(':id')
  @RequirePermission('invoice.read')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, invoice_number, status, subtotal, tax_total, total FROM invoices
       WHERE id = $1 AND organization_id = $2`,
      [id, req.membership.organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Invoice not found');
    }
    const balance = await getInvoiceBalance(pool, req.membership.organizationId, id);
    return { success: true, data: { ...result.rows[0], balance } };
  }

  @Post(':id/void')
  @RequirePermission('invoice.void')
  async voidInvoice(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    const result = await this.invoiceService.voidInvoice(
      req.membership.organizationId,
      id,
      body?.reason || 'Voided by user',
    );
    return { success: true, data: result };
  }

  @Post(':id/credit-note')
  @RequirePermission('invoice.void')
  async creditNote(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    const result = await this.invoiceService.creditNote(
      req.membership.organizationId,
      id,
      body?.reason || 'Credit note',
    );
    return { success: true, data: result };
  }

  @Post(':id/duplicate')
  @RequirePermission('invoice.create')
  async duplicate(@Req() req: any, @Param('id') id: string) {
    const pool = getPool();
    const orgResult = await pool.query(`SELECT country_code FROM organizations WHERE id = $1`, [
      req.membership.organizationId,
    ]);
    const countryCode = orgResult.rows[0]?.country_code ?? 'AU';
    const invoice = await this.invoiceService.duplicate(req.membership.organizationId, id, countryCode);
    return { success: true, data: invoice };
  }

  @Delete(':id')
  @RequirePermission('invoice.update')
  async remove(@Req() req: any, @Param('id') id: string) {
    const result = await this.invoiceService.deleteOne(req.membership.organizationId, id);
    return { success: true, data: result };
  }
}
