import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // --------------------------------------------------
  // CORS
  // --------------------------------------------------
  const configuredOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    'https://tykstore.com,https://www.tykstore.com'
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow server-to-server / health-check requests
      if (!requestOrigin) {
        return callback(null, true);
      }

      const normalizedOrigin = requestOrigin
        .trim()
        .replace(/\/$/, '');

      if (configuredOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`Origin not allowed by CORS: ${normalizedOrigin}`),
        false,
      );
    },

    credentials: true,

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-organization-id',
      'Accept',
      'Origin',
    ],

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
  });

  // --------------------------------------------------
  // Validation
  // --------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // --------------------------------------------------
  // Railway / Proxy configuration
  // --------------------------------------------------
  app.enableShutdownHooks();

  const httpAdapter = app.getHttpAdapter().getInstance();

  if (typeof httpAdapter.set === 'function') {
    httpAdapter.set('trust proxy', 1);
  }

  // --------------------------------------------------
  // Railway PORT
  // --------------------------------------------------
  const port = Number(process.env.PORT || 3000);

  await app.listen(port, '0.0.0.0');

  // --------------------------------------------------
  // Startup information
  // --------------------------------------------------
  console.log('==========================================');
  console.log('Hero Accounting API');
  console.log('==========================================');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Port: ${port}`);
  console.log(`CORS Origins: ${configuredOrigins.join(', ')}`);
  console.log('API is running');
  console.log('==========================================');
}

bootstrap().catch((error) => {
  console.error('Failed to start Hero Accounting API');
  console.error(error);
  process.exit(1);
});
