import { supabaseAdmin, requirePgPool } from '../db/client';
import { AppError, AttemptStatus, UserRole } from '../types';
import { toAttemptRow, AttemptRow } from './SubmissionService';
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

export type CompleteReviewPageStatus = 'completed' | 'needs_resubmission';

export class AttemptService {
  // Verifies ownership, then runs transaction:
  //   get max(attempt_number) → insert attempt → update current_attempt_id
  async createAttempt(
    submissionId: string,
    studentId: string,
    input: CreateAttemptInput,
  ): Promise<CreateAttemptResult> {
    // Ownership: submission must belong to this student
    const { data: sub } = await supabaseAdmin
      .from('submissions')
      .select('id, quran_page_id, status')
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

  // Phase 8 — teacher marks attempt reviewed or requests resubmission.
  async completeReview(
    _submissionId: string,
    _attemptId: string,
    _teacherId: string,
    _pageStatus: CompleteReviewPageStatus,
  ): Promise<AttemptRow> {
    throw new AppError(501, 'Review completion not implemented yet (Phase 8)');
  }
}

export const attemptService = new AttemptService();
