# Phase Progress Map

Tracks actual implementation status across backend, mobile, and remaining work.
Last updated: 2026-06-06 (Phase 16 complete)

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
| 17    | Progress drill-down — surah & juz page-by-page       | ⬜     |
| 18    | Attempt history on assignment detail                 | ⬜     |
| 19    | Teacher student roster + student history             | ⬜     |
| 20    | Push notifications — Expo token registration         | ⬜     |
| 21    | Tap-to-word annotation (teacher review screen)       | ⬜     |

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
| **Annotation viewer**   | ✅     | View Feedback button → read-only canvas + callout list |
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

## Remaining Phases — Detail

### Phase 16 — Student Feedback Viewer ⬜
**Goal:** Close the core feedback loop — students can see teacher annotations on their attempt.

**Mobile files to create:**
- `mobile/app/assignments/[id]/feedback/[attemptId].tsx` — main viewer screen
- `mobile/src/api/annotations.ts` — API calls for annotations + markers

**Mobile files to modify:**
- `mobile/app/assignments/[id]/index.tsx` — add "View Feedback" button when status = `reviewed | completed | needs_resubmission`

**What the screen does:**
- Renders the Quran page image at full width (same as teacher review)
- Fetches paginated annotations via `GET /api/submissions/:id/attempts/:attemptId/annotations`
- Overlays each annotation stroke using normalized coordinates (0–1 → canvas pixels)
- Shows mistake labels and note text as callouts on the canvas
- Lists voice notes below the canvas; tapping fetches a signed URL and plays back audio
- Read-only — no drawing tools

**Endpoints used (all exist):**
- `GET /api/submissions/:id/attempts/:attemptId/annotations`
- `GET /api/submissions/:id/attempts/:attemptId/annotation-markers`
- `POST /api/media/signed-read-url` (for voice note playback)
- `GET /api/quran/pages/:pageNumber` (page image + dimensions)

---

### Phase 17 — Progress Drill-Down ⬜
**Goal:** Students can tap into any surah or juz to see page-by-page status.

**Mobile files to create:**
- `mobile/app/(tabs)/progress/surah/[surahNumber].tsx`
- `mobile/app/(tabs)/progress/juz/[juzNumber].tsx`
- `mobile/src/api/progress.ts` — add `getSurahProgress()` and `getJuzProgress()`

**Mobile files to modify:**
- `mobile/app/(tabs)/progress.tsx` — add surah/juz breakdown section with tappable cards (use snapshot data from existing `/api/student/progress` response)

**What changes:**
- Progress screen gets two collapsible sections: "By Surah" and "By Juz"
- Each card shows surah/juz name, pages completed / total, a mini progress bar
- Tapping navigates to the detail screen showing every page as a status dot (not started / submitted / needs revision / completed)

**Endpoints used (all exist):**
- `GET /api/student/progress` (already called — `surahBreakdown` and `juzBreakdown` fields)
- `GET /api/student/progress/surahs/:n`
- `GET /api/student/progress/juz/:n`

---

### Phase 18 — Attempt History ⬜
**Goal:** Students can see all past attempts for an assignment, not just the current one.

**Mobile files to modify:**
- `mobile/app/assignments/[id]/index.tsx` — add attempt history list below current attempt card

**What changes:**
- After the current attempt status card, show a "Previous Attempts" section
- Each row: "Attempt #N · date · status badge"
- Tapping a completed/reviewed attempt navigates to the Phase 16 feedback viewer for that specific attempt
- Calls `GET /api/submissions/:submissionId/attempts` (already exists)

---

### Phase 19 — Teacher Student Roster ⬜
**Goal:** Teachers can see all their assigned students and each student's submission history.

**Backend files to create/modify:**
- `backend/src/routes/assignments.ts` — add `GET /api/teacher/students`
- `backend/src/services/AssignmentService.ts` — add `getTeacherStudents()` method

**What the new endpoint returns:**
```typescript
// GET /api/teacher/students
[{
  studentId, displayName, email,
  pagesAssigned, pagesCompleted,      // from student_page_progress
  lastSubmittedAt,                    // most recent submission.submitted_at
  activeAssignmentCount,
}]
```

**Mobile files to create:**
- `mobile/app/(teacher)/students.tsx` — roster list screen
- `mobile/app/(teacher)/students/[studentId].tsx` — student detail: their assignments + submission statuses

**Mobile files to modify:**
- `mobile/app/(teacher)/_layout.tsx` — add "Students" header button (alongside Sign Out)

---

### Phase 20 — Push Notifications ⬜
**Goal:** Teachers get a lock-screen notification when a student submits; students get notified when teacher reviews.

**Mobile files to modify:**
- `mobile/app/_layout.tsx` — on post-login, request push permissions and call `POST /api/devices/register`
- `mobile/src/api/notifications.ts` — add `registerDevice(token)` call

**Backend — already done:**
- `POST /api/devices/register` route exists
- `NotificationService.sendPushNotification()` exists
- DB table `push_device_tokens` exists

**What's needed:**
- Import `expo-notifications`, call `getExpoPushTokenAsync()` after login
- Pass token to `POST /api/devices/register`
- Backend `createNotification()` already calls `sendPushNotification()` — tokens just need to be in the DB

**Note:** Push only works on physical devices, not simulators. Test on a real device.

---

### Phase 21 — Tap-to-Word Annotation ⬜
**Goal:** Teachers can tap a specific Arabic word on the page to attach a mistake label, instead of only drawing freehand.

**Mobile files to modify:**
- `mobile/app/(teacher)/review/[submissionId].tsx` — add word-tap mode toggle + word hit detection

**What changes:**
- Add a "Word" mode button to the annotation toolbar (alongside existing freehand/text modes)
- On mount: fetch `quran-page-images/mushaf-madani/glyph-bounds.json` from public URL, filter to current page
- Scale normalized word bounds (0–1) to canvas pixel coordinates
- In word mode: on tap, find the closest bounding box within a tolerance radius
- Show a bottom sheet: mistake category picker → mistake option picker → optional text note
- On confirm: POST annotation with `anchorType: 'word'`, `wordId`, `verseKey`, `mistakeType`, `mistakeOptionId`

**Endpoints used (all exist):**
- `POST /api/submissions/:id/attempts/:attemptId/annotations`
- `GET /api/mistake-categories`
- Glyph bounds JSON from public Supabase storage URL

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
