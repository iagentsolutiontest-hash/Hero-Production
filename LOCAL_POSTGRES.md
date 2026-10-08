# Local PostgreSQL

Hero can run against a separate local PostgreSQL instance for development.

## Docker

```bash
docker compose up -d postgres
```

Copy `.env.local.example` to `.env` and adjust the secrets.

Then:

```bash
npm ci
npm run migrate
npm run seed
npm run start:dev
```

Health:

`http://localhost:3000/health`

## Production

Do not use `localhost` from Railway. Railway cannot reach PostgreSQL running on your Windows PC. Production needs a network-accessible PostgreSQL host. The application code uses `DATABASE_URL`, so switching between local and production PostgreSQL does not require code changes.
