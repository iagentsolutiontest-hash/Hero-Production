import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';
import { getPool } from '../src/db/pool';

describe('Bills workflow', () => {
  let app: INestApplication;
  let token: string;
  let organizationId: string;
  let supplierId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerAndLogin(app, 'bills-flow@example.com');
    token = user.accessToken;
    organizationId = await createOrgForUser(app, token, 'Bills Flow Org', 'AU');

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ type: 'SUPPLIER', name: 'Officeworks' })
      .expect(201);
    supplierId = supplierRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createDraftBill(net: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: supplierId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        currency: 'AUD',
        lines: [{ description: 'Office supplies', quantity: '1', unitPrice: net, taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    return res.body.data;
  }

  it('creates a DRAFT bill with correct GST totals', async () => {
    const bill = await createDraftBill('500.00');
    expect(bill.status).toBe('DRAFT');
    expect(bill.subtotal).toBe('500.00000000');
    expect(bill.tax_total).toBe('50.00000000');
    expect(bill.total).toBe('550.00000000');
  });

  it('enforces valid state transitions: cannot approve a DRAFT bill directly', async () => {
    const bill = await createDraftBill('100.00');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(400);
    expect(res.body.error.message).toMatch(/Cannot move bill from DRAFT to APPROVED/);
  });

  it('enforces valid state transitions: cannot pay a bill that has not been approved', async () => {
    const bill = await createDraftBill('100.00');
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(400);
  });

  it('full workflow: draft -> submit -> approve -> pay posts correct, balanced ledger entries', async () => {
    const bill = await createDraftBill('1000.00'); // +10% GST = 1100 total

    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    expect(approveRes.body.data.status).toBe('APPROVED');

    const pool = getPool();
    const approveLines = await pool.query(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = $1`,
      [approveRes.body.data.journalEntryId],
    );
    const byCode = Object.fromEntries(
      approveLines.rows.map((r) => [r.code, { debit: parseFloat(r.debit), credit: parseFloat(r.credit) }]),
    );
    expect(byCode['6-1000'].debit).toBeCloseTo(1000, 6); // General Expenses
    expect(byCode['2-2000'].debit).toBeCloseTo(100, 6); // GST credit
    expect(byCode['2-1000'].credit).toBeCloseTo(1100, 6); // Accounts Payable

    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    expect(payRes.body.data.status).toBe('PAID');

    const payLines = await pool.query(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = $1`,
      [payRes.body.data.journalEntryId],
    );
    const payByCode = Object.fromEntries(
      payLines.rows.map((r) => [r.code, { debit: parseFloat(r.debit), credit: parseFloat(r.credit) }]),
    );
    expect(payByCode['2-1000'].debit).toBeCloseTo(1100, 6); // Accounts Payable cleared
    expect(payByCode['1-1000'].credit).toBeCloseTo(1100, 6); // Bank reduced

    // Paying an already-paid bill must be rejected, not double-posted.
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${bill.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(400);
  });

  it('rejects bill creation from a user without bill permissions', async () => {
    const readOnlyUser = await registerAndLogin(app, 'bills-readonly@example.com');
    const pool = getPool();
    const roleResult = await pool.query(
      `SELECT id FROM roles WHERE organization_id IS NULL AND name = 'ReadOnly'`,
    );
    await pool.query(
      `INSERT INTO memberships (user_id, organization_id, role_id) VALUES ($1, $2, $3)`,
      [readOnlyUser.userId, organizationId, roleResult.rows[0].id],
    );

    await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('Authorization', `Bearer ${readOnlyUser.accessToken}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: supplierId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'x', quantity: '1', unitPrice: '10.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(403);
  });
});
