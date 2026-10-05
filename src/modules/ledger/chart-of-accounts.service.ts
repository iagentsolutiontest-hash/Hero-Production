import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';

const STANDARD_ACCOUNTS: { code: string; name: string; type: string }[] = [
  // Assets
  { code: '1-1000', name: 'Business Bank Account', type: 'ASSET' },
  { code: '1-1100', name: 'Cash on Hand', type: 'ASSET' },
  { code: '1-1200', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '1-1300', name: 'Inventory', type: 'ASSET' },
  { code: '1-1400', name: 'Prepaid Expenses', type: 'ASSET' },
  { code: '1-1500', name: 'Fixed Assets', type: 'ASSET' },
  // Liabilities
  { code: '2-1000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '2-2000', name: 'GST Payable', type: 'LIABILITY' },
  { code: '2-2100', name: 'GST Receivable', type: 'LIABILITY' },
  { code: '2-3000', name: 'Loans Payable', type: 'LIABILITY' },
  { code: '2-4000', name: 'Accrued Expenses', type: 'LIABILITY' },
  // Equity
  { code: '3-1000', name: "Owner's Capital", type: 'EQUITY' },
  { code: '3-2000', name: 'Retained Earnings', type: 'EQUITY' },
  { code: '3-3000', name: 'Drawings', type: 'EQUITY' },
  // Revenue
  { code: '4-1000', name: 'Sales Revenue', type: 'REVENUE' },
  { code: '4-2000', name: 'Service Revenue', type: 'REVENUE' },
  { code: '4-3000', name: 'Other Income', type: 'REVENUE' },
  // COGS
  { code: '5-1000', name: 'Cost of Goods Sold', type: 'COST_OF_GOODS_SOLD' },
  // Expenses
  { code: '6-1000', name: 'General Expenses', type: 'EXPENSE' },
  { code: '6-1100', name: 'Salaries & Wages', type: 'EXPENSE' },
  { code: '6-1200', name: 'Rent', type: 'EXPENSE' },
  { code: '6-1300', name: 'Utilities', type: 'EXPENSE' },
  { code: '6-1400', name: 'Advertising & Marketing', type: 'EXPENSE' },
  { code: '6-1500', name: 'Software & Subscriptions', type: 'EXPENSE' },
  { code: '6-1600', name: 'Office Expenses', type: 'EXPENSE' },
  { code: '6-1700', name: 'Travel', type: 'EXPENSE' },
  { code: '6-1800', name: 'Bank Charges', type: 'EXPENSE' },
];

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_system: boolean;
  is_archived: boolean;
  created_at: string;
}

@Injectable()
export class ChartOfAccountsService {
  async bootstrapStandardAccounts(organizationId: string): Promise<void> {
    const pool = getPool();
    for (const acc of STANDARD_ACCOUNTS) {
      await pool.query(
        `INSERT INTO accounts (organization_id, code, name, type, is_system)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [organizationId, acc.code, acc.name, acc.type],
      );
    }
  }

  async listAccounts(organizationId: string, includeArchived = false): Promise<AccountRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, code, name, type, parent_id, is_system, is_archived, created_at
       FROM accounts
       WHERE organization_id = $1
         ${includeArchived ? '' : 'AND is_archived = FALSE'}
       ORDER BY code ASC`,
      [organizationId],
    );
    return result.rows;
  }

  async createAccount(
    organizationId: string,
    input: { code: string; name: string; type: string; parentId?: string | null },
  ): Promise<AccountRow> {
    const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COST_OF_GOODS_SOLD', 'EXPENSE'];
    if (!allowed.includes(input.type)) {
      throw new BadRequestException(`Invalid account type. Allowed: ${allowed.join(', ')}`);
    }
    if (!input.code?.trim() || !input.name?.trim()) {
      throw new BadRequestException('Account code and name are required');
    }

    const pool = getPool();
    try {
      const result = await pool.query(
        `INSERT INTO accounts (organization_id, code, name, type, parent_id, is_system)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING id, code, name, type, parent_id, is_system, is_archived, created_at`,
        [organizationId, input.code.trim(), input.name.trim(), input.type, input.parentId ?? null],
      );
      return result.rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new BadRequestException(`Account code ${input.code} already exists in this organization`);
      }
      throw err;
    }
  }

  async getAccountByCode(organizationId: string, code: string): Promise<AccountRow | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, code, name, type, parent_id, is_system, is_archived, created_at
       FROM accounts WHERE organization_id = $1 AND code = $2`,
      [organizationId, code],
    );
    return result.rows[0] ?? null;
  }

  async archiveAccount(organizationId: string, accountId: string): Promise<void> {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE accounts SET is_archived = TRUE
       WHERE id = $1 AND organization_id = $2 AND is_system = FALSE
       RETURNING id`,
      [accountId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Account not found or is a system account that cannot be archived');
    }
  }
}
