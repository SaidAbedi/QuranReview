# Quran Recitation Review App — Final MVP Architecture Plan

## 1. Product Direction

This app is a **human teacher-led Quran recitation review platform**.

It is not trying to replace a qualified Quran teacher with AI. The product exists to make the traditional teacher-student correction loop easier, clearer, trackable, and scalable.

Core idea:

```text
Student records a page
Teacher reviews the recording
Teacher marks mistakes on the same Quran page
Student reviews feedback
Student improves over multiple attempts
Progress is tracked across page, surah, juz, and full Quran
```

The product may be built with AI-assisted development, and future AI features may help with workflow, organization, search, or summaries. However, the Quran correction itself should remain human-led.

---

## 2. Core MVP Features

### Student Side

- Select assigned Quran page.
- Record or upload recitation.
- Submit a page attempt.
- View teacher feedback.
- Review previous attempts.
- Track Quran progress by page, surah, juz, and full Quran.

### Teacher Side

- Review student submissions.
- Listen to student recording.
- Mark mistakes on Quran page.
- Add text notes.
- Add voice notes.
- Attach correction to audio timestamp.
- Mark attempt as completed or needs resubmission.

### System Side

- Multiple attempts per page.
- Attempt history.
- Progress tracking.
- Quran.com / Quran.Foundation metadata integration.
- Offline draft support.
- Direct-to-storage media uploads.
- Signed playback URLs.
- In-app notifications and push notification readiness.
- Admin/super-admin user management.
- Teacher assignment workflow for new students.
- Quick mistake-code feedback options for teachers.
- Payment/subscription-ready backend structure, with visible payment UI hidden for MVP.

---

## 3. MVP Non-Goals

The MVP should **not** include:

- AI tajweed detection.
- Automated recitation grading.
- Full teacher marketplace.
- Public teacher profiles.
- Visible payment checkout.
- Multiple mushaf layouts.
- Live multiplayer annotation.
- Live video/audio lessons.
- Advanced classroom management.
- Full audio transcoding pipeline.
- Advanced word-level analytics.

---

## 4. High-Level Architecture

```text
React Native Mobile App
  - Expo Development Client
  - Quran page viewer
  - Audio recording/playback
  - Annotation canvas
  - Offline draft queue
  - Progress dashboard

        ↓ HTTPS

Backend API
  - Auth
  - Assignment service
  - Submission/attempt service
  - Annotation service
  - Progress service
  - Quran content proxy/cache
  - Media signed URL service
  - Payment-ready backend layer
  - Notification service
  - Admin assignment service

        ↓

Supabase Postgres
  - users
  - assignments
  - submissions
  - submission_attempts
  - annotations
  - progress
  - Quran metadata cache
  - payment/subscription readiness

        ↓

Supabase Storage
  - student recordings
  - teacher voice notes
  - Quran page images if self-hosted/cache-backed

        ↓

Quran.Foundation / Quran.com API
  - pages
  - surahs
  - juz
  - verse ranges
  - optional word metadata
```

---

## 5. Recommended MVP Stack

```text
Mobile App
React Native / Expo Development Client

Backend API
Node.js / Express

Database
Supabase Postgres

Object Storage
Supabase Storage

Quran Content Provider
Quran.Foundation / Quran.com APIs through backend proxy/cache layer

Auth
Supabase Auth

Local Mobile Persistence
SQLite or Expo SQLite for offline drafts, annotation drafts, upload queue, signed URL cache metadata, and local review state

Payments Foundation
Stripe or another payment provider integration prepared at the backend level, but hidden/disabled in MVP UI

Push Notifications
Expo Notifications for MVP, backed by a notifications table and optional background worker

Backend Platform Foundation
Supabase Auth + Supabase Postgres + Supabase Storage
```

---

## 5A. MVP Database Foundation Principles

The database should be strong enough to scale, but not over-engineered before real usage exists.

### 5A.1 Adopt Now

The MVP should include these foundational safeguards:

```text
- Attempts are first-class entities.
- current_attempt_id is nullable and updated transactionally.
- submission_attempts must match the parent submission's student and Quran page.
- Composite indexes should match real app query patterns.
- Notification unread counts should use a partial index.
- Annotation payloads should be paginated.
- Progress snapshots are derived read models, not the source of truth.
```

### 5A.2 Defer Until Needed

Do not add these until real query patterns justify them:

```text
- GIN indexes on annotation JSONB style/points.
- Lookup tables for every stable enum.
- Database triggers for progress recalculation.
- Cron-based progress refresh.
- Soft-delete partial unique indexes on student_page_progress.
```

### 5A.3 Source of Truth Rules

```text
student_page_progress:
  source of truth for whether a student completed a page

student_progress_snapshots:
  derived read model for dashboard performance

submission_attempts:
  source of truth for each recording attempt

annotations:
  source of truth for teacher feedback on a specific attempt

notifications:
  source of truth for in-app notification state

push notifications:
  best-effort delivery only
```

---

## 6. Major Technical Decisions

### 6.1 Use Expo Development Client, Not Plain Expo Go

This app depends heavily on audio, local storage, offline queueing, and potentially native annotation behavior.

Start with:

```text
Expo Development Client
```

Do **not** rely on plain Expo Go for the full MVP.

Expo Development Client keeps Expo's developer experience while allowing native modules if audio, storage, or annotation libraries require them.

---

### 6.2 Use Quran.com APIs for Metadata, Not Direct Mobile Rendering

Use Quran.Foundation / Quran.com APIs for:

