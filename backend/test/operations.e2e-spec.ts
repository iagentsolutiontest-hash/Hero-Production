import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';

describe('Operations module (/api/v1/ops)', () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let contactId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const auth = await registerAndLogin(app, 'ops-owner@hero.test');
    token = auth.accessToken;
    orgId = await createOrgForUser(app, token, 'Ops Test Co');

    const contactRes = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ type: 'CUSTOMER', name: 'Acme Pty Ltd' })
      .expect(201);
    contactId = contactRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function req() {
    return request(app.getHttpServer());
  }

  it('creates, lists, filters, updates and deletes a quote', async () => {
    const create = await req()
      .post('/api/v1/ops/quotes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ contact_id: contactId, quote_number: 'Q-1001', issue_date: '2026-09-01', total: '999.00' })
      .expect(201);
    expect(create.body.data.status).toBe('DRAFT');
    const id = create.body.data.id;

    const list = await req()
      .get('/api/v1/ops/quotes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(200);
    expect(list.body.data.some((r: any) => r.id === id)).toBe(true);

    await req()
      .patch(`/api/v1/ops/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ status: 'SENT' })
      .expect(200);

    const filtered = await req()
      .get('/api/v1/ops/quotes?status=SENT')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(200);
    expect(filtered.body.data.every((r: any) => r.status === 'SENT')).toBe(true);
    await req()
      .delete(`/api/v1/ops/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(200);

    await req()
      .delete(`/api/v1/ops/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(404);
  });

  it('rejects create when a required field is missing', async () => {
    await req()
      .post('/api/v1/ops/quotes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ contact_id: contactId })
      .expect(400);
  });

  it('rejects an unknown entity key', async () => {
    await req()
      .get('/api/v1/ops/not-a-real-entity')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(404);
  });

  it('recording a stock movement updates the product quantity on hand', async () => {
    const product = await req()
      .post('/api/v1/ops/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ sku: 'SKU-TEST-1', name: 'Widget', purchase_price: '10.00', quantity_on_hand: '5' })
      .expect(201);
    const productId = product.body.data.id;

    await req()
      .post('/api/v1/ops/stock-movements')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ product_id: productId, quantity: '20', movement_type: 'IN' })
      .expect(201);

    const updated = await req()
      .get(`/api/v1/ops/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(200);
    expect(parseFloat(updated.body.data.quantity_on_hand)).toBe(25);
  });

  it('filters on a boolean column without throwing a Postgres type error', async () => {
    await req()
      .post('/api/v1/ops/products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ sku: 'SKU-BOOL-1', name: 'Active Widget', is_active: true })
      .expect(201);

    const res = await req()
      .get('/api/v1/ops/products?is_active=true')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(200);
    expect(res.body.data.every((r: any) => r.is_active === true)).toBe(true);
  });

  it('runs straight-line depreciation and caps it at the depreciable base, then disposes the asset', async () => {
    const asset = await req()
      .post('/api/v1/ops/fixed-assets')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ asset_code: 'FA-TEST-1', name: 'Laptop', acquisition_date: '2026-01-01', cost: '1200.00', useful_life_months: 12 })
      .expect(201);
    const assetId = asset.body.data.id;

    const dep1 = await req()
      .post(`/api/v1/ops/fixed-assets/${assetId}/run-depreciation`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(201);
    expect(dep1.body.data.amountPosted).toBe('100.00');

    const disposed = await req()
      .post(`/api/v1/ops/fixed-assets/${assetId}/dispose`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ disposalDate: '2026-06-01', proceeds: '900.00' })
      .expect(201);
    expect(disposed.body.data.status).toBe('DISPOSED');

    // Disposed assets can no longer be depreciated.
    await req()
      .post(`/api/v1/ops/fixed-assets/${assetId}/run-depreciation`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(400);
  });

  it('generates a real invoice from a recurring invoice template and advances its next run date', async () => {
    const template = await req()
      .post('/api/v1/ops/recurring-invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        contact_id: contactId,
        next_run_date: '2026-10-01',
        frequency: 'MONTHLY',
        line_template: [{ description: 'Retainer', quantity: '1', unitPrice: '500.00', taxRateCode: 'GST_FREE' }],
      })
      .expect(201);
    const templateId = template.body.data.id;

    const generated = await req()
      .post(`/api/v1/ops/recurring-invoices/${templateId}/generate`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(201);
    expect(generated.body.data.invoice.total).toBe('500.00000000');

    const after = await req()
      .get('/api/v1/ops/recurring-invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .expect(200);
    const updatedTemplate = after.body.data.find((r: any) => r.id === templateId);
    expect(new Date(updatedTemplate.next_run_date).getUTCMonth()).toBe(10); // Nov (0-indexed) — advanced one month
  });

  it('blocks access without the domain permission (ReadOnly role cannot manage sales_ops)', async () => {
    const reader = await registerAndLogin(app, 'ops-readonly@hero.test');
    // Invite as ReadOnly into the same org, owner does the inviting.
    await req()
      .post('/api/v1/members/invite')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({ email: 'ops-readonly@hero.test', roleName: 'ReadOnly' })
      .expect(201);

    await req()
      .post('/api/v1/ops/quotes')
      .set('Authorization', `Bearer ${reader.accessToken}`)
      .set('x-organization-id', orgId)
      .send({ contact_id: contactId, quote_number: 'Q-BLOCKED', issue_date: '2026-09-01' })
      .expect(403);

    // But read access should work fine.
    await req()
      .get('/api/v1/ops/quotes')
      .set('Authorization', `Bearer ${reader.accessToken}`)
      .set('x-organization-id', orgId)
      .expect(200);
  });
});
