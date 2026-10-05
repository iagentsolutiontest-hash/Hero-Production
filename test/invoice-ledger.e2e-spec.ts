import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';
import { getPool } from '../src/db/pool';

describe('Invoice -> Ledger integration', () => {
  let app: INestApplication;
  let token: string;
  let organizationId: string;
  let contactId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerAndLogin(app, 'invoice-flow@example.com');
    token = user.accessToken;
    organizationId = await createOrgForUser(app, token, 'Invoice Flow Org', 'AU');

    const contactRes = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ type: 'CUSTOMER', name: 'Bright Ideas Co' })
      .expect(201);
    contactId = contactRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a DRAFT invoice with correct GST totals', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        currency: 'AUD',
        lines: [
          { description: 'Consulting services', quantity: '10', unitPrice: '100.00', taxRateCode: 'GST_STANDARD' },
        ],
      })
      .expect(201);

    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.subtotal).toBe('1000.00000000');
    expect(res.body.data.tax_total).toBe('100.00000000');
    expect(res.body.data.total).toBe('1100.00000000');
  });

  it('sending the invoice posts a balanced journal entry matching the invoice total exactly', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        currency: 'AUD',
        lines: [
          { description: 'Design work', quantity: '5', unitPrice: '200.00', taxRateCode: 'GST_STANDARD' },
        ],
      })
      .expect(201);

    const invoiceId = createRes.body.data.id;

    const sendRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    expect(sendRes.body.data.status).toBe('SENT');
    const journalEntryId = sendRes.body.data.journalEntryId;

    const pool = getPool();
    const lines = await pool.query(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = $1 ORDER BY a.code`,
      [journalEntryId],
    );

    const byCode = Object.fromEntries(
      lines.rows.map((r) => [r.code, { debit: parseFloat(r.debit), credit: parseFloat(r.credit) }]),
    );

    // 5 * 200 = 1000 net, 10% GST = 100, total 1100
    expect(byCode['1-1200'].debit).toBeCloseTo(1100, 6); // Accounts Receivable
    expect(byCode['4-1000'].credit).toBeCloseTo(1000, 6); // Sales Revenue
    expect(byCode['2-2000'].credit).toBeCloseTo(100, 6); // GST Payable

    const totalDebit = lines.rows.reduce((s, r) => s + parseFloat(r.debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + parseFloat(r.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 6);

    // Sending an already-sent invoice must be rejected, not double-posted.
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(400);
  });
});
