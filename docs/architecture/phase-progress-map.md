# Phase Progress Map

Tracks actual implementation status across backend, mobile, and remaining work.
Last updated: 2026-06-06

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

| Screen                  | Status | Notes                                              |
| ----------------------- | ------ | -------------------------------------------------- |
| Login / Register        | ✅     |                                                    |
| Pending assignment      | ✅     | Shown until admin assigns a teacher                |
| Assignments list        | ✅     | Status badges, relative dates                      |
| Assignment detail       | ✅     | Page image (real 1300×2103 PNG), record button     |
| Record & upload audio   | ✅     | expo-audio, signed URL upload                      |
| Progress overview       | ✅     | Overall % bar + assigned/completed/revision stats  |
| Notifications inbox     | ✅     | Unread highlight, mark read, mark all read         |
| **Annotation viewer**   | 🔵     | Student can't see teacher marks on their attempt   |
| **Surah/Juz drill-down**| 🔵     | Progress screen has no tappable breakdown          |
| **Attempt history**     | 🔵     | Only current attempt shown on assignment detail    |

### Teacher

| Screen                      | Status | Notes                                             |
| --------------------------- | ------ | ------------------------------------------------- |
| Review queue                | ✅     | Pending submissions with attempt # and page info  |
| Review screen               | ✅     | Page image + freehand canvas + audio playback     |
| Mark complete / resubmit    | ✅     | Triggers notification to student                  |
| **Student list**            | 🔵     | No screen to see all assigned students or history |
| **Tap-to-word annotation**  | 🔵     | Glyph bounds uploaded; UI not built yet           |

### Admin

| Screen                  | Status | Notes                                           |
| ----------------------- | ------ | ----------------------------------------------- |
| Pending request queue   | ✅     |                                                 |
| Assign teacher          | ✅     | Load/capacity display, full-teacher guard       |
| Relationships list      | ✅     | Activate/deactivate with confirmation           |

---

## Remaining Work — Prioritised

### P1 — Core feedback loop (students can't see their feedback)

**Student annotation viewer**
- New screen: `assignments/[id]/feedback/[attemptId].tsx`
- Renders the Quran page image with teacher's annotation strokes overlaid
- Uses existing `GET /annotations` (paginated) + `GET /annotation-markers` endpoints
- Plays back teacher voice notes via `GET /media/signed-read-url`
- Reuses the normalized-coordinate rendering logic already in the teacher review canvas
- Entry point: "View Feedback" button on assignment detail when status = `reviewed` | `completed` | `needs_resubmission`

### P2 — Progress drill-down (backend exists, UI missing)

**Surah & Juz breakdown in progress screen**
- Add tappable surah/juz cards to the existing progress screen
- New screen: `progress/surah/[surahNumber].tsx` — page list with status dots
- New screen: `progress/juz/[juzNumber].tsx` — same pattern
- Calls `GET /api/student/progress/surahs/:n` and `/juz/:n`

### P3 — Attempt history (backend exists, UI missing)

**Attempt history on assignment detail**
- Show a list of all past attempts (attempt #, date, status) below the current attempt
- Calls existing `GET /submissions/:id/attempts`
- Each row navigable to the feedback viewer for that specific attempt

### P4 — Teacher student list

**Teacher's student roster**
- New screen in `(teacher)/` — lists all active students assigned to this teacher
- Shows student name, page progress summary, last submission date
- Tapping opens a student's submission history
- Requires one new backend endpoint: `GET /api/teacher/students` (list with basic progress)

### P5 — Push notifications

**Register Expo push tokens**
- On app launch (post-login), call `POST /api/devices/register` with the Expo token
- The `NotificationService.sendPushNotification()` method already exists — just needs tokens populated
- Test with a real device (simulators don't receive push)

### P6 — Tap-to-word annotation (teacher)

**Word selection in review screen**
- Load `glyph-bounds.json` from the public bucket on review screen mount
- Filter to the current page's word bounds
- Map normalized coordinates back to canvas pixels
- On tap: find the nearest word bounding box, create an annotation with `anchorType: 'word'`
- Show a quick-label picker (mistake categories) after word selection

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
