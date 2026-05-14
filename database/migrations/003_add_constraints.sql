-- ============================================================
-- 003_add_constraints.sql
-- Two constraint additions needed before Phase 4 service logic runs.
-- ============================================================

-- ============================================================
-- 1. Prevent duplicate active assignment requests per student
--
-- A student should only have one pending_assignment row and one
-- assigned row at a time. These partial unique indexes enforce
-- that at the DB level, so concurrent calls to GET /api/me
-- cannot race to create two pending rows for the same student.
--
-- Terminal states (waitlisted, declined, archived) are excluded
-- so a student who was declined can later receive a new request.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_one_pending_request
  ON student_assignment_requests(student_id)
  WHERE status = 'pending_assignment';

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_one_assigned_request
  ON student_assignment_requests(student_id)
  WHERE status = 'assigned';

-- ============================================================
-- 2. Unique constraint on quran_page_mappings(quran_page_id, surah_number)
--
-- Each (page, surah) pair should appear at most once per mushaf.
-- A page can span multiple surahs (one row per surah per page),
-- and a surah can span multiple pages (one row per page per surah),
-- but no (page_id, surah_number) combination should repeat.
--
-- This constraint is required for QuranContentService upserts so
-- that re-fetching from Quran.Foundation updates existing rows
-- rather than inserting duplicates.
-- ============================================================

ALTER TABLE quran_page_mappings
  ADD CONSTRAINT uq_quran_page_mapping_page_surah
  UNIQUE (quran_page_id, surah_number);
