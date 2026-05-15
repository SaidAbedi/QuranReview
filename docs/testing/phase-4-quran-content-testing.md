# Phase 4 — Quran Content Service Testing Guide

## Auth Approach

`@quranjs/api` is used for **TypeScript types only**. All HTTP is handled by the custom
`QfTokenManager` + `QfApiClient` inside `QuranContentService.ts`.

**Why:** The SDK sends `client_id`/`client_secret` in the form body for token exchange.
The Quran.Foundation OAuth2 server requires HTTP Basic auth. The SDK has no override for this.

Token request (what `QfTokenManager` sends):
```
POST /oauth2/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded
Body: grant_type=client_credentials&scope=content
```

Content API requests (what `QfApiClient` sends):
```
GET /content/api/v4/<path>?<params>
x-auth-token: <access_token>
x-client-id:  <client_id>
Accept: application/json
```

On `401`: cached token is invalidated, fresh token is fetched, request is retried **once**.

---

## Required Environment Variables

Fill in `backend/.env` (copy from `.env.example`):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

QURAN_FOUNDATION_ENV=production          # use 'production' for real content API calls
QURAN_FOUNDATION_PRELIVE_CLIENT_ID=...
QURAN_FOUNDATION_PRELIVE_CLIENT_SECRET=...
QURAN_FOUNDATION_PROD_CLIENT_ID=...
QURAN_FOUNDATION_PROD_CLIENT_SECRET=...
QURAN_FOUNDATION_DEFAULT_MUSHAF_ID=1
```

> **Security note:** Quran.Foundation credentials are backend-only. Never add them to any
> Expo / mobile configuration.

> **Prelive note:** Prelive credentials (`prelive-oauth2.quran.foundation`) can obtain tokens
> successfully, but the content API (`apis.quran.foundation`) only accepts production-issued
> tokens. Set `QURAN_FOUNDATION_ENV=production` for real content API calls. Prelive is useful
> only for verifying the OAuth2 token exchange step.

---

## Credential Probe (Manual HTTP)

Before running the full backend, confirm credentials and headers work:

```bash
cd backend

node -e "
require('dotenv').config();
const env = require('./dist/config/env.js').env;

(async () => {
  // 1. Token acquisition
  const tokenUrl = env.QURAN_FOUNDATION_OAUTH_BASE_URL + '/oauth2/token';
  const basic = 'Basic ' + Buffer.from(env.QURAN_FOUNDATION_CLIENT_ID + ':' + env.QURAN_FOUNDATION_CLIENT_SECRET).toString('base64');
  const r = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basic },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'content' }),
  });
  console.log('Token status:', r.status); // expected: 200
  const { access_token } = await r.json();

  // 2. Content API with x-auth-token + x-client-id
  const url = 'https://apis.quran.foundation/content/api/v4/verses/by_page/1?mushaf=1&words=false&fields=image_url&per_page=50';
  const cr = await fetch(url, {
    headers: { 'x-auth-token': access_token, 'x-client-id': env.QURAN_FOUNDATION_CLIENT_ID, Accept: 'application/json' },
  });
  console.log('Content status:', cr.status); // expected: 200
  const body = await cr.json();
  console.log('verse count:', body.verses?.length, '| first verse:', body.verses?.[0]?.verse_key);
  console.log('image_url:', body.verses?.[0]?.image_url);

  // 3. Invalid credentials fail cleanly
  const r2 = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from('bad-id:bad-secret').toString('base64') },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'content' }),
  });
  console.log('Invalid creds status:', r2.status); // expected: 401
})();
"
```

Expected output:
```
Token status: 200
Content status: 200
verse count: 7 | first verse: 1:1
image_url: //c22506.r6.cf1.rackcdn.com/1_1.png
Invalid creds status: 401
```

---

## Starting the Backend

```bash
cd backend
npm run dev
# or: npm run build && npm start
```

Confirm startup:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

Obtain a JWT by signing in through Supabase Auth (see phase-3-auth-profile-testing.md):

```bash
TOKEN="<your_access_token>"
```

---

## Endpoint Tests

### GET /api/quran/pages/lookup

**By surah number**

```bash
curl -s "http://localhost:3000/api/quran/pages/lookup?surah=1" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → [{"pageNumber":1}]

