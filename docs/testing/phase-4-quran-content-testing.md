# Phase 4 — Quran Content Service Testing Guide

## SDK Version

`@quranjs/api@3.2.0` (pinned). The SDK handles OAuth2 client-credentials token
acquisition, caching, and refresh automatically.

---

## Required Environment Variables

Fill in `backend/.env` (copy from `.env.example`):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

QURAN_FOUNDATION_CLIENT_ID=<your_client_id>
QURAN_FOUNDATION_CLIENT_SECRET=<your_client_secret>
QURAN_FOUNDATION_DEFAULT_MUSHAF_ID=1
```

> **Security note:** The Quran.Foundation credentials are backend-only.
> The mobile app never calls Quran.Foundation directly — it calls our backend,
> which proxies and caches the response. Never add these vars to any Expo / mobile
> configuration.

---

## Verifying Credentials (Direct SDK Probe)

Before running the full backend tests, confirm the SDK can exchange credentials for a token:

```bash
cd backend
node -e "
const { createServerClient } = require('@quranjs/api/server');
const client = createServerClient({
  clientId: process.env.QURAN_FOUNDATION_CLIENT_ID,
  clientSecret: process.env.QURAN_FOUNDATION_CLIENT_SECRET,
});
client.content.v4.verses.byPage(1, { perPage: 1 })
  .then(v => console.log('OK — verse key:', v[0]?.verseKey))
  .catch(e => console.error('FAILED:', e.message));
" 2>&1
```

Expected: `OK — verse key: 1:1`

If you get a `401` or token error, the credentials or the OAuth2 base URL are wrong.

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
# → multiple pages (SDK returns Chapter.pages — all pages for this surah)
```

Note: on a cache miss, `lookupBySurahNumber` now returns **all** pages for the surah
(from the SDK's `Chapter.pages` array), not just the first. This is an improvement
over the previous raw-HTTP fallback.

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

`imageUrl` is null until `getPageContent` is called (which populates it from the SDK).

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
  "imageUrl": "https://...",
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

`imageUrl` should now be populated (SDK returns it per verse; we take the first).
No `words` key in the response.

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

Call `/api/quran/pages/1/content` again. Response is identical. To confirm no SDK
call is made, temporarily set invalid credentials in `.env` and restart — the cached
response should still return successfully.

---

## API / SDK Failure Behavior

**503 when Quran.Foundation is unreachable**

Set `QURAN_FOUNDATION_CLIENT_ID=invalid` in `.env`, restart, then request an uncached page:

```bash
curl -s "http://localhost:3000/api/quran/pages/550/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":503,"message":"Quran content provider error for page 550: ..."}
```

**404 for invalid page**

```bash
curl -s "http://localhost:3000/api/quran/pages/605/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":404,"message":"Quran content not found: page 605"}
```

---

## Prelive / Staging Environment

If Quran.Foundation provides prelive endpoint URLs, set these in `.env`:

```bash
QURAN_FOUNDATION_CONTENT_BASE_URL=https://prelive-apis.quran.foundation/content
QURAN_FOUNDATION_OAUTH_BASE_URL=https://prelive-oauth2.quran.foundation
```

The SDK will use these URLs instead of the production defaults. Leave blank for production.

---

## Real vs. Stubbed Endpoints

All non-Quran routes still return `501 Not Implemented` if reached past the auth guard:

```bash
curl -s "http://localhost:3000/api/student/assignments" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":501,"message":"Not implemented"}
```

This is expected. Stubs are replaced in Phases 5–14.
