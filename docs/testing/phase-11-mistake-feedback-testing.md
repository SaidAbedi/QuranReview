# Phase 11 — Mistake Feedback: Testing Guide

## What Was Added

Phase 11 completes the structured mistake feedback layer for annotations. The columns
(`mistake_type`, `mistake_option_id`, `quick_label`) were already in the schema from Phase 7;
Phase 11 adds:

1. **Enriched responses** — `mistakeOptionDetail` object embedded in all annotation responses
   (includes `id`, `code`, `label`, `categoryId`, `categoryCode`, `categoryLabel`).
2. **Validation** — `mistakeOptionId` must exist, be active, and (when `mistakeType` is also
   set) belong to the matching category. Throws 422 otherwise.
3. **Migration 007** — extends the `notifications.type` CHECK constraint to include
   `relationship_deactivated` and `relationship_reactivated`.

## Routes

All existing annotation routes are unchanged. `GET /api/mistake-categories` was already
implemented (Phase 7) and returns the full categories + options tree.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/mistake-categories` | All categories with nested options — read from DB |
| POST | `/api/submissions/:id/attempts/:aid/annotations` | Now validates mistakeOptionId; returns `mistakeOptionDetail` |
| POST | `/api/submissions/:id/attempts/:aid/annotations/batch` | Same validation; enriched after commit |
| PATCH | `/api/annotations/:id` | Same validation for option updates; returns enriched detail |
| GET | `/api/submissions/:id/attempts/:aid/annotations` | Returns `mistakeOptionDetail` for each annotation |

---

## Setup

```bash
BASE=http://localhost:3000/api
TEACHER_TOKEN=...   # role=teacher
STUDENT_TOKEN=...   # role=student (read-only tests)
SUB_ID=<submissionId>
ATTEMPT_ID=<attemptId>

# Get a real option ID from the categories endpoint
CATS=$(curl -s "$BASE/mistake-categories" -H "Authorization: Bearer $TEACHER_TOKEN")
MADD_OPT=$(echo $CATS | jq -r '[.[] | select(.code=="madd")][0].options[0].id')
TAJWEED_OPT=$(echo $CATS | jq -r '[.[] | select(.code=="tajweed")][0].options[0].id')
```

---

## Test 1: GET /mistake-categories returns full tree from DB

```bash
curl -s "$BASE/mistake-categories" -H "Authorization: Bearer $TEACHER_TOKEN" | \
  jq '{totalCategories: length, firstCategory: .[0] | {code, label, optionCount: (.options|length)}}'
