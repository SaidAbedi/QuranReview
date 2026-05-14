# Phase 4 — Quran Content Service Testing Guide

## Required Environment Variables

In addition to the Phase 3 variables, add to `backend/.env`:

```
QURAN_FOUNDATION_CLIENT_ID=<your_client_id>
QURAN_FOUNDATION_CLIENT_SECRET=<your_client_secret>
QURAN_FOUNDATION_API_BASE=https://api.qurancdn.com/api/qdc
QURAN_FOUNDATION_DEFAULT_MUSHAF_ID=1
```

> **Auth mechanism TBD:** `QuranContentService.buildAuthHeader()` currently uses HTTP Basic auth
> (`Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)`). If Quran.Foundation requires a
> different mechanism (OAuth2 client credentials or an API key header), update that method.
> The comment in the service file lists all three candidate mechanisms.

---

## Verifying the Quran.Foundation Token

Before running endpoint tests, confirm your credentials reach the API:

```bash
# Direct API probe (replace vars)
curl -s "https://api.qurancdn.com/api/qdc/verses/by_page/1?mushaf=1&words=false&per_page=10" \
  -H "Authorization: Basic $(echo -n '$CLIENT_ID:$CLIENT_SECRET' | base64)" \
  -H "Accept: application/json" | jq '.verses | length'
# Should return a number > 0
```

If you get `401` or `403`, the credentials or auth mechanism need updating before the backend tests will pass.

---

## Endpoint Tests

All three routes below require an authenticated backend. Obtain a token as described in the Phase 3 guide.

```bash
TOKEN="<access_token>"
```

### GET /api/quran/pages/lookup

**By surah number**

```bash
curl -s "http://localhost:3000/api/quran/pages/lookup?surah=1" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → [{"pageNumber":1}]

curl -s "http://localhost:3000/api/quran/pages/lookup?surah=2" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → [{"pageNumber":2}]  (or whichever page Al-Baqarah starts on)
```

**By juz number**

```bash
curl -s "http://localhost:3000/api/quran/pages/lookup?juz=1" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → [{"pageNumber":1}]
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

`imageUrl` is null until a Phase 9+ image upload populates it. The DB row is created (or confirmed present) by this call.

---

### GET /api/quran/pages/:pageNumber/content

**Without words**

```bash
curl -s "http://localhost:3000/api/quran/pages/1/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `mappings` array with at least one surah entry, no `words` key.

```json
{
  "id": "<uuid>",
  "pageNumber": 1,
  "mushafId": "qcf_v2",
  "imageUrl": null,
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

**With words**

```bash
curl -s "http://localhost:3000/api/quran/pages/1/content?words=true" \
  -H "Authorization: Bearer $TOKEN" | jq '.words | length'
# Should be > 0
```

---

## Cache Verification in Supabase

After the first call to `/api/quran/pages/1/content`:

1. Open Supabase Dashboard → Table Editor → `quran_pages`.
   - A row with `page_number = 1`, `provider = 'quran_foundation'`, `provider_mushaf_id = 1` should exist.

2. Open `quran_page_mappings`.
   - At least one row with `page_number = 1`, `surah_number = 1` should exist.
   - `source_payload` should contain a `verses` array.

**Second call — served from cache (no API hit)**

Call `/api/quran/pages/1/content` a second time. The response should be identical. To confirm no API call was made, you can temporarily set `QURAN_FOUNDATION_API_BASE` to an invalid URL and verify the cached response still returns successfully.

---

## API Failure Behavior

**503 when Quran.Foundation is unreachable**

Set `QURAN_FOUNDATION_API_BASE=http://localhost:9999` (nothing listening), then request a page not yet in cache:

```bash
curl -s "http://localhost:3000/api/quran/pages/604/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":503,"message":"Quran content provider error (HTTP ...)"}
```

**404 for invalid page**

Quran has 604 pages (mushaf 1). Requesting page 605 should return 404 from the upstream API, forwarded as:

```bash
curl -s "http://localhost:3000/api/quran/pages/605/content" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":404,"message":"Quran content not found: /verses/by_page/605..."}
```

---

## Real vs. Stubbed Endpoints

At the end of Phase 4, only the Quran content routes call real backend logic. All other service routes still return `501 Not Implemented`. Confirm stubs are still in place:

```bash
curl -s "http://localhost:3000/api/assignments" \
  -H "Authorization: Bearer $TOKEN" | jq .
# → {"statusCode":501,"message":"Not implemented"}
```

This is expected and correct — stubs will be replaced in Phases 5–14.
