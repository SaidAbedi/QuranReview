# Phase 9 — Notifications: Testing Guide

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/notifications` | any authenticated |
| POST | `/api/notifications/read-all` | any authenticated |
| POST | `/api/notifications/:id/read` | any authenticated (own only) |
| POST | `/api/devices/register` | any authenticated |
| PATCH | `/api/devices/:id/disable` | any authenticated (own only) |

Push delivery is **out of scope** for Phase 9. The `notifications` table is the source of truth; push is a future best-effort layer.

---

## Setup

```bash
BASE=http://localhost:3000/api

# Tokens via Supabase Auth password sign-in
STUDENT_TOKEN=...    # student with existing notifications (from completeReview)
OTHER_TOKEN=...      # different user — for cross-access tests
```

Notifications for the student are written by `AttemptService.completeReview` (Phase 6).
If the student has no notifications, run a complete-review cycle first.

---

## Test 1: List notifications — shape

```bash
curl -s "$BASE/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" | jq '{
  itemCount: (.items | length),
  unreadCount,
  nextCursor,
  firstType: .items[0].type
}'
# → { itemCount: N, unreadCount: N, nextCursor: null, firstType: "teacher_completed_review" }
# Items ordered by createdAt DESC
```

---

## Test 2: Unauthenticated → 401

```bash
curl -s -o /dev/null -w "%{http_code}" "$BASE/notifications"
# → 401
```

---

## Test 3: unreadOnly=true filter

```bash
curl -s "$BASE/notifications?unreadOnly=true" -H "Authorization: Bearer $STUDENT_TOKEN" | \
  jq 'all(.items[]; .readAt == null)'
# → true (only unread items returned)
```

---

## Test 4: limit + cursor pagination

```bash
# With limit=1, first page
P1=$(curl -s "$BASE/notifications?limit=1" -H "Authorization: Bearer $STUDENT_TOKEN")
echo $P1 | jq '{itemCount: (.items|length), nextCursor}'
# → { itemCount: 1, nextCursor: "<timestamp>" }

# Fetch page 2 using cursor
CURSOR=$(echo $P1 | jq -r '.nextCursor')
P2=$(curl -s "$BASE/notifications?limit=1&cursor=$CURSOR" -H "Authorization: Bearer $STUDENT_TOKEN")
echo $P2 | jq '{itemCount: (.items|length), nextCursor}'
# → next page; nextCursor null when no more pages remain
```

---

## Test 5: Mark one notification read

```bash
NOTIF_ID=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" | jq -r '.items[0].id')

# Mark read → 204
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/notifications/$NOTIF_ID/read" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204

# Verify unreadCount decreased
curl -s "$BASE/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" | jq .unreadCount
# → N-1
```

---

## Test 6: Mark read is idempotent

```bash
# Call again on already-read notification → still 204
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/notifications/$NOTIF_ID/read" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204
```

---

## Test 7: Cross-user cannot mark another user's notification read → 403

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/notifications/$NOTIF_ID/read" \
  -H "Authorization: Bearer $OTHER_TOKEN"
# → 403
```

---

## Test 8: Mark all read

```bash
# Mark all
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/notifications/read-all" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204

# Verify unreadCount = 0
curl -s "$BASE/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" | jq .unreadCount
# → 0

# All items have readAt set
curl -s "$BASE/notifications" -H "Authorization: Bearer $STUDENT_TOKEN" | \
  jq 'all(.items[]; .readAt != null)'
# → true
```

---

## Test 9: Mark all read is idempotent

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/notifications/read-all" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204 (no error even when nothing to update)
```

---

## Test 10: User sees only their own notifications

```bash
# OTHER user has no notifications — returns empty
curl -s "$BASE/notifications" -H "Authorization: Bearer $OTHER_TOKEN" | jq '{itemCount:(.items|length),unreadCount}'
# → { itemCount: 0, unreadCount: 0 }
```

---

## Test 11: Device registration

```bash
DEV=$(curl -s -X POST "$BASE/devices/register" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[abc123]","platform":"ios","deviceId":"iphone-001"}')
DEV_ID=$(echo $DEV | jq -r '.id')
echo $DEV | jq '{id, isActive, platform, token}'
# → { id: "...", isActive: true, platform: "ios", token: "ExponentPushToken[abc123]" }
```

---

## Test 12: Device re-registration upserts (same token, same id)

```bash
DEV2=$(curl -s -X POST "$BASE/devices/register" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[abc123]","platform":"ios","deviceId":"iphone-001"}')
echo "Same id: $([ $(echo $DEV | jq -r .id) = $(echo $DEV2 | jq -r .id) ] && echo YES || echo NO)"
# → YES — no duplicate row created
```

---

## Test 13: Disabled device is reactivated on re-registration

```bash
# Disable
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/devices/$DEV_ID/disable" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204

# Re-register same token → is_active becomes true again
DEV3=$(curl -s -X POST "$BASE/devices/register" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[abc123]","platform":"ios"}')
echo $DEV3 | jq '{id, isActive}'
# → { id: same, isActive: true }
```

---

## Test 14: Disable device

```bash
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/devices/$DEV_ID/disable" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204
```

---

## Test 15: Disable is idempotent

```bash
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/devices/$DEV_ID/disable" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# → 204 (no error on repeat)
```

---

## Test 16: Cross-user cannot disable another user's device → 403

```bash
# Register a device for STUDENT, then try to disable from OTHER
NEW_DEV=$(curl -s -X POST "$BASE/devices/register" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[xyz999]","platform":"android"}')
NEW_DEV_ID=$(echo $NEW_DEV | jq -r '.id')

curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/devices/$NEW_DEV_ID/disable" \
  -H "Authorization: Bearer $OTHER_TOKEN"
# → 403
```

---

## Response shape reference

### GET /api/notifications

```json
{
  "items": [
    {
      "id": "uuid",
      "recipientUserId": "uuid",
      "actorUserId": "uuid | null",
      "type": "teacher_completed_review",
      "title": "Your recitation has been marked complete",
      "body": "Page 1 is now complete.",
      "data": { "submissionId": "...", "pageNumber": 1 },
      "readAt": null,
      "createdAt": "2026-05-20T10:00:00.000Z"
    }
  ],
  "unreadCount": 3,
  "nextCursor": null
}
```

### POST /api/devices/register

```json
{
  "id": "uuid",
  "userId": "uuid",
  "provider": "expo",
  "token": "ExponentPushToken[...]",
  "platform": "ios",
  "deviceId": "device-001",
  "isActive": true,
  "lastSeenAt": "2026-05-20T10:00:00.000Z",
  "createdAt": "2026-05-20T10:00:00.000Z",
  "updatedAt": "2026-05-20T10:00:00.000Z"
}
```

---

## What is NOT implemented (Phase 9 scope boundary)

- Expo push API call (best-effort push delivery deferred to Phase 12)
- Push retry logic / delivery receipts
- Email notification channel
- Notification preferences / opt-out
- Admin notification tooling
