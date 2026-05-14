import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';

const router = Router();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  preferredLanguage: z.string().optional(),
  timezone: z.string().optional(),
  studentAgeGroup: z.string().optional(),
});

// GET /api/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    // Phase 3: return req.user + profile from user_profiles
    res.status(501).json({ message: 'Not implemented' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/me/profile
router.patch('/me/profile', authenticate, async (req, res, next) => {
  try {
    UpdateProfileSchema.parse(req.body);
    // Phase 3: update user_profiles for req.user!.id
    res.status(501).json({ message: 'Not implemented' });
  } catch (err) {
    next(err);
  }
});

export { router as meRouter };
