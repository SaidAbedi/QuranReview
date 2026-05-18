-- 004_update_annotation_types.sql
-- Phase 7: update annotation_type CHECK to add note/word_marker/ayah_marker,
-- remove box/word_select. Also allow points to be NULL for non-drawing types.

-- Drop the old CHECK constraint by recreating it.
-- PostgreSQL does not support ALTER TABLE ... ALTER CONSTRAINT for CHECK constraints,
-- so we drop and re-add.
ALTER TABLE annotations
  DROP CONSTRAINT IF EXISTS annotations_annotation_type_check;

ALTER TABLE annotations
  ADD CONSTRAINT annotations_annotation_type_check CHECK (
    annotation_type IN (
      'freehand', 'circle', 'underline', 'highlight',
      'note', 'word_marker', 'ayah_marker'
    )
  );

-- Allow points to be NULL: word_marker/ayah_marker/note annotations have no stroke data.
ALTER TABLE annotations
  ALTER COLUMN points DROP NOT NULL;
