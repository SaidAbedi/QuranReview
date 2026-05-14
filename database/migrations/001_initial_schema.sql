-- ============================================================
-- 001_initial_schema.sql
-- QuranReview MVP — Initial Database Schema
--
-- Apply via Supabase SQL Editor or:
--   supabase db push
--
-- Table creation order is intentional — dependencies are
-- resolved bottom-up; circular FKs (submissions ↔
-- submission_attempts) are resolved with deferred ALTER TABLE
-- statements in Section 4.
-- ============================================================

-- ============================================================
-- SECTION 1: Standalone / Foundation Tables
-- ============================================================

-- users
-- id is linked to Supabase Auth via the trigger in Section 7.
-- All other tables reference this table, not auth.users directly.
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin', 'super_admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mistake_categories
-- Seeded lookup table; drives QuickMistakeOptionSheet in teacher review flow.
CREATE TABLE IF NOT EXISTS mistake_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS surahs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surah_number INT NOT NULL UNIQUE CHECK (surah_number BETWEEN 1 AND 114),
  name_arabic  TEXT NOT NULL,
  name_english TEXT,
  total_ayahs  INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS juzs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  juz_number INT NOT NULL UNIQUE CHECK (juz_number BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quran_provider_resources
-- One row per active Quran content provider config.
CREATE TABLE IF NOT EXISTS quran_provider_resources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL DEFAULT 'quran_foundation',
  provider_version    TEXT,
  default_mushaf_id   INT NOT NULL DEFAULT 1,
  default_mushaf_name TEXT NOT NULL DEFAULT 'QCF V2',
  api_base_url        TEXT NOT NULL DEFAULT 'https://apis.quran.foundation/content/api/v4',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quran_pages
-- One row per page per mushaf. MVP uses Mushaf ID 1 / QCF V2 (604 pages).
CREATE TABLE IF NOT EXISTS quran_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL DEFAULT 'quran_foundation',
  provider_mushaf_id INT NOT NULL DEFAULT 1,
  mushaf_id         TEXT NOT NULL DEFAULT 'qcf_v2',
  page_number       INT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  image_url         TEXT,
  width             INT,
  height            INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_mushaf_id, page_number)
);

-- subscription_plans
-- Stripe-ready; is_active=false keeps all plans hidden in MVP UI.
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'stripe',
  provider_price_id TEXT,
  amount_cents      INT,
  currency          TEXT DEFAULT 'usd',
  interval          TEXT CHECK (interval IN ('month', 'year')),
  is_active         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: User-Dependent Tables
-- ============================================================

-- user_profiles
-- App-specific profile metadata beyond Supabase Auth fields.
CREATE TABLE IF NOT EXISTS user_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_language  TEXT,
  timezone            TEXT,
  student_age_group   TEXT,
  teacher_capacity    INT,
  teacher_current_load INT NOT NULL DEFAULT 0,
  onboarding_status   TEXT NOT NULL DEFAULT 'new' CHECK (
    onboarding_status IN ('new', 'pending_assignment', 'active', 'inactive')
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- device_tokens
-- Expo push tokens; used for best-effort push notification delivery.
CREATE TABLE IF NOT EXISTS device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL DEFAULT 'expo' CHECK (provider IN ('expo', 'fcm', 'apns')),
  token        TEXT NOT NULL,
  platform     TEXT CHECK (platform IN ('ios', 'android', 'web')),
  device_id    TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, token)
);

-- notifications
-- Source of truth for all in-app notifications. Push delivery is best-effort.
CREATE TABLE IF NOT EXISTS notifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id      UUID REFERENCES users(id),
  type               TEXT NOT NULL CHECK (
    type IN (
      'student_submitted_attempt',
      'teacher_completed_review',
      'teacher_requested_resubmission',
      'admin_assigned_teacher',
      'student_assigned_to_teacher',
      'voice_note_added',
      'attempt_comment_added'
    )
  ),
  title              TEXT NOT NULL,
  body               TEXT,
  data               JSONB NOT NULL DEFAULT '{}',
  channel            TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'push', 'email')),
  read_at            TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  delivery_status    TEXT NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'sent', 'failed', 'skipped')
  ),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- student_assignment_requests
