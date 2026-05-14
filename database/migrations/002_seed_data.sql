-- ============================================================
-- 002_seed_data.sql
-- QuranReview MVP — Safe Seed Data
--
-- Production-safe sections:
--   Section 1 — Mistake categories and options
--   Section 2 — Quran provider config
--
-- Local / dev-only section (approximate data, overwritten in Phase 4):
--   Section 3 — Sample Quran content (Surah 1, Juz 1, Page 1)
--
-- NO auth.users rows are created here.
-- Test users must be created via Supabase Auth (dashboard, CLI,
-- or supabase.auth.signUp). The handle_new_auth_user trigger will
-- auto-create their public.users row with role = 'student'.
-- Role upgrades (teacher/admin/super_admin) are done via backend API.
-- ============================================================

-- ============================================================
-- SECTION 1: Mistake Categories and Options
-- These drive the QuickMistakeOptionSheet in teacher review.
-- Idempotent: upserts on code (categories) or (category_id, code) (options).
-- ============================================================

DO $$
DECLARE
  v_tajweed_id      UUID;
  v_harakat_id      UUID;
  v_wrong_word_id   UUID;
  v_wrong_ayah_id   UUID;
  v_makhraj_id      UUID;
  v_madd_id         UUID;
  v_ghunnah_id      UUID;
  v_waqf_id         UUID;
  v_memorization_id UUID;
  v_pronunciation_id UUID;
  v_other_id        UUID;
BEGIN

  -- ---- Categories ----
  -- ON CONFLICT DO UPDATE ensures RETURNING id always fires (insert or upsert).

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('tajweed', 'Tajweed', 'Rules of Quranic recitation', 1)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_tajweed_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('harakat', 'Harakat', 'Vowel marks and diacritics', 2)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_harakat_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('wrong_word', 'Wrong Word', 'Incorrect, skipped, or added word', 3)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_wrong_word_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('wrong_ayah', 'Wrong Ayah', 'Repeated, skipped, or continued from wrong place', 4)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_wrong_ayah_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('makhraj', 'Makhraj', 'Point of articulation of letters', 5)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_makhraj_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('madd', 'Madd', 'Elongation rules', 6)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_madd_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('ghunnah', 'Ghunnah', 'Nasalization rules', 7)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_ghunnah_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('waqf', 'Waqf', 'Stopping and pausing rules', 8)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_waqf_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('memorization', 'Memorization', 'Memory and recall errors', 9)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_memorization_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('pronunciation', 'Pronunciation', 'General pronunciation issues', 10)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_pronunciation_id;

  INSERT INTO mistake_categories (code, label, description, sort_order)
    VALUES ('other', 'Other', 'Other uncategorized issues', 11)
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_other_id;

  -- ---- Options ----

  -- Tajweed
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_tajweed_id, 'madd_issue',     'Madd issue',           1),
    (v_tajweed_id, 'ghunnah_issue',  'Ghunnah issue',        2),
    (v_tajweed_id, 'ikhfa_idgham',   'Ikhfa / Idgham issue', 3),
    (v_tajweed_id, 'qalqalah_issue', 'Qalqalah issue',       4)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Harakat
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_harakat_id, 'wrong_vowel',   'Wrong vowel',   1),
    (v_harakat_id, 'missing_vowel', 'Missing vowel', 2),
    (v_harakat_id, 'extra_vowel',   'Extra vowel',   3)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Wrong Word
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_wrong_word_id, 'replaced_word', 'Replaced word', 1),
    (v_wrong_word_id, 'skipped_word',  'Skipped word',  2),
    (v_wrong_word_id, 'added_word',    'Added word',    3)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Wrong Ayah
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_wrong_ayah_id, 'repeated_ayah',      'Repeated ayah',              1),
    (v_wrong_ayah_id, 'skipped_ayah',       'Skipped ayah',               2),
    (v_wrong_ayah_id, 'wrong_continuation', 'Continued from wrong place', 3)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Makhraj
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_makhraj_id, 'letter_confusion', 'Letter confusion',     1),
    (v_makhraj_id, 'unclear_letter',   'Unclear letter sound', 2)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Madd
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_madd_id, 'madd_too_short', 'Madd too short',    1),
    (v_madd_id, 'madd_too_long',  'Madd too long',     2),
    (v_madd_id, 'madd_missing',   'Madd not applied',  3)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Ghunnah
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_ghunnah_id, 'ghunnah_missing', 'Ghunnah not applied', 1),
    (v_ghunnah_id, 'ghunnah_weak',    'Ghunnah too weak',    2)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Waqf
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_waqf_id, 'stopped_incorrectly', 'Stopped incorrectly', 1),
    (v_waqf_id, 'did_not_stop',        'Did not stop',        2),
    (v_waqf_id, 'started_incorrectly', 'Started incorrectly', 3)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Memorization
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_memorization_id, 'forgot_ayah',     'Forgot ayah',     1),
    (v_memorization_id, 'wrong_order',     'Wrong order',     2),
    (v_memorization_id, 'long_hesitation', 'Long hesitation', 3)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Pronunciation
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_pronunciation_id, 'unclear_pronunciation', 'Unclear pronunciation', 1),
    (v_pronunciation_id, 'accent_issue',          'Accent issue',          2)
  ON CONFLICT (category_id, code) DO NOTHING;

  -- Other
  INSERT INTO mistake_options (category_id, code, label, sort_order) VALUES
    (v_other_id, 'other_issue', 'Other issue', 1)
  ON CONFLICT (category_id, code) DO NOTHING;

