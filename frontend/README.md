# Hero Accounting — Production Frontend

Professional React/Vite frontend for Hero Accounting.

## Stack

- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- React Router 7

## Production deployment

See `DEPLOY_VERCEL.md`.

Required Vercel variable:

```env
VITE_API_BASE_URL=https://YOUR-BACKEND-DOMAIN
```

The browser must never receive backend-only secrets such as `DATABASE_URL`, JWT secrets, `OPENAI_API_KEY`, or Stripe secret keys.
