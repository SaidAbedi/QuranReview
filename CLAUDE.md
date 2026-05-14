# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository is **pre-implementation**: there is no code, package manifest, or build tooling yet. Every file you create is the first of its kind. Do not invent build/test/lint commands or directory layouts that contradict the blueprint — follow the blueprint's recommendations.

## Source-of-Truth Documents

Two external documents drive this project. **The blueprint is authoritative**; if implementation details conflict with the blueprint, stop and ask for clarification before inventing a new pattern.

- **Blueprint** (authoritative architecture): `quran-recitation-review-final-blueprint.md` (repo root)
- **Coding-agent prompt** (working style, phase order): `/Users/saidabedi/Downloads/coding-agent-prompt-quran-recitation-review.md` (local, not in repo)

Re-read both at the start of any major task. Specific section references below cite the blueprint.

## Product (One Sentence)

A **human teacher-led** Quran recitation review platform: students submit page recordings; teachers annotate the same page with freehand marks, tap-to-word selections, quick mistake labels, text notes, and voice notes; students track progress across page/surah/juz/full Quran. It is explicitly **not** an AI tajweed grader (§1, §3).

## Required Working Style — Phased Delivery with Review Checkpoints

This is non-negotiable. Do **not** implement the whole product in one shot.

1. State the goal of the phase.
2. List files you expect to create or modify.
3. Explain the architecture decision in plain English.
4. Implement the phase.
5. Produce a review summary in **exactly** this format (from the coding-agent prompt):

   ```markdown
   # Phase Review: <Phase Name>
   ## What Was Built
   ## Files Created or Modified
   ## Architecture Explanation
   ## How This Connects to the Blueprint
   ## Assumptions Made
   ## Risks / Things to Watch
   ## Suggested Next Phase
   ## Questions for User Review
   ```

6. **Stop and wait for user approval** before starting the next major phase. Do not skip checkpoints.

### Phase Order

`0` Plan confirmation → `1` Supabase schema → `2` Express backend skeleton → `3` Auth/profile → `4` Quran content proxy → `5` Assignments/submissions/attempts → `6` Storage & signed URLs → `7` Annotations → `8` Review completion & progress → `9` Notifications → `10` Admin assignment → `11` Mobile foundation (Expo Dev Client) → `12` Student mobile flow → `13` Teacher mobile flow → `14` Admin mobile/web flow.

Full per-phase deliverables live in the coding-agent prompt and §28 of the blueprint.

## Stack (Confirmed)

| Layer | Choice | Notes |
| --- | --- | --- |
| Mobile | React Native + **Expo Development Client** | Not plain Expo Go (§6.1) — native modules needed for audio/storage/annotation |
| Backend | Node.js + Express | |
| Auth / DB / Object storage | Supabase (Auth + Postgres + Storage) | |
| Quran content | Quran.Foundation / Quran.com APIs via **backend proxy/cache only** | Secrets must never reach mobile (§6.2, §7) |
| Mushaf layout | **One layout only** for MVP: Quran.Foundation Mushaf ID 1 / QCF V2 (§6.3) |
| Local mobile persistence | Expo SQLite | For offline drafts, upload queues, signed-URL cache, annotation sync queue |
| Push | Expo Notifications | Backed by durable `notifications` table; push is best-effort only |
| Payments | Stripe-ready backend tables, **UI hidden in MVP** |

### Backend Env Vars (§7.2)

```
QURAN_FOUNDATION_CLIENT_ID=
QURAN_FOUNDATION_CLIENT_SECRET=
QURAN_FOUNDATION_API_BASE=https://apis.quran.foundation/content/api/v4
QURAN_FOUNDATION_DEFAULT_MUSHAF_ID=1
```

Plus standard Supabase URL/anon-key/service-role-key vars. **Never** ship the Supabase service-role key or Quran.Foundation client secret to the mobile app.

## Non-Negotiable Architectural Guardrails

Pulled from §30 of the blueprint. Apply these to every decision.

### Data model
- **Attempts are first-class.** `submissions` has many `submission_attempts`; never overwrite a previous recording. `Submission` = work item for a page; `SubmissionAttempt` = each recording (§11).
- `submissions.current_attempt_id` is **nullable** on insert. Insert submission → insert first attempt → update `current_attempt_id`, all in one transaction (§22.10).
- Enforce composite integrity: a `submission_attempt`'s `(submission_id, student_id, quran_page_id)` must match its parent submission. The blueprint shows the exact `UNIQUE` + composite FK in §22.10.
- **Source-of-truth tables** (do not invert these):
  - `student_page_progress` — whether a student completed a page.
  - `submission_attempts` — each recording.
  - `annotations` — teacher feedback on a specific attempt.
  - `notifications` — in-app notification state. Push is best-effort.
  - `student_progress_snapshots` — derived read model **only**; recompute in backend service code after review completion. **No DB triggers, no cron** for MVP (§19, §5A.3).
