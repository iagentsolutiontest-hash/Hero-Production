import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerAndLogin, createOrgForUser } from './helpers';
import { getPool } from '../src/db/pool';

describe('RBAC', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const owner = await registerAndLogin(app, 'owner-rbac@example.com');
    ownerToken = owner.accessToken;
    organizationId = await createOrgForUser(app, ownerToken, 'RBAC Test Org');

    // Create a second user and attach them to the org with the system
    // "ReadOnly" role directly via the DB (no invite-flow endpoint yet in
    // Phase 1) so we can prove the guard actually blocks writes for them.
    const readOnlyUser = await registerAndLogin(app, 'readonly@example.com');
    readOnlyToken = readOnlyUser.accessToken;

    const pool = getPool();
    const roleResult = await pool.query(
      `SELECT id FROM roles WHERE organization_id IS NULL AND name = 'ReadOnly'`,
    );
    await pool.query(
      `INSERT INTO memberships (user_id, organization_id, role_id) VALUES ($1, $2, $3)`,
      [readOnlyUser.userId, organizationId, roleResult.rows[0].id],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a request with no x-organization-id header', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('allows Owner to create a contact', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-organization-id', organizationId)
      .send({ type: 'CUSTOMER', name: 'Bright Ideas Co' })
      .expect(201);
  });

  it('rejects ReadOnly role from creating a contact (403, checked server-side)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .set('x-organization-id', organizationId)
      .send({ type: 'CUSTOMER', name: 'Should Not Be Created' })
      .expect(403);
    expect(res.body.error.message).toMatch(/contact.create/);
  });

  it('allows ReadOnly role to read contacts (has contact.read)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .set('x-organization-id', organizationId)
      .expect(200);
  });
});
