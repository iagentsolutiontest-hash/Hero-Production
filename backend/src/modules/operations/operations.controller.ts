import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OperationsService } from './operations.service';
import { getEntityConfig } from './operations.registry';
import { InvoiceService } from '../invoices/invoice.service';
import { BillService } from '../bills/bill.service';
import { getPool } from '../../db/pool';

function requireDomainPermission(req: any, domain: string, action: 'read' | 'manage') {
  const key = `${domain}.${action}`;
  if (!req.membership.permissionKeys.has(key)) {
    throw new ForbiddenException(`Missing required permission: ${key}`);
  }
}

@Controller('api/v1/ops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(
    private operationsService: OperationsService,
    private invoiceService: InvoiceService,
    private billService: BillService,
  ) {}

  // ---- Computed / read-only reports (checked before the generic :entity
  // routes below so "reports" is never mistaken for an entity key) ----

  @Get('reports/inventory-valuation')
  async inventoryValuation(@Req() req: any) {
    requireDomainPermission(req, 'inventory_ops', 'read');
    const data = await this.operationsService.inventoryValuation(req.membership.organizationId);
    return { success: true, data };
  }

  @Get('reports/cash-flow')
  async cashFlow(@Req() req: any, @Query('months') months?: string) {
    requireDomainPermission(req, 'sales_ops', 'read');
    const data = await this.operationsService.cashFlowForecast(
      req.membership.organizationId,
      Math.min(Math.max(parseInt(months || '6', 10) || 6, 1), 24),
    );
    return { success: true, data };
  }

  @Get('reports/budget-vs-actual')
  async budgetVsActual(@Req() req: any) {
    requireDomainPermission(req, 'project_ops', 'read');
    const data = await this.operationsService.budgetVsActual(req.membership.organizationId);
    return { success: true, data };
  }

  @Get('reports/analytics')
  async analytics(@Req() req: any) {
    if (!req.membership.permissionKeys.has('report.read')) {
      throw new ForbiddenException('Missing required permission: report.read');
    }
    const data = await this.operationsService.analyticsSummary(req.membership.organizationId);
    return { success: true, data };
  }

  // ---- Fixed asset actions ----

  @Post('fixed-assets/:id/run-depreciation')
  async runDepreciation(@Req() req: any, @Param('id') id: string) {
    requireDomainPermission(req, 'asset_ops', 'manage');
    const data = await this.operationsService.runDepreciation(req.membership.organizationId, id);
    return { success: true, data };
  }

  @Post('fixed-assets/:id/dispose')
  async disposeAsset(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { disposalDate: string; proceeds?: string; reason?: string },
  ) {
    requireDomainPermission(req, 'asset_ops', 'manage');
    const data = await this.operationsService.disposeAsset(req.membership.organizationId, id, body);
    return { success: true, data };
  }

  // ---- Recurring template actions: turn a template into a real invoice/bill now ----

  @Post('recurring-invoices/:id/generate')
  async generateInvoiceNow(@Req() req: any, @Param('id') id: string) {
    requireDomainPermission(req, 'sales_ops', 'manage');
    const orgId = req.membership.organizationId;
    const template = await this.operationsService.getOne(orgId, 'recurring-invoices', id);
    const countryCode = await this.orgCountryCode(orgId);
    const today = new Date();
    const invoice = await this.invoiceService.create(orgId, countryCode, {
      contactId: template.contact_id,
      issueDate: today,
      dueDate: today,
      currency: template.currency,
      lines: template.line_template,
    });
    await getPool().query(
      `UPDATE recurring_invoices SET next_run_date = (next_run_date + CASE frequency WHEN 'WEEKLY' THEN interval '7 days' WHEN 'QUARTERLY' THEN interval '3 months' ELSE interval '1 month' END) WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    return { success: true, data: { invoice, templateId: id } };
  }

  @Post('recurring-bills/:id/generate')
  async generateBillNow(@Req() req: any, @Param('id') id: string) {
    requireDomainPermission(req, 'purchase_ops', 'manage');
    const orgId = req.membership.organizationId;
    const template = await this.operationsService.getOne(orgId, 'recurring-bills', id);
    const countryCode = await this.orgCountryCode(orgId);
    const today = new Date();
    const bill = await this.billService.create(orgId, countryCode, {
      contactId: template.contact_id,
      issueDate: today,
      dueDate: today,
      currency: template.currency,
      lines: template.line_template,
    });
    await getPool().query(
      `UPDATE recurring_bills SET next_run_date = (next_run_date + CASE frequency WHEN 'WEEKLY' THEN interval '7 days' WHEN 'QUARTERLY' THEN interval '3 months' ELSE interval '1 month' END) WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    return { success: true, data: { bill, templateId: id } };
  }

  private async orgCountryCode(organizationId: string): Promise<string> {
    const result = await getPool().query(`SELECT country_code FROM organizations WHERE id = $1`, [organizationId]);
    return result.rows[0]?.country_code ?? 'AU';
  }

  // ---- Generic CRUD for every registered entity ----

  @Get(':entity')
  async list(@Req() req: any, @Param('entity') entity: string, @Query() query: Record<string, string>) {
    const config = getEntityConfig(entity);
    requireDomainPermission(req, config.permissionDomain, 'read');
    const { ...filters } = query;
    const data = await this.operationsService.list(req.membership.organizationId, entity, filters);
    return { success: true, data };
  }

  @Get(':entity/:id')
  async getOne(@Req() req: any, @Param('entity') entity: string, @Param('id') id: string) {
    const config = getEntityConfig(entity);
    requireDomainPermission(req, config.permissionDomain, 'read');
    const data = await this.operationsService.getOne(req.membership.organizationId, entity, id);
    return { success: true, data };
  }

  @Post(':entity')
  async create(@Req() req: any, @Param('entity') entity: string, @Body() body: Record<string, unknown>) {
    const config = getEntityConfig(entity);
    requireDomainPermission(req, config.permissionDomain, 'manage');
    const data = await this.operationsService.create(req.membership.organizationId, entity, body);
    return { success: true, data };
  }

  @Patch(':entity/:id')
  async update(
    @Req() req: any,
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const config = getEntityConfig(entity);
    requireDomainPermission(req, config.permissionDomain, 'manage');
    const data = await this.operationsService.update(req.membership.organizationId, entity, id, body);
    return { success: true, data };
  }

  @Post(':entity/bulk-delete')
  async bulkDelete(@Req() req: any, @Param('entity') entity: string, @Body() body: { ids: string[] }) {
    const config = getEntityConfig(entity);
    requireDomainPermission(req, config.permissionDomain, 'manage');
    const data = await this.operationsService.bulkDelete(req.membership.organizationId, entity, body.ids || []);
    return { success: true, data };
  }

  @Delete(':entity/:id')
  async remove(@Req() req: any, @Param('entity') entity: string, @Param('id') id: string) {
    const config = getEntityConfig(entity);
    requireDomainPermission(req, config.permissionDomain, 'manage');
    const data = await this.operationsService.remove(req.membership.organizationId, entity, id);
    return { success: true, data };
  }
}
