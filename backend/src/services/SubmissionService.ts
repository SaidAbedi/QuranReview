import { supabaseAdmin, requirePgPool } from '../db/client';
import { AppError, SubmissionStatus, UserRole } from '../types';
import { mediaService, MediaService } from './MediaService';

export interface CreateSubmissionInput {
  assignmentId: string;
  recordingDurationMs?: number;
  originalFileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface SubmissionRow {
  id: string;
  assignmentId: string;
  studentId: string;
  quranPageId: string;
  currentAttemptId: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttemptRow {
  id: string;
  submissionId: string;
  studentId: string;
  quranPageId: string;
  attemptNumber: number;
  recordingStorageKey: string;
  recordingDurationMs: number | null;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmissionResult {
  submission: SubmissionRow;
  attempt: AttemptRow;
  uploadUrl: string;
  storageKey: string;
  uploadExpiresAt: string;
}

export class SubmissionService {
  // Blueprint §22.10: insert submission → insert attempt → update current_attempt_id
  // all inside a single Postgres transaction.
  async createSubmission(
    studentId: string,
    input: CreateSubmissionInput,
  ): Promise<CreateSubmissionResult> {
    // Verify the assignment belongs to this student and is in an assignable state.
    const { data: assignment } = await supabaseAdmin
      .from('assignments')
      .select('id, quran_page_id, teacher_id, status')
      .eq('id', input.assignmentId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) throw new AppError(404, 'Assignment not found or not assigned to you');
    if (assignment.status === 'archived') throw new AppError(409, 'Assignment is archived');

    // One submission per assignment per student.
    const { data: existing } = await supabaseAdmin
      .from('submissions')
      .select('id')
      .eq('assignment_id', input.assignmentId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (existing) throw new AppError(409, 'Submission already exists for this assignment — use POST /attempts to add another attempt');

    const pool = requirePgPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insert submission (current_attempt_id nullable on insert per blueprint §22.10)
      const { rows: [sub] } = await client.query<Record<string, unknown>>(`
        INSERT INTO submissions (assignment_id, student_id, quran_page_id, status)
        VALUES ($1, $2, $3, 'submitted')
        RETURNING *
      `, [input.assignmentId, studentId, assignment.quran_page_id]);

      // 2. Build deterministic storage key now that submissionId is known (blueprint §13.1)
      const storageKey = MediaService.buildStudentRecordingKey(
        studentId,
        sub.id as string,
        1,
      );

      // 3. Insert first attempt with the stable key
      const { rows: [attempt] } = await client.query<Record<string, unknown>>(`
        INSERT INTO submission_attempts (
          submission_id, student_id, quran_page_id, attempt_number,
          recording_storage_key, recording_duration_ms, original_file_name,
          content_type, size_bytes, status
        ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'submitted')
        RETURNING *
      `, [
        sub.id, studentId, assignment.quran_page_id,
        storageKey,
        input.recordingDurationMs ?? null,
        input.originalFileName ?? null,
        input.contentType ?? null,
        input.sizeBytes ?? null,
      ]);

      // 4. Close the circular reference: set current_attempt_id
      await client.query(`
        UPDATE submissions
        SET current_attempt_id = $1, updated_at = now()
        WHERE id = $2
      `, [attempt.id, sub.id]);

      // 5. Update assignment status to reflect submission
      await client.query(`
        UPDATE assignments SET status = 'submitted', updated_at = now() WHERE id = $1
      `, [input.assignmentId]);

      await client.query('COMMIT');

      // Generate signed upload URL after commit — key is now stable in DB
      const uploadResult = await mediaService.getSignedUploadUrl(
        studentId,
        'student_recording',
        input.contentType ?? 'audio/m4a',
        sub.id as string,
        1,
      );

      return {
        submission: toSubmissionRow({ ...sub, current_attempt_id: attempt.id }),
        attempt: toAttemptRow(attempt),
        uploadUrl: uploadResult.uploadUrl,
        storageKey: uploadResult.storageKey,
        uploadExpiresAt: uploadResult.expiresAt,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err instanceof AppError ? err : new AppError(500, 'Failed to create submission');
    } finally {
      client.release();
    }
  }

  async getSubmission(
    submissionId: string,
    userId: string,
    role: UserRole = 'student',
  ): Promise<SubmissionRow> {
    const { data } = await supabaseAdmin
      .from('submissions')
      .select('*, assignments!inner(teacher_id)')
      .eq('id', submissionId)
      .maybeSingle();

    if (!data) throw new AppError(404, 'Submission not found');

    const row = data as Record<string, unknown>;
    const teacherId = (row.assignments as Record<string, unknown>)?.teacher_id;

    if (role === 'student' && row.student_id !== userId) {
      throw new AppError(403, 'Access denied');
    }
    if (role === 'teacher' && teacherId !== userId) {
      throw new AppError(403, 'Access denied');
    }

    return toSubmissionRow(row);
  }

  async getStudentSubmissions(
    studentId: string,
    limit = 20,
    offset = 0,
  ): Promise<SubmissionRow[]> {
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new AppError(500, 'Failed to fetch submissions');
    return (data ?? []).map((r) => toSubmissionRow(r as Record<string, unknown>));
  }

  async getTeacherSubmissions(
    teacherId: string,
    limit = 20,
    offset = 0,
  ): Promise<SubmissionRow[]> {
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .select('*, assignments!inner(teacher_id)')
      .eq('assignments.teacher_id', teacherId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new AppError(500, 'Failed to fetch submissions');
    return (data ?? []).map((r) => toSubmissionRow(r as Record<string, unknown>));
  }
}

export function toSubmissionRow(row: Record<string, unknown>): SubmissionRow {
  return {
    id: row.id as string,
    assignmentId: row.assignment_id as string,
    studentId: row.student_id as string,
    quranPageId: row.quran_page_id as string,
    currentAttemptId: (row.current_attempt_id as string | null) ?? null,
    status: row.status as SubmissionStatus,
    submittedAt: row.submitted_at as string,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function toAttemptRow(row: Record<string, unknown>): AttemptRow {
  return {
    id: row.id as string,
    submissionId: row.submission_id as string,
    studentId: row.student_id as string,
    quranPageId: row.quran_page_id as string,
    attemptNumber: row.attempt_number as number,
    recordingStorageKey: row.recording_storage_key as string,
    recordingDurationMs: (row.recording_duration_ms as number | null) ?? null,
    originalFileName: (row.original_file_name as string | null) ?? null,
    contentType: (row.content_type as string | null) ?? null,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    status: row.status as string,
    submittedAt: row.submitted_at as string,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const submissionService = new SubmissionService();
