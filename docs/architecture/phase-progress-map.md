# Phase Progress Map

Tracks actual implementation status across backend, mobile, and remaining work.
Last updated: 2026-06-18 (Phase 24 complete)

> **Rule:** Update this file every time a phase is completed — mark it ✅ in the Phase Status table, update the Mobile Screen Map, and move it out of the Remaining Phases section.

## Legend

| Symbol | Meaning                                      |
| ------ | -------------------------------------------- |
| ✅     | Fully implemented (backend + mobile UI)      |
| 🔵     | Backend done — mobile UI missing or partial  |
| ⬜     | Not started                                  |

---

## Phase Status

| Phase | Scope                                                | Status |
| ----- | ---------------------------------------------------- | ------ |
| 0     | Project plan, monorepo scaffold, CLAUDE.md           | ✅     |
| 1     | DB schema (migrations 001–008)                       | ✅     |
| 2     | Express skeleton, middleware, error handling          | ✅     |
| 3     | Auth middleware, GET /api/me, PATCH /api/me/profile  | ✅     |
| 4     | QuranContentService, Quran page images (604 PNGs)    | ✅     |
| 5     | Assignments, Submissions, Attempts (backend)         | ✅     |
| 6     | Storage & signed URLs (upload + read)                | ✅     |
| 7     | Annotations (freehand, batch, voice notes, markers)  | ✅     |
| 8     | Review completion & progress tracking (backend)      | ✅     |
| 9     | Notifications (in-app DB + read/unread)              | ✅     |
| 10    | Admin assignment management (backend)                | ✅     |
| 11    | Mistake feedback categories & options (backend)      | ✅     |
| 12    | Mobile foundation — Expo Dev Client, auth, routing   | ✅     |
| 13    | Student mobile flow                                  | ✅     |
| 14    | Teacher mobile flow — queue, review, annotations     | ✅     |
| 15    | Admin mobile flow — assign queue, relationships      | ✅     |
| 16    | Student feedback viewer — see teacher annotations    | ✅     |
| 17    | Progress drill-down — surah & juz page-by-page       | ✅     |
| 18    | Attempt history on assignment detail                 | ✅     |
| 19    | Teacher hub — queue polish, student roster, history  | ✅     |
| 20    | Notifications — unread badge, mark read, push tokens | ✅     |
| 21    | Quran Mus'haf browser + self-paced recording flow    | ✅     |
| 22    | Annotation UX overhaul — zoom/pan, mode separation, auto-save, details sheet | ✅ |
| 23    | Review voice notes — teacher wrap-up audio per attempt | ✅   |
| 24    | Student UX polish — merged tabs, Recitation Room, image & annotation fixes | ✅ |

---

## Backend Route Map (all implemented)

### Auth & Profile

| Method | Route            | Notes                                |
| ------ | ---------------- | ------------------------------------ |
| GET    | /api/me          | Returns user + profile + role        |
| PATCH  | /api/me/profile  | Update display name, onboarding step |

### Quran Content

| Method | Route                                | Notes                                      |
| ------ | ------------------------------------ | ------------------------------------------ |
| GET    | /api/quran/pages/lookup              | Lookup page by surah/ayah                  |
| GET    | /api/quran/pages/:pageNumber         | Page metadata + storage-backed image URL   |
| GET    | /api/quran/pages/:pageNumber/content | Full verse content (cache-first from QF)   |

### Assignments

| Method | Route                              | Guard                  |
| ------ | ---------------------------------- | ---------------------- |
| POST   | /api/assignments                   | requireTeacher         |
| GET    | /api/student/assignments           | student's own list     |
| GET    | /api/assignments/:id               | owner check            |
| GET    | /api/student/assignments/:id       | student shorthand      |
| GET    | /api/teacher/assignments           | teacher's list         |
| GET    | /api/teacher/review-queue          | enriched with attempt# |

### Submissions & Attempts

| Method | Route                                                         | Notes                        |
| ------ | ------------------------------------------------------------- | ---------------------------- |
| POST   | /api/submissions                                              | Creates sub + attempt 1      |
| GET    | /api/student/submissions                                      | Student's own submissions    |
| GET    | /api/submissions/:id                                          | Single submission            |
| GET    | /api/submissions/:id/attempts                                 | All attempts (ordered)       |
| POST   | /api/submissions/:id/attempts                                 | New attempt (resubmission)   |
| GET    | /api/submissions/:id/attempts/:attemptId                      | Single attempt               |
| GET    | /api/submissions/:id/attempts/:attemptId/recording-url        | Signed read URL              |
| POST   | /api/submissions/:id/attempts/:attemptId/complete-review      | Teacher marks reviewed       |

### Annotations

