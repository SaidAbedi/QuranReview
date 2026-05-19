-- 005_annotation_voice_note_unique.sql
-- Phase 7 hardening: enforce one active voice note per annotation at the DB level.
-- Soft-deleted voice notes (deleted_at IS NOT NULL) are excluded so a replacement
-- can be added after a voice note is deleted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_annotation_voice_notes_one_per_annotation
  ON annotation_voice_notes (annotation_id)
  WHERE deleted_at IS NULL;