- page metadata
- surah mapping
- juz mapping
- verse ranges
- word metadata later

For MVP, render a stable **Quran page image** as the annotation surface.

Best pattern:

```text
Quran.com API = canonical Quran metadata
Your page image = stable visual annotation surface
Your database = attempts, feedback, progress, users
```

Do not call Quran.Foundation directly from the mobile app.

Use:

```text
React Native App → Your Backend → Quran.Foundation API
```

Reasons:

- Keep Quran API credentials off the mobile client.
- Add caching and rate-limit protection.
- Normalize provider responses into app contracts.
- Allow fallback behavior if the upstream API is unavailable.
- Keep app-specific progress, attempts, and annotations independent from the external provider.

---

### 6.3 Use One Mushaf Layout for MVP

Use one standard 604-page layout.

Recommended default:

```text
Quran.Foundation Mushaf ID 1 / QCF V2
```

Do not support multiple mushaf layouts in MVP.

---

## 7. Quran.Foundation Integration Strategy

### 7.1 Backend Service

Create a backend service/module:

```text
QuranContentService
```

Responsibilities:

- Manage Quran.Foundation access tokens.
- Call Pages Lookup API.
- Call Verses by Page API.
- Normalize provider responses.
- Cache stable Quran metadata.
- Expose app-specific Quran endpoints to React Native.
- Protect the mobile app from upstream API details.

### 7.2 Backend Environment Variables

```text
QURAN_FOUNDATION_CLIENT_ID=
QURAN_FOUNDATION_CLIENT_SECRET=
QURAN_FOUNDATION_API_BASE=https://apis.quran.foundation/content/api/v4
QURAN_FOUNDATION_DEFAULT_MUSHAF_ID=1
```

### 7.3 Provider Cache Strategy

Cache Quran.Foundation content that rarely changes:

```text
chapters
juz metadata
mushaf page mappings
page-to-verse mappings
verse metadata by page
optional word metadata by page
```

For MVP, cache can be database-backed. Redis can be added later.

### 7.4 Provider Ownership Boundary

Quran.Foundation provides:

- Quran content.
- Chapters.
- Juz metadata.
- Mushaf pagination.
- Verse ranges.
- Optional word metadata.

This application owns:

- Users.
- Teacher/student relationships.
- Assignments.
- Student recordings.
- Submission attempts.
- Teacher annotations.
- Teacher voice notes.
- Review status.
- Progress tracking.
- Payments/subscriptions.

---

## 8. Annotation Strategy

Support both annotation modes.

### 8.1 Mode 1: Freehand Annotation

Teacher circles, underlines, or marks manually.

Good for:

- iPad.
- Apple Pencil.
- Marking a phrase or region.
- Marking multiple words.
- General correction areas.

Stored as normalized coordinates:

```json
{
  "annotationType": "circle",
  "anchorType": "page_region",
  "points": [
    { "x": 0.52, "y": 0.34 },
    { "x": 0.53, "y": 0.35 }
  ]
}
```

### 8.2 Mode 2: Tap-to-Select Word Annotation

Teacher taps a word, and the app circles/highlights it automatically.

Good for:

- Mobile phone grading.
- Fast corrections.
- Small screens.
- Future word-level analytics.

Stored as semantic Quran anchor plus optional visual bounds:

```json
{
  "annotationType": "word_select",
  "anchorType": "word",
  "verseKey": "2:5",
  "wordId": 12345,
  "wordPosition": 3,
  "lineNumber": 4,
  "visualBounds": {
    "x": 0.42,
    "y": 0.31,
    "width": 0.08,
    "height": 0.03
  }
}
```

### 8.3 Recommended Priority

Build in this order:

```text
1. Freehand annotation
2. Tap-to-select word annotation
```

Why? Freehand works even if word-bound mapping is not perfect yet.


---

## 8A. Quick Mistake Feedback Options

Teachers should not be forced to type a custom note for every mistake.

When a teacher taps a word or creates a circle annotation, the app should show quick feedback options.

### 8A.1 Mistake Categories

Recommended MVP categories:

```text
tajweed
harakat
wrong_word
wrong_ayah
makhraj
madd
ghunnah
waqf
memorization
pronunciation
other
```

### 8A.2 Quick Labels

Each category can have short labels that are fast to select.

Examples:

```text
Tajweed:
  - Madd issue
  - Ghunnah issue
  - Ikhfa / Idgham issue
  - Qalqalah issue

Harakat:
  - Wrong vowel
  - Missing vowel
  - Extra vowel

Wrong Word:
  - Replaced word
  - Skipped word
  - Added word

Wrong Ayah:
  - Repeated ayah
  - Skipped ayah
  - Continued from wrong place

Waqf:
  - Stopped incorrectly
  - Did not stop
  - Started incorrectly
```

### 8A.3 Teacher Feedback UX

Recommended flow:

```text
Teacher taps word or circles area
  → correction sheet opens
  → teacher selects mistake category
  → teacher optionally selects quick label
  → teacher optionally adds text note
  → teacher optionally records voice note
  → annotation saves locally
```

### 8A.4 Data Model Principle

Store quick feedback as structured metadata, not only free text.

This enables future reporting such as:

```text
Most common mistake types
Student improvement by category
Surah/juz mistake patterns
Teacher review consistency
```


---

## 9. Annotation Rendering Layers

```text
Quran Page Container

Layer 1: Quran page image
Layer 2: invisible word tap map
Layer 3: freehand drawing canvas
Layer 4: saved annotation markers/circles
Layer 5: note / voice note popover
Layer 6: audio player
```

