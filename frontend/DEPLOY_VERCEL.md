# Hero Accounting — Vercel Deployment

This package is the production frontend for Hero Accounting.

## Vercel settings

- Framework Preset: **Vite**
- Build Command: **npm run build**
- Install Command: **npm ci**
- Output Directory: **dist**
- Root Directory: **./** (this package is already the frontend root)

`vercel.json` contains the same settings plus SPA routing and security/cache headers.

## Required environment variable

Set this in Vercel Project Settings → Environment Variables:

```env
VITE_API_BASE_URL=https://YOUR-BACKEND-DOMAIN
```

Set it for Production (and Preview if desired). Do not put database passwords, JWT secrets, OpenAI keys or Stripe secret keys in `VITE_*` variables. Anything beginning with `VITE_` is delivered to the browser.

## Local verification

```bash
npm ci
npm run build
npm run preview
```

## Vercel

Push this directory to GitHub or import it directly into Vercel. Because `package.json` is at the root, do not set the Root Directory to `frontend` when using this package.
