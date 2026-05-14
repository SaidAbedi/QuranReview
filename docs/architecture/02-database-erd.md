# Database ERD

Ownership structure and relationship flow. Omits index-only columns and timestamps for readability.

```mermaid
erDiagram
    USERS {
        uuid id PK
        string email
        string display_name
        enum role "student|teacher|admin|super_admin"
    }

    USER_PROFILES {
        uuid user_id FK
        enum onboarding_status
        string preferred_language
        string timezone
        string student_age_group
        int teacher_capacity
        int teacher_current_load
    }

    STUDENT_ASSIGNMENT_REQUESTS {
        uuid id PK
        uuid student_id FK
        enum status "pending_assignment|assigned|waitlisted|declined|archived"
    }

    TEACHER_STUDENT_RELATIONSHIPS {
        uuid id PK
        uuid teacher_id FK
        uuid student_id FK
        enum status
    }

    ASSIGNMENTS {
        uuid id PK
        uuid teacher_id FK
        uuid student_id FK
        uuid quran_page_id FK
        string title
        enum status
    }

    SUBMISSIONS {
        uuid id PK
        uuid assignment_id FK
        uuid student_id FK
        uuid quran_page_id FK
        uuid current_attempt_id FK "nullable — set after first attempt"
        enum status
    }

    SUBMISSION_ATTEMPTS {
        uuid id PK
        uuid submission_id FK
        uuid student_id FK
        uuid quran_page_id FK
        string audio_storage_key
        enum status
        timestamp submitted_at
        timestamp deleted_at
    }

    QURAN_ANNOTATIONS {
        uuid id PK
        uuid submission_attempt_id FK
        uuid teacher_id FK
        enum annotation_type
        enum anchor_type
        jsonb points "normalized 0-1 coords"
        jsonb style
        timestamp deleted_at
    }

    ANNOTATION_VOICE_NOTES {
        uuid id PK
        uuid annotation_id FK
        uuid teacher_id FK
        string audio_storage_key
        timestamp deleted_at
    }

    STUDENT_PAGE_PROGRESS {
        uuid id PK
        uuid student_id FK
        uuid quran_page_id FK
        enum status
        int completion_count
    }

    STUDENT_PROGRESS_SNAPSHOTS {
        uuid id PK
        uuid student_id FK
        jsonb surah_progress
        jsonb juz_progress
        int total_pages_completed
    }

    NOTIFICATIONS {
        uuid id PK
        uuid recipient_id FK
        uuid actor_id FK
        enum type
        jsonb payload
        timestamp read_at "null = unread"
    }

    MISTAKE_CATEGORIES {
        uuid id PK
        string name
        enum mistake_type
    }

    MISTAKE_OPTIONS {
        uuid id PK
        uuid category_id FK
        string label
        string quick_label
    }

    QURAN_PAGES {
        uuid id PK
        int page_number
        string provider
        int provider_mushaf_id
        string mushaf_id
        string image_url "null until populated"
    }

    QURAN_PAGE_MAPPINGS {
        uuid id PK
        uuid quran_page_id FK
        int page_number
        int surah_number
        int juz_number
        string first_verse_key
        string last_verse_key
        jsonb source_payload
    }

    USERS ||--o| USER_PROFILES : "has one"
    USERS ||--o{ STUDENT_ASSIGNMENT_REQUESTS : "student has"
    USERS ||--o{ TEACHER_STUDENT_RELATIONSHIPS : "teacher has"
    USERS ||--o{ ASSIGNMENTS : "teacher creates / student receives"
    USERS ||--o{ SUBMISSIONS : "student owns"
    USERS ||--o{ SUBMISSION_ATTEMPTS : "student submits"
    USERS ||--o{ QURAN_ANNOTATIONS : "teacher creates"
    USERS ||--o{ STUDENT_PAGE_PROGRESS : "student has"
    USERS ||--o{ STUDENT_PROGRESS_SNAPSHOTS : "student has one"
    USERS ||--o{ NOTIFICATIONS : "recipient"

    ASSIGNMENTS ||--o{ SUBMISSIONS : "has many"
    SUBMISSIONS ||--o{ SUBMISSION_ATTEMPTS : "has many"
    SUBMISSIONS ||--o| SUBMISSION_ATTEMPTS : "current_attempt_id → one"
    SUBMISSION_ATTEMPTS ||--o{ QURAN_ANNOTATIONS : "teacher annotates"
    QURAN_ANNOTATIONS ||--o{ ANNOTATION_VOICE_NOTES : "has voice notes"

    QURAN_PAGES ||--o{ QURAN_PAGE_MAPPINGS : "has mappings"
    QURAN_PAGES ||--o{ ASSIGNMENTS : "used in"
    QURAN_PAGES ||--o{ SUBMISSIONS : "subject of"
    QURAN_PAGES ||--o{ STUDENT_PAGE_PROGRESS : "tracks progress on"

    MISTAKE_CATEGORIES ||--o{ MISTAKE_OPTIONS : "has options"
```

## Key Structural Notes

### Circular FK: submissions ↔ submission_attempts

`submissions.current_attempt_id` points into `submission_attempts`, but `submission_attempts.submission_id` also points back to `submissions`. Resolved with deferred ALTER TABLE (migration 001):

1. CREATE `submissions` (no FK on `current_attempt_id`)
2. ALTER TABLE `submissions` ADD unique `(id, student_id, quran_page_id)`
3. CREATE `submission_attempts` with composite FK matching that unique index
4. ALTER TABLE `submissions` ADD FK `current_attempt_id → submission_attempts.id`

### Composite FK on submission_attempts

`submission_attempts(submission_id, student_id, quran_page_id)` must match `submissions(id, student_id, quran_page_id)`. This prevents an attempt from being attached to a different student's submission.

### Source-of-truth tables

| Table | Purpose |
|-------|---------|
| `student_page_progress` | Whether a student completed a page (one row per student+page, never deleted) |
| `submission_attempts` | Each recording (soft-deleted only, never hard-deleted) |
| `quran_annotations` | Teacher feedback (soft-deleted only) |
| `notifications` | In-app notification state (push is best-effort) |
| `student_progress_snapshots` | Derived read model — recalculated in service code after review completion; no DB triggers |