| Method | Route                                                           | Guard          |
| ------ | --------------------------------------------------------------- | -------------- |
| GET    | /api/submissions/:id/attempts/:attemptId/annotation-markers     | auth           |
| GET    | /api/submissions/:id/attempts/:attemptId/annotations            | auth, paginated|
| POST   | /api/submissions/:id/attempts/:attemptId/annotations            | requireTeacher |
| POST   | /api/submissions/:id/attempts/:attemptId/annotations/batch      | requireTeacher |
| PATCH  | /api/annotations/:annotationId                                  | requireTeacher |
| DELETE | /api/annotations/:annotationId                                  | soft delete    |
| POST   | /api/annotations/:annotationId/voice-note                       | requireTeacher |
| GET    | /api/mistake-categories                                         | auth           |

### Progress

| Method | Route                              | Notes                              |
| ------ | ---------------------------------- | ---------------------------------- |
| GET    | /api/student/progress              | Overall: % complete, pages stats   |
| GET    | /api/student/progress/surahs/:n    | Page-by-page detail for a surah    |
| GET    | /api/student/progress/juz/:n       | Page-by-page detail for a juz      |
| GET    | /api/progress/:studentId           | Teacher/admin view of a student    |
| GET    | /api/progress/:studentId/surahs/:n | Teacher/admin surah drill-down     |
| GET    | /api/progress/:studentId/juz/:n    | Teacher/admin juz drill-down       |

### Media

| Method | Route                    | Notes                             |
| ------ | ------------------------ | --------------------------------- |
| POST   | /api/uploads/signed-url  | Generate upload URL for recording |
| POST   | /api/media/signed-read-url | Generate read URL for playback  |

### Notifications

| Method | Route                              | Notes                    |
| ------ | ---------------------------------- | ------------------------ |
| GET    | /api/notifications                 | List + unread count      |
| POST   | /api/notifications/read-all        | Bulk mark read           |
| POST   | /api/notifications/:id/read        | Single mark read         |
| POST   | /api/devices/register              | Register push token      |
| PATCH  | /api/devices/:id/disable           | Disable push token       |

### Admin

| Method | Route                                          | Guard         |
| ------ | ---------------------------------------------- | ------------- |
| GET    | /api/admin/students/unassigned                 | requireAdmin  |
| GET    | /api/admin/assignment-requests                 | requireAdmin  |
| POST   | /api/admin/assignment-requests/:id/assign-teacher | requireAdmin |
| PATCH  | /api/admin/teacher-student-relationships/:id   | requireAdmin  |
| GET    | /api/admin/teachers                            | requireAdmin  |
| GET    | /api/admin/relationships                       | requireAdmin  |

---

## Mobile Screen Map

### Student (tabs)

| Screen                        | Status | Notes                                                                 |
| ----------------------------- | ------ | --------------------------------------------------------------------- |
| Login / Register              | ✅     |                                                                       |
| Pending assignment            | ✅     | Shown until admin assigns a teacher                                   |
| Assignments tab               | ✅     | Merged with Focus: NEEDS ATTENTION action cards + ALL ASSIGNMENTS list; tab badge counts actionable items |
| Assignment detail             | ✅     | Page image (real 1300×2103 PNG), record button, attempt history       |
| Recitation Room               | ✅     | Immersive dark UI; auto-countdown; pulse rings; waveform bars; review before submit |
| Quran browser                 | ✅     | 604-page scroll; My Pages strip shows assignment status dots per page |
| Quran page view               | ✅     | Full-width Mus'haf image; Recite + Feedback buttons (feedback shown only when teacher reviewed) |
| Student feedback viewer       | ✅     | Read-only annotation canvas; tap dot → detail popup; voice notes; fallback to most-recently-annotated attempt |
| Progress overview             | ✅     | Overall % bar + stats; surah & juz drill-down cards                   |
| Surah / Juz drill-down        | ✅     | Page-by-page status dots tappable to page view                        |
| Attempt history               | ✅     | Past attempts listed on assignment detail; tap to view attempt feedback |
| Notifications inbox           | ✅     | Unread highlight, mark read, mark all read                            |

### Teacher

| Screen                      | Status | Notes                                                          |
| --------------------------- | ------ | -------------------------------------------------------------- |
| Review queue                | ✅     | Pending submissions with attempt # and page info               |
| Review screen               | ✅     | Page image + freehand canvas (zoom/pan) + audio playback + annotation toolbar |
| Annotation modes            | ✅     | Freehand draw; mistake label picker; text note; voice note per mark |
| Mark complete / resubmit    | ✅     | Triggers notification to student; auto-saves pending annotations first |
| Review voice note           | ✅     | Teacher leaves a wrap-up voice message per attempt             |
| Annotation details sheet    | ✅     | Tap any saved mark → see label, note, voice note               |
| Student list (hub)          | ✅     | All assigned students with stats; tap → submission history     |
| Tap-to-word annotation      | ⬜     | Glyph bounds available; word-tap UI not built yet              |

