# Phase Progress Map

## Phase Status

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Project plan, monorepo scaffold, CLAUDE.md | ✅ Complete |
| 1 | DB schema (001_initial_schema.sql) + seed (002_seed_data.sql) | ✅ Complete |
| 2 | Express skeleton, middleware, all route stubs | ✅ Complete |
| 3 | Auth middleware, GET /api/me, PATCH /api/me/profile | ✅ Complete |
| 4 | QuranContentService, 003_add_constraints.sql | ✅ Complete |
| 5 | Assignments, Submissions, Attempts | ⬜ Next |
| 6 | Teacher review flow (mark complete / request resubmission) | ⬜ |
| 7 | Annotations (freehand + tap-to-word) | ⬜ |
| 8 | Progress tracking (student_page_progress + snapshots) | ⬜ |
| 9 | Media — Supabase Storage signed URLs, audio keys | ⬜ |
| 10 | Notifications (DB-first, push best-effort) | ⬜ |
| 11 | Admin assignment management | ⬜ |
| 12 | Mistake feedback (structured mistake_type + options) | ⬜ |
| 13 | React Native mobile app (Expo Dev Client) | ⬜ |
| 14 | Polish, E2E testing, launch prep | ⬜ |

## Route Implementation Map

### ✅ Implemented

| Method | Route | Phase | Auth Guard |
|--------|-------|-------|-----------|
| GET | /health | 2 | none |
| GET | /api/me | 3 | authenticate |
| PATCH | /api/me/profile | 3 | authenticate |
| GET | /api/quran/pages/lookup | 4 | authenticate |
| GET | /api/quran/pages/:pageNumber | 4 | authenticate |
| GET | /api/quran/pages/:pageNumber/content | 4 | authenticate |

### ⬜ Registered + Stubbed (501 if reached past auth)

| Method | Route | Target Phase | Auth Guard |
|--------|-------|-------------|-----------|
| POST | /api/assignments | 5 | authenticate + requireTeacherOrAbove |
| GET | /api/student/assignments | 5 | authenticate |
| GET | /api/teacher/review-queue | 5 | authenticate + requireTeacherOrAbove |
| POST | /api/submissions | 5 | authenticate |
| GET | /api/submissions/:id | 5 | authenticate |
| POST | /api/submissions/:id/attempts | 5 | authenticate |
| POST | /api/attempts/:id/voice-notes | 6 | authenticate + requireTeacherOrAbove |
| PATCH | /api/attempts/:id/review | 6 | authenticate + requireTeacherOrAbove |
| GET | /api/attempts/:id/annotations | 7 | authenticate |
| GET | /api/attempts/:id/annotation-markers | 7 | authenticate |
| POST | /api/attempts/:id/annotations/batch | 7 | authenticate + requireTeacherOrAbove |
| DELETE | /api/annotations/:id | 7 | authenticate + requireTeacherOrAbove |
| GET | /api/mistake-categories | 7 | authenticate |
| GET | /api/student/progress | 8 | authenticate |
| GET | /api/student/progress/surahs/:n | 8 | authenticate |
| GET | /api/student/progress/juz/:n | 8 | authenticate |
| POST | /api/uploads/signed-url | 9 | authenticate |
| POST | /api/media/signed-read-url | 9 | authenticate |
| GET | /api/notifications | 10 | authenticate |
| POST | /api/notifications/:id/read | 10 | authenticate |
| POST | /api/notifications/read-all | 10 | authenticate |
| POST | /api/devices/register | 10 | authenticate |
| PATCH | /api/devices/:id/disable | 10 | authenticate |
| GET | /api/admin/assignment-requests | 11 | authenticate + requireAdmin |
| PATCH | /api/admin/assignment-requests/:id | 11 | authenticate + requireAdmin |
| GET | /api/admin/users | 11 | authenticate + requireAdmin |
| PATCH | /api/admin/users/:id/role | 11 | authenticate + requireSuperAdmin |

## Architecture Decision Log

| Phase | Decision | Reason |
|-------|----------|--------|
| 1 | Circular FK deferred via ALTER TABLE | submissions ↔ submission_attempts mutual reference |
| 1 | Supabase trigger for user row creation | Guarantees public.users exists before any API call |
| 3 | No check-before-insert for assignment requests | Race-safe: partial unique index + 23505 handling |
| 4 | Basic auth placeholder for Quran.Foundation | Auth mechanism (OAuth2/API key/Basic) TBD from docs |
| 4 | ws package for Supabase on Node 18 | No native WebSocket in Node 18; realtime not used server-side |
| 4 | Lazy cache population for Quran pages | Pages cached as viewed; no pre-population job needed |
| All | No DB triggers or cron for progress | Recalculated in service code after review completion (blueprint §5A.3) |
| All | Soft-delete for attempts, annotations, voice notes | Never hard-delete user content |
