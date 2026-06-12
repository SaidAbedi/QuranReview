-- 009_review_voice_notes.sql
-- One review-level voice note per submission attempt.
-- Lets the teacher leave a wrap-up message after annotating, separate from per-mark notes.
-- Storage path: teacher-voice-notes/{teacherId}/{submissionId}/{attemptId}/review.m4a

CREATE TABLE IF NOT EXISTS review_voice_notes (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_attempt_id UUID         NOT NULL REFERENCES submission_attempts(id),
  teacher_id            UUID         NOT NULL REFERENCES users(id),
  audio_storage_key     TEXT         NOT NULL,
  duration_ms           INTEGER,
  content_type          TEXT,
  size_bytes            INTEGER,
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID         REFERENCES users(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- One active review voice note per attempt (soft-deleted rows are excluded).
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_voice_notes_one_per_attempt
  ON review_voice_notes (submission_attempt_id)
  WHERE deleted_at IS NULL;

-- RLS enabled with zero policies — only service_role (backend) may read/write.
ALTER TABLE review_voice_notes ENABLE ROW LEVEL SECURITY;
