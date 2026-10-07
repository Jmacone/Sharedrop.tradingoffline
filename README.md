# Sharedrop.tradingoffline
Transportation App — ShareDrop Digital OS, an offline-first logistics PWA.

- `public/` — the static PWA (index.html, app.js, service worker, manifest, icons)
- `netlify/functions/` — API: `/api/auth/login`, `/api/auth/register`, `/api/orders`, `/api/applicants`, `/api/sync`
- `db/schema.ts` — Netlify Database (Postgres) schema via Drizzle; migrations live in `netlify/database/migrations/`
