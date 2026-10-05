import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    const requiredEnv = [
      'DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'CORS_ORIGINS',
    ];
    const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
    if (missingEnv.length) {
      throw new Error(`Missing required production environment variables: ${missingEnv.join(', ')}`);
    }
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (process.env[name]!.length < 32) {
        throw new Error(`${name} must be at least 32 characters in production`);
      }
    }
  }

  // rawBody: true so Stripe webhook signature verification can use the exact payload
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isNonProduction =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (!isNonProduction && allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must include the production frontend origin');
  }

  // Required for the Vite frontend (and any production SPA) to call the API.
  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Hero API listening on port ${port}`);
}

bootstrap();
