-- Migration 008: Add storage_path, width, height to quran_pages
-- storage_path is the object key within the quran-page-images bucket,
-- e.g. "mushaf-madani/page-001.png". Public URL is derived at runtime.
-- width and height (pixels) are populated by the upload script after
-- generating pages with quran.com-images Docker.

ALTER TABLE quran_pages ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE quran_pages ADD COLUMN IF NOT EXISTS width INT;
ALTER TABLE quran_pages ADD COLUMN IF NOT EXISTS height INT;

CREATE INDEX IF NOT EXISTS idx_quran_pages_storage_path
  ON quran_pages (storage_path)
  WHERE storage_path IS NOT NULL;
