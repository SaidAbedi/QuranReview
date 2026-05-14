import { Request, Response, NextFunction } from 'express';
import { AppError, UserRole } from '../types';

// Returns middleware that allows only the specified roles.
// Must be used after `authenticate`.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'Not authenticated'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }
    next();
  };
}

// Shorthand helpers for common role combinations.

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole('admin', 'super_admin')(req, res, next);
}

export function requireTeacherOrAbove(req: Request, res: Response, next: NextFunction): void {
  requireRole('teacher', 'admin', 'super_admin')(req, res, next);
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole('super_admin')(req, res, next);
}
