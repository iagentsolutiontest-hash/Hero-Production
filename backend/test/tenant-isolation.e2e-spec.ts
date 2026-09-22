import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';

describe('Tenant isolation', () => {
  let app: INestApplication;
  let orgAToken: string;
  let orgBToken: string;
  let orgAId: string;
  let orgBId: string;
  let orgAContactId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const userA = await registerAndLogin(app, 'org-a-owner@example.com');
    orgAToken = userA.accessToken;
    orgAId = await createOrgForUser(app, orgAToken, 'Org A');

    const userB = await registerAndLogin(app, 'org-b-owner@example.com');
    orgBToken = userB.accessToken;
    orgBId = await createOrgForUser(app, orgBToken, 'Org B');

    const contactRes = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('x-organization-id', orgAId)
      .send({ type: 'CUSTOMER', name: 'Org A Secret Customer' })
      .expect(201);
    orgAContactId = contactRes.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Org B cannot use Org A id as x-organization-id even with a valid Org B token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${orgBToken}`)
      .set('x-organization-id', orgAId)
      .expect(403); // no membership in Org A → forbidden, not data leak
  });

  it("Org B's own membership cannot read Org A's contact by ID (404, not found — not a data leak with 403)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${orgAContactId}`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .set('x-organization-id', orgBId)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it("Org A's own membership CAN read its own contact", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/contacts/${orgAContactId}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .set('x-organization-id', orgAId)
      .expect(200);
  });

  it("listing contacts under Org B's context never includes Org A's contact", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${orgBToken}`)
      .set('x-organization-id', orgBId)
      .expect(200);
    const names = res.body.data.map((c: any) => c.name);
    expect(names).not.toContain('Org A Secret Customer');
  });
});
