import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireTeacher } from '../middleware/requireRole';
import { mediaService } from '../services/MediaService';
import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

const router = Router();

// Refresh endpoint: use when the original upload URL (returned by POST /submissions
// or POST /submissions/:id/attempts) has expired before the client could upload.
// Verifies the student owns the attempt before issuing a fresh URL for the same key.
const SignedUploadUrlSchema = z.object({
  fileType: z.enum(['student_recording', 'teacher_voice_note']),
  contentType: z.string().min(1),
  submissionId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
});

const SignedReadUrlSchema = z.object({
  mediaType: z.enum(['student_recording', 'teacher_voice_note', 'review_voice_note']),
  storageKey: z.string().min(1),
});

// POST /api/uploads/signed-url — refresh a signed upload URL for an existing attempt
router.post('/uploads/signed-url', authenticate, async (req, res, next) => {
  try {
    const body = SignedUploadUrlSchema.parse(req.body);

    if (body.fileType !== 'student_recording') {
      throw new AppError(400, 'Only student_recording uploads are supported');
    }

    // Verify the attempt exists and belongs to this student
    const { data: attempt } = await supabaseAdmin
      .from('submission_attempts')
      .select('id, student_id')
      .eq('submission_id', body.submissionId)
      .eq('attempt_number', body.attemptNumber)
      .eq('student_id', req.user!.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!attempt) throw new AppError(404, 'Attempt not found or not yours');

    const result = await mediaService.getSignedUploadUrl(
      req.user!.id,
      body.fileType,
      body.contentType,
      body.submissionId,
      body.attemptNumber,
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
      req.user!.role,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/media/voice-note-upload-url — teacher gets a signed upload URL for a voice note
const VoiceNoteUploadSchema = z.object({
  submissionId: z.string().uuid(),
  attemptId: z.string().uuid(),
  annotationId: z.string().uuid(),
  contentType: z.string().min(1),
});

router.post('/media/voice-note-upload-url', authenticate, requireTeacher, async (req, res, next) => {
  try {
    const body = VoiceNoteUploadSchema.parse(req.body);

    // Verify the annotation belongs to this teacher
    const { data: ann } = await supabaseAdmin
      .from('annotations')
      .select('id, teacher_id')
      .eq('id', body.annotationId)
      .eq('teacher_id', req.user!.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!ann) throw new AppError(404, 'Annotation not found or not yours');

    const result = await mediaService.getVoiceNoteUploadUrl(
      req.user!.id,
      body.submissionId,
      body.attemptId,
      body.annotationId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/media/review-voice-note-upload-url — teacher gets a signed upload URL for a review voice note
const ReviewVoiceNoteUploadSchema = z.object({
  submissionId: z.string().uuid(),
  attemptId: z.string().uuid(),
  contentType: z.string().min(1),
});

router.post('/media/review-voice-note-upload-url', authenticate, requireTeacher, async (req, res, next) => {
  try {
    const body = ReviewVoiceNoteUploadSchema.parse(req.body);

    // Verify the attempt belongs to a submission assigned to this teacher
    const { data: sub } = await supabaseAdmin
      .from('submissions')
      .select('id, assignment_id')
      .eq('id', body.submissionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!sub) throw new AppError(404, 'Submission not found');

    const { data: assignment } = await supabaseAdmin
      .from('assignments')
      .select('id, teacher_id')
      .eq('id', sub.assignment_id)
      .maybeSingle();

    if (!assignment || assignment.teacher_id !== req.user!.id) {
      throw new AppError(403, 'Not your assignment');
    }

    const result = await mediaService.getReviewVoiceNoteUploadUrl(
      req.user!.id,
      body.submissionId,
      body.attemptId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as mediaRouter };