Important behavior:

- Quran page should preserve aspect ratio.
- Annotations should scale with rendered page size.
- Freehand coordinates should be normalized between `0` and `1`.
- Word annotations should use semantic anchors plus visual bounds.
- Both freehand and word annotations should render in the same review layer.

---

## 10. Coordinate Conversion

### 10.1 Screen to Normalized Coordinates

```ts
function screenToNormalizedPoint(
  screenX: number,
  screenY: number,
  pageLayout: { x: number; y: number; width: number; height: number }
) {
  return {
    x: (screenX - pageLayout.x) / pageLayout.width,
    y: (screenY - pageLayout.y) / pageLayout.height,
  };
}
```

### 10.2 Normalized to Screen Coordinates

```ts
function normalizedToScreenPoint(
  point: { x: number; y: number },
  pageLayout: { x: number; y: number; width: number; height: number }
) {
  return {
    x: pageLayout.x + point.x * pageLayout.width,
    y: pageLayout.y + point.y * pageLayout.height,
  };
}
```

---

## 11. Multiple Attempts Model

This is essential.

Do **not** model one page as one recording.

Use:

```text
Submission = student’s work item for a page
SubmissionAttempt = each recording attempt for that page
```

Example:

```text
Student reads page 1 → Attempt 1
Teacher reviews → needs resubmission
Student reads page 1 again → Attempt 2
Teacher reviews → completed
Page 1 counts toward progress
```

Previous attempts should not be overwritten.

They should remain available for:

- learning history
- teacher context
- student improvement tracking
- attempt comparison
- audit/history

---

## 12. Status Model

Use respectful teacher-student language.

### 12.1 Backend Statuses

```text
draft
submitted
in_review
reviewed
needs_resubmission
completed
archived
```

### 12.2 Teacher Actions

```text
Mark as Complete
Request Another Attempt
```

### 12.3 Student-Facing Language

```text
Submitted
Teacher Reviewing
Returned for Practice
Completed
```

Avoid language like:

```text
failed
wrong
rejected
```


---

## 12A. User Roles, Admin Control, and Assignment Workflow

The app should support role-based access from the beginning.

### 12A.1 Roles

```text
student
teacher
admin
super_admin
```

Recommended meaning:

```text
student:
  submits recordings and reviews feedback

teacher:
  reviews assigned students and grades attempts

admin:
  manages student/teacher assignments and operational workflows

super_admin:
  full platform control, including admins, teachers, students, settings, and payment readiness
```

Update the `users.role` check constraint to include:

```sql
CHECK (role IN ('student', 'teacher', 'admin', 'super_admin'))
```

### 12A.2 Student Signup Workflow

Do not automatically assign every new student to a teacher unless there is a clear rule. For MVP, use a controlled assignment workflow.

Recommended MVP flow:

```text
Student signs up
  → student profile created
  → student_assignment_requests row created
  → admin/super_admin sees unassigned student
  → admin assigns student to teacher
  → teacher gets notification
  → student gets notification
```

This avoids accidentally overloading one teacher or assigning students incorrectly.

### 12A.3 Optional Auto-Assignment Later

Later, add auto-assignment rules such as:

```text
teacher capacity
student timezone
student age group
teacher specialization
language preference
subscription plan
availability
```

For MVP, keep auto-assignment disabled or admin-approved.

### 12A.4 Assignment Statuses

Use a dedicated workflow table for assignment requests.

```text
pending_assignment
assigned
waitlisted
declined
archived
```


---

## 13. Storage Strategy

Store media in object storage, not the database.

### 13.1 Student Recording Paths

Version attempts by storage path:

```text
student-recordings/
  {studentId}/
    {assignmentId}/
      {submissionId}/
        attempts/
          attempt-001.m4a
          attempt-002.m4a
          attempt-003.m4a
```

### 13.2 Teacher Voice Note Paths

```text
teacher-voice-notes/
  {teacherId}/
    {submissionId}/
      {attemptId}/
        {annotationId}.m4a
```

### 13.3 Stable Storage Keys

Store storage keys in the database, not temporary signed URLs.

Bad:

```ts
recordingUrl: "https://signed-url-that-expires..."
```

Good:

```ts
recordingStorageKey: "student-recordings/.../attempt-001.m4a"
```

Generate temporary signed URLs only when needed for upload or playback.

---

## 14. Signed URL Lifecycle

### 14.1 Signed Upload URL

```http
POST /api/uploads/signed-url
```

Used before uploading audio.

Request:

```json
{
  "fileType": "student_recording",
  "contentType": "audio/m4a",
  "assignmentId": "assignment_uuid"
}
```

Response:

```json
{
  "uploadUrl": "https://temporary-upload-url",
  "storageKey": "student-recordings/student_uuid/assignment_uuid/submission_uuid/attempts/attempt-001.m4a",
  "expiresAt": "2026-05-05T16:30:00Z"
}
```

### 14.2 Signed Read URL

```http
POST /api/media/signed-read-url
```

Used before playback.

Request:

```json
{
  "mediaType": "student_recording",
  "storageKey": "student-recordings/student_uuid/assignment_uuid/submission_uuid/attempts/attempt-001.m4a"
}
```

Response:

```json
{
  "url": "https://temporary-playback-url",
  "expiresAt": "2026-05-05T18:00:00Z"
}
```

Mobile app behavior:

```text
Before playback:
  check if signed URL exists and is not expired
  if expired or close to expired, request a new one
```

