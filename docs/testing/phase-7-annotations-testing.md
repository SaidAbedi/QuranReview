# Phase 7 — Annotations: Testing Guide

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/mistake-categories` | any authenticated |
| GET | `/api/submissions/:sid/attempts/:aid/annotation-markers` | any authenticated |
| GET | `/api/submissions/:sid/attempts/:aid/annotations` | any authenticated |
| POST | `/api/submissions/:sid/attempts/:aid/annotations` | teacher only |
| POST | `/api/submissions/:sid/attempts/:aid/annotations/batch` | teacher only |
| PATCH | `/api/annotations/:id` | teacher only (owner) |
| DELETE | `/api/annotations/:id` | teacher only (owner) |
| POST | `/api/annotations/:id/voice-note` | teacher only (owner) |

Annotation writes require `role = 'teacher'`. Admin/super_admin are rejected with 403.

---

## Setup

```bash
SUPABASE_URL=https://<ref>.supabase.co
SERVICE_KEY=<service-role-key>
ANON_KEY=<anon-key>

TEACHER_TOKEN=...   # assigned teacher
TEACHER2_TOKEN=...  # teacher with no relationship to this student
STUDENT_TOKEN=...
ADMIN_TOKEN=...     # user with role='admin'

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
ATT_ID=$(echo $RESULT | jq -r '.attempt.id')
```

---

## Test 1: Mistake Categories

```bash
curl -s http://localhost:3000/api/mistake-categories \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq 'map({code, n_options: (.options | length)})'
# → 11 categories (tajweed, harakat, wrong_word, wrong_ayah, makhraj, madd,
#                   ghunnah, waqf, memorization, pronunciation, other)
# Each with 1–4 options
```

---

## Test 2: Access Control — Write Paths

```bash
# Student cannot create annotation → 403
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"annotationType":"freehand","anchorType":"page_region","points":[{"x":0.1,"y":0.1}]}'
# → { error: "Insufficient permissions" }

# Admin cannot create annotation → 403 (requireTeacher middleware blocks)
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"annotationType":"note","anchorType":"page_region","noteText":"admin attempt"}'
# → { error: "Insufficient permissions" }

# Unassigned teacher cannot create annotation → 403
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"annotationType":"freehand","anchorType":"page_region","points":[{"x":0.1,"y":0.1}]}'
# → { error: "Access denied: not your assignment" }
```

---

## Test 3: Access Control — Read Paths

```bash
# Admin CAN read annotation-markers
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotation-markers" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → [] (empty array, 200 OK)

# Student CAN read their own annotation-markers
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotation-markers" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → [] or list of markers, 200 OK

# Student CANNOT read another student's annotations
# (attempt belongs to a different student → 403 from resolveAccess)
```

---

## Test 4: Single Annotation — freehand (normalized points)

```bash
ANN=$(curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "annotationType": "freehand",
    "anchorType": "page_region",
    "points": [{"x":0.10,"y":0.20},{"x":0.15,"y":0.25},{"x":0.20,"y":0.30}],
    "style": {"color":"#ff0000","lineWidth":2},
    "mistakeType": "tajweed",
    "recordingTimestampMs": 12500
  }')
ANN_ID=$(echo $ANN | jq -r '.id')
echo $ANN | jq '{id, annotationType, pointCount, mistakeType, recordingTimestampMs}'
# → { id: "...", annotationType: "freehand", pointCount: 3, mistakeType: "tajweed", recordingTimestampMs: 12500 }
```

---

## Test 5: word_marker — no points required

```bash
WORD_ANN=$(curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "annotationType": "word_marker",
    "anchorType": "word",
    "verseKey": "1:2",
    "wordPosition": 3,
    "mistakeType": "harakat",
    "noteText": "Check the kasra here",
    "recordingTimestampMs": 8000
  }')
echo $WORD_ANN | jq '{id, annotationType, anchorType, verseKey, wordPosition, points}'
# → points: null, verseKey: "1:2", wordPosition: 3
```

---

## Test 6: Other drawing types (circle / underline / highlight)

```bash
# circle
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "annotationType": "circle",
    "anchorType": "page_region",
    "points": [{"x":0.5,"y":0.5},{"x":0.6,"y":0.6}],
    "style": {"color":"#0000ff"}
  }' | jq '{id, annotationType, pointCount}'

# highlight — no mistake type needed
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "annotationType": "highlight",
    "anchorType": "page_region",
    "points": [{"x":0.3,"y":0.4},{"x":0.4,"y":0.4},{"x":0.4,"y":0.5}],
    "style": {"color":"#ffff00","opacity":0.5}
  }' | jq '{id, annotationType}'
```

---

## Test 7: note and ayah_marker (no points)

```bash
# note — free-text comment, no stroke
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"annotationType":"note","anchorType":"page_region","noteText":"Overall good pacing"}' \
  | jq '{id, annotationType, noteText, points}'
# → points: null

# ayah_marker
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"annotationType":"ayah_marker","anchorType":"ayah","verseKey":"1:3"}' \
  | jq '{id, annotationType, anchorType, verseKey}'
