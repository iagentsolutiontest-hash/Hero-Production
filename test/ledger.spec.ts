import { LedgerService } from '../src/modules/ledger/ledger.service';
import { ChartOfAccountsService } from '../src/modules/ledger/chart-of-accounts.service';
import { getPool } from '../src/db/pool';
import { randomUUID } from 'crypto';

describe('LedgerService — double-entry invariant', () => {
  const ledgerService = new LedgerService();
  const chartOfAccountsService = new ChartOfAccountsService();
  let organizationId: string;

  beforeAll(async () => {
    const pool = getPool();
    const orgResult = await pool.query(
      `INSERT INTO organizations (name, country_code) VALUES ($1, 'AU') RETURNING id`,
      [`Ledger Test Org ${randomUUID()}`],
    );
    organizationId = orgResult.rows[0].id;
    await chartOfAccountsService.bootstrapStandardAccounts(organizationId);
  });

  it('posts a balanced entry successfully', async () => {
    const result = await ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: 'Test balanced entry',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1-1000', debit: '100.00' },
        { accountCode: '4-1000', credit: '100.00' },
      ],
    });
    expect(result.id).toBeDefined();
  });

  it('rejects an unbalanced entry and writes nothing to the DB', async () => {
    await expect(
      ledgerService.postEntry({
        organizationId,
        entryDate: new Date(),
        description: 'Unbalanced entry',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '1-1000', debit: '100.00' },
          { accountCode: '4-1000', credit: '99.99' },
        ],
      }),
    ).rejects.toThrow(/does not balance/);

    const pool = getPool();
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM journal_entries WHERE organization_id = $1 AND description = 'Unbalanced entry'`,
      [organizationId],
    );
    expect(count.rows[0].n).toBe(0); // the failed transaction must roll back completely
  });

  it('rejects a line with both debit and credit set', async () => {
    await expect(
      ledgerService.postEntry({
        organizationId,
        entryDate: new Date(),
        description: 'Ambiguous line',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '1-1000', debit: '50.00', credit: '50.00' },
          { accountCode: '4-1000', credit: '50.00' },
        ],
      }),
    ).rejects.toThrow(/cannot have both/);
  });

  it('rejects posting against an unknown account code', async () => {
    await expect(
      ledgerService.postEntry({
        organizationId,
        entryDate: new Date(),
        description: 'Bad account',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '9-9999', debit: '10.00' },
          { accountCode: '4-1000', credit: '10.00' },
        ],
      }),
    ).rejects.toThrow(/not found/);
  });

  it('reverses a posted entry with a nets-to-zero reversal, and marks the original REVERSED', async () => {
    const original = await ledgerService.postEntry({
      organizationId,
      entryDate: new Date(),
      description: 'Entry to be reversed',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: '1-1000', debit: '250.00' },
        { accountCode: '4-1000', credit: '250.00' },
      ],
    });

    const reversal = await ledgerService.reverseEntry(
      organizationId,
      original.id,
      'Test reversal',
    );
    expect(reversal.id).not.toBe(original.id);

    const pool = getPool();
    const statusResult = await pool.query(
      `SELECT status FROM journal_entries WHERE id = $1`,
      [original.id],
    );
    expect(statusResult.rows[0].status).toBe('REVERSED');

    // Net effect on the bank account across original + reversal must be zero.
    const netResult = await pool.query(
      `SELECT COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS net
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id IN ($1, $2) AND a.code = '1-1000'`,
      [original.id, reversal.id],
    );
    expect(parseFloat(netResult.rows[0].net)).toBe(0);

    // Reversing an already-reversed entry must be rejected.
    await expect(
      ledgerService.reverseEntry(organizationId, original.id, 'Double reversal'),
    ).rejects.toThrow(/already been reversed/);
  });

  it('rejects posting against an archived account', async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE accounts SET is_archived = TRUE WHERE organization_id = $1 AND code = '6-1000'`,
      [organizationId],
    );
    await expect(
      ledgerService.postEntry({
        organizationId,
        entryDate: new Date(),
        description: 'Posting to archived account',
        sourceType: 'MANUAL',
        lines: [
          { accountCode: '6-1000', debit: '10.00' },
          { accountCode: '1-1000', credit: '10.00' },
        ],
      }),
    ).rejects.toThrow(/archived/);
  });

  it('trial balance always has total debits equal to total credits across the whole org', async () => {
    const rows = await ledgerService.getTrialBalance(organizationId);
    const totalDebit = rows.reduce((sum, r) => sum + parseFloat(r.debit), 0);
    const totalCredit = rows.reduce((sum, r) => sum + parseFloat(r.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 6);
  });
});