This prevents the teacher review screen from breaking during long review sessions.

---

## 15. Offline-First Behavior

The MVP should support offline-safe drafts for the most important flows.

Use local SQLite / Expo SQLite for:

```text
local_recording_upload_queue
local_annotation_drafts
local_annotation_sync_queue
local_voice_note_upload_queue
local_cached_quran_pages
local_signed_url_cache
```

Sync states:

```text
local_only
uploading
synced
failed_retryable
failed_needs_user_action
```

Key rule:

```text
Never silently lose a student recording or teacher annotation because of bad internet.
```


---

## 15A. Notifications Architecture

Notifications are a first-class MVP feature because the product depends on teacher-student handoff.

### 15A.1 Notification Events

Create notifications for:

```text
student_submitted_attempt:
  notify assigned teacher

teacher_completed_review:
  notify student

teacher_requested_resubmission:
  notify student

admin_assigned_teacher:
  notify teacher and student

student_assigned_to_teacher:
  notify teacher

voice_note_added:
  notify student if review is already visible

attempt_comment_added:
  notify student if review is already visible
```

### 15A.2 Notification Channels

For MVP, support:

```text
in_app
push
```

Email can be added later.

### 15A.3 Recommended Notification Flow

```text
Important app event happens
  → backend writes notification row
  → backend optionally sends push notification through Expo
  → mobile app displays unread notification badge
  → user opens notification center
  → notification deep-links to assignment, attempt, or review
```

### 15A.4 Push Provider

Use Expo Notifications for MVP.

The mobile app should register for a push token and send it to the backend.

```http
POST /api/devices/register
```

The backend stores the Expo push token and can send notifications to the appropriate user.

### 15A.5 Notification Reliability

The database notification row is the source of truth.

Push notifications are best-effort delivery. If push fails, the user should still see the notification in-app.


---

## 16. Canvas Save Strategy

Do not POST every stroke or every point.

Use local drafts and batch sync.

Recommended behavior:

```text
During drawing:
  store in memory/local draft

On gesture end:
  simplify path
  update local draft

On Save / Next / Complete:
  batch sync annotations
```

Batch endpoint:

```http
POST /api/submissions/:submissionId/attempts/:attemptId/annotations/batch
```

---

## 17. Path Simplification

Freehand paths can get large. Simplify before saving.

Use:

```text
Ramer-Douglas-Peucker
or
distance-threshold simplification
```

Store metadata:

```json
{
  "pointCount": 120,
  "originalPointCount": 900,
  "isSimplified": true
}
```

MVP guardrails:

```text
Max points per annotation after simplification: 500
Max annotation batch size: 50
Do not return full path data in list endpoints
```

### 17.1 Annotation Payload Loading

Do not return all full annotation paths from `GET /api/submissions/:submissionId`.

Use separate endpoints:

```http
GET /api/submissions/:submissionId/attempts/:attemptId/annotation-markers
GET /api/submissions/:submissionId/attempts/:attemptId/annotations?limit=50&cursor=...
```

`annotation-markers` should return lightweight data for playback and timelines:

```json
[
  {
    "id": "annotation_uuid",
    "recordingTimestampMs": 42000,
    "mistakeType": "tajweed",
    "hasVoiceNote": true
  }
]
```

Load full annotation paths only on the review screen or when the user opens a specific attempt.


---

## 18. Audio Strategy

Start with compressed recording:

```text
m4a / AAC where possible
```

Use `expo-audio` first if staying in Expo.

Run an early audio spike across:

```text
iPhone
iPad
Android Samsung
budget Android
Bluetooth mic / AirPods
long recording
interrupted recording
failed upload retry
```

Do not block MVP on full transcoding.

Later add background transcoding:

```text
object storage event
queue job
worker compresses/transcodes
store playback version
archive original if needed
```

---

## 19. Progress Tracking

Use page completion as the source of truth.

```text
student_page_progress = source of truth
student_progress_snapshots = fast dashboard read model
```

A page counts as completed only when:

```text
teacher marks a specific attempt as completed
```

Not when the student merely uploads audio.

Track progress by:

```text
page
surah
juz
whole Quran
```

Progress flow:

```text
Attempt completed
  → backend CompleteReviewService updates attempt/submission status
  → ProgressService updates student_page_progress
  → ProgressService recalculates student_progress_snapshots for that student
  → dashboard loads from snapshot
```

For MVP, avoid database triggers and cron jobs for progress refresh. Recalculate the student's snapshot explicitly in backend service code after review completion. The data size is small: one student has at most 604 Quran pages.


---

## 20. Soft Delete Policy

Do not hard-delete recordings, attempts, annotations, or voice notes immediately.

Add fields:

```sql
deleted_at TIMESTAMPTZ
deleted_by UUID
delete_reason TEXT
```

Soft delete behavior:

```text
User hides/deletes item
  → mark deleted_at
  → hide from normal UI
  → retain object storage file
  → hard delete only through admin/retention job later
```

Reason: a student recording may have teacher annotations attached to it.

Do not soft-delete `student_page_progress` in MVP. Keep one durable row per student/page with:

```sql
UNIQUE (student_id, quran_page_id)
```

Progress should be updated by status, not deleted and recreated.

---

## 21. Database Model Summary

Core tables:

```text
users
user_profiles
device_tokens
notifications
student_assignment_requests
teacher_student_relationships

quran_provider_resources
quran_pages
surahs
juzs
quran_page_mappings

assignments
submissions
submission_attempts

annotations
annotation_voice_notes
mistake_categories
mistake_options

student_page_progress
student_progress_snapshots

payment_customers
subscription_plans
subscriptions
```

