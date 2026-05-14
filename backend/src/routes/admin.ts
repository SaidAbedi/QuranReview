import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireRole';
import { adminAssignmentService } from '../services/AdminAssignmentService';

const router = Router();

// All admin routes require admin or super_admin role.
// `requireAdmin` is applied per route so it always runs after `authenticate`.

const AssignmentRequestStatusSchema = z.enum([
  'pending_assignment', 'assigned', 'waitlisted', 'declined', 'archived',
]);

const AssignTeacherSchema = z.object({
  teacherId: z.string().uuid(),
});

const UpdateRelationshipSchema = z.object({
  status: z.enum(['active', 'inactive', 'pending']),
});

// GET /api/admin/students/unassigned
// Returns students with a pending_assignment request — admin review queue.
router.get(
  '/admin/students/unassigned',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await adminAssignmentService.getUnassignedStudents();
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/assignment-requests?status=
router.get(
  '/admin/assignment-requests',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const status = req.query.status
        ? AssignmentRequestStatusSchema.parse(req.query.status)
        : undefined;
      const result = await adminAssignmentService.getAssignmentRequests(status);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/assignment-requests/:requestId/assign-teacher
// Admin assigns a teacher to a pending student.
// Notifies both teacher and student on success.
router.post(
  '/admin/assignment-requests/:requestId/assign-teacher',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { teacherId } = AssignTeacherSchema.parse(req.body);
      const result = await adminAssignmentService.assignTeacher(
        req.params.requestId,
        teacherId,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/admin/teacher-student-relationships/:relationshipId
router.patch(
  '/admin/teacher-student-relationships/:relationshipId',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { status } = UpdateRelationshipSchema.parse(req.body);
      const result = await adminAssignmentService.updateTeacherStudentRelationship(
        req.params.relationshipId,
        status,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as adminRouter };
