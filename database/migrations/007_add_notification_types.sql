-- Migration 007: Add relationship status notification types
--
-- Extends the notifications.type CHECK constraint to include two new types
-- introduced in Phase 10 for teacher-student relationship status changes:
--   relationship_deactivated — fired when a relationship is set to inactive
--   relationship_reactivated — fired when a relationship is set back to active
--
-- Postgres does not support ALTER CONSTRAINT; the only way to change a CHECK
-- constraint is to DROP the old one and ADD the new one in the same transaction.

BEGIN;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'student_submitted_attempt',
      'teacher_completed_review',
      'teacher_requested_resubmission',
      'admin_assigned_teacher',
      'student_assigned_to_teacher',
      'relationship_deactivated',
      'relationship_reactivated',
      'voice_note_added',
      'attempt_comment_added'
    )
  );

COMMIT;
