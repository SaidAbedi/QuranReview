# Phase 10 — Admin Assignment: Testing Guide

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/admin/students/unassigned` | admin or super_admin |
| GET | `/api/admin/assignment-requests` | admin or super_admin |
| POST | `/api/admin/assignment-requests/:requestId/assign-teacher` | admin or super_admin |
| PATCH | `/api/admin/teacher-student-relationships/:relationshipId` | admin or super_admin |

---

## Setup

```bash
BASE=http://localhost:3000/api

ADMIN_TOKEN=...    # user with role='admin' or 'super_admin'
TEACHER_TOKEN=...  # user with role='teacher'
STUDENT_TOKEN=...  # user with role='student' who has a pending_assignment request
```

A pending student is created automatically when a student calls `GET /api/me` for the first time (their `student_assignment_requests` row is inserted with `status='pending_assignment'`).

---

## Test 1: Admin lists unassigned students

```bash
curl -s "$BASE/admin/students/unassigned" -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
# → array of students with pending_assignment requests; ordered by createdAt ASC
# Shape: [{ id, email, displayName, requestId, requestStatus, createdAt }]
```

---

## Test 2: Admin lists all assignment requests

```bash
curl -s "$BASE/admin/assignment-requests" -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
# → all requests regardless of status

curl -s "$BASE/admin/assignment-requests?status=pending_assignment" -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
# → only pending requests

curl -s "$BASE/admin/assignment-requests?status=assigned" -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
# → only assigned requests
```

---

## Test 3: Admin assigns teacher to pending student

```bash
REQUEST_ID=<requestId from Test 1>
TEACHER_ID=<teacher user id>

RESULT=$(curl -s -X POST \
  "$BASE/admin/assignment-requests/$REQUEST_ID/assign-teacher" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teacherId\": \"$TEACHER_ID\"}")

echo $RESULT | jq '{id, status, assignedTeacherId, assignedBy, assignedAt}'
# → { status: "assigned", assignedTeacherId: TEACHER_ID, assignedAt: "<timestamp>" }
```

---

## Test 4: Student onboarding_status → active after assignment

```bash
# Call /api/me as the student whose request was just assigned
curl -s "$BASE/me" -H "Authorization: Bearer $STUDENT_TOKEN" | jq '.profile.onboardingStatus'
# → "active"
```

---

## Test 5: Teacher-student relationship created

```bash
STUDENT_ID=<studentId from Test 1>

# Teacher should now be able to access the student's progress
curl -s "$BASE/teacher/students/$STUDENT_ID/progress" -H "Authorization: Bearer $TEACHER_TOKEN" | \
  jq '{pagesAssigned, pagesCompleted}'
# → returns data (not 403 or 404)
```

---

## Test 6: Student notification created

```bash
curl -s "$BASE/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" | \
  jq '[.items[] | select(.type == "student_assigned_to_teacher") | {type, title, body}]'
# → [{ type: "student_assigned_to_teacher", title: "You have been assigned to a teacher", body: "... is your teacher." }]
```

---

## Test 7: Teacher notification created

```bash
curl -s "$BASE/notifications" -H "Authorization: Bearer $TEACHER_TOKEN" | \
  jq '[.items[] | select(.type == "admin_assigned_teacher") | {type, title, body}]'
# → [{ type: "admin_assigned_teacher", title: "A new student has been assigned to you", body: "... has been added to your students." }]
```

---

## Test 8: Duplicate assignment returns 409

```bash
# Second call on the same requestId → 409
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE/admin/assignment-requests/$REQUEST_ID/assign-teacher" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teacherId\": \"$TEACHER_ID\"}"
# → 409

# Body contains clear message
curl -s -X POST \
  "$BASE/admin/assignment-requests/$REQUEST_ID/assign-teacher" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teacherId\": \"$TEACHER_ID\"}" | jq '.error.message'
# → "Student is already assigned to a teacher"
```

---

## Test 9: Student cannot access admin endpoints → 403

```bash
curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/students/unassigned" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 403

curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assignment-requests" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 403
```

---

## Test 10: Teacher cannot access admin endpoints → 403

```bash
curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/students/unassigned" \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → 403

curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE/admin/assignment-requests/$REQUEST_ID/assign-teacher" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teacherId\": \"$TEACHER_ID\"}"
# → 403
```

---

## Test 11: Update teacher-student relationship status

```bash
REL_ID=<relationship uuid from DB or previous test>

# Deactivate
curl -s -X PATCH "$BASE/admin/teacher-student-relationships/$REL_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}' | jq '{id, status}'
# → { status: "inactive" }

# Reactivate
curl -s -X PATCH "$BASE/admin/teacher-student-relationships/$REL_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}' | jq '{id, status}'
# → { status: "active" }

# Unknown relationship → 404
curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  "$BASE/admin/teacher-student-relationships/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'
# → 404

# Invalid status value → 400 VALIDATION_ERROR
curl -s -X PATCH "$BASE/admin/teacher-student-relationships/$REL_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "archived"}' | jq '.error.code'
# → "VALIDATION_ERROR"
# Note: 'paused', 'ended', 'archived' require a schema migration — not yet supported
```

---

## Test 12: Unauthenticated → 401

```bash
curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/students/unassigned"
# → 401
```

---

## Test 13: Non-existent teacher ID → 404

```bash
curl -s -X POST \
  "$BASE/admin/assignment-requests/$REQUEST_ID/assign-teacher" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"teacherId": "00000000-0000-0000-0000-000000000000"}' | jq '.error.message'
# → "Teacher not found"
```

---

## Test 14: Non-teacher user ID → 400

```bash
# Passing a student's ID as the teacherId
curl -s -X POST \
  "$BASE/admin/assignment-requests/$REQUEST_ID/assign-teacher" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teacherId\": \"$STUDENT_ID\"}" | jq '.error.message'
# → "Specified user is not a teacher"
```

---

## Response Shape Reference

### GET /api/admin/students/unassigned

```json
[
  {
    "id": "uuid",
    "email": "student@example.com",
    "displayName": "Student Name",
    "requestId": "uuid",
    "requestStatus": "pending_assignment",
    "createdAt": "2026-05-15T18:22:28.524Z"
  }
]
```

### GET /api/admin/assignment-requests

```json
[
  {
    "id": "uuid",
    "studentId": "uuid",
    "studentEmail": "student@example.com",
    "studentDisplayName": "Student Name",
    "requestedTeacherId": null,
    "assignedTeacherId": "uuid | null",
    "assignedBy": "uuid | null",
    "status": "pending_assignment",
    "notes": null,
    "createdAt": "2026-05-15T18:22:28.524Z",
    "assignedAt": null
  }
]
```

### POST /api/admin/assignment-requests/:id/assign-teacher

Same shape as above with `status: "assigned"`, `assignedTeacherId`, `assignedBy`, and `assignedAt` populated.

### PATCH /api/admin/teacher-student-relationships/:id

```json
{
  "id": "uuid",
  "teacherId": "uuid",
  "studentId": "uuid",
  "status": "active",
  "createdAt": "2026-05-21T14:08:06.597Z"
}
```

---

## What is NOT implemented (Phase 10 scope boundary)

- `GET /api/admin/users` and `PATCH /api/admin/users/:id/role` — stubbed, deferred
- Admin UI (deferred to Phase 14)
- Push notification delivery for assignment events (deferred to Phase 12)
- `paused`, `ended`, `archived` relationship statuses (require schema migration)
- Waitlisting or declining assignment requests