Most important relationships:

```text
Assignment
  has many Submissions

Submission
  has many SubmissionAttempts

SubmissionAttempt
  has many Annotations

Annotation
  may have one AnnotationVoiceNote

StudentPageProgress
  points to latest submission/attempt
  points to completed attempt
```

---

## 22. Database Schema Draft

### 22.1 users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.1A user_profiles

Use this table for app-specific profile metadata beyond Supabase Auth.

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_language TEXT,
  timezone TEXT,
  student_age_group TEXT,
  teacher_capacity INT,
  teacher_current_load INT NOT NULL DEFAULT 0,
  onboarding_status TEXT NOT NULL DEFAULT 'new' CHECK (
    onboarding_status IN ('new', 'pending_assignment', 'active', 'inactive')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.1B device_tokens

Stores mobile push tokens for Expo Notifications.

```sql
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'expo' CHECK (provider IN ('expo', 'fcm', 'apns')),
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, token)
);
```

### 22.1C notifications

In-app notifications. Push delivery is optional; this table is the source of truth.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (
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
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'push', 'email')),
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'sent', 'failed', 'skipped')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.1D student_assignment_requests

Created when a student signs up and needs to be assigned to a teacher.

```sql
CREATE TABLE student_assignment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_teacher_id UUID REFERENCES users(id),
  assigned_teacher_id UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_assignment' CHECK (
    status IN ('pending_assignment', 'assigned', 'waitlisted', 'declined', 'archived')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.2 teacher_student_relationships

```sql
CREATE TABLE teacher_student_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id),
  student_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, student_id)
);
```

### 22.3 quran_provider_resources

```sql
CREATE TABLE quran_provider_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'quran_foundation',
  provider_version TEXT,
  default_mushaf_id INT NOT NULL DEFAULT 1,
  default_mushaf_name TEXT NOT NULL DEFAULT 'QCF V2',
  api_base_url TEXT NOT NULL DEFAULT 'https://apis.quran.foundation/content/api/v4',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.4 quran_pages

```sql
CREATE TABLE quran_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'quran_foundation',
  provider_mushaf_id INT NOT NULL DEFAULT 1,
  mushaf_id TEXT NOT NULL DEFAULT 'qcf_v2',
  page_number INT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  image_url TEXT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_mushaf_id, page_number)
);
```

### 22.5 surahs

```sql
CREATE TABLE surahs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surah_number INT NOT NULL UNIQUE CHECK (surah_number BETWEEN 1 AND 114),
  name_arabic TEXT NOT NULL,
  name_english TEXT,
  total_ayahs INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.6 juzs

```sql
CREATE TABLE juzs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  juz_number INT NOT NULL UNIQUE CHECK (juz_number BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.7 quran_page_mappings

```sql
CREATE TABLE quran_page_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'quran_foundation',
  provider_mushaf_id INT NOT NULL DEFAULT 1,
  page_number INT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  surah_number INT NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
  juz_number INT NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  starts_at_ayah INT,
  ends_at_ayah INT,
  first_verse_key TEXT,
  last_verse_key TEXT,
  first_verse_id INT,
  last_verse_id INT,
  verses_count INT,
  source_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.8 assignments

```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id),
  student_id UUID NOT NULL REFERENCES users(id),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id),
  title TEXT,
  instructions TEXT,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (
    status IN ('assigned', 'submitted', 'reviewed', 'archived')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.9 submissions

```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  student_id UUID NOT NULL REFERENCES users(id),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id),
  current_attempt_id UUID,
  -- Nullable on creation. Set transactionally after the first submission_attempt is inserted.
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('draft', 'submitted', 'in_review', 'reviewed', 'needs_resubmission', 'completed')
  ),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.10 submission_attempts

```sql
CREATE TABLE submission_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id),
  attempt_number INT NOT NULL,
  recording_storage_key TEXT NOT NULL,
  recording_duration_ms INT,
  original_file_name TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'in_review', 'reviewed', 'needs_resubmission', 'completed', 'archived')
  ),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, attempt_number)
);
```

Integrity constraint:

```sql
ALTER TABLE submissions
ADD CONSTRAINT uq_submissions_id_student_page
UNIQUE (id, student_id, quran_page_id);

ALTER TABLE submission_attempts
ADD CONSTRAINT fk_attempt_submission_student_page
FOREIGN KEY (submission_id, student_id, quran_page_id)
REFERENCES submissions(id, student_id, quran_page_id);
```

Create submission + first attempt transactionally:

```text
1. Insert submission with current_attempt_id = null.
2. Insert first submission_attempt.
3. Update submissions.current_attempt_id.
```


### 22.11 annotations

```sql
CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  submission_attempt_id UUID NOT NULL REFERENCES submission_attempts(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id),

  annotation_type TEXT NOT NULL CHECK (
    annotation_type IN ('freehand', 'circle', 'underline', 'box', 'highlight', 'word_select')
  ),

  anchor_type TEXT NOT NULL DEFAULT 'page_region' CHECK (
    anchor_type IN ('page_region', 'word', 'ayah', 'line')
  ),

  verse_key TEXT,
  word_id INT,
  word_position INT,
  line_number INT,

  mistake_type TEXT CHECK (
    mistake_type IN (
      'tajweed',
      'harakat',
      'wrong_word',
      'wrong_ayah',
      'makhraj',
      'madd',
      'ghunnah',
      'waqf',
      'pronunciation',
      'memorization',
      'other'
    )
  ),

  mistake_option_id UUID,
  quick_label TEXT,

  points JSONB NOT NULL DEFAULT '[]',
  visual_bounds JSONB,
  point_count INT NOT NULL DEFAULT 0,
  original_point_count INT,
  is_simplified BOOLEAN NOT NULL DEFAULT false,
  style JSONB NOT NULL DEFAULT '{}',

  note_text TEXT,
  recording_timestamp_ms INT,

  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  delete_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.12 annotation_voice_notes

