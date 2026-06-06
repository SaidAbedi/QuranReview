import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { quranContentService } from '../services/QuranContentService';

const router = Router();

const PageNumberSchema = z
  .string()
  .transform(Number)
  .pipe(z.number().int().min(1).max(604));

const LookupQuerySchema = z
  .object({
    surahNumber: z.string().transform(Number).pipe(z.number().int().min(1).max(114)).optional(),
    juzNumber: z.string().transform(Number).pipe(z.number().int().min(1).max(30)).optional(),
  })
  .refine((d) => d.surahNumber !== undefined || d.juzNumber !== undefined, {
    message: 'Provide surahNumber or juzNumber',
  });

// GET /api/quran/pages/:pageNumber
router.get('/quran/pages/lookup', authenticate, async (req, res, next) => {
  try {
    const { surahNumber, juzNumber } = LookupQuerySchema.parse(req.query);
    if (surahNumber !== undefined) {
      const result = await quranContentService.lookupBySurahNumber(surahNumber);
      return res.json(result);
    }
    const result = await quranContentService.lookupByJuzNumber(juzNumber!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/quran/pages/:pageNumber
// Returns page metadata (imageUrl from quran-page-images storage, width, height).
// DB-only — does not call Quran.Foundation API. Images are pre-generated via
// quran.com-images Docker and uploaded with backend/scripts/upload-quran-pages.ts.
router.get('/quran/pages/:pageNumber', authenticate, async (req, res, next) => {
  try {
    const pageNumber = PageNumberSchema.parse(req.params.pageNumber);
    const result = await quranContentService.getPage(pageNumber);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/quran/pages/:pageNumber/content?includeWords=true
router.get('/quran/pages/:pageNumber/content', authenticate, async (req, res, next) => {
  try {
    const pageNumber = PageNumberSchema.parse(req.params.pageNumber);
    const includeWords = req.query.includeWords === 'true';
    const result = await quranContentService.getPageContent(pageNumber, includeWords);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as quranRouter };
