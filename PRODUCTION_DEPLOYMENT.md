# Hero Accounting Backend — Production

## Railway
- Root directory: `backend`
- `railway.json` configures the build, production start command, `/health` check, and restart policy.
- Do not commit `.env` or production secrets.

After connecting the Supabase Postgres database, run `npm run migrate` and
`npm run seed` from the Railway service shell before serving production traffic.

## Required variables
`NODE_ENV=production`, `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, and `CORS_ORIGINS`.

Configure `DATABASE_URL` with the Supabase direct connection or session-mode
pooler. The API sets tenant context on each pooled Postgres session, so do not
use transaction-mode pooling.

File records are available through the operations API, but this version does
not implement binary upload/download endpoints or connect these values to
Supabase Storage. Do not rely on file attachments until that API is added.
If storage support is implemented later, keep any service-role key only in
Railway.

Set `CORS_ORIGINS` in Railway to the comma-separated Vercel production origin(s), for
example `https://your-app.vercel.app,https://app.yourdomain.com`. Production
startup fails if this is missing so the API cannot silently allow every origin.

AI and Stripe are optional. For Ask Hero, set `OPENAI_API_KEY` and
`OPENAI_MODEL`. For payments, set the Stripe secret and webhook values.

## Database
Run `npm run migrate` and `npm run seed` once against the production database
after verifying the connection and before serving production traffic.
