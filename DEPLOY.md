# Deploy for Testing (backend host + iOS TestFlight)

Goal: run the app from anywhere for invited testers, without publishing to the
App Store. Supabase (DB/Auth/Storage) is already cloud-hosted — we only need to
(1) give the Express backend a public URL and (2) ship an iOS build to TestFlight.

---

## Part 1 — Host the backend (Docker image)

The backend ships as a Docker image (`backend/Dockerfile`), so it runs the same
on Railway, Render, Fly.io, or Hostinger Docker hosting. **Railway** is the
smoothest for testing; **Render** has a free tier (sleeps when idle).

### Option A — Railway (recommended)
1. Go to railway.app → New Project → **Deploy from GitHub repo** → pick this repo.
2. Settings → **Root Directory** = `backend` (Railway auto-detects the Dockerfile).
3. Add the environment variables below (Variables tab).
4. Deploy. Railway gives a public URL like `https://quranreview-production.up.railway.app`.
5. Settings → Networking → **Generate Domain** if no URL is shown.

### Option B — Render (free)
1. render.com → New → **Web Service** → connect repo.
2. Root Directory `backend`, Runtime **Docker**.
3. Add env vars, create. URL looks like `https://quranreview.onrender.com`.
   (Free tier cold-starts ~30–50s after idle — fine for testing.)

### Backend environment variables (copy values from local `backend/.env`)
```
NODE_ENV=production
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
DATABASE_URL=...                       # required for transactions (submissions, etc.)
QURAN_FOUNDATION_ENV=production
QURAN_FOUNDATION_PROD_CLIENT_ID=...
QURAN_FOUNDATION_PROD_CLIENT_SECRET=...
CORS_ORIGINS=https://REPLACE_WITH_BACKEND_URL
```
> The mobile app sends no Origin header, so CORS won't block it. Buckets already
> exist on the shared Supabase project, so leave AUTO_CREATE_STORAGE_BUCKETS unset.

### Verify
```
curl https://<your-backend-url>/health      # -> {"status":"ok"}
```

---

## Part 2 — Point the app at the public backend

1. In `mobile/eas.json`, replace **both** `REPLACE_WITH_BACKEND_URL` occurrences
   (preview + production profiles) with your backend host, e.g.
   `https://quranreview-production.up.railway.app`.
2. In Supabase dashboard → Authentication → URL Configuration → **Redirect URLs**,
   add `https://<your-backend-url>/auth/callback` (for email-confirmation deep link).

---

## Part 3 — Build for iOS TestFlight (EAS)

Prereqs: Apple Developer account (have it), Expo account.

```
cd mobile
npm i -g eas-cli
eas login
eas build --platform ios --profile production      # builds on Expo servers
eas submit --platform ios --latest                 # uploads to App Store Connect
```
- EAS can create/manage the iOS signing credentials for you (answer "yes" when
  prompted). Bundle id is already `com.quranreview.app`.
- In App Store Connect → your app → **TestFlight**, add testers by email
  (Internal Testing = up to 100, no Apple review needed).

---

## Part 4 — Fast iteration during testing (OTA)

JS-only changes don't need a rebuild — push them over-the-air:
```
cd mobile
eas update --branch production --message "tweak X"
```
Testers get the update on next app launch. (A new native build is only needed
when native deps or app config change.)

---

## Quick reference — what lives where
- **Supabase**: DB, Auth, Storage — already public.
- **Backend**: Docker image → Railway/Render/Hostinger → public HTTPS URL.
- **Mobile**: EAS build → TestFlight; env baked from `eas.json`.
