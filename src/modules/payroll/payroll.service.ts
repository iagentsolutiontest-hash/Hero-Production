import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { LedgerService } from '../ledger/ledger.service';

/**
 * Payroll scaffold — stores employees and draft payslips, and can post a
 * simple journal (Dr Wages Expense, Cr Bank / Cr PAYG withholding).
 *
 * Tax withholding is a PLACEHOLDER (flat 20% of gross). This is NOT a
 * statutory payroll engine and must not be used for real payroll without
 * verified jurisdiction-specific rules (ATO/IRS/etc.).
 */
@Injectable()
export class PayrollService {
  constructor(private ledgerService: LedgerService) {}

  async listEmployees(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, full_name, email, start_date, annual_salary, pay_frequency, is_active
       FROM employees WHERE organization_id = $1 ORDER BY full_name`,
      [organizationId],
    );
    return result.rows;
  }

  async createEmployee(
    organizationId: string,
    input: { fullName: string; email?: string; annualSalary?: string; payFrequency?: string },
  ) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO employees (organization_id, full_name, email, annual_salary, pay_frequency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, annual_salary, pay_frequency, is_active`,
      [
        organizationId,
        input.fullName,
        input.email ?? null,
        input.annualSalary ?? null,
        input.payFrequency ?? 'MONTHLY',
      ],
    );
    return result.rows[0];
  }

  async createDraftPayslip(
    organizationId: string,
    input: { employeeId: string; periodStart: string; periodEnd: string; grossPay: string },
  ) {
    const gross = parseFloat(input.grossPay);
    if (!(gross > 0)) throw new BadRequestException('grossPay must be positive');
    // PLACEHOLDER withholding — not statutory
    const tax = Math.round(gross * 0.2 * 100) / 100;
    const net = Math.round((gross - tax) * 100) / 100;

    const pool = getPool();
    const emp = await pool.query(
      `SELECT id FROM employees WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
      [input.employeeId, organizationId],
    );
    if (emp.rows.length === 0) throw new NotFoundException('Employee not found');

    const result = await pool.query(
      `INSERT INTO payslips
         (organization_id, employee_id, period_start, period_end, gross_pay, tax_withheld, net_pay, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
       RETURNING *`,
      [organizationId, input.employeeId, input.periodStart, input.periodEnd, gross.toFixed(2), tax.toFixed(2), net.toFixed(2)],
    );
    return {
      ...result.rows[0],
      disclaimer:
        'Tax withheld is a flat 20% placeholder — not ATO/IRS compliant. Do not use for real payroll.',
    };
  }

  async postPayslip(organizationId: string, payslipId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM payslips WHERE id = $1 AND organization_id = $2`,
      [payslipId, organizationId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Payslip not found');
    const slip = result.rows[0];
    if (slip.status !== 'DRAFT') throw new BadRequestException('Payslip already posted');

    // Ensure wage expense account exists (6-1100 was seeded in expanded CoA)
    const journal = await this.ledgerService.postEntry({
      organizationId,
      entryDate: slip.period_end,
      description: `Payslip ${payslipId}`,
      sourceType: 'PAYROLL',
      sourceId: payslipId,
      lines: [
        { accountCode: '6-1100', debit: slip.gross_pay, memo: 'Salaries & Wages' },
        { accountCode: '1-1000', credit: slip.net_pay, memo: 'Net pay to bank' },
        ...(parseFloat(slip.tax_withheld) > 0
          ? [{ accountCode: '2-3000', credit: slip.tax_withheld, memo: 'PAYG/withholding (placeholder)' }]
          : []),
      ],
    });

    await pool.query(
      `UPDATE payslips SET status = 'POSTED', journal_entry_id = $1 WHERE id = $2`,
      [journal.id, payslipId],
    );
    return { payslipId, status: 'POSTED', journalEntryId: journal.id };
  }

  async listPayslips(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT p.*, e.full_name AS employee_name
       FROM payslips p JOIN employees e ON e.id = p.employee_id
       WHERE p.organization_id = $1 ORDER BY p.period_end DESC`,
      [organizationId],
    );
    return result.rows;
  }
}