```sql
CREATE TABLE annotation_voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id),
  audio_storage_key TEXT NOT NULL,
  duration_ms INT,
  content_type TEXT,
  size_bytes BIGINT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.12A mistake_categories

Seeded lookup table for quick teacher feedback.

```sql
CREATE TABLE mistake_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.12B mistake_options

Seeded options under each category.

```sql
CREATE TABLE mistake_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES mistake_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, code)
);
```

Example seed categories:

```text
tajweed
harakat
wrong_word
wrong_ayah
makhraj
madd
ghunnah
waqf
memorization
pronunciation
other
```

### 22.13 student_page_progress

```sql
CREATE TABLE student_page_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  quran_page_id UUID NOT NULL REFERENCES quran_pages(id),
  page_number INT NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (
    status IN ('not_started', 'assigned', 'submitted', 'reviewed', 'completed', 'needs_resubmission')
  ),
  latest_submission_id UUID REFERENCES submissions(id),
  latest_attempt_id UUID REFERENCES submission_attempts(id),
  completed_attempt_id UUID REFERENCES submission_attempts(id),
  attempt_count INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, quran_page_id)
);
```

### 22.14 student_progress_snapshots

```sql
CREATE TABLE student_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  total_pages_completed INT NOT NULL DEFAULT 0,
  quran_progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  surah_progress JSONB NOT NULL DEFAULT '{}',
  juz_progress JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);
```

### 22.15 payment_customers

```sql
CREATE TABLE payment_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id),
  UNIQUE (user_id, provider)
);
```

### 22.16 subscription_plans

```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_price_id TEXT,
  amount_cents INT,
  currency TEXT DEFAULT 'usd',
  interval TEXT CHECK (interval IN ('month', 'year')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 22.17 subscriptions

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan_id UUID REFERENCES subscription_plans(id),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (
    status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled')
  ),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 23. Recommended Indexes

```sql

-- Composite indexes for real app query patterns
CREATE INDEX idx_submissions_student_status_created
ON submissions(student_id, status, created_at DESC);

CREATE INDEX idx_assignments_teacher_status_due
ON assignments(teacher_id, status, due_at);

CREATE INDEX idx_submission_attempts_submission_status_submitted
ON submission_attempts(submission_id, status, submitted_at DESC);

CREATE INDEX idx_annotations_attempt_timestamp
ON annotations(submission_attempt_id, recording_timestamp_ms);

-- Fast unread notification count and notification dropdown
CREATE INDEX idx_notifications_unread_by_user
ON notifications(recipient_user_id, created_at DESC)
WHERE read_at IS NULL;

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
```

### 23.1 Indexing Notes

Do not add GIN indexes on `annotations.points` or `annotations.style` in the first MVP unless the app actually needs JSONB field filtering.

Core query paths are:

```text
teacher review queue
student active submissions
annotations for one attempt
annotations near one audio timestamp
unread notification count
student progress dashboard
```

Optimize for those first.


---

## 24. API Endpoints

### 24.1 Current User

```http
GET /api/me
PATCH /api/me/profile
```

---

### 24.2 Quran Endpoints

```http
GET /api/quran/pages/:pageNumber
GET /api/quran/pages/:pageNumber/content?includeWords=true
GET /api/quran/pages/lookup?surahNumber=2
GET /api/quran/pages/lookup?juzNumber=1
```

Backend provider call examples:

```text
GET https://apis.quran.foundation/content/api/v4/verses/by_page/{pageNumber}?mushaf=1&words=true
GET https://apis.quran.foundation/content/api/v4/pages/lookup?chapter_number=2&mushaf=1
GET https://apis.quran.foundation/content/api/v4/pages/lookup?juz_number=1&mushaf=1
```

---

### 24.3 Assignment Endpoints

```http
POST /api/assignments
GET /api/student/assignments
GET /api/teacher/review-queue
```

### 24.3A Admin Assignment Endpoints

```http
GET /api/admin/students/unassigned
GET /api/admin/assignment-requests
POST /api/admin/assignment-requests/:requestId/assign-teacher
PATCH /api/admin/teacher-student-relationships/:relationshipId
```

### 24.3B Notification Endpoints

```http
GET /api/notifications
POST /api/notifications/:notificationId/read
POST /api/notifications/read-all
POST /api/devices/register
PATCH /api/devices/:deviceTokenId/disable
```

---

### 24.4 Media Endpoints

```http
POST /api/uploads/signed-url
POST /api/media/signed-read-url
```

---

### 24.5 Submission and Attempt Endpoints

```http
POST /api/submissions
GET /api/submissions/:submissionId
POST /api/submissions/:submissionId/attempts
```

---

### 24.6 Annotation Endpoints

```http
GET /api/mistake-categories
GET /api/submissions/:submissionId/attempts/:attemptId/annotations?limit=50&cursor=...
GET /api/submissions/:submissionId/attempts/:attemptId/annotation-markers
POST /api/submissions/:submissionId/attempts/:attemptId/annotations
POST /api/submissions/:submissionId/attempts/:attemptId/annotations/batch
PATCH /api/annotations/:annotationId
DELETE /api/annotations/:annotationId
POST /api/annotations/:annotationId/voice-note
```

---

### 24.7 Review Completion Endpoint

```http
POST /api/submissions/:submissionId/attempts/:attemptId/complete-review
```

Request:

```json
{
  "pageStatus": "completed"
}
```

or:

```json
{
  "pageStatus": "needs_resubmission"
}
```

Backend behavior:

1. Set the specific attempt status to `completed` or `needs_resubmission`.
2. Set the parent submission status to `completed` or `needs_resubmission`.
3. Set assignment status to `reviewed` if appropriate.
4. Upsert `student_page_progress`.
5. Store `latest_attempt_id`, `completed_attempt_id`, and `attempt_count`.
6. Recalculate progress snapshot.

---

### 24.8 Progress Endpoints

```http
GET /api/student/progress
GET /api/student/progress/surahs/:surahNumber
GET /api/student/progress/juz/:juzNumber
```

---

## 25. Mobile App Architecture

Recommended structure:

```text
src/
  app/
    navigation/
    providers/
  features/
    auth/
    assignments/
    submissions/
    attempts/
    review/
    quran-page/
    annotations/
    audio/
    progress/
    offline-sync/
    notifications/
    admin/
    teacher-assignment/
    mistake-feedback/
  shared/
    api/
    components/
    hooks/
    types/
    utils/
