# Phase Progress Map

## Phase Status

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Project plan, monorepo scaffold, CLAUDE.md | ✅ Complete |
| 1 | DB schema (001_initial_schema.sql) + seed (002_seed_data.sql) | ✅ Complete |
| 2 | Express skeleton, middleware, all route stubs | ✅ Complete |
| 3 | Auth middleware, GET /api/me, PATCH /api/me/profile | ✅ Complete |
| 4 | QuranContentService, 003_add_constraints.sql | ✅ Complete |
| 5 | Assignments, Submissions, Attempts, Signed URLs | ✅ Complete |
| 6 | Teacher review flow (mark complete / request resubmission) | ✅ Complete |
| 7 | Annotations (freehand + tap-to-word) | ✅ Complete |
| 8 | Progress tracking (student_page_progress + snapshots) | ✅ Complete |
| 9 | Notifications (DB-first, push best-effort) | ✅ Complete |
| 10 | Admin assignment management | ✅ Complete |
| 11 | Mistake feedback (structured mistake_type + options) | ✅ Complete |
| 12 | Mobile foundation — Expo Dev Client, auth, routing | ✅ Complete |
| 13 | Student mobile flow | ✅ Complete |
| 14 | Teacher mobile flow — queue, review, annotations | ✅ Complete |
| 15 | Admin mobile flow — assign queue, relationships | ✅ Complete |
| 16 | Student feedback viewer — read-only annotation canvas | ✅ Complete |
| 17 | Progress drill-down — surah & juz page-by-page | ✅ Complete |
| 18 | Attempt history on assignment detail | ✅ Complete |
| 19 | Teacher hub — student roster + submission history | ✅ Complete |
| 20 | Notifications — unread badge, push token registration | ✅ Complete |
| 21 | Quran Mus'haf browser + self-paced recording flow | ✅ Complete |
| 22 | Annotation UX — zoom/pan, mode separation, auto-save | ✅ Complete |
| 23 | Review voice notes — teacher wrap-up audio per attempt | ✅ Complete |
| 24 | Student UX polish — merged tabs, Recitation Room, image & annotation fixes | ✅ Complete |

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
| POST | /api/assignments | 5 | authenticate + requireTeacherOrAbove |
| GET | /api/teacher/assignments | 5 | authenticate + requireTeacherOrAbove |
| GET | /api/teacher/assignments/:id | 5 | authenticate + requireTeacherOrAbove |
| GET | /api/student/assignments | 5 | authenticate |
| GET | /api/student/assignments/:id | 5 | authenticate |
| GET | /api/teacher/review-queue | 5 | authenticate + requireTeacherOrAbove |
| POST | /api/uploads/signed-url | 5 | authenticate (refresh only — submit via POST /submissions) |
| POST | /api/media/signed-read-url | 5 | authenticate |
| POST | /api/submissions | 5 | authenticate |
| GET | /api/student/submissions | 5 | authenticate |
| GET | /api/teacher/submissions | 5 | authenticate + requireTeacherOrAbove |
| GET | /api/submissions/:id | 5 | authenticate |
| GET | /api/submissions/:id/attempts | 5 | authenticate |
| POST | /api/submissions/:id/attempts | 5 | authenticate |
| GET | /api/submissions/:id/attempts/:aid | 5 | authenticate |
| GET | /api/submissions/:id/attempts/:aid/recording-url | 5 | authenticate |
| POST | /api/submissions/:id/attempts/:aid/complete-review | 6 | authenticate + requireTeacherOrAbove |
| GET | /api/mistake-categories | 7 | authenticate |
| GET | /api/submissions/:id/attempts/:aid/annotation-markers | 7 | authenticate |
| GET | /api/submissions/:id/attempts/:aid/annotations | 7 | authenticate |
| POST | /api/submissions/:id/attempts/:aid/annotations | 7 | authenticate + requireTeacherOrAbove |
| POST | /api/submissions/:id/attempts/:aid/annotations/batch | 7 | authenticate + requireTeacherOrAbove |
| PATCH | /api/annotations/:id | 7 | authenticate + requireTeacherOrAbove |
| DELETE | /api/annotations/:id | 7 | authenticate + requireTeacherOrAbove |
| POST | /api/annotations/:id/voice-note | 7 | authenticate + requireTeacherOrAbove |
| GET | /api/student/progress | 8 | authenticate |
| GET | /api/student/progress/surahs/:n | 8 | authenticate |
| GET | /api/student/progress/juz/:n | 8 | authenticate |
| GET | /api/teacher/students/:id/progress | 8 | authenticate + requireTeacherOrAbove |
| GET | /api/teacher/students/:id/progress/surahs/:n | 8 | authenticate + requireTeacherOrAbove |
| GET | /api/teacher/students/:id/progress/juz/:n | 8 | authenticate + requireTeacherOrAbove |
| GET | /api/admin/students/:id/progress | 8 | authenticate + requireAdmin |
| GET | /api/admin/students/:id/progress/surahs/:n | 8 | authenticate + requireAdmin |
| GET | /api/admin/students/:id/progress/juz/:n | 8 | authenticate + requireAdmin |
| GET | /api/notifications | 9 | authenticate |
| POST | /api/notifications/read-all | 9 | authenticate |
| POST | /api/notifications/:id/read | 9 | authenticate (own only) |
| POST | /api/devices/register | 9 | authenticate |
| PATCH | /api/devices/:id/disable | 9 | authenticate (own only) |

