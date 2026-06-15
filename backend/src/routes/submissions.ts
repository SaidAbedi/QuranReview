import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacher, requireTeacherOrAbove } from '../middleware/requireRole';
import { submissionService } from '../services/SubmissionService';
import { attemptService } from '../services/AttemptService';
import { mediaService } from '../services/MediaService';
import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

const router = Router();

const CreateSubmissionSchema = z.object({
  assignmentId: z.string().uuid(),
  recordingDurationMs: z.number().int().positive().optional(),
  originalFileName: z.string().optional(),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

const CreateAttemptSchema = z.object({
  recordingDurationMs: z.number().int().positive().optional(),
  originalFileName: z.string().optional(),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

const CompleteReviewSchema = z.object({
  pageStatus: z.enum(['completed', 'needs_resubmission']),
});

const PaginationSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
});

const SelfPacedSchema = z.object({
  pageNumber: z.number().int().min(1).max(604),
});

// ── Student: submission list ──────────────────────────────────────────────────

// POST /api/student/self-paced-submissions — student initiates a self-paced recitation
// Creates the assignment only; the mobile record screen calls POST /submissions as normal.
router.post('/student/self-paced-submissions', authenticate, async (req, res, next) => {
  try {
    if (req.user!.role !== 'student') throw new AppError(403, 'Students only');
    const { pageNumber } = SelfPacedSchema.parse(req.body);
    const result = await submissionService.createSelfPacedAssignment(req.user!.id, pageNumber);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/student/submissions — student's own submissions
router.get('/student/submissions', authenticate, async (req, res, next) => {
  try {
    const { limit = 20, offset = 0 } = PaginationSchema.parse(req.query);
    const result = await submissionService.getStudentSubmissions(req.user!.id, limit, offset);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Teacher: submission list ──────────────────────────────────────────────────

// GET /api/teacher/submissions — teacher's students' submissions
router.get(
  '/teacher/submissions',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = PaginationSchema.parse(req.query);
      const result = await submissionService.getTeacherSubmissions(req.user!.id, limit, offset);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── Submission CRUD ───────────────────────────────────────────────────────────

// POST /api/submissions — student creates submission + first attempt (transactional)
router.post('/submissions', authenticate, async (req, res, next) => {
  try {
    const body = CreateSubmissionSchema.parse(req.body);
    const result = await submissionService.createSubmission(req.user!.id, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/submissions/:submissionId — student or teacher views a submission
router.get('/submissions/:submissionId', authenticate, async (req, res, next) => {
  try {
    const result = await submissionService.getSubmission(
      req.params.submissionId,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Attempts ─────────────────────────────────────────────────────────────────

// GET /api/submissions/:submissionId/attempts — list all attempts
router.get('/submissions/:submissionId/attempts', authenticate, async (req, res, next) => {
  try {
    const result = await attemptService.getAttemptsBySubmission(
      req.params.submissionId,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/submissions/:submissionId/attempts — student adds a new attempt
router.post('/submissions/:submissionId/attempts', authenticate, async (req, res, next) => {
  try {
    const body = CreateAttemptSchema.parse(req.body);
    const result = await attemptService.createAttempt(
      req.params.submissionId,
      req.user!.id,
      body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/submissions/:submissionId/attempts/:attemptId — single attempt detail
router.get(
  '/submissions/:submissionId/attempts/:attemptId',
  authenticate,
  async (req, res, next) => {
    try {
      const result = await attemptService.getAttemptById(
        req.params.submissionId,
        req.params.attemptId,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/submissions/:submissionId/attempts/:attemptId/recording-url
// Returns a short-lived signed read URL. Mobile must call before each playback.
router.get(
  '/submissions/:submissionId/attempts/:attemptId/recording-url',
  authenticate,
  async (req, res, next) => {
    try {
      // Verify the attempt exists and this user has access before signing.
      const attempt = await attemptService.getAttemptById(
        req.params.submissionId,
        req.params.attemptId,
        req.user!.id,
        req.user!.role,
      );
      const result = await mediaService.getSignedReadUrl(
        req.user!.id,
        'student_recording',
        attempt.recordingStorageKey,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/submissions/:submissionId/attempts/:attemptId/complete-review — Phase 8
router.post(
  '/submissions/:submissionId/attempts/:attemptId/complete-review',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const { pageStatus } = CompleteReviewSchema.parse(req.body);
      const result = await attemptService.completeReview(
        req.params.submissionId,
        req.params.attemptId,
        req.user!.id,
        req.user!.role,
        pageStatus,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── Review voice notes ────────────────────────────────────────────────────────

function toReviewVoiceNoteRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    submissionAttemptId: row.submission_attempt_id as string,
    teacherId: row.teacher_id as string,
    audioStorageKey: row.audio_storage_key as string,
    durationMs: (row.duration_ms as number | null) ?? null,
    contentType: (row.content_type as string | null) ?? null,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const ReviewVoiceNoteSchema = z.object({
  audioStorageKey: z.string().min(1),
  durationMs: z.number().int().positive().optional(),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

// GET /api/submissions/:submissionId/attempts/:attemptId/review-voice-note
// Returns the active review voice note row, or null if none.
// Accessible by the student who owns the submission and the assigned teacher.
router.get(
  '/submissions/:submissionId/attempts/:attemptId/review-voice-note',
  authenticate,
  async (req, res, next) => {
    try {
      const { submissionId, attemptId } = req.params;

      const { data: sub } = await supabaseAdmin
        .from('submissions')
        .select('id, student_id, assignment_id')
        .eq('id', submissionId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!sub) throw new AppError(404, 'Submission not found');

      const userId = req.user!.id;
      const role = req.user!.role;

      if (role === 'student' && sub.student_id !== userId) {
        throw new AppError(403, 'Access denied');
      }

      if (role === 'teacher') {
        const { data: assignment } = await supabaseAdmin
          .from('assignments')
          .select('teacher_id')
          .eq('id', sub.assignment_id)
          .maybeSingle();
        if (!assignment || assignment.teacher_id !== userId) {
          throw new AppError(403, 'Not your assignment');
        }
      }

      const { data: rvn } = await supabaseAdmin
        .from('review_voice_notes')
        .select('*')
        .eq('submission_attempt_id', attemptId)
        .is('deleted_at', null)
        .maybeSingle();

      res.json(rvn ? toReviewVoiceNoteRow(rvn as Record<string, unknown>) : null);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/submissions/:submissionId/attempts/:attemptId/review-voice-note
// Save (or replace) the review voice note for an attempt.
router.post(
  '/submissions/:submissionId/attempts/:attemptId/review-voice-note',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      const { submissionId, attemptId } = req.params;
      const body = ReviewVoiceNoteSchema.parse(req.body);

      const { data: sub } = await supabaseAdmin
        .from('submissions')
        .select('id, student_id, assignment_id')
        .eq('id', submissionId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!sub) throw new AppError(404, 'Submission not found');

      const { data: assignment } = await supabaseAdmin
        .from('assignments')
        .select('teacher_id, quran_pages(page_number)')
        .eq('id', sub.assignment_id)
        .maybeSingle();

      if (!assignment || assignment.teacher_id !== req.user!.id) {
        throw new AppError(403, 'Not your assignment');
      }

      // Soft-delete any existing active review voice note for this attempt
      await supabaseAdmin
        .from('review_voice_notes')
        .update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id })
        .eq('submission_attempt_id', attemptId)
        .is('deleted_at', null);

      const { data: rvn, error } = await supabaseAdmin
        .from('review_voice_notes')
        .insert({
          submission_attempt_id: attemptId,
          teacher_id: req.user!.id,
          audio_storage_key: body.audioStorageKey,
          duration_ms: body.durationMs ?? null,
          content_type: body.contentType ?? null,
          size_bytes: body.sizeBytes ?? null,
        })
        .select()
        .single();

      if (error || !rvn) {
        throw new AppError(500, `Failed to save review voice note: ${error?.message ?? 'unknown'}`);
      }

      // Notify student — fire and forget
      const pageNumber = (assignment.quran_pages as unknown as Record<string, unknown> | null)?.page_number as number | undefined;
      void Promise.resolve(supabaseAdmin.from('notifications').insert({
        recipient_user_id: sub.student_id,
        actor_user_id: req.user!.id,
        type: 'voice_note_added',
        title: 'Your teacher left a voice note',
        body: pageNumber
          ? `Open your feedback for page ${pageNumber} to listen.`
          : "Open your feedback to listen to your teacher's voice note.",
        data: { submissionId, attemptId, assignmentId: sub.assignment_id },
        channel: 'in_app',
        delivery_status: 'pending',
      })).catch((err: unknown) => {
        console.error('[submissions] Failed to create voice note notification:', err);
      });

      res.status(201).json(toReviewVoiceNoteRow(rvn as Record<string, unknown>));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/submissions/:submissionId/attempts/:attemptId/review-voice-note
router.delete(
  '/submissions/:submissionId/attempts/:attemptId/review-voice-note',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      const { attemptId } = req.params;

      const { data: rvn } = await supabaseAdmin
        .from('review_voice_notes')
        .select('id, teacher_id')
        .eq('submission_attempt_id', attemptId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!rvn) throw new AppError(404, 'No review voice note found');
      if (rvn.teacher_id !== req.user!.id) throw new AppError(403, 'Not your voice note');

      await supabaseAdmin
        .from('review_voice_notes')
        .update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id })
        .eq('id', rvn.id);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as submissionsRouter };
