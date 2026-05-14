# Backend Request Flow

## Standard Authenticated Request

```mermaid
flowchart TD
    REQ["Incoming HTTP Request"]
    CORS["CORS middleware\n(express cors)"]
    PARSE["Body Parser\n(express.json)"]
    HEALTH{"GET /health?"}
    ROUTE["Express Route Match"]
    AUTH["authenticate() middleware\n→ reads Authorization: Bearer token\n→ supabaseAdmin.auth.getUser(token)\n→ loads public.users row\n→ attaches req.user"]
    AUTH_FAIL["401 Unauthorized\n{error:{message:'...'}}"]
    ROLE{"requireRole()\nmiddleware present?"}
    ROLE_CHECK["requireRole() check\nreq.user.role in allowedRoles?"]
    ROLE_FAIL["403 Forbidden"]
    ZOD{"Request body\nrequires validation?"}
    ZOD_PARSE["Zod schema.parse(req.body)"]
    ZOD_FAIL["400 Bad Request\n{error:{issues:[...]}}"]
    SVC["Service method call\n(e.g. quranContentService.getPage)"]
    IMPL{"Service\nimplemented?"}
    STUB["501 Not Implemented\n(AppError thrown by stub)"]
    DB["Supabase Postgres\n(service role queries)"]
    EXT["External API\n(Quran.Foundation on cache miss)"]
    RESP["200/201 JSON Response"]
    ERR["errorHandler middleware\nAppError → statusCode\nZodError → 400\nunknown → 500"]

    REQ --> CORS --> PARSE
    PARSE --> HEALTH
    HEALTH -->|yes| RESP
    HEALTH -->|no| ROUTE
    ROUTE --> AUTH
    AUTH -->|invalid/missing token| AUTH_FAIL
    AUTH -->|valid| ROLE
    ROLE -->|no role guard| ZOD
    ROLE -->|has role guard| ROLE_CHECK
    ROLE_CHECK -->|pass| ZOD
    ROLE_CHECK -->|fail| ROLE_FAIL
    ZOD -->|no schema| SVC
    ZOD -->|has schema| ZOD_PARSE
    ZOD_PARSE -->|invalid| ZOD_FAIL
    ZOD_PARSE -->|valid| SVC
    SVC --> IMPL
    IMPL -->|"✅ implemented"| DB
    IMPL -->|"⬜ stub — throws AppError(501)"| STUB
    DB --> EXT
    DB --> RESP
    EXT --> DB
    STUB --> ERR
    AUTH_FAIL --> ERR
    ROLE_FAIL --> ERR
    ZOD_FAIL --> ERR
    ERR --> RESP
```

## Which Routes Are Implemented vs. Stubbed

### ✅ Fully implemented (Phase 3–4)

| Route | Service | Notes |
|-------|---------|-------|
| GET /api/me | inline (no service) | bootstraps user_profiles |
| PATCH /api/me/profile | inline | updates users + user_profiles |
| GET /api/quran/pages/lookup | QuranContentService | cache-first |
| GET /api/quran/pages/:n | QuranContentService | cache-first |
| GET /api/quran/pages/:n/content | QuranContentService | cache-first, optional words |

### ⬜ Registered but stubbed — throw AppError(501)

All other routes are registered (auth guard fires, role guard fires, Zod validates) but the service call hits a stub that throws `AppError(501, 'Not implemented')`. The 501 is surfaced only if a valid, correctly-authorized token is provided. Unauthenticated requests see 401 before the 501 is ever reached.

```
AssignmentService   → POST /api/assignments, GET /api/student/assignments, GET /api/teacher/review-queue
SubmissionService   → POST /api/submissions, GET /api/submissions/:id
AttemptService      → POST /api/submissions/:id/attempts
AnnotationService   → GET/POST /api/attempts/:id/annotations, batch-save, markers, mistake categories
ProgressService     → GET /api/student/progress (and surah/juz sub-routes)
NotificationService → GET /api/notifications, read, read-all, device register
MediaService        → POST /api/uploads/signed-url, GET /api/media/signed-read-url
AdminService        → GET/PATCH /api/admin/assignment-requests, user management
```
