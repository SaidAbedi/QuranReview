import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacher } from '../middleware/requireRole';
import { annotationService } from '../services/AnnotationService';
import { mistakeFeedbackService } from '../services/MistakeFeedbackService';

const router = Router();

const PointSchema = z.object({ x: z.number(), y: z.number() });

const VisualBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const AnnotationTypeEnum = z.enum([
  'freehand', 'circle', 'underline', 'highlight',
  'note', 'word_marker', 'ayah_marker',
]);

const AnchorTypeEnum = z.enum(['page_region', 'word', 'ayah', 'line']);

const MistakeTypeEnum = z.enum([
  'tajweed', 'harakat', 'wrong_word', 'wrong_ayah',
  'makhraj', 'madd', 'ghunnah', 'waqf',
  'pronunciation', 'memorization', 'other',
]);

const CreateAnnotationSchema = z.object({
  annotationType: AnnotationTypeEnum,
  anchorType: AnchorTypeEnum.default('page_region'),
  points: z.array(PointSchema).optional(),
  style: z.record(z.unknown()).optional(),
  visualBounds: VisualBoundsSchema.optional(),
  verseKey: z.string().optional(),
  wordId: z.number().int().optional(),
  wordPosition: z.number().int().optional(),
  lineNumber: z.number().int().optional(),
  mistakeType: MistakeTypeEnum.optional(),
  mistakeOptionId: z.string().uuid().optional(),
  quickLabel: z.string().optional(),
  noteText: z.string().optional(),
  recordingTimestampMs: z.number().int().min(0).optional(),
});

const BatchAnnotationsSchema = z.object({
  annotations: z.array(CreateAnnotationSchema).min(1).max(50),
});

const UpdateAnnotationSchema = CreateAnnotationSchema.partial();

const PaginationSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('50'),
  cursor: z.string().optional(),
});

const VoiceNoteSchema = z.object({
  audioStorageKey: z.string().min(1),
  durationMs: z.number().int().positive().optional(),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
});

// GET /api/mistake-categories — returns categories + options (read from DB, not hardcoded)
router.get('/mistake-categories', authenticate, async (_req, res, next) => {
  try {
    const result = await mistakeFeedbackService.getMistakeCategories();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/submissions/:submissionId/attempts/:attemptId/annotation-markers
// Lightweight markers for audio playback timeline — no path data.
router.get(
  '/submissions/:submissionId/attempts/:attemptId/annotation-markers',
  authenticate,
  async (req, res, next) => {
    try {
      const result = await annotationService.getAnnotationMarkers(
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

// GET /api/submissions/:submissionId/attempts/:attemptId/annotations?limit=50&cursor=
// Full annotation payloads, paginated. Load only on review screen.
router.get(
  '/submissions/:submissionId/attempts/:attemptId/annotations',
  authenticate,
  async (req, res, next) => {
    try {
      const { limit, cursor } = PaginationSchema.parse(req.query);
      const result = await annotationService.getAnnotations(
        req.params.submissionId,
        req.params.attemptId,
        req.user!.id,
        { limit, cursor },
        req.user!.role,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/submissions/:submissionId/attempts/:attemptId/annotations — single annotation
router.post(
  '/submissions/:submissionId/attempts/:attemptId/annotations',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      const body = CreateAnnotationSchema.parse(req.body);
      const result = await annotationService.createAnnotation(
        req.params.submissionId,
        req.params.attemptId,
        req.user!.id,
        body,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/submissions/:submissionId/attempts/:attemptId/annotations/batch
router.post(
  '/submissions/:submissionId/attempts/:attemptId/annotations/batch',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      const { annotations } = BatchAnnotationsSchema.parse(req.body);
      const result = await annotationService.batchCreateAnnotations(
        req.params.submissionId,
        req.params.attemptId,
        req.user!.id,
        annotations,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/annotations/:annotationId
router.patch(
  '/annotations/:annotationId',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      const body = UpdateAnnotationSchema.parse(req.body);
      const result = await annotationService.updateAnnotation(
        req.params.annotationId,
        req.user!.id,
        body,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/annotations/:annotationId — soft delete
router.delete(
  '/annotations/:annotationId',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      await annotationService.deleteAnnotation(req.params.annotationId, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/annotations/:annotationId/voice-note
router.post(
  '/annotations/:annotationId/voice-note',
  authenticate,
  requireTeacher,
  async (req, res, next) => {
    try {
      const body = VoiceNoteSchema.parse(req.body);
      const result = await annotationService.addVoiceNote(
        req.params.annotationId,
        req.user!.id,
        body.audioStorageKey,
        body.durationMs,
        body.contentType,
        body.sizeBytes,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as annotationsRouter };