-- Created on student signup. Admin assigns teacher; no auto-assignment in MVP.
CREATE TABLE IF NOT EXISTS student_assignment_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_teacher_id UUID REFERENCES users(id),
  assigned_teacher_id  UUID REFERENCES users(id),
  assigned_by          UUID REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'pending_assignment' CHECK (
    status IN ('pending_assignment', 'assigned', 'waitlisted', 'declined', 'archived')
  ),
  notes               TEXT,
  assigned_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_student_relationships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id),
  student_id UUID NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, student_id)
);

-- payment_customers
-- Stripe customer IDs. Hidden in MVP UI; tables present for future use.
CREATE TABLE IF NOT EXISTS payment_customers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  provider             TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id),
  plan_id                  UUID REFERENCES subscription_plans(id),
  provider                 TEXT NOT NULL DEFAULT 'stripe',
  provider_subscription_id TEXT,
  status                   TEXT NOT NULL DEFAULT 'inactive' CHECK (
    status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled')
  ),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 3: Quran Content Tables
-- ============================================================

-- quran_page_mappings
-- Cached Quran.Foundation page→surah/juz mappings; never fetched from mobile directly.
CREATE TABLE IF NOT EXISTS quran_page_mappings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quran_page_id      UUID NOT NULL REFERENCES quran_pages(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'quran_foundation',
  provider_mushaf_id INT NOT NULL DEFAULT 1,
  page_number        INT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  surah_number       INT NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
  juz_number         INT NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  starts_at_ayah     INT,
  ends_at_ayah       INT,
  first_verse_key    TEXT,
  last_verse_key     TEXT,
  first_verse_id     INT,
  last_verse_id      INT,
  verses_count       INT,
  source_payload     JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 4: Assignment / Submission Core
-- (Circular FK between submissions ↔ submission_attempts is
--  resolved with ALTER TABLE statements at the end of this section.)
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID NOT NULL REFERENCES users(id),
  student_id   UUID NOT NULL REFERENCES users(id),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id),
  title        TEXT,
  instructions TEXT,
  due_at       TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'assigned' CHECK (
    status IN ('assigned', 'submitted', 'reviewed', 'archived')
  ),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mistake_options
-- Quick labels under each mistake_category.
CREATE TABLE IF NOT EXISTS mistake_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES mistake_categories(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, code)
);

-- submissions
-- current_attempt_id is intentionally left without a FK here.
-- The FK is added below after submission_attempts is created.
CREATE TABLE IF NOT EXISTS submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      UUID NOT NULL REFERENCES assignments(id),
  student_id         UUID NOT NULL REFERENCES users(id),
  quran_page_id      UUID NOT NULL REFERENCES quran_pages(id),
  current_attempt_id UUID,
  -- ^ Nullable on creation. Set transactionally after first attempt is inserted.
  status             TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('draft', 'submitted', 'in_review', 'reviewed', 'needs_resubmission', 'completed')
  ),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Required for the composite FK on submission_attempts below.
-- (id is already PK; this allows a 3-column FK from submission_attempts.)
ALTER TABLE submissions
ADD CONSTRAINT uq_submissions_id_student_page
UNIQUE (id, student_id, quran_page_id);

-- submission_attempts
-- Each row is one recording attempt. Never overwrite; create a new row per attempt.
CREATE TABLE IF NOT EXISTS submission_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES users(id),
  quran_page_id         UUID NOT NULL REFERENCES quran_pages(id),
  attempt_number        INT NOT NULL,
  recording_storage_key TEXT NOT NULL,
  -- ^ Stable object-storage key (e.g. student-recordings/.../attempt-001.m4a).
  --   Never store a signed URL here.
  recording_duration_ms INT,
  original_file_name    TEXT,
  content_type          TEXT,
  size_bytes            BIGINT,
  status                TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'in_review', 'reviewed', 'needs_resubmission', 'completed', 'archived')
  ),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID REFERENCES users(id),
  delete_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, attempt_number)
);