| GET | /api/admin/students/unassigned | 10 | authenticate + requireAdmin |
| GET | /api/admin/assignment-requests | 10 | authenticate + requireAdmin |
| POST | /api/admin/assignment-requests/:id/assign-teacher | 10 | authenticate + requireAdmin |
| PATCH | /api/admin/teacher-student-relationships/:id | 10 | authenticate + requireAdmin |

### ⬜ Registered + Stubbed (501 if reached past auth)

| Method | Route | Target Phase | Auth Guard |
|--------|-------|-------------|-----------|
| GET | /api/admin/users | 10 | authenticate + requireAdmin |
| PATCH | /api/admin/users/:id/role | 10 | authenticate + requireSuperAdmin |

## Architecture Decision Log

| Phase | Decision | Reason |
|-------|----------|--------|
| 1 | Circular FK deferred via ALTER TABLE | submissions ↔ submission_attempts mutual reference |
| 1 | Supabase trigger for user row creation | Guarantees public.users exists before any API call |
| 3 | No check-before-insert for assignment requests | Race-safe: partial unique index + 23505 handling |
| 4 | Basic auth placeholder for Quran.Foundation | Auth mechanism (OAuth2/API key/Basic) TBD from docs |
| 4 | Node 22 required; ws package removed | Node 22 ships native WebSocket; ws workaround no longer needed. engines.node >=22, backend/.nvmrc=22 |
| 4 | Lazy cache population for Quran pages | Pages cached as viewed; no pre-population job needed |
| All | No DB triggers or cron for progress | Recalculated in service code after review completion (blueprint §5A.3) |
| All | Soft-delete for attempts, annotations, voice notes | Never hard-delete user content |
| 5 | Storage key generated server-side after attempt row created | Key uses submissionId + attemptNumber (blueprint §13.1); client never supplies it |
| 5 | Signed upload URL returned from POST /submissions and POST /attempts | Client gets URL from creation response; /uploads/signed-url is a refresh-only endpoint |
| 5 | Teacher read access gated on teacher_student_relationships | Defense-in-depth; deactivating relationship revokes access to existing submissions |
| 6 | completeReview is a single pg transaction | Atomically updates attempt + submission + assignment + progress + notification |
| 6 | assignments.status → 'reviewed' (not 'completed') | Schema constraint; completed state expressed via submission.status = 'completed' |
| 6 | Review queue only shows 'submitted' assignments | 'reviewed' = teacher acted; student re-submission resets assignment to 'submitted' |
| 6 | student_page_progress.completed_at preserved on repeat reviews | CASE expression in ON CONFLICT prevents overwriting a completed_at with NULL |
| 7 | One annotation table for all types | freehand/circle/underline/highlight/note/word_marker/ayah_marker all share quran_annotations; annotation_type discriminates |
| 7 | points column nullable (migration 004) | word_marker/ayah_marker/note annotations carry Quran refs, not stroke data; points = NULL is valid |
| 7 | Max 500 points per annotation, 50 per batch | Validated in service layer before insert (blueprint §17) |
| 7 | /annotation-markers returns no points | Lightweight for timeline UI; full payload only from paginated /annotations |
| 7 | Cursor pagination on /annotations uses created_at | Stable, append-only workload; no need for keyset on id |
| 7 | Annotation writes restricted to role=teacher only | requireTeacher middleware (not requireTeacherOrAbove); admin moderation needs a separate explicit endpoint |
| 7 | batchCreateAnnotations uses pg transaction | Teacher annotation sync must be all-or-nothing; partial saves need recovery UX we haven't designed |
| 7 | DB partial unique index on annotation_voice_notes(annotation_id) WHERE deleted_at IS NULL | Belt-and-suspenders with service check; 23505 → 409 |
| 8 | Live aggregation for getStudentProgress summary; snapshot as cached accelerator | student_page_progress rows ≤604 per student — live count is O(assigned pages), acceptable for MVP |
| 8 | recalculateSnapshot called async after completeReview COMMIT | Snapshot failure must not block the review API response; non-critical read model |
| 8 | surahBreakdown/juzBreakdown in summary uses snapshot JSONB | Avoids a join query on every dashboard load; surah/juz totals grow as quran_page_mappings is populated |
| 8 | getSurahProgress/getJuzProgress always live (pg JOIN) | Snapshot has no page-level detail; live query needed for page list |
| 8 | pagesCompleted counts current status='completed', not completed_at IS NOT NULL | Current state of learning; teacher re-review can change it. completed_at preserved for historical audit |
| 9 | notifications table is source of truth; push deferred | DB row written first (atomically in completeReview tx); push delivery is a future best-effort layer in Phase 12 |
| 9 | read-all route declared before /:id/read | Express matches routes in declaration order; "read-all" would be treated as a notificationId param otherwise |
| 9 | device upsert on (provider, token), reassigns user_id on conflict | Token is the device identity; if re-registered by a new user (device transfer), it belongs to the new user |
| 9 | createNotification internal helper uses supabaseAdmin, not pg | Notifications created outside a transaction use the helper; inside a transaction (completeReview) use direct pg INSERT for atomicity |
| 8 | quran_page_mappings populated at assignment creation (fire-and-forget) | getPageContent(pageNumber, false) called when assignment is created; ensures surah/juz snapshot is non-empty from first review. If QF prefetch fails: assignment creation still succeeds; mapping populates on next GET /api/quran/pages/:n/content call; until then surahBreakdown/juzBreakdown are empty for that page |
| pre-9 | RLS enabled on all 23 application tables (migration 006) | No policies added — RLS + zero policies = deny all for anon/authenticated. Service role (supabaseAdmin) and postgres superuser (pg Pool) bypass RLS. Auth trigger is SECURITY DEFINER (bypasses RLS). Storage buckets set to private; signed URLs verified at storage API layer, independent of RLS |
| 10 | assignTeacher uses pg transaction with SELECT FOR UPDATE lock | Prevents concurrent admin assigns racing on the same request; lock acquired before any mutation |
| 10 | teacher_student_relationships upserted (not inserted) | ON CONFLICT (teacher_id, student_id) DO UPDATE SET status='active' — reactivates if previously deactivated without creating duplicates |
| 10 | Notifications fire after COMMIT, not inside transaction | Non-critical; notification failure must not roll back the assignment. Fire-and-forget .catch() logs but does not surface to caller |
| 10 | updateTeacherStudentRelationship accepts _updatedBy but cannot store it | teacher_student_relationships has no updated_by column; param accepted for API compatibility, prefixed _ to suppress unused-var warning |
| 10 | Relationship status CHECK: active, inactive, pending only | 'paused', 'ended', 'archived' require a schema migration before use; zod schema enforces the same constraint at the API layer |
| 10 | assignTeacher request-state guards moved inside transaction | All status checks now happen after the FOR UPDATE lock — no pre-flight/lock race window; missing row → 404, not 500 |
| 10 | Relationship status notifications fire-and-forget | inactive → relationship_deactivated to student; active → relationship_reactivated to student; no notification for pending |
| 10 | migration 007 extends notifications.type CHECK | Added relationship_deactivated and relationship_reactivated; ALTER TABLE DROP + ADD CONSTRAINT is the only way to change a pg CHECK |
| 11 | annotations.mistake_option_id validated before write | mistakeFeedbackService.validateAndGetOptionDetail checks option exists, is active, and category code matches mistakeType; throws 422 |
| 11 | Annotation responses include mistakeOptionDetail (enriched) | Supabase nested join mistake_options!mistake_option_id → mistake_categories!category_id for Supabase queries; post-transaction batch lookup for pg batchCreateAnnotations |
| 11 | GET /mistake-categories unchanged (already complete) | Categories + options always read from DB; seeded in 002_seed_data.sql; labels editable without code deploy |
