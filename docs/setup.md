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

## Mobile (Expo)

```bash
# Switch to the correct Node version (same requirement as backend)
cd mobile
nvm use          # reads .nvmrc (22)

# Install dependencies
npm install

# Configure env — create mobile/.env (git-ignored)
# EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
# EXPO_PUBLIC_SUPABASE_URL=          ← your Supabase project URL
# EXPO_PUBLIC_SUPABASE_ANON_KEY=     ← public anon key (safe to ship in app bundle)

# Start Metro bundler
npx expo start
```

To run on a physical device, install **Expo Go** from the App Store or Google Play, then:
1. Make sure your phone and dev machine are on the **same Wi-Fi network**.
2. Run `npx expo start` — a QR code appears in the terminal.
3. **iOS**: open the Camera app and point it at the QR code.
4. **Android**: open Expo Go and tap "Scan QR code".

> **Note:** Expo Go runs a pre-built Expo SDK runtime. Some native modules (e.g. `expo-av` audio recording) work in Expo Go, but if a module requires a custom native build you will need to run `npx expo run:ios` or `npx expo run:android` with Xcode / Android Studio installed.

### Troubleshooting: backend crashes on startup

If the backend crashes immediately after `npm run dev` with an error inside `RealtimeClient` or `WebSocket`, check your Node version first:

```bash
node -v   # must be v22.x.x
```

If it shows v18, run `nvm use 22` and restart. Do **not** add a `ws` workaround — the correct fix is using Node 22, which ships native WebSocket.

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
