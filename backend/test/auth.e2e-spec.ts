import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

describe('Auth', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'StrongPass1', fullName: 'Alice' })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('alice@example.com');
    // password hash must never be returned to the client
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('rejects duplicate registration with the same email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'StrongPass1', fullName: 'Alice 2' })
      .expect(409);
  });

  it('rejects weak passwords', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'weak@example.com', password: 'short1A', fullName: 'Weak' })
      .expect(400);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'StrongPass1' })
      .expect(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('rejects login with wrong password without revealing whether the account exists', async () => {
    const wrongPassRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongPassword1' })
      .expect(401);

    const noSuchUserRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'WhoKnows1' })
      .expect(401);

    expect(wrongPassRes.body.error.message).toEqual(noSuchUserRes.body.error.message);
  });

  it('rotates refresh tokens and rejects reuse of a rotated-out token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'StrongPass1' })
      .expect(200);

    const firstRefreshToken = loginRes.body.data.refreshToken;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(200);

    expect(refreshRes.body.data.refreshToken).not.toEqual(firstRefreshToken);

    // Reusing the now-rotated-out token must be rejected (theft/replay detection)
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);
  });

  it('rejects protected routes without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/organizations/mine').expect(401);
  });
});
