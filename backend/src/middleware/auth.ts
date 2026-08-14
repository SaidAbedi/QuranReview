import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

// Verifies the Supabase JWT in Authorization: Bearer <token>,
// loads the app-level role from public.users, and attaches req.user.
// Every protected route must run this middleware before any role checks.
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or malformed authorization token'));
  }

  const token = authHeader.slice(7);

  try {
    // Timeout after 10 seconds to prevent hanging on slow Supabase Auth
    const authPromise = supabaseAdmin.auth.getUser(token);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Auth verification timeout')), 10_000),
    );

    const {
      data: { user: authUser },
      error: authError,
    } = await Promise.race([authPromise, timeoutPromise]);

    if (authError || !authUser) {
      return next(new AppError(401, 'Invalid or expired token'));
    }

    const { data: appUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, role')
      .eq('id', authUser.id)
      .single();

    if (userError || !appUser) {
      return next(
        new AppError(401, 'User account not found — profile may not have been created yet'),
      );
    }

    req.user = {
      id: appUser.id,
      email: appUser.email,
      displayName: appUser.display_name,
      role: appUser.role,
    };

    next();
  } catch {
    next(new AppError(401, 'Token verification failed'));
  }
}
