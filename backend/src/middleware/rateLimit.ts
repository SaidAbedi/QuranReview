import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter (use Redis in production)
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5; // Max 5 failed attempts per window

export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const record = attempts.get(key);

  // Clean up expired records
  if (record && now > record.resetAt) {
    attempts.delete(key);
  }

  const current = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (current.count >= MAX_ATTEMPTS) {
    res.status(429).json({
      error: {
        message: 'Too many attempts. Please try again later.',
      },
    });
    return;
  }

  current.count++;
  attempts.set(key, current);

  // Attach increment function for use after auth failure
  (req as any).incrementFailure = () => {
    const rec = attempts.get(key);
    if (rec) rec.count++;
  };

  next();
}

export function resetRateLimit(req: Request): void {
  const key = `${req.ip}:${req.path}`;
  attempts.delete(key);
}