-- Composite integrity: prevents a submission_attempt from being linked to a
-- submission that belongs to a different student or Quran page.
ALTER TABLE submission_attempts
ADD CONSTRAINT fk_attempt_submission_student_page
FOREIGN KEY (submission_id, student_id, quran_page_id)
REFERENCES submissions(id, student_id, quran_page_id);

-- Now safe to add: closes the circular reference from submissions → submission_attempts.
ALTER TABLE submissions
ADD CONSTRAINT fk_submissions_current_attempt
FOREIGN KEY (current_attempt_id) REFERENCES submission_attempts(id);

-- ============================================================
-- SECTION 5: Annotation Tables
-- ============================================================

-- annotations
-- Freehand and tap-to-word annotations made by teachers during review.
-- points uses normalized 0–1 coordinates relative to rendered page dimensions.
-- Full path data is only returned from the paginated /annotations endpoint,
-- NOT from submission summaries or list endpoints.
CREATE TABLE IF NOT EXISTS annotations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  submission_attempt_id UUID NOT NULL REFERENCES submission_attempts(id) ON DELETE CASCADE,
  teacher_id            UUID NOT NULL REFERENCES users(id),
  quran_page_id         UUID NOT NULL REFERENCES quran_pages(id),

  annotation_type TEXT NOT NULL CHECK (
    annotation_type IN ('freehand', 'circle', 'underline', 'box', 'highlight', 'word_select')
  ),
  anchor_type TEXT NOT NULL DEFAULT 'page_region' CHECK (
    anchor_type IN ('page_region', 'word', 'ayah', 'line')
  ),

  -- Semantic Quran anchor (populated for tap-to-word annotations)
  verse_key     TEXT,
  word_id       INT,
  word_position INT,
  line_number   INT,

  -- Quick mistake feedback (structured, not only free text)
  mistake_type TEXT CHECK (
    mistake_type IN (
      'tajweed', 'harakat', 'wrong_word', 'wrong_ayah',
      'makhraj', 'madd', 'ghunnah', 'waqf',
      'pronunciation', 'memorization', 'other'
    )
  ),
  mistake_option_id UUID REFERENCES mistake_options(id),
  quick_label       TEXT,

  -- Path / bounds data
  -- points: simplified normalized coordinates after Ramer-Douglas-Peucker.
  --   Max 500 points per annotation after simplification.
  points               JSONB NOT NULL DEFAULT '[]',
  visual_bounds        JSONB,
  point_count          INT NOT NULL DEFAULT 0,
  original_point_count INT,
  is_simplified        BOOLEAN NOT NULL DEFAULT false,
  style                JSONB NOT NULL DEFAULT '{}',

  note_text              TEXT,
  recording_timestamp_ms INT,

  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id),
  delete_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- annotation_voice_notes
-- One optional voice note per annotation.
CREATE TABLE IF NOT EXISTS annotation_voice_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id     UUID NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  teacher_id        UUID NOT NULL REFERENCES users(id),
  audio_storage_key TEXT NOT NULL,
  -- ^ Stable object-storage key (e.g. teacher-voice-notes/.../annotation_uuid.m4a)
  duration_ms   INT,
  content_type  TEXT,
  size_bytes    BIGINT,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES users(id),
  delete_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 6: Progress Tables
-- ============================================================

-- student_page_progress
-- Source of truth for whether a student completed a page.
-- One durable row per (student, page). Updated by status; never deleted in MVP.
CREATE TABLE IF NOT EXISTS student_page_progress (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL REFERENCES users(id),
  quran_page_id        UUID NOT NULL REFERENCES quran_pages(id),
  page_number          INT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  status               TEXT NOT NULL DEFAULT 'not_started' CHECK (
    status IN ('not_started', 'assigned', 'submitted', 'reviewed', 'completed', 'needs_resubmission')
  ),
  latest_submission_id   UUID REFERENCES submissions(id),
  latest_attempt_id      UUID REFERENCES submission_attempts(id),
  completed_attempt_id   UUID REFERENCES submission_attempts(id),
  attempt_count          INT NOT NULL DEFAULT 0,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, quran_page_id)
);

