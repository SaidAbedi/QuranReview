import { supabaseAdmin } from '../db/client';
import { AppError, AttemptStatus, NotificationType, UserRole } from '../types';
import { toAttemptRow, AttemptRow, toSubmissionRow, SubmissionRow } from './SubmissionService';
import { mediaService, MediaService } from './MediaService';
import { progressService } from './ProgressService';

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
    // Ownership: submission must belong to this student.
    // Also join assignment to get teacher_id + page_number for the submission notification.
    const { data: sub } = await supabaseAdmin
      .from('submissions')
      .select('id, quran_page_id, assignment_id, status, assignments!inner(teacher_id, quran_pages(page_number))')
      .eq('id', submissionId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!sub) throw new AppError(404, 'Submission not found or not yours');
    if (sub.status === 'completed' || sub.status === 'archived') {
      throw new AppError(409, `Cannot add attempt to a ${sub.status} submission`);
    }

    // Get current max attempt number
    const { data: maxData } = await supabaseAdmin
      .from('submission_attempts')
      .select('attempt_number')
      .eq('submission_id', submissionId)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextAttemptNumber = maxData
      ? ((maxData as Record<string, unknown>).attempt_number as number) + 1
      : 1;

    // Build deterministic key using submissionId + attemptNumber (blueprint §13.1)
    const storageKey = MediaService.buildStudentRecordingKey(
      studentId,
      submissionId,
      nextAttemptNumber,
    );

    const { data: att, error: attError } = await supabaseAdmin
      .from('submission_attempts')
      .insert({
        submission_id: submissionId,
        student_id: studentId,
        quran_page_id: sub.quran_page_id,
        attempt_number: nextAttemptNumber,
        recording_storage_key: storageKey,
        recording_duration_ms: input.recordingDurationMs ?? null,
        original_file_name: input.originalFileName ?? null,
        content_type: input.contentType ?? null,
        size_bytes: input.sizeBytes ?? null,
        status: 'submitted',
      })
      .select('*')
      .single();

    if (attError || !att) throw new AppError(500, 'Failed to create attempt');
    const attempt = att as Record<string, unknown>;

    // Update submission: new current attempt, reset status to submitted
    await supabaseAdmin
      .from('submissions')
      .update({ current_attempt_id: attempt.id, status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', submissionId);

    // Re-queue the assignment for teacher review (handles post-resubmission case)
    await supabaseAdmin
      .from('assignments')
      .update({ status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', sub.assignment_id)
      .neq('status', 'archived');

    // Generate signed upload URL
    const uploadResult = await mediaService.getSignedUploadUrl(
      studentId,
      'student_recording',
      input.contentType ?? 'audio/m4a',
      submissionId,
      nextAttemptNumber,
    );

    // Notify teacher — fire and forget, non-blocking
    const subRow = sub as Record<string, unknown>;
    const asgn = subRow.assignments as Record<string, unknown> | null;
    const teacherId = asgn?.teacher_id as string | undefined;
    const pageData = asgn?.quran_pages as Record<string, unknown> | null;
    const pageNumber = pageData?.page_number as number | undefined;
    if (teacherId) {
      void Promise.resolve(supabaseAdmin.from('notifications').insert({
        recipient_user_id: teacherId,
        actor_user_id: studentId,
        type: 'student_submitted_attempt',
        title: 'New recording submitted',
        body: pageNumber
          ? `Page ${pageNumber} has been submitted for review.`
          : 'A student submitted a new recording.',
        data: { submissionId, attemptId: attempt.id as string, assignmentId: sub.assignment_id },
        channel: 'in_app',
        delivery_status: 'pending',
      })).catch((err: unknown) => {
        console.error('[AttemptService] Failed to create submission notification:', err);
      });
    }

    return {
      attempt: toAttemptRow(attempt),
      uploadUrl: uploadResult.uploadUrl,
      storageKey: uploadResult.storageKey,
      uploadExpiresAt: uploadResult.expiresAt,
    };
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

    const reviewedAt = new Date().toISOString();

    const notifType: NotificationType = pageStatus === 'completed'
      ? 'teacher_completed_review'
      : 'teacher_requested_resubmission';
    const notifTitle = pageStatus === 'completed'
      ? 'Your recitation has been marked complete'
      : 'Your teacher has requested a new attempt';
    const notifBody = pageStatus === 'completed'
      ? `Page ${pageNumber} is now complete.`
      : `Please re-record and resubmit page ${pageNumber}.`;

    // 1. Update attempt
    const { data: updAtt, error: attUpdateError } = await supabaseAdmin
      .from('submission_attempts')
      .update({ status: attemptStatus, reviewed_at: reviewedAt, updated_at: reviewedAt })
      .eq('id', attemptId)
      .select('*')
      .single();

    if (attUpdateError || !updAtt) throw new AppError(500, 'Failed to update attempt');

    // 2. Update submission
    const submissionUpdate: Record<string, unknown> = {
      status: submissionStatus,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    };
    if (pageStatus === 'completed') submissionUpdate.completed_at = reviewedAt;

    const { data: updSub, error: subUpdateError } = await supabaseAdmin
      .from('submissions')
      .update(submissionUpdate)
      .eq('id', submissionId)
      .select('*')
      .single();

    if (subUpdateError || !updSub) throw new AppError(500, 'Failed to update submission');

    // 3. Update assignment → 'reviewed' (leaves review queue)
    await supabaseAdmin
      .from('assignments')
      .update({ status: 'reviewed', updated_at: reviewedAt })
      .eq('id', assignmentId);

    // 4. Upsert student_page_progress
    await supabaseAdmin.from('student_page_progress').upsert({
      student_id: studentId,
      quran_page_id: quranPageId,
      page_number: pageNumber,
      status: progressStatus,
      latest_submission_id: submissionId,
      latest_attempt_id: attemptId,
      completed_attempt_id: pageStatus === 'completed' ? attemptId : null,
      attempt_count: attemptNumber,
      completed_at: pageStatus === 'completed' ? reviewedAt : null,
      updated_at: reviewedAt,
    }, { onConflict: 'student_id,quran_page_id' });

    // 5. Insert notification
    await supabaseAdmin.from('notifications').insert({
      recipient_user_id: studentId,
      actor_user_id: reviewerId,
      type: notifType,
      title: notifTitle,
      body: notifBody,
      data: { submissionId, attemptId, assignmentId, quranPageId, pageNumber },
      channel: 'in_app',
      delivery_status: 'pending',
    });

    // Recalculate snapshot — failure is non-critical.
    progressService.recalculateSnapshot(studentId).catch((snapErr) => {
      console.error('[AttemptService] Snapshot recalculation failed:', snapErr);
    });

    return {
      attempt: toAttemptRow(updAtt as Record<string, unknown>),
      submission: toSubmissionRow(updSub as Record<string, unknown>),
      assignmentStatus: 'reviewed',
      pageProgressStatus: progressStatus,
    };
  }
}

export const attemptService = new AttemptService();
