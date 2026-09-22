import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { ContactRow } from '../../common/types';

@Injectable()
export class ContactService {
  async create(
    organizationId: string,
    input: { type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'; name: string; email?: string; currency?: string },
  ): Promise<ContactRow> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO contacts (organization_id, type, name, email, currency)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'AUD'))
       RETURNING id, organization_id, type, name, email, currency`,
      [organizationId, input.type, input.name, input.email ?? null, input.currency ?? null],
    );
    return result.rows[0];
  }

  /** Tenant-scoped read: organizationId is always part of the WHERE clause,
   * never trusted from anywhere except the resolved membership. Returns
   * 404 (not 403) for a contact belonging to a different org, so existence
   * isn't leaked across tenants. */
  async findByIdForOrg(organizationId: string, contactId: string): Promise<ContactRow> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, organization_id, type, name, email, currency FROM contacts
       WHERE id = $1 AND organization_id = $2`,
      [contactId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Contact not found');
    }
    return result.rows[0];
  }

  async listForOrg(organizationId: string): Promise<ContactRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, organization_id, type, name, email, currency FROM contacts
       WHERE organization_id = $1 ORDER BY name`,
      [organizationId],
    );
    return result.rows;
  }

  /** A running statement of everything owed to/by this contact: their
   * invoices (if a customer) and/or bills (if a supplier), each with its
   * balance, plus a total outstanding figure. Read-only — this doesn't
   * create or modify anything. */
  async getStatement(organizationId: string, contactId: string) {
    const contact = await this.findByIdForOrg(organizationId, contactId);
    const pool = getPool();

    const invoices =
      contact.type === 'CUSTOMER' || contact.type === 'BOTH'
        ? (
            await pool.query(
              `SELECT id, invoice_number, issue_date, due_date, status, total,
                      COALESCE((SELECT SUM(amount) FROM payments WHERE payments.invoice_id = invoices.id), 0) AS paid
               FROM invoices WHERE organization_id = $1 AND contact_id = $2 ORDER BY issue_date`,
              [organizationId, contactId],
            )
          ).rows.map((r) => ({
            ...r,
            balance: (parseFloat(r.total) - parseFloat(r.paid)).toFixed(2),
          }))
        : [];

    const bills =
      contact.type === 'SUPPLIER' || contact.type === 'BOTH'
        ? (
            await pool.query(
              `SELECT id, bill_number, issue_date, due_date, status, total,
                      COALESCE((SELECT SUM(amount) FROM payments WHERE payments.bill_id = bills.id), 0) AS paid
               FROM bills WHERE organization_id = $1 AND contact_id = $2 ORDER BY issue_date`,
              [organizationId, contactId],
            )
          ).rows.map((r) => ({
            ...r,
            balance: (parseFloat(r.total) - parseFloat(r.paid)).toFixed(2),
          }))
        : [];

    const totalReceivable = invoices
      .filter((i) => i.status !== 'VOID')
      .reduce((sum, i) => sum + parseFloat(i.balance), 0);
    const totalPayable = bills.reduce((sum, b) => sum + parseFloat(b.balance), 0);

    return {
      contact,
      invoices,
      bills,
      totals: { totalReceivable: totalReceivable.toFixed(2), totalPayable: totalPayable.toFixed(2) },
    };
  }

  async deleteOne(organizationId: string, contactId: string) {
    await this.findByIdForOrg(organizationId, contactId);
    const pool = getPool();
    const used = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM invoices WHERE contact_id = $1 AND organization_id = $2) +
         (SELECT COUNT(*) FROM bills WHERE contact_id = $1 AND organization_id = $2) AS n`,
      [contactId, organizationId],
    );
    if (Number(used.rows[0].n) > 0) {
      throw new BadRequestException(
        'This contact has invoices or bills. Remove those documents first (Xero keeps history the same way).',
      );
    }
    await pool.query(`DELETE FROM contacts WHERE id = $1 AND organization_id = $2`, [
      contactId,
      organizationId,
    ]);
    return { contactId, deleted: true };
  }

  async bulkDelete(organizationId: string, ids: string[]) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteOne(organizationId, id);
        deleted.push(id);
      } catch (err: any) {
        skipped.push({ id, reason: err?.message || 'Could not delete' });
      }
    }
    return { deleted, skipped };
  }
}
