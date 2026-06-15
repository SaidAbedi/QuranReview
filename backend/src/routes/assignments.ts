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

// POST /api/assignments — teacher creates an assignment for one of their students
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

// GET /api/teacher/assignments — teacher's assignments list
router.get(
  '/teacher/assignments',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const result = await assignmentService.getTeacherAssignments(req.user!.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/teacher/assignments/:id — teacher views single assignment
router.get(
  '/teacher/assignments/:id',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const result = await assignmentService.getAssignmentById(
        req.params.id,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/student/assignments/:id — student views single assignment
router.get('/student/assignments/:id', authenticate, async (req, res, next) => {
  try {
    const result = await assignmentService.getAssignmentById(
      req.params.id,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/teacher/review-queue — submissions awaiting teacher review (submitted only)
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

// GET /api/teacher/all-submissions — all active submissions (submitted + in_review + reviewed + needs_resubmission + completed)
router.get(
  '/teacher/all-submissions',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const result = await assignmentService.getTeacherAllSubmissions(req.user!.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/teacher/students — deduplicated student roster with progress summary
router.get(
  '/teacher/students',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const result = await assignmentService.getTeacherStudents(req.user!.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/teacher/students/:studentId/submissions — all submissions for one of this teacher's students
router.get(
  '/teacher/students/:studentId/submissions',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.params);
      const result = await assignmentService.getTeacherStudentSubmissions(req.user!.id, studentId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as assignmentsRouter };