- One durable `student_page_progress` row per `(student_id, quran_page_id)`. Update by status; do **not** delete+recreate, and do **not** soft-delete this table in MVP (§20).
- Soft-delete (`deleted_at`, `deleted_by`, `delete_reason`) attempts, recordings, annotations, and voice notes — never hard-delete in user flows (§20).

### Storage & media
- Store **stable storage keys** in DB, never signed URLs (§13.3).
- Generate signed upload URLs and signed read URLs on demand; mobile must refresh before playback if expired (§14).
- Path conventions (§13.1, §13.2):
  - `student-recordings/{studentId}/{assignmentId}/{submissionId}/attempts/attempt-NNN.m4a`
  - `teacher-voice-notes/{teacherId}/{submissionId}/{attemptId}/{annotationId}.m4a`

### Annotations
- Support **both** freehand and tap-to-word. Build freehand first (works without reliable word bounds), then tap-to-word (§8.3).
- Freehand coordinates are **normalized 0–1** relative to rendered page (§9, §10). Helpers in §10.1/§10.2.
- Simplify paths before save (Ramer-Douglas-Peucker or distance threshold). Caps: ≤500 points/annotation after simplification, ≤50 annotations/batch (§17).
- **Do not** return full annotation paths from list endpoints or submission summaries. Use:
  - `GET …/annotation-markers` — lightweight markers for playback timeline.
  - `GET …/annotations?limit=&cursor=` — paginated full payloads, loaded only on review screen (§17.1).
- Batch annotation saves locally and sync via `POST …/annotations/batch`. Never POST per stroke (§16).
- Store quick mistake feedback as **structured** `mistake_type` + `mistake_option_id` + optional `quick_label` — not only free text (§8A.4).

### Notifications
- Write the `notifications` row first; push delivery is best-effort. Mobile UX must work without push.
- Unread count query relies on the partial index `WHERE read_at IS NULL` (§23).

### Assignment workflow
- New student signup creates a `student_assignment_requests` row with status `pending_assignment`. **Do not auto-assign** to a teacher. Admin/super-admin assigns; both teacher and student get notifications (§12A.2).

### Indexes (defer until needed)
- **Do NOT** add: GIN indexes on `annotations.points`/`style`, lookup tables for every enum, DB triggers for progress, cron-based snapshot refresh, soft-delete partial unique index on `student_page_progress` (§5A.2, §32).
- **DO** add the composite indexes listed in §23 — they match real screens (teacher review queue, student submissions, annotations-by-timestamp, unread notifications).

## Roles & Authorization

Roles: `student`, `teacher`, `admin`, `super_admin` (§12A.1). The `users.role` CHECK constraint must include all four.

Every backend endpoint must verify ownership/relationship (§26). Examples:
- Student accesses a submission only if `submission.student_id = current_user.id`.
- Teacher accesses a submission only if `assignment.teacher_id = current_user.id`.
- Teacher creates annotation only on submissions in their assignment.

## Status Vocabulary

Backend uses neutral terms; student-facing UI uses respectful language (§12).

- Backend: `draft`, `submitted`, `in_review`, `reviewed`, `needs_resubmission`, `completed`, `archived`.
- Teacher actions: **Mark as Complete**, **Request Another Attempt**.
- Student-facing labels: `Submitted`, `Teacher Reviewing`, `Returned for Practice`, `Completed`.
- **Avoid** language like `failed`, `wrong`, `rejected`.

A page counts toward progress only when a teacher marks a specific attempt `completed` — not when audio uploads (§19).

## Mobile Folder Structure (when Phase 11 starts)

From §25. Use this exact layout:

```
src/
  app/{navigation,providers}
  features/{auth,assignments,submissions,attempts,review,quran-page,
            annotations,audio,progress,offline-sync,notifications,
            admin,teacher-assignment,mistake-feedback}
  shared/{api,components,hooks,types,utils}
```

## Security Rules (Hard)

- Never hardcode the Supabase **service-role** key in mobile code.
- Never expose Quran.Foundation client secrets in mobile code — proxy everything through backend.
- Never store signed URLs as permanent DB references.
- Never hard-delete student recordings or teacher annotations in normal user flows.
- Role-based access checks on **every** backend endpoint.

## When in Doubt

The blueprint is the source of truth. If an implementation detail conflicts with the blueprint, stop and ask. Do not invent large new architecture patterns without explaining the tradeoff and getting user approval.
