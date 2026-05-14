import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { mediaService } from '../services/MediaService';

const router = Router();

const SignedUploadUrlSchema = z.object({
  fileType: z.enum(['student_recording', 'teacher_voice_note']),
  contentType: z.string().min(1),
  assignmentId: z.string().uuid(),
});

const SignedReadUrlSchema = z.object({
  mediaType: z.enum(['student_recording', 'teacher_voice_note']),
  storageKey: z.string().min(1),
});

// POST /api/uploads/signed-url — get a short-lived upload URL before uploading audio
router.post('/uploads/signed-url', authenticate, async (req, res, next) => {
  try {
    const body = SignedUploadUrlSchema.parse(req.body);
    const result = await mediaService.getSignedUploadUrl(
      req.user!.id,
      body.fileType,
      body.contentType,
      body.assignmentId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/media/signed-read-url — get a short-lived playback URL before playing audio
// Mobile must call this before each playback session; never persist the returned URL.
router.post('/media/signed-read-url', authenticate, async (req, res, next) => {
  try {
    const body = SignedReadUrlSchema.parse(req.body);
    const result = await mediaService.getSignedReadUrl(
      req.user!.id,
      body.mediaType,
      body.storageKey,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as mediaRouter };
