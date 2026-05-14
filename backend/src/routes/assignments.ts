import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacherOrAbove } from '../middleware/requireRole';
import { assignmentService } from '../services/AssignmentService';

const router = Router();

const CreateAssignmentSchema = z.object({
  studentId: z.string().uuid(),
  quranPageId: z.string().uuid(),
  title: z.string().min(1).optional(),
  instructions: z.string().optional(),
  dueAt: z.string().datetime().optional(),
});

// POST /api/assignments — teacher creates an assignment for a student
router.post(
  '/assignments',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const body = CreateAssignmentSchema.parse(req.body);
      const result = await assignmentService.createAssignment(req.user!.id, body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/student/assignments — student's own assignments
router.get('/student/assignments', authenticate, async (req, res, next) => {
  try {
    const result = await assignmentService.getStudentAssignments(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/teacher/review-queue — teacher's pending reviews
router.get(
  '/teacher/review-queue',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const result = await assignmentService.getTeacherReviewQueue(req.user!.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as assignmentsRouter };