```

Core screens:

```text
StudentAssignmentListScreen
StudentRecordSubmissionScreen
StudentReviewedSubmissionScreen
StudentProgressDashboardScreen
NotificationCenterScreen

TeacherReviewQueueScreen
TeacherReviewSubmissionScreen

AdminDashboardScreen
AdminUnassignedStudentsScreen
AdminAssignTeacherScreen

QuranPageReviewScreen
```

Core components:

```text
QuranPageViewer
WordTapMap
AnnotationCanvas
AnnotationToolbar
AnnotationPopover
AudioPlayerBar
VoiceNoteRecorder
MistakeTypeSelector
QuickMistakeOptionSheet
NotificationBell
NotificationList
AdminAssignmentQueue
ReviewStatusBadge
ProgressSummaryCard
SurahProgressList
JuzProgressList
AttemptHistoryList
```

---

## 26. Security and Permissions

### Students Can

- View their own assignments.
- Create submissions for their assignments.
- Create new attempts for their own submissions.
- View reviewed annotations on their own submissions.
- Request soft deletion/hiding of their own media where allowed.

### Teachers Can

- View submissions assigned to them.
- Create annotations on their students' submission attempts.
- Update/delete their own annotations before review completion.
- Mark assigned attempts as completed or needing resubmission.
- Mark their assigned submissions as reviewed.

### Admins Can

- View unassigned students.
- Assign students to teachers.
- Manage teacher/student relationships.
- View operational queues.

### Super Admins Can

- Manage admins, teachers, and students.
- Override assignments.
- Manage platform settings.
- Access payment/subscription admin tools later.
- Perform retention and hard-delete cleanup jobs later.

Every endpoint should verify ownership or relationship.

Examples:

```text
Student can access submission only if submission.student_id = current_user.id.
Teacher can access submission only if assignment.teacher_id = current_user.id.
Teacher can create annotation only if submission belongs to their assignment.
```

---

## 27. Scaling Strategy

### What Scales Well

- Quran page assets are static and cacheable.
- Audio files live in object storage.
- Annotation records are small JSON documents after path simplification.
- Most queries are scoped by student, teacher, assignment, submission, or attempt.
- Progress dashboard reads can use `student_progress_snapshots`.

### Main Scaling Concerns

1. Audio storage growth.
2. Large numbers of submissions.
3. Teacher review queue performance.
4. Notification fan-out and push token management.
5. Media access permissions.
6. Long-term retention and deletion policies.
7. Progress recalculation for thousands of students.
8. Offline sync conflict handling.
9. Oversized annotation path payloads.
10. Signed URL refresh lifecycle.

### Scaling Recommendations

- Store audio in object storage, not the database.
- Keep database records metadata-only.
- Store stable storage keys, not signed URLs.
- Add indexes around teacher/student/status queries.
- Use pagination for assignment and review queue endpoints.
- Use CDN for Quran page images.
- Batch annotation saves.
- Simplify drawing paths.
- Use progress snapshots for dashboards.
- Use background jobs for notifications and media cleanup later.
- Avoid live multiplayer annotation in MVP.

---

## 28. MVP Build Order

Give the coding agent this order:

```text
1. Create database schema
   - users
   - profiles
   - device tokens
   - notifications
   - student assignment requests
   - teacher/student relationships
   - assignments
   - submissions
   - submission_attempts
   - composite attempt/submission integrity constraint
   - nullable current_attempt_id
   - annotations
   - mistake categories/options
   - progress
   - progress snapshots
   - Quran provider cache
   - soft delete fields where appropriate
   - storage keys
   - composite indexes for real query paths

2. Seed test data
   - one super_admin
   - one admin
   - one teacher
   - one student
   - mistake categories/options
   - Quran provider config
   - one Quran page

3. Build QuranContentService
   - backend proxy to Quran.Foundation
   - page lookup
   - verse/page metadata
   - cache normalized data

4. Build Quran page endpoints

5. Build assignment endpoints

