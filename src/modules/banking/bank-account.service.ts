import { Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';

@Injectable()
export class BankAccountService {
  /** Creating a bank account also creates a dedicated GL asset account for
   * it (code auto-incremented under the 1-10xx range), so multiple bank
   * accounts don't all collapse onto the single default '1-1000' account
   * bootstrapped by ChartOfAccountsService. */
  async create(organizationId: string, name: string, currency = 'AUD') {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingCodes = await client.query(
        `SELECT code FROM accounts WHERE organization_id = $1 AND code LIKE '1-10%' ORDER BY code DESC LIMIT 1`,
        [organizationId],
      );
      const lastCode = existingCodes.rows[0]?.code as string | undefined;
      const nextSuffix = lastCode ? parseInt(lastCode.split('-')[1], 10) + 1 : 1000;
      const newCode = `1-${nextSuffix}`;

      const accountResult = await client.query(
        `INSERT INTO accounts (organization_id, code, name, type, is_system)
         VALUES ($1, $2, $3, 'ASSET', TRUE) RETURNING id`,
        [organizationId, newCode, name],
      );
      const glAccountId = accountResult.rows[0].id;

      const bankAccountResult = await client.query(
        `INSERT INTO bank_accounts (organization_id, gl_account_id, name, currency)
         VALUES ($1, $2, $3, $4) RETURNING id, name, currency`,
        [organizationId, glAccountId, name, currency],
      );

      await client.query('COMMIT');
      return { ...bankAccountResult.rows[0], glAccountCode: newCode };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listForOrg(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ba.id, ba.name, ba.currency, a.code AS gl_account_code
       FROM bank_accounts ba JOIN accounts a ON a.id = ba.gl_account_id
       WHERE ba.organization_id = $1 AND ba.is_active = TRUE ORDER BY ba.created_at`,
      [organizationId],
    );
    return result.rows;
  }

  async getGlAccountCode(organizationId: string, bankAccountId: string): Promise<string> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.code FROM bank_accounts ba JOIN accounts a ON a.id = ba.gl_account_id
       WHERE ba.id = $1 AND ba.organization_id = $2`,
      [bankAccountId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Bank account not found');
    }
    return result.rows[0].code;
  }
}
