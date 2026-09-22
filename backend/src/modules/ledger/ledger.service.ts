import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { PostJournalEntryInput } from '../../common/types';
import { toCents } from '../../common/money';

/**
 * LedgerService is the single write path for the general ledger.
 * Nothing else in the codebase should INSERT into journal_entries or
 * journal_lines directly — every accounting event (invoice sent, payment
 * received, bill recorded, ...) must go through postEntry().
 *
 * Invariant enforced here, not just assumed: for a given journal entry,
 * sum(debit) === sum(credit), computed in exact decimal arithmetic (never
 * JS floating point — comparisons use string/BigInt-safe decimal math via
 * a fixed-point cent representation).
 */
@Injectable()
export class LedgerService {
  private cents(value: string | undefined): bigint {
    return value ? toCents(value) : 0n;
  }

  async postEntry(input: PostJournalEntryInput): Promise<{ id: string }> {
    if (input.lines.length < 2) {
      throw new BadRequestException(
        'A journal entry needs at least two lines (one debit, one credit)',
      );
    }

    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const line of input.lines) {
      if (line.debit && line.credit) {
        throw new BadRequestException(
          'A journal line cannot have both a debit and a credit amount',
        );
      }
      totalDebit += this.cents(line.debit);
      totalCredit += this.cents(line.credit);
    }

    if (totalDebit !== totalCredit) {
      throw new BadRequestException(
        `Journal entry does not balance: debits=${totalDebit} cents, credits=${totalCredit} cents`,
      );
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entryResult = await client.query(
        `INSERT INTO journal_entries
           (organization_id, entry_date, description, source_type, source_id, status)
         VALUES ($1, $2, $3, $4, $5, 'POSTED')
         RETURNING id`,
        [
          input.organizationId,
          input.entryDate,
          input.description,
          input.sourceType,
          input.sourceId ?? null,
        ],
      );
      const journalEntryId = entryResult.rows[0].id;

      for (const line of input.lines) {
        const accountResult = await client.query(
          `SELECT id, is_archived FROM accounts WHERE organization_id = $1 AND code = $2`,
          [input.organizationId, line.accountCode],
        );
        if (accountResult.rows.length === 0) {
          throw new NotFoundException(
            `Account with code ${line.accountCode} not found for this organization`,
          );
        }
        if (accountResult.rows[0].is_archived) {
          throw new BadRequestException(
            `Account ${line.accountCode} is archived and cannot receive new postings`,
          );
        }

        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, memo)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            journalEntryId,
            accountResult.rows[0].id,
            line.debit ?? '0',
            line.credit ?? '0',
            line.memo ?? null,
          ],
        );
      }

      await client.query('COMMIT');
      return { id: journalEntryId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Reverses a posted entry by creating a new entry with debits/credits
   * swapped, and marks the original REVERSED. Historical entries are never
   * edited in place. */
  async reverseEntry(
    organizationId: string,
    journalEntryId: string,
    reason: string,
  ): Promise<{ id: string }> {
    const pool = getPool();
    const original = await pool.query(
      `SELECT je.id, je.status, jl.account_id, jl.debit, jl.credit, a.code AS account_code
       FROM journal_entries je
       JOIN journal_lines jl ON jl.journal_entry_id = je.id
       JOIN accounts a ON a.id = jl.account_id
       WHERE je.id = $1 AND je.organization_id = $2`,
      [journalEntryId, organizationId],
    );

    if (original.rows.length === 0) {
      throw new NotFoundException('Journal entry not found');
    }
    if (original.rows[0].status === 'REVERSED') {
      throw new BadRequestException('Journal entry has already been reversed');
    }

    const reversedLines = original.rows.map((row) => ({
      accountCode: row.account_code,
      debit: row.credit !== '0.00000000' ? row.credit : undefined,
      credit: row.debit !== '0.00000000' ? row.debit : undefined,
    }));

    // Note: postEntry manages its own DB transaction internally. The
    // reversal-entry insert and the original-entry status update below are
    // therefore two separate transactions, not one atomic unit — a crash
    // between them would leave a posted reversal but an un-flagged
    // original. Documented as a known Phase 1 limitation; closing it
    // properly means either refactoring postEntry to accept an existing
    // client, or wrapping both in a saga/outbox pattern. Tracked in
    // docs/TESTING.md under "known limitations".
    const result = await this.postEntry({
      organizationId,
      entryDate: new Date(),
      description: `Reversal: ${reason}`,
      sourceType: 'REVERSAL',
      sourceId: journalEntryId,
      lines: reversedLines,
    });
    await pool.query(
      `UPDATE journal_entries SET status = 'REVERSED' WHERE id = $1`,
      [journalEntryId],
    );
    return result;
  }

  async getTrialBalance(
    organizationId: string,
  ): Promise<{ accountCode: string; accountName: string; type: string; debit: string; credit: string }[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.code AS account_code, a.name AS account_name, a.type,
              COALESCE(SUM(jl.debit), 0) AS debit,
              COALESCE(SUM(jl.credit), 0) AS credit
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
       WHERE a.organization_id = $1
       GROUP BY a.id, a.code, a.name, a.type
       ORDER BY a.code`,
      [organizationId],
    );
    return result.rows;
  }


  async listEntries(
    organizationId: string,
    opts: { from?: string; to?: string; limit?: number } = {},
  ): Promise<
    {
      id: string;
      entry_date: string;
      description: string;
      source_type: string;
      status: string;
      created_at: string;
      total_debit: string;
    }[]
  > {
    const pool = getPool();
    const limit = Math.min(opts.limit ?? 50, 200);
    const params: unknown[] = [organizationId];
    let dateFilter = '';
    if (opts.from) {
      params.push(opts.from);
      dateFilter += ` AND je.entry_date >= $${params.length}`;
    }
    if (opts.to) {
      params.push(opts.to);
      dateFilter += ` AND je.entry_date <= $${params.length}`;
    }
    params.push(limit);
    const limitParamIndex = params.length;

    const result = await pool.query(
      `SELECT je.id, je.entry_date, je.description, je.source_type, je.status, je.created_at,
              COALESCE(SUM(jl.debit), 0)::text AS total_debit
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1 ${dateFilter}
       GROUP BY je.id
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT $${limitParamIndex}`,
      params,
    );
    return result.rows;
  }

  async getEntryWithLines(
    organizationId: string,
    journalEntryId: string,
  ): Promise<{
    id: string;
    entry_date: string;
    description: string;
    source_type: string;
    status: string;
    lines: { account_code: string; account_name: string; debit: string; credit: string; memo: string | null }[];
  }> {
    const pool = getPool();
    const entry = await pool.query(
      `SELECT id, entry_date, description, source_type, status
       FROM journal_entries
       WHERE id = $1 AND organization_id = $2`,
      [journalEntryId, organizationId],
    );
    if (entry.rows.length === 0) {
      throw new NotFoundException('Journal entry not found');
    }

    const lines = await pool.query(
      `SELECT a.code AS account_code, a.name AS account_name, jl.debit, jl.credit, jl.memo
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = $1
       ORDER BY jl.debit DESC, a.code`,
      [journalEntryId],
    );

    return {
      ...entry.rows[0],
      lines: lines.rows,
    };
  }
}