### Admin

| Screen                  | Status | Notes                                           |
| ----------------------- | ------ | ----------------------------------------------- |
| Pending request queue   | ✅     |                                                 |
| Assign teacher          | ✅     | Load/capacity display, full-teacher guard       |
| Relationships list      | ✅     | Activate/deactivate with confirmation           |

---

## Remaining Work

### Next up — Tap-to-Word Annotation
**Goal:** Teachers can tap a specific Arabic word on the page to attach a mistake label, instead of only drawing freehand.

**Mobile files to modify:**
- `mobile/app/(teacher)/review/[submissionId].tsx` — add word-tap mode toggle + word hit detection

**What changes:**
- Add a "Word" mode button to the annotation toolbar (alongside existing freehand/text modes)
- On mount: fetch glyph bounds for the current page from Supabase public bucket
- Scale normalized word bounds (0–1) to canvas pixel coordinates
- In word mode: on tap, find the closest bounding box within a tolerance radius
- Show a bottom sheet: mistake category picker → mistake option picker → optional text note
- On confirm: POST annotation with `anchorType: 'word'`, `wordId`, `verseKey`, `mistakeType`, `mistakeOptionId`

**Endpoints used (all exist):**
- `POST /api/submissions/:id/attempts/:attemptId/annotations`
- `GET /api/mistake-categories`

---

### Remaining — Push Notifications (physical device only)
- Import `expo-notifications`, call `getExpoPushTokenAsync()` after login
- Pass token to `POST /api/devices/register` (backend already implemented)
- Push only works on physical devices — confirm on a real device before shipping

---

## Architecture Notes

### Storage layout (Supabase)
```
student-recordings/{studentId}/{submissionId}/attempts/attempt-NNN.m4a
teacher-voice-notes/{teacherId}/{submissionId}/{attemptId}/{annotationId}.m4a
quran-page-images/mushaf-madani/page-NNN.png         (public bucket)
quran-page-images/mushaf-madani/glyph-bounds.json    (public bucket, 88k words)
```

### Key invariants
- `submissions.current_attempt_id` → always the latest attempt
- `student_page_progress` is the source of truth for page completion — only updated by `completeReview`
- `student_progress_snapshots` is a derived read model — recalculated after every review, never triggers
- Annotation coordinates are normalized 0–1 relative to rendered page dimensions
- All signed URLs are ephemeral — never stored in DB, always generated on demand
- Push is best-effort — in-app `notifications` table is the durable record

### Database connections
- `supabaseAdmin` (service role JWT) — all backend DB operations; bypasses RLS
- `pg` Pool (DATABASE_URL) — removed; no longer required
- Mobile app — Supabase Auth only (JWT issuance/refresh); all data through Express backend

### Phase 24 decisions

| Decision | Reason |
| -------- | ------ |
| Merged Assignments + Focus tab into one screen | Two separate tabs showed the same data from different angles; single screen with NEEDS ATTENTION action cards at top removes duplication without losing either UX pattern |
| `useActionCount` hook drives tab badge | Shares assignment fetch logic; responds to `AppState` changes so badge updates when app returns to foreground without a separate polling loop |
| `getAnnotations` falls back to most-recently-annotated attempt for students | After a teacher annotates attempt N and marks needs-resubmission, the student re-records and `current_attempt_id` advances to N+1. N+1 has no annotations yet; the student would see a blank canvas. Fallback returns the last attempt that has marks so feedback is always visible. Teachers are not affected (no fallback for role=teacher) |
| Quran page images fetched lazily via `fetchImageUrlOnly()` | `getPage()` creates minimal DB rows on first visit; if the row has no `image_url`, it calls the QF API for just `fields=image_url&per_page=1` — lightweight. Result cached in DB on background update |
| `primary_surah_name_english` column (migration 011) backfilled via JS | DDL applied by user in SQL Editor (Supavisor pooler unsupported for this project). Column then backfilled for all 604 rows via static `SURAH_PAGE_STARTS` array in Node script — no Quran.Foundation API calls needed |
| `review_voice_notes` table (migration 009) applied | Enables teacher review-level voice note per attempt (separate from per-annotation voice notes in `annotation_voice_notes`) |
| Recitation Room auto-starts countdown on mount | Student sets phone down before beginning; countdown (3–2–1) gives them time to compose themselves. Uses `Animated.spring` + `Animated.timing` per tick; waveform bars and pulse rings use `Animated.loop` with staggered delays |
