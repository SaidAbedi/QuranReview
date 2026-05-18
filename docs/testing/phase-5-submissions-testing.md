# Phase 5 — Submissions, Attempts & Signed URLs: Testing Guide

## Prerequisites

- Backend running: `node dist/index.js` (or `npm run dev`)
- Migrations applied: `001_initial_schema.sql`, `002_seed_data.sql`, `003_add_constraints.sql`
- `.env` contains `DATABASE_URL` (required for pg transactions)
- Supabase Storage buckets exist (or `AUTO_CREATE_STORAGE_BUCKETS=true` on first run)

## Environment Setup

```bash
# Export helpers — run once per shell session
SUPABASE_URL=https://<ref>.supabase.co
SERVICE_KEY=<service-role-key>
ANON_KEY=<anon-key>

STUDENT_TOKEN=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"<student-email>","password":"<password>"}' | jq -r '.access_token')

TEACHER_TOKEN=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"<teacher-email>","password":"<password>"}' | jq -r '.access_token')
```

---

## Route Map

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/assignments` | teacher | Create assignment for student |
| GET | `/api/teacher/assignments` | teacher | List teacher's assignments |
| GET | `/api/teacher/assignments/:id` | teacher | Single assignment |
| GET | `/api/student/assignments` | student | Student's assignments |
| GET | `/api/student/assignments/:id` | student | Single assignment |
| GET | `/api/teacher/review-queue` | teacher | Submissions awaiting review |
| POST | `/api/uploads/signed-url` | student | Refresh a signed upload URL for an existing attempt |
| POST | `/api/submissions` | student | Create submission + first attempt (transactional); returns uploadUrl |
| GET | `/api/student/submissions` | student | Student's submissions |
| GET | `/api/teacher/submissions` | teacher | Teacher's students' submissions |
| GET | `/api/submissions/:id` | student/teacher | Single submission |
| GET | `/api/submissions/:id/attempts` | student/teacher | All attempts for submission |
| POST | `/api/submissions/:id/attempts` | student | Add new attempt; returns uploadUrl |
| GET | `/api/submissions/:id/attempts/:aid` | student/teacher | Single attempt |
| GET | `/api/submissions/:id/attempts/:aid/recording-url` | student/teacher | Signed read URL (1 hr) |
| POST | `/api/submissions/:id/attempts/:aid/complete-review` | teacher | **501 — Phase 8** |

---

## Storage Key Format (blueprint §13.1)

```
student-recordings/{studentId}/{submissionId}/attempts/attempt-{N}.m4a
```

The key is **server-generated** at the moment the attempt row is created — never supplied by the client. It is deterministic: given the same submissionId and attemptNumber, the key is always the same. This means a refreshed upload URL points to the same object in storage.

---

## Upload Flow

```
POST /api/submissions
  → backend: INSERT submission → compute storageKey → INSERT attempt → UPDATE current_attempt_id
  → response: { submission, attempt, uploadUrl, storageKey, uploadExpiresAt }

Client uploads audio to uploadUrl using HTTP PUT.

If uploadUrl expires before upload:
  POST /api/uploads/signed-url { submissionId, attemptNumber }
  → new uploadUrl for the same storageKey (10 min validity)

POST /api/submissions/:id/attempts  (for additional recordings)
  → same pattern: storageKey computed server-side, uploadUrl returned
```

---

## Test 1: Teacher Creates Assignment

```bash
curl -s -X POST http://localhost:3000/api/assignments \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"<student-uuid>","quranPageId":"<page-uuid>","title":"Al-Fatiha Review"}'
# → 201 { id, status: "assigned", pageNumber: 1 }
```

**Save the assignment `id` as `ASSIGNMENT_ID`.**

## Test 2: Student Creates Submission (no storageKey in request body)

```bash
curl -s -X POST http://localhost:3000/api/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignmentId":"'$ASSIGNMENT_ID'","recordingDurationMs":45000,"contentType":"audio/m4a"}'
# → 201 {
#     submission: { id, currentAttemptId, status: "submitted" },
#     attempt: { id, attemptNumber: 1, recordingStorageKey: "student-recordings/{studentId}/{submissionId}/attempts/attempt-1.m4a" },
#     uploadUrl: "https://...",
#     storageKey: "student-recordings/{studentId}/{submissionId}/attempts/attempt-1.m4a",
#     uploadExpiresAt: "..."
#   }
```

Use `uploadUrl` with HTTP PUT to upload the audio file. **Do not store the `uploadUrl`** — request a fresh one if it expires.

**Verify DB transaction:**
```bash
# current_attempt_id is set
curl -s "${SUPABASE_URL}/rest/v1/submissions?id=eq.<sub-id>&select=id,current_attempt_id,status" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → current_attempt_id matches attempt.id, status = "submitted"