curl -s "http://localhost:3000/api/quran/pages/lookup?surah=2" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → multiple pages (all pages for this surah via /chapters/{n})
```

**By juz number**

```bash
curl -s "http://localhost:3000/api/quran/pages/lookup?juz=1" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → [{"pageNumber":1}]  (first page of juz, on cache miss)
```

**Missing parameters — 400**

```bash
curl -s "http://localhost:3000/api/quran/pages/lookup" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":400,"message":"..."}
```

---

### GET /api/quran/pages/:pageNumber

```bash
curl -s "http://localhost:3000/api/quran/pages/1" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected shape:

```json
{
  "id": "<uuid>",
  "pageNumber": 1,
  "mushafId": "qcf_v2",
  "imageUrl": null
}
```

`imageUrl` is null until `getPageContent` is called (which populates it from the API response).

---

### GET /api/quran/pages/:pageNumber/content

**Without words**

```bash
curl -s "http://localhost:3000/api/quran/pages/1/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected:

```json
{
  "id": "<uuid>",
  "pageNumber": 1,
  "mushafId": "qcf_v2",
  "imageUrl": "//c22506.r6.cf1.rackcdn.com/1_1.png",
  "mappings": [
    {
      "surahNumber": 1,
      "juzNumber": 1,
      "firstVerseKey": "1:1",
      "lastVerseKey": "1:7",
      "startsAtAyah": 1,
      "endsAtAyah": 7,
      "versesCount": 7
    }
  ]
}
```

`imageUrl` is populated from the API response (`fields=image_url`). No `words` key.

**With words**

```bash
curl -s "http://localhost:3000/api/quran/pages/1/content?words=true" \
  -H "Authorization: Bearer $TOKEN" | jq '{wordCount: (.words | length), firstWord: .words[0]}'
```

Expected: `wordCount` > 0, `firstWord` has `id`, `position`, `text`.

---

## Cache Verification in Supabase

After the first call to `/api/quran/pages/1/content`:

1. **Supabase Dashboard → quran_pages**: row with `page_number = 1`, `image_url` populated.
2. **quran_page_mappings**: row with `page_number = 1`, `surah_number = 1`, `source_payload.verses` present.

**Second call — served from cache**

Call `/api/quran/pages/1/content` again. Response is identical. To confirm no API
call is made, temporarily set invalid credentials in `.env` and restart — the cached
response should still return successfully.

---

## Token Refresh / Retry Behavior

`QfTokenManager` caches the token until 60 seconds before expiry. On a `401` from the content API:
1. `invalidate()` clears the cached token
2. A fresh token is fetched
3. The original request is retried exactly once

To observe this manually: the `invalidate()` path is exercised automatically — no manual test needed.
If both the token refresh and the retry fail, the service throws `AppError(503)`.

---

## Error Behavior

**503 when credentials are invalid (uncached page)**

Set `QURAN_FOUNDATION_PROD_CLIENT_SECRET=invalid` in `.env`, rebuild, then:

```bash
curl -s "http://localhost:3000/api/quran/pages/550/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":503,"message":"QF token request failed: 401"}
```

**404 for invalid page number**

```bash
curl -s "http://localhost:3000/api/quran/pages/999999/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":404,"message":"Quran content not found: /verses/by_page/999999"}
```

---

## Real vs. Stubbed Endpoints

All non-Quran routes still return `501 Not Implemented` if reached past the auth guard:

```bash
curl -s "http://localhost:3000/api/student/assignments" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":501,"message":"Not implemented"}
```

This is expected. Stubs are replaced in Phases 5–14.
