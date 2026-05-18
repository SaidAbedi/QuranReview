# Phase 6 — Teacher Review Flow: Testing Guide

## Route

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/submissions/:submissionId/attempts/:attemptId/complete-review` | teacher / admin / super_admin |

**Request body:**
```json
{ "pageStatus": "completed" }
// or
{ "pageStatus": "needs_resubmission" }
```

**Response:**
```json
{
  "attempt":          { "id", "status", "reviewedAt", "attemptNumber", ... },
  "submission":       { "id", "status", "reviewedAt", "completedAt", ... },
  "assignmentStatus": "reviewed",
  "pageProgressStatus": "completed" | "needs_resubmission"
}
```

---

## Status Mapping

| `pageStatus` | attempt.status | submission.status | assignment.status | progress.status |
|---|---|---|---|---|
| `completed` | `completed` | `completed` | `reviewed` | `completed` |
| `needs_resubmission` | `needs_resubmission` | `needs_resubmission` | `reviewed` | `needs_resubmission` |

**Review queue behavior:**
- After any review: assignment.status = `reviewed` → drops from queue
- After student adds new attempt: assignment.status resets to `submitted` → re-enters queue
- Queue only shows `status = 'submitted'` assignments

---

## Setup

```bash
SUPABASE_URL=https://<ref>.supabase.co
SERVICE_KEY=<service-role-key>
ANON_KEY=<anon-key>

TEACHER_TOKEN=...   # teacher with active teacher_student_relationships to student
TEACHER2_TOKEN=...  # teacher with NO relationship to student (for 403 test)
STUDENT_TOKEN=...

# 1. Teacher creates assignment
ASS_ID=$(curl -s -X POST http://localhost:3000/api/assignments \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"<student-uuid>","quranPageId":"<page-uuid>"}' | jq -r '.id')

# 2. Student creates submission
RESULT=$(curl -s -X POST http://localhost:3000/api/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignmentId":"'$ASS_ID'"}')
SUB_ID=$(echo $RESULT | jq -r '.submission.id')
ATT1_ID=$(echo $RESULT | jq -r '.attempt.id')
```

---

## Test 1: Access Control

```bash
# Student cannot complete review → 403
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT1_ID/complete-review" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"completed"}'
# → { error: "Insufficient permissions" }

# Unassigned teacher → 403
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT1_ID/complete-review" \
  -H "Authorization: Bearer $TEACHER2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"completed"}'
# → { error: "Access denied: not your assignment" }
```

**Admin/super_admin:** bypass the relationship check — can review any submission.

---

## Test 2: Assignment in Review Queue Before Review

```bash
curl -s http://localhost:3000/api/teacher/review-queue \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.[] | select(.id == "'$ASS_ID'")'
# → assignment with status "submitted" is present
```

---

## Test 3: Mark needs_resubmission

```bash
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT1_ID/complete-review" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"needs_resubmission"}'
# → {
#     attempt: { status: "needs_resubmission", reviewedAt: "..." },
#     submission: { status: "needs_resubmission" },
#     assignmentStatus: "reviewed",
#     pageProgressStatus: "needs_resubmission"
#   }
```

**DB verifications:**
```bash
# attempt reviewed
curl -s "$SUPABASE_URL/rest/v1/submission_attempts?id=eq.$ATT1_ID&select=status,reviewed_at" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status: "needs_resubmission", reviewed_at: <timestamp>

# submission reviewed
curl -s "$SUPABASE_URL/rest/v1/submissions?id=eq.$SUB_ID&select=status,reviewed_at" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status: "needs_resubmission", reviewed_at: <timestamp>

# assignment reviewed
curl -s "$SUPABASE_URL/rest/v1/assignments?id=eq.$ASS_ID&select=status" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status: "reviewed"

# progress row created
curl -s "$SUPABASE_URL/rest/v1/student_page_progress?student_id=eq.<student-id>&select=status,completed_at,completed_attempt_id" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status: "needs_resubmission", completed_at: null, completed_attempt_id: null

# notification
curl -s "$SUPABASE_URL/rest/v1/notifications?recipient_user_id=eq.<student-id>&select=type,title&order=created_at.desc&limit=1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → type: "teacher_requested_resubmission"
```

---

## Test 4: Assignment Leaves Queue After Review

```bash
curl -s http://localhost:3000/api/teacher/review-queue \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.[] | select(.id == "'$ASS_ID'")'
# → empty (assignment no longer in queue)
```

---

## Test 5: Double-Review Blocked

```bash
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT1_ID/complete-review" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"completed"}'
# → 409 { error: "Attempt is already in status \"needs_resubmission\"" }
```

---

## Test 6: Student Resubmits → Assignment Re-enters Queue

```bash
ATT2_RESULT=$(curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
ATT2_ID=$(echo $ATT2_RESULT | jq -r '.attempt.id')
# → attemptNumber: 2

# Assignment is back in queue
curl -s http://localhost:3000/api/teacher/review-queue \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.[] | select(.id == "'$ASS_ID'")'
# → status: "submitted"
```

---

## Test 7: Mark completed on Attempt 2

```bash
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT2_ID/complete-review" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageStatus":"completed"}'
# → {
#     attempt: { status: "completed" },
#     submission: { status: "completed", completedAt: "..." },
#     assignmentStatus: "reviewed",
#     pageProgressStatus: "completed"
#   }
```

**DB verifications:**
```bash
# student_page_progress — completed
curl -s "$SUPABASE_URL/rest/v1/student_page_progress?student_id=eq.<student-id>&select=status,attempt_count,completed_at,completed_attempt_id" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → status: "completed", attempt_count: 2, completed_at: <timestamp>, completed_attempt_id: <ATT2_ID>

# Notification
curl -s "$SUPABASE_URL/rest/v1/notifications?recipient_user_id=eq.<student-id>&select=type,title&order=created_at.desc&limit=1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → type: "teacher_completed_review"

# Assignment leaves queue again
curl -s http://localhost:3000/api/teacher/review-queue \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.[] | select(.id == "'$ASS_ID'")'
# → empty
```

---

## How Page Progress Is Updated

`student_page_progress` is upserted inside the same pg transaction as the review, so it is always consistent with the attempt/submission state.

**ON CONFLICT logic:**
- `status` always reflects the latest review outcome
- `completed_attempt_id` and `completed_at` are only updated when `status = 'completed'` — a subsequent `needs_resubmission` review does **not** clear a previously recorded completion
- `attempt_count` is set to the `attempt_number` of the reviewed attempt

**A page counts toward student progress only when a teacher explicitly marks it `completed`.** Audio upload alone does not increment progress (blueprint §19).

---

## Known Limitations (deferred)

- `student_progress_snapshots` (aggregated surah/juz/full Quran percentages) — Phase 8
- Push notification delivery — Phase 9 (in-app notification row is inserted in Phase 6)
- Teacher voice notes and annotation attachment to review — Phase 7