# → { totalCategories: 11, firstCategory: { code: "tajweed", label: "Tajweed", optionCount: 4 } }
# Categories and options always come from the DB — no hardcoded values in service code
```

---

## Test 2: Create annotation with mistakeType + mistakeOptionId → enriched response

```bash
ANN=$(curl -s -X POST "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d "{
    \"annotationType\": \"word_marker\",
    \"anchorType\": \"word\",
    \"mistakeType\": \"madd\",
    \"mistakeOptionId\": \"$MADD_OPT\",
    \"quickLabel\": \"Madd too short\",
    \"wordId\": 1234
  }")
echo $ANN | jq '{mistakeType, mistakeOptionId, mistakeOptionDetail, quickLabel}'
# → {
#     mistakeType: "madd",
#     mistakeOptionId: "...",
#     mistakeOptionDetail: {
#       id: "...", code: "madd_too_short", label: "Madd too short",
#       categoryId: "...", categoryCode: "madd", categoryLabel: "Madd"
#     },
#     quickLabel: "Madd too short"
#   }
ANN_ID=$(echo $ANN | jq -r '.id')
```

---

## Test 3: Annotation without mistake fields has mistakeOptionDetail = null

```bash
curl -s -X POST "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d '{"annotationType":"freehand","anchorType":"page_region","points":[{"x":0.1,"y":0.1}]}' | \
  jq '{mistakeType, mistakeOptionId, mistakeOptionDetail}'
# → { mistakeType: null, mistakeOptionId: null, mistakeOptionDetail: null }
```

---

## Test 4: GET annotations includes mistakeOptionDetail for all items

```bash
curl -s "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" | \
  jq '[.data[] | {id, mistakeType, mistakeOptionDetail: (.mistakeOptionDetail | if . then {code: .code, categoryCode: .categoryCode} else null end)}]'
# → Annotations with an option show enriched detail; others show null
```

---

## Test 5: Validation — option from wrong category → 422

```bash
# Use a tajweed option but specify mistakeType=harakat
curl -s -X POST "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"annotationType\":\"word_marker\",\"anchorType\":\"word\",\"mistakeType\":\"harakat\",\"mistakeOptionId\":\"$TAJWEED_OPT\"}" | \
  jq '{status: .error.message}'
# → "Mistake option \"...\" belongs to category \"tajweed\", not \"harakat\""
# HTTP status: 422
```

---

## Test 6: Validation — non-existent option UUID → 422

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d '{"annotationType":"word_marker","anchorType":"word","mistakeType":"madd","mistakeOptionId":"00000000-0000-0000-0000-000000000000"}'
# → 422
```

---

## Test 7: mistakeOptionId without mistakeType is allowed

```bash
# mistakeOptionId alone (no category check) is valid — option just needs to exist
curl -s -X POST "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"annotationType\":\"word_marker\",\"anchorType\":\"word\",\"mistakeOptionId\":\"$MADD_OPT\"}" | \
  jq '{mistakeType, mistakeOptionDetail: (.mistakeOptionDetail | {code: .code, categoryCode: .categoryCode})}'
# → { mistakeType: null, mistakeOptionDetail: { code: "madd_too_short", categoryCode: "madd" } }
```

---

## Test 8: PATCH annotation updates mistakeOptionDetail

```bash
CATS=$(curl -s "$BASE/mistake-categories" -H "Authorization: Bearer $TEACHER_TOKEN")
MADD_OPT2=$(echo $CATS | jq -r '[.[] | select(.code=="madd")][0].options[1].id')

curl -s -X PATCH "$BASE/annotations/$ANN_ID" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"mistakeOptionId\":\"$MADD_OPT2\"}" | \
  jq '.mistakeOptionDetail | {code, label}'
# → { code: "madd_too_long", label: "Madd too long" }
```

---

## Test 9: Batch create — enriched and validated

```bash
HARAKAT_OPT=$(echo $CATS | jq -r '[.[] | select(.code=="harakat")][0].options[0].id')

curl -s -X POST "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations/batch" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"annotations\":[
    {\"annotationType\":\"word_marker\",\"anchorType\":\"word\",\"mistakeType\":\"harakat\",\"mistakeOptionId\":\"$HARAKAT_OPT\",\"wordId\":100},
    {\"annotationType\":\"freehand\",\"anchorType\":\"page_region\",\"points\":[{\"x\":0.5,\"y\":0.5}]}
  ]}" | jq '[.[] | {mistakeType, mistakeOptionDetail: (.mistakeOptionDetail | if . then {code: .code, categoryCode: .categoryCode} else null end)}]'
# → [
#     { mistakeType: "harakat", mistakeOptionDetail: { code: "wrong_vowel", categoryCode: "harakat" } },
#     { mistakeType: null, mistakeOptionDetail: null }
#   ]
```

---

## Test 10: Batch validation — wrong category in any item blocks whole batch → 422

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations/batch" \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"annotations\":[
    {\"annotationType\":\"word_marker\",\"anchorType\":\"word\",\"mistakeType\":\"harakat\",\"mistakeOptionId\":\"$TAJWEED_OPT\"}
  ]}"
# → 422 (batch fails entirely — all-or-nothing)
```

---

## Test 11: Student can read annotations (read-only, sees enriched detail)

```bash
curl -s "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $STUDENT_TOKEN" | \
  jq '[.data[0] | {mistakeOptionDetail}]'
# → student can read enriched detail but cannot write
```

---

## Test 12: Student cannot create annotations → 403

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE/submissions/$SUB_ID/attempts/$ATTEMPT_ID/annotations" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"annotationType":"freehand","anchorType":"page_region","points":[{"x":0.1,"y":0.1}]}'
# → 403
```

---

## Response Shape — Annotation with Mistake Details

```json
{
  "id": "uuid",
  "submissionId": "uuid",
  "submissionAttemptId": "uuid",
  "teacherId": "uuid",
  "quranPageId": "uuid",
  "annotationType": "word_marker",
  "anchorType": "word",
  "points": null,
  "pointCount": 0,
  "isSimplified": false,
  "visualBounds": null,
  "style": {},
  "verseKey": null,
  "wordId": 1234,
  "wordPosition": null,
  "lineNumber": null,
  "mistakeType": "madd",
  "mistakeOptionId": "uuid",
  "mistakeOptionDetail": {
    "id": "uuid",
    "code": "madd_too_short",
    "label": "Madd too short",
    "categoryId": "uuid",
    "categoryCode": "madd",
    "categoryLabel": "Madd"
  },
  "quickLabel": "Madd too short",
  "noteText": null,
  "recordingTimestampMs": null,
  "hasVoiceNote": false,
  "createdAt": "2026-05-21T15:00:00.000Z",
  "updatedAt": "2026-05-21T15:00:00.000Z"
}
```

---

## What is NOT implemented (Phase 11 scope boundary)

- Admin category editor (categories editable via seed SQL or direct DB; no API)
- Analytics dashboard / mistake frequency reports
- AI mistake analysis
- Push notifications for mistake feedback
- Notification preferences
- `GET /api/mistake-categories/:categoryId/options` — not needed since the full tree
  is returned by `GET /api/mistake-categories`
