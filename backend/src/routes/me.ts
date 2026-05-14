import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { supabaseAdmin } from '../db/client';
import { AppError, MeResponse, UserProfile } from '../types';

const router = Router();

// role is deliberately absent — normal users cannot set their own role.
// Role changes are admin/super_admin operations handled in /api/admin routes.
const UpdateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    preferredLanguage: z.string().optional(),
    timezone: z.string().optional(),
    studentAgeGroup: z.string().optional(),
  })
  .refine(
    (data: Record<string, unknown>) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided' },
  );

function toProfileShape(row: Record<string, unknown>): UserProfile {
  return {
    preferredLanguage: (row.preferred_language as string | null) ?? null,
    timezone: (row.timezone as string | null) ?? null,
    studentAgeGroup: (row.student_age_group as string | null) ?? null,
    teacherCapacity: (row.teacher_capacity as number | null) ?? null,
    teacherCurrentLoad: (row.teacher_current_load as number) ?? 0,
    onboardingStatus: (row.onboarding_status as UserProfile['onboardingStatus']) ?? 'new',
  };
}

// GET /api/me
// Called by the mobile app on every authenticated app open.
// Bootstraps user_profiles on first call; idempotent on subsequent calls.
// For new students: creates a student_assignment_requests row so the
// student enters the admin assignment queue.
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: userId, role } = req.user!;

    // Load or bootstrap user_profiles
    let { data: profile, error: profileLoadError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileLoadError) {
      return next(new AppError(500, 'Failed to load user profile'));
    }

    if (!profile) {
      // First login: create user_profiles row.
      // Students start as 'pending_assignment'; all other roles start as 'active'.
      const initialStatus = role === 'student' ? 'pending_assignment' : 'active';

      const { data: created, error: createError } = await supabaseAdmin
        .from('user_profiles')
        .insert({ user_id: userId, onboarding_status: initialStatus })
        .select()
        .single();

      if (createError) {
        return next(new AppError(500, 'Failed to create user profile'));
      }

      profile = created;

      // Students enter the admin assignment queue on first login.
      // The partial unique index uq_student_one_pending_request (migration 003)
      // enforces at most one pending row per student at the DB level.
      // On a race (concurrent first calls), the second insert hits the 23505
      // unique_violation constraint — we treat that as success.
      if (role === 'student') {
        const { error: requestError } = await supabaseAdmin
          .from('student_assignment_requests')
          .insert({ student_id: userId });

        if (requestError && requestError.code !== '23505') {
          return next(new AppError(500, 'Failed to create assignment request'));
        }
      }
    }

    const response: MeResponse = {
      id: req.user!.id,
      email: req.user!.email,
      displayName: req.user!.displayName,
      role: req.user!.role,
      profile: toProfileShape(profile),
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/me/profile
// Updates display_name (users table) and profile fields (user_profiles table).
// role is not in UpdateProfileSchema — users cannot change their own role.
// Returns 400 if no fields are provided (prevents empty writes).
router.patch('/me/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateProfileSchema.parse(req.body);
    const { id: userId } = req.user!;

    // Update display_name in users table if provided
    if (body.displayName !== undefined) {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ display_name: body.displayName, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        return next(new AppError(500, 'Failed to update display name'));
      }
    }

    // Build user_profiles patch — only fields present in the request body
    const profilePatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.preferredLanguage !== undefined) profilePatch.preferred_language = body.preferredLanguage;
    if (body.timezone !== undefined) profilePatch.timezone = body.timezone;
    if (body.studentAgeGroup !== undefined) profilePatch.student_age_group = body.studentAgeGroup;

    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update(profilePatch)
      .eq('user_id', userId)
      .select()
      .single();

    if (profileError) {
      return next(new AppError(500, 'Failed to update profile'));
    }

    const response: MeResponse = {
      id: userId,
      email: req.user!.email,
      displayName: body.displayName ?? req.user!.displayName,
      role: req.user!.role,
      profile: toProfileShape(updatedProfile),
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

export { router as meRouter };