```

---

## Test 8: annotation-markers (no points in response)

```bash
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotation-markers" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq .
# → Array of { id, annotationType, recordingTimestampMs, mistakeType, quickLabel, hasVoiceNote }
# No "points" field in any item
# Ordered by recordingTimestampMs ascending (nulls last)
```

---

## Test 9: GET annotations — full payloads, paginated

```bash
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations?limit=3" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '{count: (.data | length), hasMore, nextCursor}'
# → If more than 3 exist: hasMore: true, nextCursor: "<timestamp>"

# Page 2
CURSOR=<nextCursor from above>
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations?limit=3&cursor=$CURSOR" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '{count: (.data | length), hasMore}'
```

---

## Test 10: Batch create — success (all-or-nothing)

```bash
BATCH=$(curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations/batch" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "annotations": [
      {"annotationType":"circle","anchorType":"page_region","points":[{"x":0.5,"y":0.5}]},
      {"annotationType":"ayah_marker","anchorType":"ayah","verseKey":"2:1"},
      {"annotationType":"note","anchorType":"page_region","noteText":"Batch note"}
    ]
  }')
echo $BATCH | jq 'length'
# → 3
echo $BATCH | jq 'map({id, annotationType})'
```

---

## Test 11: Batch create — atomic rollback

```bash
# Count before
BEFORE=$(curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.data | length')

# Batch with valid item + 501-point item (fails validation, rolls back both)
POINTS=$(python3 -c "import json; print(json.dumps([{'x':i*0.001,'y':i*0.001} for i in range(501)]))")
curl -s -X POST "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations/batch" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"annotations\":[
    {\"annotationType\":\"circle\",\"anchorType\":\"page_region\",\"points\":[{\"x\":0.1,\"y\":0.1}]},
    {\"annotationType\":\"freehand\",\"anchorType\":\"page_region\",\"points\":$POINTS}
  ]}" | jq .error.message
# → "Annotation exceeds maximum of 500 points"

# Count after — must equal BEFORE
AFTER=$(curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.data | length')
echo "Before: $BEFORE, After: $AFTER"
# → numbers match
```

---

## Test 12: PATCH annotation

```bash
curl -s -X PATCH "http://localhost:3000/api/annotations/$ANN_ID" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"noteText":"Updated note","mistakeType":"madd"}' | jq '{id, noteText, mistakeType}'
# → updated values

# Another teacher cannot PATCH → 403
curl -s -X PATCH "http://localhost:3000/api/annotations/$ANN_ID" \
  -H "Authorization: Bearer $TEACHER2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"noteText":"hijack"}' | jq .error.message
# → "Access denied: not your annotation"
```

---

## Test 13: Soft delete

```bash
curl -s -X DELETE "http://localhost:3000/api/annotations/$ANN_ID" \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → 204 No Content

# Deleted annotation no longer appears in GET /annotations
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq '.data | map(select(.id == "'$ANN_ID'")) | length'
# → 0

# Verify deleted_at is set in DB (not hard deleted)
curl -s "$SUPABASE_URL/rest/v1/annotations?id=eq.$ANN_ID&select=id,deleted_at,deleted_by" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# → deleted_at: <timestamp>, deleted_by: <teacher-uuid>

# DELETE again → 404
curl -s -X DELETE "http://localhost:3000/api/annotations/$ANN_ID" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | jq .error.message
# → "Annotation not found"
```

---

## Test 14: Voice note — one per annotation

```bash
# Add voice note
VN=$(curl -s -X POST "http://localhost:3000/api/annotations/$ANN_ID/voice-note" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"audioStorageKey":"teacher-voice-notes/b8b4f59c/ann1.m4a","durationMs":5000}')
echo $VN | jq '{id, audioStorageKey}'
# → { id: "...", audioStorageKey: "teacher-voice-notes/..." }

# Duplicate voice note → 409
curl -s -X POST "http://localhost:3000/api/annotations/$ANN_ID/voice-note" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"audioStorageKey":"teacher-voice-notes/b8b4f59c/ann1-dup.m4a"}' | jq .error.message
# → "Voice note already exists for this annotation"
# (enforced by DB partial unique index on annotation_id WHERE deleted_at IS NULL)

# Annotation markers now show hasVoiceNote: true for this annotation
curl -s "http://localhost:3000/api/submissions/$SUB_ID/attempts/$ATT_ID/annotation-markers" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  | jq 'map(select(.hasVoiceNote == true)) | length'
# → 1 (at minimum)
```

---

## DB Verifications

```bash
# Confirm annotation_type CHECK now allows new types
curl -s "$SUPABASE_URL/rest/v1/annotations?submission_attempt_id=eq.$ATT_ID&select=annotation_type&is.deleted_at=null" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | jq '[.[].annotation_type] | unique'

# Confirm points is NULL for word_marker/ayah_marker/note rows
curl -s "$SUPABASE_URL/rest/v1/annotations?annotation_type=in.(word_marker,ayah_marker,note)&select=annotation_type,points&limit=5" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | jq .

# Confirm partial unique index exists
# In psql:
# SELECT indexname, indexdef FROM pg_indexes
# WHERE tablename = 'annotation_voice_notes' AND indexname LIKE '%unique%';
```
