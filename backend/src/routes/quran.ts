import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { quranContentService } from '../services/QuranContentService';
import { supabaseAdmin } from '../db/client';

const WORD_BOUNDS_DIR = path.join(__dirname, '../../data/word-bounds');

// In-memory cache: pageNumber → enriched JSON (loaded once per process lifetime)
const wordBoundsCache = new Map<number, unknown>();

// Glyph-bounds lookup: "surah:ayah:wordPos" → {x0, y0, x1, y1}
// Lazy-loaded from Supabase Storage on first word-bounds request.
type GlyphBounds = { x0: number; y0: number; x1: number; y1: number };
let glyphBoundsMap: Map<string, GlyphBounds> | null = null;
let glyphBoundsLoading: Promise<void> | null = null;

async function ensureGlyphBounds(): Promise<void> {
  if (glyphBoundsMap) return;
  if (glyphBoundsLoading) return glyphBoundsLoading;
  glyphBoundsLoading = (async () => {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from('quran-page-images')
        .download('mushaf-madani/glyph-bounds.json');
      if (error || !data) throw new Error(error?.message ?? 'download failed');
      const json = JSON.parse(await data.text()) as {
        v: number;
        pages: Record<string, [number, number, number, number, number, number, number][]>;
      };
      const map = new Map<string, GlyphBounds>();
      for (const [pageStr, words] of Object.entries(json.pages)) {
        void pageStr; // page key not needed for the map
        for (const [surah, ayah, wordPos, x0, y0, x1, y1] of words) {
          map.set(`${surah}:${ayah}:${wordPos}`, { x0, y0, x1, y1 });
        }
      }
      glyphBoundsMap = map;
    } catch (err) {
      glyphBoundsLoading = null; // allow retry
      console.error('[quran] glyph-bounds load failed:', err);
    }
  })();
  return glyphBoundsLoading;
}

async function loadWordBounds(pageNumber: number): Promise<unknown | null> {
  if (wordBoundsCache.has(pageNumber)) return wordBoundsCache.get(pageNumber)!;
  const file = path.join(WORD_BOUNDS_DIR, `page-${String(pageNumber).padStart(3, '0')}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    page: number; wordCount: number;
    words: Array<{ id: number; verseKey: string; position: number; lineNumber: number; positionInLine: number; text: string; code: string; }>;
  };

  // Enrich words with exact pixel bounds from the glyph-bounds atlas
  await ensureGlyphBounds();
  if (glyphBoundsMap) {
    for (const word of data.words) {
      const [surahStr, ayahStr] = word.verseKey.split(':');
      const key = `${surahStr}:${ayahStr}:${word.position}`;
      const bounds = glyphBoundsMap.get(key);
      if (bounds) (word as Record<string, unknown>).bounds = bounds;
    }
  }

  wordBoundsCache.set(pageNumber, data);
  return data;
}

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

// GET /api/quran/pages/:pageNumber/word-bounds
// Returns words enriched with exact glyph bounding boxes (bounds.x0/y0/x1/y1, normalised 0–1).
// Text/line data from local JSON; bounds from Supabase Storage glyph-bounds.json atlas.
router.get('/quran/pages/:pageNumber/word-bounds', authenticate, async (req, res, next) => {
  try {
    const pageNumber = PageNumberSchema.parse(req.params.pageNumber);
    const data = await loadWordBounds(pageNumber);
    if (!data) {
      return res.status(404).json({ error: `Word bounds not available for page ${pageNumber}` });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export { router as quranRouter };
