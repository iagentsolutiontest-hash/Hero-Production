# Hero Accounting — Backend Production Deployment

The NestJS API is intended to run as a persistent Node.js service (Railway, Render, Fly.io, VPS, etc.). The React/Vite frontend should be deployed to Vercel.

## Build

```bash
NODE_ENV=development npm ci --no-audit --no-fund
npm run build
npm run migrate
npm run seed
NODE_ENV=production npm run start:prod
```

Keep `NODE_ENV=production` only for the runtime start command. Installing with `NODE_ENV=production` in hosted build environments can trigger npm cache-locking issues and production-only dependency pruning during the build phase.

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
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=hero-files
```

AI and Stripe are optional and should only be configured when those integrations are enabled.

## File uploads

Files & Documents and Receipts are stored in a **private Supabase Storage bucket**. Create the bucket (default name `hero-files`) in Supabase Storage, keep it private, and configure the backend-only variables above.

```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=hero-files
```

Never expose the service-role key to the frontend or commit it. File and bank-statement uploads have a 20 MiB (20 × 1024 × 1024 bytes) maximum enforced by both the browser and API.

## Health checks

- `GET /`
- `GET /health`

Expected health response:

```json
{"status":"ok","timestamp":"..."}
```

## PostgreSQL

Use a managed PostgreSQL instance with SSL as required by the provider. Verify the `hero` database role/password independently before starting the API.
