import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';

describe('Partial payments & contact statements', () => {
  let app: INestApplication;
  let token: string;
  let organizationId: string;
  let customerId: string;
  let supplierId: string;
  let bankAccountId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerAndLogin(app, 'partial-payments@example.com');
    token = user.accessToken;
    organizationId = await createOrgForUser(app, token, 'Partial Payments Org', 'AU');

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
      .send({ name: 'Everyday Account' })
      .expect(201);
    bankAccountId = bankRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a partial deposit leaves the invoice PARTIALLY_PAID with the correct remaining balance', async () => {
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

    const import1 = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-05', description: 'First installment', amount: '500.00' }] })
      .expect(201);
    const txn1 = import1.body.data.ids[0];

    const match1 = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txn1}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);
    expect(match1.body.data.invoiceStatus).toBe('PARTIALLY_PAID');

    const check1 = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(check1.body.data.status).toBe('PARTIALLY_PAID');
    expect(check1.body.data.balance.paid).toBe('500.00');
    expect(check1.body.data.balance.remaining).toBe('600.00');

    const import2 = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-12', description: 'Second installment', amount: '600.00' }] })
      .expect(201);
    const txn2 = import2.body.data.ids[0];

    const match2 = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txn2}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);
    expect(match2.body.data.invoiceStatus).toBe('PAID');

    const check2 = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(check2.body.data.status).toBe('PAID');
    expect(check2.body.data.balance.remaining).toBe('0.00');
  });

  it('rejects a payment that would exceed the remaining balance (overpayment)', async () => {
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: customerId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'x', quantity: '1', unitPrice: '100.00', taxRateCode: 'GST_STANDARD' }],
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
      .send({ transactions: [{ date: '2026-08-05', description: 'Too much', amount: '200.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    const res = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(400);
    expect(res.body.error.message).toMatch(/exceeds the invoice's remaining balance/);
  });

  it('unmatching one of two partial payments leaves the other intact and status correctly PARTIALLY_PAID', async () => {
    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: customerId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'x', quantity: '1', unitPrice: '1000.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    const invoiceId = invRes.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const import1 = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-05', description: 'Part A', amount: '400.00' }] })
      .expect(201);
    const txn1 = import1.body.data.ids[0];
    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txn1}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);

    const import2 = await request(app.getHttpServer())
      .post(`/api/v1/bank-accounts/${bankAccountId}/transactions/import`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ transactions: [{ date: '2026-08-06', description: 'Part B', amount: '300.00' }] })
      .expect(201);
    const txn2 = import2.body.data.ids[0];
    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txn2}/match-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ invoiceId })
      .expect(201);

    const midCheck = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(midCheck.body.data.balance.paid).toBe('700.00');

    await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txn2}/unmatch`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const afterUnmatch = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(afterUnmatch.body.data.status).toBe('PARTIALLY_PAID');
    expect(afterUnmatch.body.data.balance.paid).toBe('400.00');
    expect(afterUnmatch.body.data.balance.remaining).toBe('700.00');
  });

  it('partial payment also works for bills (purchase side)', async () => {
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
      .send({ transactions: [{ date: '2026-08-05', description: 'Partial supplier payment', amount: '-250.00' }] })
      .expect(201);
    const txnId = importRes.body.data.ids[0];

    const matchRes = await request(app.getHttpServer())
      .post(`/api/v1/bank-transactions/${txnId}/match-bill`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({ billId })
      .expect(201);
    expect(matchRes.body.data.billStatus).toBe('PARTIALLY_PAID');

    const billCheck = await request(app.getHttpServer())
      .get(`/api/v1/bills/${billId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(billCheck.body.data.balance.remaining).toBe('300.00');
  });

  it('contact statement shows correct outstanding balance for a customer', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${customerId}/statement`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);

    expect(res.body.data.contact.id).toBe(customerId);
    expect(Array.isArray(res.body.data.invoices)).toBe(true);
    expect(res.body.data.bills).toEqual([]);
    const sumBalances = res.body.data.invoices
      .filter((i: any) => i.status !== 'VOID')
      .reduce((s: number, i: any) => s + parseFloat(i.balance), 0);
    expect(parseFloat(res.body.data.totals.totalReceivable)).toBeCloseTo(sumBalances, 6);
  });

  it('contact statement shows correct outstanding balance for a supplier', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${supplierId}/statement`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);

    expect(res.body.data.invoices).toEqual([]);
    expect(res.body.data.bills.length).toBeGreaterThan(0);
    expect(parseFloat(res.body.data.totals.totalPayable)).toBeCloseTo(300, 6);
  });

  it('a statement for a contact in a different org is rejected (tenant isolation still holds)', async () => {
    const outsider = await registerAndLogin(app, 'statement-outsider@example.com');
    const outsiderOrgId = await createOrgForUser(app, outsider.accessToken, 'Outsider Org', 'AU');
    await request(app.getHttpServer())
      .get(`/api/v1/contacts/${customerId}/statement`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .set('x-organization-id', outsiderOrgId)
      .expect(404);
  });
});
