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
| POST | `/api/uploads/signed-url` | student | Get signed upload URL |
| POST | `/api/submissions` | student | Create submission + first attempt (transactional) |
| GET | `/api/student/submissions` | student | Student's submissions |
| GET | `/api/teacher/submissions` | teacher | Teacher's students' submissions |
| GET | `/api/submissions/:id` | student/teacher | Single submission |
| GET | `/api/submissions/:id/attempts` | student/teacher | All attempts for submission |
| POST | `/api/submissions/:id/attempts` | student | Add new attempt |
| GET | `/api/submissions/:id/attempts/:aid` | student/teacher | Single attempt |
| GET | `/api/submissions/:id/attempts/:aid/recording-url` | student/teacher | Signed read URL (1 hr) |
| POST | `/api/submissions/:id/attempts/:aid/complete-review` | teacher | **501 — Phase 8** |

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

## Test 2: Student Gets Signed Upload URL

```bash
curl -s -X POST http://localhost:3000/api/uploads/signed-url \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileType":"student_recording","contentType":"audio/m4a","assignmentId":"'$ASSIGNMENT_ID'"}'
# → { uploadUrl, storageKey, expiresAt }
```

**Save `storageKey` as `STORAGE_KEY`. Use `uploadUrl` with a PUT to upload actual audio.**
The `storageKey` is the stable reference to store in the DB — never store the signed URL.

## Test 3: Student Creates Submission (Transaction)

```bash
curl -s -X POST http://localhost:3000/api/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignmentId": "'$ASSIGNMENT_ID'",
    "recordingStorageKey": "'$STORAGE_KEY'",
    "recordingDurationMs": 45000,
    "contentType": "audio/m4a",
    "sizeBytes": 720000
  }'
# → 201 { submission: { id, currentAttemptId, status: "submitted" }, attempt: { id, attemptNumber: 1 } }
```

**Verify the transaction committed correctly:**

```bash
curl -s "${SUPABASE_URL}/rest/v1/submissions?id=eq.<sub-id>&select=id,current_attempt_id,status" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → current_attempt_id matches attempt.id, status = "submitted"

curl -s "${SUPABASE_URL}/rest/v1/assignments?id=eq.$ASSIGNMENT_ID&select=id,status" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status = "submitted"
```

## Test 4: Student Adds Second Attempt

```bash
# Get a new upload URL for the second recording
STORAGE_KEY2=$(curl -s -X POST http://localhost:3000/api/uploads/signed-url \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileType":"student_recording","contentType":"audio/m4a","assignmentId":"'$ASSIGNMENT_ID'"}' \
  | jq -r '.storageKey')

curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recordingStorageKey":"'$STORAGE_KEY2'","recordingDurationMs":52000}'
# → { id, attemptNumber: 2, status: "submitted" }
```

**Verify `current_attempt_id` updated to attempt 2 in submissions table.**

## Test 5: Teacher Views Submissions

```bash
curl -s http://localhost:3000/api/teacher/submissions \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → array; submission.studentId must match the assigned student only
```

## Test 6: Signed Read URL — Student Owns Recording

```bash
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/recording-url" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → { url: "https://...supabase.co/...", expiresAt }
# Note: url will return "Object not found" if no audio was actually uploaded; that is expected
```

## Test 7: Signed Read URL — Teacher Can Access Assigned Student

```bash
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/recording-url" \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → { url, expiresAt }  (or "Object not found" if no file uploaded — auth passes)
```

## Test 8: Access Denial Checks

```bash
# Student cannot access another student's recording
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/recording-url" \
  -H "Authorization: Bearer $STUDENT2_TOKEN"
# → 403 { error: { message: "Access denied" } }

# Teacher cannot access a submission assigned to a different teacher
curl -s "http://localhost:3000/api/submissions/$SUB2_ID/attempts/$ATTEMPT_S2_ID/recording-url" \
  -H "Authorization: Bearer $TEACHER1_TOKEN"
# → 403 { error: { message: "Access denied" } }

# Duplicate submission blocked
curl -s -X POST http://localhost:3000/api/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignmentId":"'$ASSIGNMENT_ID'","recordingStorageKey":"'$STORAGE_KEY'"}'
# → 409 { error: { message: "Submission already exists..." } }
```

## Test 9: completeReview Returns 501

```bash
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATTEMPT1_ID/complete-review" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"completed"}'
# → 501 { error: { message: "Review completion not implemented yet (Phase 8)" } }
```

---

## Storage Bucket Setup

### Local / Development

Leave `AUTO_CREATE_STORAGE_BUCKETS` unset (or set to `true`). The server will create both buckets on startup if they don't exist.

### Production

**First deploy only:** set `AUTO_CREATE_STORAGE_BUCKETS=true` so the server creates the buckets.

**All subsequent deploys:** leave unset (defaults to `false` in production). The server will verify buckets exist and throw if they don't — catching misconfigured environments before serving traffic.

Required bucket settings:
| Bucket | Access | Allowed types | Max size |
|--------|--------|--------------|----------|
| `student-recordings` | private | audio/m4a, audio/mp4, audio/aac, audio/mpeg, audio/ogg, audio/webm | 50 MB |
| `teacher-voice-notes` | private | same | 20 MB |

---

## Known Limitations (deferred to later phases)

- `completeReview` — Phase 8
- Teacher voice notes — Phase 7 (annotations)
- Storage path currently uses `{studentId}/{assignmentId}/{uuid}.m4a` (blueprint path includes `submissionId` — will align in Phase 6)
- Teacher access to signed read URLs is enforced via `teacher_student_relationships`; if a relationship is deactivated after assignment creation, the teacher loses read access (intentional defense-in-depth)