END $$;

-- ============================================================
-- SECTION 2: Quran Provider Config
-- One active row for Quran.Foundation / QCF V2 Mushaf.
-- quran_provider_resources has no unique constraint, so we
-- guard with WHERE NOT EXISTS.
-- ============================================================

INSERT INTO quran_provider_resources (
  provider, provider_version, default_mushaf_id, default_mushaf_name, api_base_url, is_active
)
SELECT
  'quran_foundation', 'v4', 1, 'QCF V2',
  'https://apis.quran.foundation/content/api/v4', true
WHERE NOT EXISTS (
  SELECT 1 FROM quran_provider_resources
  WHERE provider = 'quran_foundation' AND default_mushaf_id = 1 AND is_active = true
);

-- ============================================================
-- SECTION 3: Sample Quran Content — Page 1 / Al-Fatiha
-- DEV/LOCAL ONLY. This is approximate data to allow local
-- testing before Phase 4 (QuranContentService) populates real
-- data from the Quran.Foundation API.
-- The QuranContentService will upsert the real payload and
-- overwrite these rows. Do not rely on this data in production.
-- ============================================================

-- Surah 1: Al-Fatiha
INSERT INTO surahs (surah_number, name_arabic, name_english, total_ayahs)
VALUES (1, 'الفاتحة', 'The Opening', 7)
ON CONFLICT (surah_number) DO NOTHING;

-- Juz 1
INSERT INTO juzs (juz_number)
VALUES (1)
ON CONFLICT (juz_number) DO NOTHING;

-- Quran page 1 (QCF V2)
-- image_url is null; populated by QuranContentService in Phase 4.
INSERT INTO quran_pages (provider, provider_mushaf_id, mushaf_id, page_number)
VALUES ('quran_foundation', 1, 'qcf_v2', 1)
ON CONFLICT (provider, provider_mushaf_id, page_number) DO NOTHING;

-- Page mapping: page 1 → Surah 1, Juz 1, verses 1:1–1:7
-- Approximate. Phase 4 overwrites with real Quran.Foundation payload.
DO $$
DECLARE
  v_page_id UUID;
BEGIN
  SELECT id INTO v_page_id
  FROM quran_pages
  WHERE provider = 'quran_foundation'
    AND provider_mushaf_id = 1
    AND page_number = 1;

  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'quran_pages row for page 1 not found — run this file after 001_initial_schema.sql';
  END IF;

  INSERT INTO quran_page_mappings (
    quran_page_id,
    provider,
    provider_mushaf_id,
    page_number,
    surah_number,
    juz_number,
    starts_at_ayah,
    ends_at_ayah,
    first_verse_key,
    last_verse_key,
    first_verse_id,
    last_verse_id,
    verses_count,
    source_payload
  )
  SELECT
    v_page_id,
    'quran_foundation',
    1,
    1,    -- page_number
    1,    -- surah_number
    1,    -- juz_number
    1,    -- starts_at_ayah
    7,    -- ends_at_ayah
    '1:1',
    '1:7',
    1,
    7,
    7,
    '{"note": "approximate seed data — overwritten by QuranContentService in Phase 4"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM quran_page_mappings
    WHERE quran_page_id = v_page_id AND surah_number = 1
  );
END $$;
