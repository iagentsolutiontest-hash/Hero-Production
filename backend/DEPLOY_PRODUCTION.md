# Hero Accounting — Backend Production Deployment

The NestJS API is intended to run as a persistent Node.js service (Railway, Render, Fly.io, VPS, etc.). The React/Vite frontend should be deployed to Vercel.

## Build

```bash
npm ci
npm run build
npm run migrate
npm run seed
npm run start:prod
```

Run migrations and seed only against the intended production database and after reviewing the migration/seed behavior.

## Required environment variables

Copy `.env.example` into the platform's environment-variable settings and provide real values. Never commit `.env`.

At minimum:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CORS_ORIGINS=https://YOUR-FRONTEND.vercel.app
```

AI and Stripe are optional and should only be configured when those integrations are enabled.

## Health checks

- `GET /`
- `GET /health`

Expected health response:

```json
{"status":"ok","timestamp":"..."}
```

## PostgreSQL

Use a managed PostgreSQL instance with SSL as required by the provider. Verify the `hero` database role/password independently before starting the API.
