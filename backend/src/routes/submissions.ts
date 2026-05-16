import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacherOrAbove } from '../middleware/requireRole';
import { submissionService } from '../services/SubmissionService';
import { attemptService } from '../services/AttemptService';
import { mediaService } from '../services/MediaService';

const router = Router();

const CreateSubmissionSchema = z.object({
  assignmentId: z.string().uuid(),
  recordingStorageKey: z.string().min(1),
  recordingDurationMs: z.number().int().positive().optional(),
  originalFileName: z.string().optional(),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

const CreateAttemptSchema = z.object({
  recordingStorageKey: z.string().min(1),
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

// ── Student: submission list ──────────────────────────────────────────────────

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
        pageStatus,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as submissionsRouter };