# assignment flipped to submitted
curl -s "${SUPABASE_URL}/rest/v1/assignments?id=eq.$ASSIGNMENT_ID&select=id,status" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status = "submitted"
```

## Test 3: Student Adds Second Attempt

```bash
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recordingDurationMs":52000}'
# → { attempt: { attemptNumber: 2, recordingStorageKey: ".../attempts/attempt-2.m4a" }, uploadUrl, storageKey, uploadExpiresAt }
```

**Verify `current_attempt_id` updated to attempt 2 and `recording_storage_key` uses `attempt-2.m4a`.**

## Test 4: Refresh Upload URL (expired URL scenario)

```bash
curl -s -X POST http://localhost:3000/api/uploads/signed-url \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileType":"student_recording","contentType":"audio/m4a","submissionId":"'$SUB_ID'","attemptNumber":1}'
# → { uploadUrl, storageKey: "...attempt-1.m4a" (same key), expiresAt }
```

## Test 5: Teacher Views Submissions

```bash
curl -s http://localhost:3000/api/teacher/submissions \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → array; only includes submissions for this teacher's students
```

## Test 6: Signed Read URL — Access Controls

```bash
# Student owns recording → signed URL issued (or "Object not found" if no file uploaded — auth passes)
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/recording-url" \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Assigned teacher → auth passes; "Object not found" if no file uploaded
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/recording-url" \
  -H "Authorization: Bearer $TEACHER_TOKEN"

# Another student → 403 Access denied
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/recording-url" \
  -H "Authorization: Bearer $STUDENT2_TOKEN"
# → { error: { message: "Access denied" } }

# Teacher for different student → 403 Access denied
curl -s "http://localhost:3000/api/submissions/$SUB2_ID/attempts/$ATT_S2_ID/recording-url" \
  -H "Authorization: Bearer $TEACHER1_TOKEN"
# → { error: { message: "Access denied" } }
```

## Test 7: Other Guards

```bash
# Duplicate submission blocked
curl -s -X POST http://localhost:3000/api/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignmentId":"'$ASSIGNMENT_ID'"}'
# → 409 "Submission already exists..."

# completeReview still 501
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/complete-review" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"completed"}'
# → 501 "Review completion not implemented yet (Phase 8)"
```

---

## Storage Bucket Setup

### Local / Development

Leave `AUTO_CREATE_STORAGE_BUCKETS` unset (defaults to `true` when `NODE_ENV != production`). The server creates both buckets on startup if they don't exist.

### Production

**First deploy only:** set `AUTO_CREATE_STORAGE_BUCKETS=true` to create the buckets.
**All subsequent deploys:** leave unset. The server verifies buckets exist and throws at startup if they don't.

Required bucket settings:
| Bucket | Access | Allowed types | Max size |
|--------|--------|--------------|----------|
| `student-recordings` | private | audio/m4a, audio/mp4, audio/aac, audio/mpeg, audio/ogg, audio/webm | 50 MB |
| `teacher-voice-notes` | private | same | 20 MB |

---

## Known Limitations (deferred)

- `completeReview` — Phase 8
- Teacher voice notes — Phase 7 (annotations)
- No `pending_upload` status or separate finalize step — attempt is created as `submitted`. A finalize flow can be added in a later phase if needed.
- Teacher read access enforced via `teacher_student_relationships`; deactivating a relationship after assignment creation removes the teacher's read access (intentional defense-in-depth)
