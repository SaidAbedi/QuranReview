import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { notificationService } from '../services/NotificationService';

const router = Router();

const ListNotificationsSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('50'),
  cursor: z.string().optional(),
  unreadOnly: z.string().transform((v) => v === 'true').optional(),
});

const RegisterDeviceSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  deviceId: z.string().optional(),
});

// GET /api/notifications
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const { limit, cursor, unreadOnly } = ListNotificationsSchema.parse(req.query);
    const result = await notificationService.getNotifications(req.user!.id, {
      limit,
      cursor,
      unreadOnly: unreadOnly ?? false,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all — must come before /:notificationId/read
// so Express does not treat "read-all" as a notificationId param.
router.post('/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    await notificationService.markAllRead(req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:notificationId/read
router.post('/notifications/:notificationId/read', authenticate, async (req, res, next) => {
  try {
    await notificationService.markRead(req.params.notificationId, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/devices/register
// Upserts on (provider, token) — reactivates if token already exists.
router.post('/devices/register', authenticate, async (req, res, next) => {
  try {
    const body = RegisterDeviceSchema.parse(req.body);
    const result = await notificationService.registerDevice(
      req.user!.id,
      body.token,
      body.platform,
      body.deviceId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/devices/:deviceTokenId/disable
router.patch('/devices/:deviceTokenId/disable', authenticate, async (req, res, next) => {
  try {
    await notificationService.disableDevice(req.params.deviceTokenId, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as notificationsRouter };
