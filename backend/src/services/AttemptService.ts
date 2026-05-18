import { supabaseAdmin, requirePgPool } from '../db/client';
import { AppError, AttemptStatus, NotificationType, UserRole } from '../types';
import { toAttemptRow, AttemptRow, toSubmissionRow, SubmissionRow } from './SubmissionService';
import { mediaService, MediaService } from './MediaService';

export interface CreateAttemptInput {
  recordingDurationMs?: number;
  originalFileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface CreateAttemptResult {
  attempt: AttemptRow;
  uploadUrl: string;
  storageKey: string;
  uploadExpiresAt: string;
}

export interface CompleteReviewResult {
  attempt: AttemptRow;
  submission: SubmissionRow;
  assignmentStatus: string;
  pageProgressStatus: string;
}

export type CompleteReviewPageStatus = 'completed' | 'needs_resubmission';

export class AttemptService {
  // Verifies ownership, then runs transaction:
  //   lock submission → get max(attempt_number) → insert attempt → update current_attempt_id → reset assignment
  async createAttempt(
    submissionId: string,
    studentId: string,
    input: CreateAttemptInput,
  ): Promise<CreateAttemptResult> {
    // Ownership: submission must belong to this student
    const { data: sub } = await supabaseAdmin
      .from('submissions')
      .select('id, quran_page_id, assignment_id, status')
      .eq('id', submissionId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!sub) throw new AppError(404, 'Submission not found or not yours');
    if (sub.status === 'completed' || sub.status === 'archived') {
      throw new AppError(409, `Cannot add attempt to a ${sub.status} submission`);
    }

    const pool = requirePgPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock the submission row to serialize concurrent attempt inserts
      await client.query('SELECT id FROM submissions WHERE id = $1 FOR UPDATE', [submissionId]);

      const { rows: [maxRow] } = await client.query<{ max: string }>(
        `SELECT COALESCE(MAX(attempt_number), 0) AS max
         FROM submission_attempts
         WHERE submission_id = $1`,
        [submissionId],
      );
      const nextAttemptNumber = parseInt(maxRow.max, 10) + 1;

      // Build deterministic key using submissionId + attemptNumber (blueprint §13.1)
      const storageKey = MediaService.buildStudentRecordingKey(
        studentId,
        submissionId,
        nextAttemptNumber,
      );

      const { rows: [attempt] } = await client.query<Record<string, unknown>>(`
        INSERT INTO submission_attempts (
          submission_id, student_id, quran_page_id, attempt_number,
          recording_storage_key, recording_duration_ms, original_file_name,
          content_type, size_bytes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted')
        RETURNING *
      `, [
        submissionId,
        studentId,
        sub.quran_page_id,
        nextAttemptNumber,
        storageKey,
        input.recordingDurationMs ?? null,
        input.originalFileName ?? null,
        input.contentType ?? null,
        input.sizeBytes ?? null,
      ]);

      // Update submission: new current attempt, reset status to submitted
      await client.query(`
        UPDATE submissions
        SET current_attempt_id = $1, status = 'submitted', updated_at = now()
        WHERE id = $2
      `, [attempt.id, submissionId]);

      // Re-queue the assignment for teacher review (handles post-resubmission case)
      await client.query(`
        UPDATE assignments
        SET status = 'submitted', updated_at = now()
        WHERE id = $1 AND status != 'archived'
      `, [sub.assignment_id]);

      await client.query('COMMIT');

      // Generate signed upload URL after commit
      const uploadResult = await mediaService.getSignedUploadUrl(
        studentId,
        'student_recording',
        input.contentType ?? 'audio/m4a',
        submissionId,
        nextAttemptNumber,
      );

      return {
        attempt: toAttemptRow(attempt),
        uploadUrl: uploadResult.uploadUrl,
        storageKey: uploadResult.storageKey,
        uploadExpiresAt: uploadResult.expiresAt,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err instanceof AppError ? err : new AppError(500, 'Failed to create attempt');
    } finally {
      client.release();
    }
  }

