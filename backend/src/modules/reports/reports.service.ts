import { Injectable } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class ReportsService {
  constructor(private ledgerService: LedgerService) {}

  async trialBalance(organizationId: string) {
    return this.ledgerService.getTrialBalance(organizationId);
  }

  async profitAndLoss(organizationId: string, fromDate: string, toDate: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.type, a.code, a.name,
              COALESCE(SUM(jl.debit), 0) AS debit,
              COALESCE(SUM(jl.credit), 0) AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE a.organization_id = $1
         AND je.status = 'POSTED'
         AND a.type IN ('REVENUE', 'COST_OF_GOODS_SOLD', 'EXPENSE')
         AND je.entry_date >= $2 AND je.entry_date <= $3
       GROUP BY a.id, a.type, a.code, a.name
       ORDER BY a.type, a.code`,
      [organizationId, fromDate, toDate],
    );

    const lines = result.rows.map((r) => {
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      const amount = r.type === 'REVENUE' ? credit - debit : debit - credit;
      return { code: r.code, name: r.name, type: r.type, amount: amount.toFixed(2) };
    });

    const totalRevenue = lines
      .filter((l) => l.type === 'REVENUE')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const totalCogs = lines
      .filter((l) => l.type === 'COST_OF_GOODS_SOLD')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const totalExpenses = lines
      .filter((l) => l.type === 'EXPENSE')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    return {
      fromDate,
      toDate,
      lines,
      totals: {
        revenue: totalRevenue.toFixed(2),
        costOfGoodsSold: totalCogs.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        expenses: totalExpenses.toFixed(2),
        netProfit: netProfit.toFixed(2),
      },
    };
  }

  async balanceSheet(organizationId: string, asOfDate: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.type, a.code, a.name,
              COALESCE(SUM(jl.debit), 0) AS debit,
              COALESCE(SUM(jl.credit), 0) AS credit
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE a.organization_id = $1
         AND je.status = 'POSTED'
         AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
         AND je.entry_date <= $2
       GROUP BY a.id, a.type, a.code, a.name
       ORDER BY a.type, a.code`,
      [organizationId, asOfDate],
    );

    const lines = result.rows.map((r) => {
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      const amount = r.type === 'ASSET' ? debit - credit : credit - debit;
      return { code: r.code, name: r.name, type: r.type, amount: amount.toFixed(2) };
    });

    const totalAssets = lines
      .filter((l) => l.type === 'ASSET')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const totalLiabilities = lines
      .filter((l) => l.type === 'LIABILITY')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const explicitEquity = lines
      .filter((l) => l.type === 'EQUITY')
      .reduce((sum, l) => sum + parseFloat(l.amount), 0);
    const derivedEquityPlug = totalAssets - totalLiabilities - explicitEquity;

    return {
      asOfDate,
      lines,
      totals: {
        assets: totalAssets.toFixed(2),
        liabilities: totalLiabilities.toFixed(2),
        explicitEquity: explicitEquity.toFixed(2),
        derivedEquityPlug: derivedEquityPlug.toFixed(2),
        note:
          'derivedEquityPlug is Assets minus Liabilities minus explicit Equity accounts, a balancing figure standing in for retained earnings, not a real equity-ledger balance. No period-end closing process exists yet.',
      },
    };
  }
}
