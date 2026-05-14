import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacherOrAbove } from '../middleware/requireRole';
import { submissionService } from '../services/SubmissionService';
import { attemptService } from '../services/AttemptService';

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

// POST /api/submissions — student submits a page for the first time
// Creates submission + first attempt transactionally.
router.post('/submissions', authenticate, async (req, res, next) => {
  try {
    const body = CreateSubmissionSchema.parse(req.body);
    const result = await submissionService.createSubmission(req.user!.id, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/submissions/:submissionId
router.get('/submissions/:submissionId', authenticate, async (req, res, next) => {
  try {
    const result = await submissionService.getSubmission(
      req.params.submissionId,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/submissions/:submissionId/attempts — student submits a new attempt
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

// POST /api/submissions/:submissionId/attempts/:attemptId/complete-review — teacher action
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
