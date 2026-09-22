import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

export async function registerAndLogin(
  app: INestApplication,
  email: string,
  password = 'TestPass1234',
  fullName = 'Test User',
) {
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, fullName })
    .expect(201);

  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return loginRes.body.data as { accessToken: string; refreshToken: string; userId: string };
}

export async function createOrgForUser(
  app: INestApplication,
  accessToken: string,
  name: string,
  countryCode = 'AU',
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, countryCode })
    .expect(201);
  return res.body.data.organizationId as string;
}
