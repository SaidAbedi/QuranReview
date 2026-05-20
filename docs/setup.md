# Development Setup

## Prerequisites

| Tool | Required version | Notes |
|------|-----------------|-------|
| Node.js | **22** (LTS) | Native WebSocket required; Node 18 is not supported |
| npm | 10+ | Ships with Node 22 |
| nvm | any | Recommended for version management |

Node 22 is required because:
- `@supabase/supabase-js` v2 uses the Realtime client which requires native WebSocket.
- Node 18 shipped without native WebSocket and required the `ws` workaround.
- Node 22 ships native WebSocket; no polyfill needed.

## Backend

```bash
# Switch to the correct Node version
cd backend
nvm use          # reads .nvmrc (22)

# Install dependencies
npm install

# Configure env — copy and fill in values
cp .env.example .env   # or create backend/.env manually

# Required env vars
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=     ← never expose to mobile
# SUPABASE_ANON_KEY=
# DATABASE_URL=                  ← never expose to mobile; postgres superuser for transactions
# QURAN_FOUNDATION_CLIENT_ID=
# QURAN_FOUNDATION_CLIENT_SECRET=  ← never expose to mobile
# QURAN_FOUNDATION_API_BASE=https://apis.quran.foundation/content/api/v4
# QURAN_FOUNDATION_DEFAULT_MUSHAF_ID=1

# Type-check
npm run type-check

# Dev server (hot-reload via nodemon)
npm run dev

# Production build
npm run build && npm start
```

## Database migrations

Migrations live in `database/migrations/` and are numbered sequentially. Apply them in order via the Supabase SQL Editor, or use the migration runner:

```bash
cd backend
node scripts/run-migration.js ../database/migrations/006_enable_rls_and_policies.sql
```

The runner reads `DATABASE_URL` from `backend/.env`.

## Security rules (never violate)

- `DATABASE_URL` — backend `.env` only. Direct Postgres superuser; bypasses RLS.
- `SUPABASE_SERVICE_ROLE_KEY` — backend `.env` only. Bypasses all RLS policies.
- `QURAN_FOUNDATION_CLIENT_SECRET` — backend `.env` only. Proxied to mobile via backend.

None of these three may be committed to the repo or shipped in any mobile/client build.

The mobile app authenticates with Supabase Auth only. All application data (assignments, submissions, progress, annotations) goes through the Express backend API.