-- student_progress_snapshots
-- Derived read model for dashboard performance.
-- Recalculated in backend ProgressService after each review completion.
-- Never use DB triggers or cron for this in MVP.
CREATE TABLE IF NOT EXISTS student_progress_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id               UUID NOT NULL REFERENCES users(id),
  total_pages_completed    INT NOT NULL DEFAULT 0,
  quran_progress_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
  surah_progress           JSONB NOT NULL DEFAULT '{}',
  juz_progress             JSONB NOT NULL DEFAULT '{}',
  calculated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);

-- ============================================================
-- SECTION 7: Supabase Auth Integration
-- ============================================================

-- Automatically creates a public.users row when a Supabase Auth user signs up.
-- Role defaults to 'student'; backend PATCH /api/me/profile can update it.
-- display_name falls back to the email prefix if not provided in signup metadata.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- SECTION 8: Indexes
-- ============================================================

-- --- Composite indexes for real app query patterns ---

-- Teacher review queue
CREATE INDEX idx_assignments_teacher_status_due
  ON assignments(teacher_id, status, due_at);

-- Student active submissions list
CREATE INDEX idx_submissions_student_status_created
  ON submissions(student_id, status, created_at DESC);

-- Attempt list for a submission
CREATE INDEX idx_submission_attempts_submission_status_submitted
  ON submission_attempts(submission_id, status, submitted_at DESC);

-- Annotation playback timeline (nearest timestamp lookup)
CREATE INDEX idx_annotations_attempt_timestamp
  ON annotations(submission_attempt_id, recording_timestamp_ms);

-- Fast unread notification count and notification dropdown
-- (partial index — only unread rows are indexed)
CREATE INDEX idx_notifications_unread_by_user
  ON notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

-- --- Supporting single-column indexes ---

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_onboarding_status ON user_profiles(onboarding_status);

CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX idx_device_tokens_is_active ON device_tokens(is_active);

CREATE INDEX idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_delivery_status ON notifications(delivery_status);

CREATE INDEX idx_student_assignment_requests_student_id ON student_assignment_requests(student_id);
CREATE INDEX idx_student_assignment_requests_status ON student_assignment_requests(status);
CREATE INDEX idx_student_assignment_requests_assigned_teacher_id ON student_assignment_requests(assigned_teacher_id);

CREATE INDEX idx_assignments_teacher_id ON assignments(teacher_id);
CREATE INDEX idx_assignments_student_id ON assignments(student_id);
CREATE INDEX idx_assignments_status ON assignments(status);

CREATE INDEX idx_submissions_assignment_id ON submissions(assignment_id);
CREATE INDEX idx_submissions_student_id ON submissions(student_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_current_attempt_id ON submissions(current_attempt_id);

CREATE INDEX idx_submission_attempts_submission_id ON submission_attempts(submission_id);
CREATE INDEX idx_submission_attempts_student_id ON submission_attempts(student_id);
CREATE INDEX idx_submission_attempts_status ON submission_attempts(status);
CREATE INDEX idx_submission_attempts_quran_page_id ON submission_attempts(quran_page_id);

CREATE INDEX idx_annotations_submission_id ON annotations(submission_id);
CREATE INDEX idx_annotations_submission_attempt_id ON annotations(submission_attempt_id);
CREATE INDEX idx_annotations_quran_page_id ON annotations(quran_page_id);
CREATE INDEX idx_annotations_teacher_id ON annotations(teacher_id);
CREATE INDEX idx_annotations_mistake_type ON annotations(mistake_type);
CREATE INDEX idx_annotations_mistake_option_id ON annotations(mistake_option_id);

CREATE INDEX idx_quran_page_mappings_page_number ON quran_page_mappings(page_number);
CREATE INDEX idx_quran_page_mappings_surah_number ON quran_page_mappings(surah_number);
CREATE INDEX idx_quran_page_mappings_juz_number ON quran_page_mappings(juz_number);

CREATE INDEX idx_student_page_progress_student_id ON student_page_progress(student_id);
CREATE INDEX idx_student_page_progress_page_number ON student_page_progress(page_number);
CREATE INDEX idx_student_page_progress_status ON student_page_progress(status);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
