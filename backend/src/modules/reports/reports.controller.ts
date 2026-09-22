import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ReportsService } from './reports.service';
import { getPool } from '../../db/pool';

@Controller('api/v1/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('trial-balance')
  @RequirePermission('report.read')
  async trialBalance(@Req() req: any) {
    const rows = await this.reportsService.trialBalance(req.membership.organizationId);
    return { success: true, data: rows };
  }

  @Get('profit-and-loss')
  @RequirePermission('report.read')
  async profitAndLoss(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) {
      throw new BadRequestException('Query params "from" and "to" (ISO dates) are required');
    }
    const report = await this.reportsService.profitAndLoss(req.membership.organizationId, from, to);
    return { success: true, data: report };
  }

  @Get('balance-sheet')
  @RequirePermission('report.read')
  async balanceSheet(@Req() req: any, @Query('asOf') asOf?: string) {
    const asOfDate = asOf || new Date().toISOString().slice(0, 10);
    const report = await this.reportsService.balanceSheet(req.membership.organizationId, asOfDate);
    return { success: true, data: report };
  }

  @Get('gst-summary')
  @RequirePermission('report.read')
  async gstSummary(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) {
      throw new BadRequestException('Query params "from" and "to" (ISO dates) are required');
    }
    const pool = getPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(jl.credit), 0) AS gst_collected, COALESCE(SUM(jl.debit), 0) AS gst_credits
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE a.organization_id = $1 AND a.code = '2-2000'
         AND je.status = 'POSTED' AND je.entry_date >= $2 AND je.entry_date <= $3`,
      [req.membership.organizationId, from, to],
    );
    const gstCollected = parseFloat(result.rows[0].gst_collected);
    const gstCredits = parseFloat(result.rows[0].gst_credits);
    return {
      success: true,
      data: {
        fromDate: from,
        toDate: to,
        gstCollectedOnSales: gstCollected.toFixed(2),
        gstCreditsOnPurchases: gstCredits.toFixed(2),
        netGstPayable: (gstCollected - gstCredits).toFixed(2),
        disclaimer:
          'Simplified figure from a single GST Payable account, not verified against ATO BAS reporting requirements. See docs/COUNTRY_CONFIGURATION.md.',
      },
    };
  }
}
