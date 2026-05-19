import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacherOrAbove, requireAdmin } from '../middleware/requireRole';
import { progressService } from '../services/ProgressService';

const router = Router();

const SurahNumberSchema = z
  .string()
  .transform(Number)
  .pipe(z.number().int().min(1).max(114));

const JuzNumberSchema = z
  .string()
  .transform(Number)
  .pipe(z.number().int().min(1).max(30));

// ── Student: own progress ─────────────────────────────────────────────────────

// GET /api/student/progress — full progress summary for the authenticated student
router.get('/student/progress', authenticate, async (req, res, next) => {
  try {
    const result = await progressService.getStudentProgress(
      req.user!.id,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/student/progress/surahs/:surahNumber
router.get('/student/progress/surahs/:surahNumber', authenticate, async (req, res, next) => {
  try {
    const surahNumber = SurahNumberSchema.parse(req.params.surahNumber);
    const result = await progressService.getSurahProgress(
      req.user!.id,
      surahNumber,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/student/progress/juz/:juzNumber
router.get('/student/progress/juz/:juzNumber', authenticate, async (req, res, next) => {
  try {
    const juzNumber = JuzNumberSchema.parse(req.params.juzNumber);
    const result = await progressService.getJuzProgress(
      req.user!.id,
      juzNumber,
      req.user!.id,
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Teacher: assigned student progress ────────────────────────────────────────

// GET /api/teacher/students/:studentId/progress
router.get(
  '/teacher/students/:studentId/progress',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const result = await progressService.getStudentProgress(
        req.params.studentId,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/teacher/students/:studentId/progress/surahs/:surahNumber
router.get(
  '/teacher/students/:studentId/progress/surahs/:surahNumber',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const surahNumber = SurahNumberSchema.parse(req.params.surahNumber);
      const result = await progressService.getSurahProgress(
        req.params.studentId,
        surahNumber,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/teacher/students/:studentId/progress/juz/:juzNumber
router.get(
  '/teacher/students/:studentId/progress/juz/:juzNumber',
  authenticate,
  requireTeacherOrAbove,
  async (req, res, next) => {
    try {
      const juzNumber = JuzNumberSchema.parse(req.params.juzNumber);
      const result = await progressService.getJuzProgress(
        req.params.studentId,
        juzNumber,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── Admin / super_admin: any student's progress ───────────────────────────────

// GET /api/admin/students/:studentId/progress
router.get(
  '/admin/students/:studentId/progress',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await progressService.getStudentProgress(
        req.params.studentId,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/students/:studentId/progress/surahs/:surahNumber
router.get(
  '/admin/students/:studentId/progress/surahs/:surahNumber',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const surahNumber = SurahNumberSchema.parse(req.params.surahNumber);
      const result = await progressService.getSurahProgress(
        req.params.studentId,
        surahNumber,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/students/:studentId/progress/juz/:juzNumber
router.get(
  '/admin/students/:studentId/progress/juz/:juzNumber',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const juzNumber = JuzNumberSchema.parse(req.params.juzNumber);
      const result = await progressService.getJuzProgress(
        req.params.studentId,
        juzNumber,
        req.user!.id,
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as progressRouter };
