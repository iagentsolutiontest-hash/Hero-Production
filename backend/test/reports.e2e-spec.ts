import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';

describe('Reports', () => {
  let app: INestApplication;
  let token: string;
  let organizationId: string;
  let customerId: string;
  let supplierId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerAndLogin(app, 'reports-flow@example.com');
    token = user.accessToken;
    organizationId = await createOrgForUser(app, token, 'Reports Flow Org', 'AU');

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

    const invRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: customerId,
        issueDate: '2026-08-01',
        dueDate: '2026-08-15',
        lines: [{ description: 'Consulting', quantity: '1', unitPrice: '2000.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invRes.body.data.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);

    const billRes = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .send({
        contactId: supplierId,
        issueDate: '2026-08-02',
        dueDate: '2026-08-16',
        lines: [{ description: 'Supplies', quantity: '1', unitPrice: '800.00', taxRateCode: 'GST_STANDARD' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${billRes.body.data.id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/bills/${billRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('trial balance always balances (debits = credits)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    const totalDebit = res.body.data.reduce((s: number, r: any) => s + parseFloat(r.debit), 0);
    const totalCredit = res.body.data.reduce((s: number, r: any) => s + parseFloat(r.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 6);
  });

  it('profit and loss shows correct revenue, expenses, and net profit derived from the ledger', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/profit-and-loss?from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);

    expect(parseFloat(res.body.data.totals.revenue)).toBeCloseTo(2000, 6);
    expect(parseFloat(res.body.data.totals.expenses)).toBeCloseTo(800, 6);
    expect(parseFloat(res.body.data.totals.netProfit)).toBeCloseTo(1200, 6);
  });

  it('profit and loss respects the date range and excludes transactions outside it', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/profit-and-loss?from=2025-01-01&to=2025-12-31')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(parseFloat(res.body.data.totals.revenue)).toBe(0);
    expect(parseFloat(res.body.data.totals.expenses)).toBe(0);
  });

  it('balance sheet balances: Assets = Liabilities + explicit equity + derived equity plug', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/balance-sheet?asOf=2026-12-31')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);

    const { assets, liabilities, explicitEquity, derivedEquityPlug } = res.body.data.totals;
    const rightHandSide = parseFloat(liabilities) + parseFloat(explicitEquity) + parseFloat(derivedEquityPlug);
    expect(parseFloat(assets)).toBeCloseTo(rightHandSide, 6);

    // Assets = unpaid Accounts Receivable = invoice total $2200 (incl GST).
    expect(parseFloat(assets)).toBeCloseTo(2200, 6);
    // Liabilities = Accounts Payable $880 (incl GST) + net GST Payable
    // ($200 collected - $80 credited = $120) = $1000.
    expect(parseFloat(liabilities)).toBeCloseTo(1000, 6);
    // The derived equity plug should equal net profit ($1200) in this
    // simple case with no other equity movements.
    expect(parseFloat(derivedEquityPlug)).toBeCloseTo(1200, 6);
  });

  it('gst summary nets collected GST against input credits', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/gst-summary?from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', organizationId)
      .expect(200);
    expect(parseFloat(res.body.data.gstCollectedOnSales)).toBeCloseTo(200, 6);
    expect(parseFloat(res.body.data.gstCreditsOnPurchases)).toBeCloseTo(80, 6);
    expect(parseFloat(res.body.data.netGstPayable)).toBeCloseTo(120, 6);
  });

  it('a user with no membership in the org is rejected from reports', async () => {
    const outsider = await registerAndLogin(app, 'reports-noaccess@example.com');
    await request(app.getHttpServer())
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .set('x-organization-id', organizationId)
      .expect(403);
  });
});
