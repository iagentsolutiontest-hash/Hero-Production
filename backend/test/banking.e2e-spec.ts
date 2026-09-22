import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';
import { getPool } from '../src/db/pool';

describe('Banking & reconciliation', () => {
  let app: INestApplication;
  let token: string;
  let organizationId: string;
  let customerId: string;
  let supplierId: string;
  let bankAccountId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerAndLogin(app, 'banking-flow@example.com');
    token = user.accessToken;
    organizationId = await createOrgForUser(app, token, 'Banking Flow Org', 'AU');

    const customerRes = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ type: 'CUSTOMER', name: 'Bright Ideas Co' })
      .expect(201);
    customerId = customerRes.body.data.id;

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ type: 'SUPPLIER', name: 'Officeworks' })
      .expect(201);
    supplierId = supplierRes.body.data.id;

    const bankRes = await request(app.getHttpServer())
      .post('/api/v1/bank-accounts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ name: 'Everyday Business Account' })
      .expect(201);
    bankAccountId = bankRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creating a bank account provisions a dedicated GL asset account', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/bank-accounts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    const acc = res.body.data.find((a: any) => a.id === bankAccountId);
    expect(acc.gl_account_code).toMatch(/^1-10\d{2}$/);
  });

  it('imports transactions as UNMATCHED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        transactions: [
          { date: '2026-08-05', description: 'Payment from Bright Ideas', amount: '1100.00' },
          { date: '2026-08-06', description: 'Payment to Officeworks', amount: '-550.00' },
          { date: '2026-08-07', description: 'Bank fee', amount: '-12.00' },
        ],
      })
      .expect(201);
    expect(res.body.data.imported).toBe(3);
  });

  it('matches a deposit to a SENT invoice, posts a balanced entry, and marks the invoice PAID', async () => {
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: customerId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'Consulting', quantity: '1', unitPrice: '1000.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    const invoiceId = invRes.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const importRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-10', description: 'Deposit', amount: '1100.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    const matchRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);
    expect(matchRes.body.data.status).toBe('MATCHED');

    const invoiceCheck = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(invoiceCheck.body.data.status).toBe('PAID');

    const pool = getPool();
    const lines = await pool.query(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id WHERE jl.journal_entry_id = $1`,
      [matchRes.body.data.journalEntryId],
    );
    const totalDebit = lines.rows.reduce((s, r) => s + parseFloat(r.debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + parseFloat(r.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 6);
    expect(totalDebit).toBeCloseTo(1100, 6);

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(400);
  });

  it('rejects matching when the amount does not match the invoice total', async () => {
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: customerId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'x', quantity: '1', unitPrice: '200.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    const invoiceId = invRes.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const importRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-10', description: 'Wrong amount deposit', amount: '999.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(400);
  });

  it('matches a withdrawal to an APPROVED bill and marks it PAID', async () => {
    const billRes = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: supplierId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'Supplies', quantity: '1', unitPrice: '500.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    const billId = billRes.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${billId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${billId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const importRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-11', description: 'Payment out', amount: '-550.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    const matchRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-bill`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ billId })
      .expect(201);
    expect(matchRes.body.data.status).toBe('MATCHED');

    const billCheck = await request(app.getHttpServer())
      .get(`/api/v1/bills/${billId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(billCheck.body.data.status).toBe('PAID');
  });

  it('categorizes an uncategorized withdrawal directly to an expense account', async () => {
    const importRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-12', description: 'Bank fee', amount: '-15.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    const catRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/categorize`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ accountCode: '6-1000' })
      .expect(201);
    expect(catRes.body.data.status).toBe('MATCHED');

    const pool = getPool();
    const lines = await pool.query(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id WHERE jl.journal_entry_id = $1`,
      [catRes.body.data.journalEntryId],
    );
    const byCode = Object.fromEntries(lines.rows.map((r) => [r.code, { debit: parseFloat(r.debit), credit: parseFloat(r.credit) }]));
    expect(byCode['6-1000'].debit).toBeCloseTo(15, 6);
  });

  it('reconcile requires MATCHED status first, and unmatch reverses the entry and reverts invoice status', async () => {
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: customerId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'x', quantity: '1', unitPrice: '300.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    const invoiceId = invRes.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const importRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-13', description: 'Deposit', amount: '330.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/unmatch`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const invoiceCheck = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(invoiceCheck.body.data.status).toBe('SENT');

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);

    const reconcileRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);
    expect(reconcileRes.body.data.status).toBe('RECONCILED');

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/unmatch`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(400);
  });
});
