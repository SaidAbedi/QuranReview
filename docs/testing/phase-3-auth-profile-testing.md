# Phase 3 — Auth & Profile Testing Guide

## Prerequisites

### Local Backend Setup

```bash
cd backend
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
npm install
npm run dev            # starts on PORT (default 3000)
```

Confirm the server is running:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

### Creating a Test User via Supabase Auth

The backend validates tokens issued by Supabase Auth. You must obtain a real JWT — there is no dev bypass.

**Option A — Supabase Dashboard**

1. Open your project in the Supabase Dashboard → Authentication → Users → "Invite user".
2. Complete sign-up with the emailed link.
3. Use the Supabase JS client or REST endpoint to sign in and get a token (see Option B).

**Option B — Supabase Auth REST**

```bash
# Sign up (first time only)
curl -X POST "https://<PROJECT_REF>.supabase.co/auth/v1/signup" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"TestPass123!"}'

# Sign in to get an access token
curl -X POST "https://<PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"TestPass123!"}' \
  | jq '.access_token'
```

Store the token:

```bash
TOKEN="<paste access_token here>"
```

---

## Endpoint Tests

### GET /api/me

**First call — bootstraps user_profiles**

```bash
curl -s http://localhost:3000/api/me \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected response shape:

```json
{
  "id": "<uuid>",
  "email": "testuser@example.com",
  "displayName": "Test User",
  "role": "student",
  "profile": {
    "preferredLanguage": null,
    "timezone": null,
    "studentAgeGroup": null,
    "teacherCapacity": null,
    "teacherCurrentLoad": 0,
    "onboardingStatus": "pending_assignment"
  }
}
```

Verify in Supabase:
- `user_profiles` has a new row with `onboarding_status = 'pending_assignment'`
- `student_assignment_requests` has a new row with `status = 'pending_assignment'`

**Subsequent calls — idempotent**

Call `GET /api/me` two or three more times with the same token. The response must be identical and no duplicate rows must appear in `student_assignment_requests`.

**Missing / invalid token**

```bash
curl -s http://localhost:3000/api/me | jq .
# → {"statusCode":401,"message":"Unauthorized"}

curl -s http://localhost:3000/api/me \
  -H "Authorization: Bearer invalidtoken" | jq .
# → {"statusCode":401,"message":"Unauthorized"}
```

---

### PATCH /api/me/profile

**Update a single field**

```bash
curl -s -X PATCH http://localhost:3000/api/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timezone":"America/New_York"}' | jq .
```

Expected: full MeResponse with `profile.timezone = "America/New_York"`.

**Update multiple fields**

```bash
curl -s -X PATCH http://localhost:3000/api/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Said","preferredLanguage":"en","studentAgeGroup":"teen"}' | jq .
```

**Update displayName only**

```bash
curl -s -X PATCH http://localhost:3000/api/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"NewName"}' | jq .
```

Verify `users.display_name` updated in Supabase Dashboard → Table Editor.

**Empty body — must return 400**

```bash
curl -s -X PATCH http://localhost:3000/api/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# → {"statusCode":400,"message":"At least one field must be provided"}
```

**Role field is ignored (users cannot self-update role)**

```bash
curl -s -X PATCH http://localhost:3000/api/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","displayName":"Hacker"}' | jq .
```

Expected: request succeeds (displayName updates), but `role` in response is unchanged (`student`). Verify `users.role` is still `student` in the DB.

---

## Role Protection Tests

### Teacher / Admin Bootstrap

Create users with different roles in the DB (via Supabase Dashboard SQL editor):

```sql
UPDATE public.users SET role = 'teacher' WHERE email = 'teacher@example.com';
```

Sign in as that user and call `GET /api/me`. Verify:
- `onboardingStatus` is `active` (not `pending_assignment`)
- No row is created in `student_assignment_requests`

### Admin-only Endpoints (Phase 5+)

All `/api/admin/*` routes require `role IN ('admin', 'super_admin')`. Test with a student token:

```bash
curl -s http://localhost:3000/api/admin/assignment-requests \
  -H "Authorization: Bearer $STUDENT_TOKEN" | jq .
# → {"statusCode":403,"message":"Forbidden"}
```

---

## Concurrent First-Login Race Test

Simulate two simultaneous first-login calls for the same student:

```bash
curl -s http://localhost:3000/api/me -H "Authorization: Bearer $TOKEN" &
curl -s http://localhost:3000/api/me -H "Authorization: Bearer $TOKEN" &
wait
```

Verify there is still only **one** row in `student_assignment_requests` for this student with `status = 'pending_assignment'`. The partial unique index `uq_student_one_pending_request` enforces this at the DB level; the backend handles the resulting `23505` unique_violation silently.
