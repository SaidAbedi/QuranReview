# System Overview

## Component Map

```mermaid
graph TD
    subgraph "Mobile App (future — Phase 13+)"
        MA["React Native\nExpo Dev Client"]
    end

    subgraph "Backend API (Node.js + Express) ✅"
        API["Express Routes\n/api/*"]
        AUTH_MW["Auth Middleware\nauthenticate()"]
        ROLE_MW["Role Middleware\nrequireRole()"]
        SVC["Service Layer\n(QuranContentService ✅\nAssignmentService ⬜\nSubmissionService ⬜\nAnnotationService ⬜\nProgressService ⬜\nNotificationService ⬜\nMediaService ⬜)"]
    end

    subgraph "Supabase"
        SA["Supabase Auth\n(JWT issuer) ✅"]
        SP["Supabase Postgres\n(primary datastore) ✅"]
        SS["Supabase Storage\n(audio + images) ⬜"]
    end

    subgraph "External APIs"
        QF["Quran.Foundation API\n(verse + word data) ✅"]
    end

    MA -->|"Bearer JWT (Phase 13+)"| API
    API --> AUTH_MW
    AUTH_MW -->|"getUser(token)"| SA
    AUTH_MW --> ROLE_MW
    ROLE_MW --> SVC
    SVC -->|"service role queries"| SP
    SVC -->|"signed URL generation (Phase 9+)"| SS
    SVC -->|"cache miss fetch"| QF
    QF -->|"verses + word data"| SVC
    SVC -->|"upsert"| SP
```

## Status by Layer

| Layer | Status | Notes |
|-------|--------|-------|
| Supabase Auth + DB schema | ✅ | Migrations 001–003 applied |
| Express skeleton + middleware | ✅ | Auth, role, error handler |
| GET /api/me, PATCH /api/me/profile | ✅ | Phase 3 |
| Quran content proxy + cache | ✅ | Phase 4 |
| Supabase Storage integration | ⬜ | Phase 9 |
| Assignment + submission routes | ⬜ | Phase 5 |
| Teacher review + annotations | ⬜ | Phases 6–7 |
| Progress tracking | ⬜ | Phase 8 |
| Notifications | ⬜ | Phase 10 |
| Admin assignment management | ⬜ | Phase 11 |
| React Native mobile app | ⬜ | Phase 13+ |

## Data Ownership Rules (enforced on every route)

- Students access only their own submissions.
- Teachers access only submissions under their assignments.
- Admins and super_admins can read all; only super_admins can change roles.
- Quran.Foundation secrets never leave the backend.
- Supabase service-role key never reaches mobile code.
- Signed URLs are generated on demand; never stored in DB.
