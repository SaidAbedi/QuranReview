-- Migration 010: Add assignment_type to assignments
-- Distinguishes teacher-assigned pages from student-initiated self-paced recitations.
-- Defaults to 'teacher_assigned' so all existing rows are unaffected.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'teacher_assigned'
  CHECK (assignment_type IN ('teacher_assigned', 'self_paced'));

CREATE INDEX IF NOT EXISTS idx_assignments_assignment_type
  ON assignments (assignment_type);

CREATE INDEX IF NOT EXISTS idx_assignments_student_self_paced
  ON assignments (student_id, assignment_type, status)
  WHERE assignment_type = 'self_paced';