6. Build submission endpoint

7. Build submission attempt endpoint

8. Build signed upload URL endpoint

9. Build signed read URL endpoint

10. Build annotation CRUD endpoint

11. Build batch annotation sync endpoint

12. Build progress tracking endpoints

12A. Build notification endpoints and device token registration

12B. Build admin assignment workflow endpoints

12C. Build mistake category/options endpoint

13. Build React Native page viewer

14. Build audio recording/playback

15. Build freehand annotation overlay

16. Add path simplification

17. Build teacher review screen

18. Build complete / needs resubmission workflow

19. Build student reviewed submission screen

20. Build student progress dashboard

21. Build notification center and notification badge

22. Build admin assignment screens

23. Add offline queues
   - recording upload queue
   - annotation draft queue
   - voice note queue

24. Add soft delete behavior

25. Prepare payment/subscription tables but keep UI hidden
```

---

## 29. Future Enhancements

### Product Enhancements

- Multi-page assignments.
- Ayah-level selection.
- Word-level tagging.
- Tajweed rule taxonomy.
- Student resubmission flow enhancements.
- Teacher grading rubric.
- Progress dashboard improvements.
- Classrooms/groups.
- Parent view.
- Teacher marketplace.
- Payment system UI.
- Live lessons.

### Technical Enhancements

- Realtime review status.
- Offline historical review access.
- Background media processing.
- Audio waveform display.
- AI-assisted summaries, not AI grading.
- CDN-backed image delivery.
- Push notifications.
- Background job queue.
- Multi-tenant organization model.
- Audio transcoding pipeline.
- Attempt comparison tools.

---

## 30. Final Technical Guardrails

Stick to the core architecture, but enforce these guardrails:

```text
1. Use attempts as first-class entities.
2. Store storage keys, not signed URLs.
3. Refresh signed URLs for playback.
4. Batch annotation saves.
5. Simplify drawing paths.
6. Use soft deletes.
7. Use progress snapshots as derived dashboard data.
8. Use Quran.Foundation through backend proxy/cache.
9. Use Expo Development Client.
10. Build both freehand and tap-to-word annotation support.
11. Use Supabase Auth, Supabase Postgres, and Supabase Storage for MVP.
12. Add notifications as durable in-app rows first, push delivery second.
13. Use admin-approved teacher assignment for new students.
14. Use structured quick mistake options to reduce teacher typing.
15. Add composite integrity between submissions and submission_attempts.
16. Keep current_attempt_id nullable and update it in backend transactions.
17. Add composite indexes for teacher queues, student submissions, annotation timestamps, and unread notifications.
18. Paginate full annotation payloads and use lightweight annotation markers for playback.
19. Recalculate progress snapshots explicitly in backend service code after review completion.
20. Do not add JSONB GIN indexes or trigger-heavy progress logic until real usage requires it.
```

---

## 31. Coding Agent Instruction Summary

Build a React Native MVP for Quran recitation review. Use Expo Development Client, not plain Expo Go, so the project can support native modules if audio, storage, or annotation libraries require them.

The app should support student audio submissions, multiple attempts per page, and teacher annotations over a Quran page image. Use normalized coordinates for all freehand drawing data. Support both annotation modes: tap-to-select word annotations when word metadata/bounds are available, and freehand circle/underline annotations for manual marking.

Store metadata in PostgreSQL and audio/page assets in object storage. Store stable object storage keys in the database, not temporary signed URLs. Generate signed upload URLs for direct-to-storage uploads and signed read URLs for playback, with refresh behavior in the mobile app.

Expose mobile-first REST endpoints for assignments, submissions, attempts, annotations, batch annotation sync, progress tracking, signed uploads, signed reads, and Quran content.

Integrate Quran.Foundation / Quran.com APIs through a backend proxy/cache layer, not directly from the mobile app. Use Quran.Foundation for canonical Quran metadata such as pages, chapters, juz, verse ranges, and optional word-level data.

Use `student_page_progress` as the source of truth and `student_progress_snapshots` as a derived dashboard read model.

The product should be human-teacher-centered, not AI-recitation-grading-centered.

Prepare the backend for future payments/subscriptions, but keep visible payment UI out of the first MVP.

Include offline-first behavior for local recordings, annotation drafts, batched annotation sync, upload queues, signed URL refresh, and retryable sync.

Use one standard mushaf layout for MVP.

Use soft delete for attempts, recordings, annotations, and voice notes before any hard deletion or retention cleanup.

Use Supabase Auth, Supabase Postgres, and Supabase Storage as the MVP backend foundation. Add durable in-app notifications plus Expo push notification support. Add admin and super-admin roles. When a student signs up, create a pending assignment request instead of automatically assigning a teacher. Let admins/super-admins assign students to teachers. Add structured mistake categories and quick feedback options so teachers can mark common mistakes without typing every note manually.

---

## 32. Latest Database Review Decisions

This version selectively adopts the useful database review feedback without over-engineering the MVP.

### Adopted

```text
- Composite integrity constraint between submissions and submission_attempts.
- current_attempt_id remains nullable and is updated inside backend transactions.
- Composite indexes for real app queries.
- Partial unread-notification index.
- Annotation pagination and lightweight marker endpoint.
- Explicit backend progress snapshot recalculation.
```

### Deferred

```text
- GIN indexes on annotation style/points JSONB.
- Lookup tables for every enum.
- Database triggers for progress recalculation.
- Cron-based progress snapshot refresh.
- Soft-delete partial unique index for student_page_progress.
```

