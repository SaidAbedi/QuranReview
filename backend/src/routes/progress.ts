import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
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

// GET /api/student/progress — full progress summary for the authenticated student
router.get('/student/progress', authenticate, async (req, res, next) => {
  try {
    const result = await progressService.getStudentProgress(req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/student/progress/surahs/:surahNumber
router.get('/student/progress/surahs/:surahNumber', authenticate, async (req, res, next) => {
  try {
    const surahNumber = SurahNumberSchema.parse(req.params.surahNumber);
    const result = await progressService.getSurahProgress(req.user!.id, surahNumber);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/student/progress/juz/:juzNumber
router.get('/student/progress/juz/:juzNumber', authenticate, async (req, res, next) => {
  try {
    const juzNumber = JuzNumberSchema.parse(req.params.juzNumber);
    const result = await progressService.getJuzProgress(req.user!.id, juzNumber);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as progressRouter };