  async getAttemptById(
    submissionId: string,
    attemptId: string,
    userId: string,
    role: UserRole,
  ): Promise<AttemptRow> {
    const { data: attempt } = await supabaseAdmin
      .from('submission_attempts')
      .select('*, submissions!submission_attempts_submission_id_fkey!inner(student_id, assignments!inner(teacher_id))')
      .eq('id', attemptId)
      .eq('submission_id', submissionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!attempt) throw new AppError(404, 'Attempt not found');

    const row = attempt as Record<string, unknown>;
    const sub = row.submissions as Record<string, unknown>;
    const assignment = sub?.assignments as Record<string, unknown>;

    if (role === 'student' && row.student_id !== userId) throw new AppError(403, 'Access denied');
    if (role === 'teacher' && assignment?.teacher_id !== userId) throw new AppError(403, 'Access denied');

    return toAttemptRow(row);
  }

  async getAttemptsBySubmission(
    submissionId: string,
    userId: string,
    role: UserRole,
  ): Promise<AttemptRow[]> {
    // Verify access to the submission first
    const { data: sub } = await supabaseAdmin
      .from('submissions')
      .select('id, student_id, assignments!inner(teacher_id)')
      .eq('id', submissionId)
      .maybeSingle();

    if (!sub) throw new AppError(404, 'Submission not found');

    const subRow = sub as Record<string, unknown>;
    const assignment = subRow.assignments as Record<string, unknown>;

    if (role === 'student' && subRow.student_id !== userId) throw new AppError(403, 'Access denied');
    if (role === 'teacher' && assignment?.teacher_id !== userId) throw new AppError(403, 'Access denied');

    const { data, error } = await supabaseAdmin
      .from('submission_attempts')
      .select('*')
      .eq('submission_id', submissionId)
      .is('deleted_at', null)
      .order('attempt_number', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch attempts');
    return (data ?? []).map((r) => toAttemptRow(r as Record<string, unknown>));
  }

  // Phase 6 — teacher marks attempt reviewed or requests resubmission.
  async completeReview(
    submissionId: string,
    attemptId: string,
    reviewerId: string,
    reviewerRole: UserRole,
    pageStatus: CompleteReviewPageStatus,
  ): Promise<CompleteReviewResult> {
    // ── Pre-flight: fetch attempt + submission + assignment ──────────────────
    const { data: raw } = await supabaseAdmin
      .from('submission_attempts')
      .select(`
        *,
        submissions!submission_attempts_submission_id_fkey!inner(
          id, student_id, assignment_id, status,
          assignments!inner(id, teacher_id, status)
        )
      `)
      .eq('id', attemptId)
      .eq('submission_id', submissionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!raw) throw new AppError(404, 'Attempt not found');

    const attemptRow = raw as Record<string, unknown>;
    const sub = attemptRow.submissions as Record<string, unknown>;
    const assignment = sub.assignments as Record<string, unknown>;

    const studentId = sub.student_id as string;
    const assignmentId = sub.assignment_id as string;
    const teacherId = assignment.teacher_id as string;

    // ── Access control ───────────────────────────────────────────────────────
    if (reviewerRole === 'teacher') {
      if (teacherId !== reviewerId) {
        throw new AppError(403, 'Access denied: not your assignment');
      }
      const { data: rel } = await supabaseAdmin
        .from('teacher_student_relationships')
        .select('id')
        .eq('teacher_id', reviewerId)
        .eq('student_id', studentId)
        .eq('status', 'active')
        .maybeSingle();
      if (!rel) throw new AppError(403, 'Access denied: no active relationship with this student');
    } else if (reviewerRole !== 'admin' && reviewerRole !== 'super_admin') {
      throw new AppError(403, 'Access denied');
    }

    // ── Guard: attempt must be in a reviewable state ─────────────────────────
    const currentAttemptStatus = attemptRow.status as string;
    if (currentAttemptStatus === 'completed' || currentAttemptStatus === 'needs_resubmission') {
      throw new AppError(409, `Attempt is already in status "${currentAttemptStatus}"`);
    }
    if (currentAttemptStatus === 'archived') {
      throw new AppError(409, 'Cannot review an archived attempt');
    }

    // ── Fetch page_number (required for student_page_progress) ───────────────
    const quranPageId = attemptRow.quran_page_id as string;
    const { data: pageData } = await supabaseAdmin
      .from('quran_pages')
      .select('page_number')
      .eq('id', quranPageId)
      .maybeSingle();

    if (!pageData) throw new AppError(500, 'Could not resolve quran page');
    const pageNumber = (pageData as Record<string, unknown>).page_number as number;

    // ── Status mapping ────────────────────────────────────────────────────────
    const attemptStatus: AttemptStatus = pageStatus === 'completed' ? 'completed' : 'needs_resubmission';
    const submissionStatus = pageStatus === 'completed' ? 'completed' : 'needs_resubmission';
    const progressStatus = pageStatus === 'completed' ? 'completed' : 'needs_resubmission';
    const attemptNumber = attemptRow.attempt_number as number;

    // ── Transaction ───────────────────────────────────────────────────────────
    const pool = requirePgPool();
    const client = await pool.connect();

    let updatedAttempt: Record<string, unknown>;
    let updatedSubmission: Record<string, unknown>;

    try {
      await client.query('BEGIN');

      // Lock the submission row
      await client.query('SELECT id FROM submissions WHERE id = $1 FOR UPDATE', [submissionId]);

      // 1. Update attempt
      const { rows: [att] } = await client.query<Record<string, unknown>>(`
        UPDATE submission_attempts
        SET status = $1, reviewed_at = now(), updated_at = now()
        WHERE id = $2
        RETURNING *
      `, [attemptStatus, attemptId]);
      updatedAttempt = att;

      // 2. Update submission
      const completedAtUpdate = pageStatus === 'completed' ? ', completed_at = now()' : '';
      const { rows: [updSub] } = await client.query<Record<string, unknown>>(`
        UPDATE submissions
        SET status = $1, reviewed_at = now()${completedAtUpdate}, updated_at = now()
        WHERE id = $2
        RETURNING *
      `, [submissionStatus, submissionId]);
      updatedSubmission = updSub;

      // 3. Update assignment → 'reviewed' (leaves review queue)
      await client.query(`
        UPDATE assignments
        SET status = 'reviewed', updated_at = now()
        WHERE id = $1
      `, [assignmentId]);

      // 4. Upsert student_page_progress
      const completedAttemptId = pageStatus === 'completed' ? attemptId : null;
      const completedAt = pageStatus === 'completed' ? new Date().toISOString() : null;

      await client.query(`
        INSERT INTO student_page_progress
          (student_id, quran_page_id, page_number, status,
           latest_submission_id, latest_attempt_id, completed_attempt_id,
           attempt_count, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (student_id, quran_page_id) DO UPDATE SET
          status                = EXCLUDED.status,
          latest_submission_id  = EXCLUDED.latest_submission_id,
          latest_attempt_id     = EXCLUDED.latest_attempt_id,
          completed_attempt_id  = CASE
            WHEN EXCLUDED.status = 'completed' THEN EXCLUDED.completed_attempt_id
            ELSE student_page_progress.completed_attempt_id
          END,
          attempt_count         = EXCLUDED.attempt_count,
          completed_at          = CASE
            WHEN EXCLUDED.status = 'completed' THEN EXCLUDED.completed_at
            ELSE student_page_progress.completed_at
          END,
          updated_at            = now()
      `, [
        studentId, quranPageId, pageNumber, progressStatus,
        submissionId, attemptId, completedAttemptId,
        attemptNumber, completedAt,
      ]);

      // 5. Insert notification (inside transaction so it's atomic with the review)
      const notifType: NotificationType = pageStatus === 'completed'
        ? 'teacher_completed_review'
        : 'teacher_requested_resubmission';
      const notifTitle = pageStatus === 'completed'
        ? 'Your recitation has been marked complete'
        : 'Your teacher has requested a new attempt';
      const notifBody = pageStatus === 'completed'
        ? `Page ${pageNumber} is now complete.`
        : `Please re-record and resubmit page ${pageNumber}.`;

      await client.query(`
        INSERT INTO notifications
          (recipient_user_id, actor_user_id, type, title, body, data, channel, delivery_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'in_app', 'pending')
      `, [
        studentId, reviewerId, notifType, notifTitle, notifBody,
        JSON.stringify({ submissionId, attemptId, assignmentId, quranPageId, pageNumber }),
      ]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err instanceof AppError ? err : new AppError(500, 'Failed to complete review');
    } finally {
      client.release();
    }

    return {
      attempt: toAttemptRow(updatedAttempt!),
      submission: toSubmissionRow(updatedSubmission!),
      assignmentStatus: 'reviewed',
      pageProgressStatus: progressStatus,
    };
  }
}

export const attemptService = new AttemptService();
