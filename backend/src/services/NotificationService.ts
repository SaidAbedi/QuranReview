import { supabaseAdmin } from '../db/client';
import { AppError, NotificationType } from '../types';

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface DeviceTokenRow {
  id: string;
  userId: string;
  provider: string;
  token: string;
  platform: string | null;
  deviceId: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Input / result shapes ─────────────────────────────────────────────────────

export interface CreateNotificationInput {
  recipientUserId: string;
  actorUserId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface NotificationsListParams {
  limit: number;
  cursor?: string;
  unreadOnly?: boolean;
}

export interface NotificationsListResult {
  items: NotificationRow[];
  unreadCount: number;
  nextCursor: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNotificationRow(r: Record<string, unknown>): NotificationRow {
  return {
    id: r.id as string,
    recipientUserId: r.recipient_user_id as string,
    actorUserId: (r.actor_user_id as string | null) ?? null,
    type: r.type as NotificationType,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

function toDeviceTokenRow(r: Record<string, unknown>): DeviceTokenRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    provider: r.provider as string,
    token: r.token as string,
    platform: (r.platform as string | null) ?? null,
    deviceId: (r.device_id as string | null) ?? null,
    isActive: r.is_active as boolean,
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class NotificationService {
  async getNotifications(
    userId: string,
    params: NotificationsListParams,
  ): Promise<NotificationsListResult> {
    const { limit, cursor, unreadOnly = false } = params;

    // Unread count uses the partial index idx_notifications_unread_by_user
    const { count, error: countErr } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .is('read_at', null);

    if (countErr) throw new AppError(500, 'Failed to fetch notification count');
    const unreadCount = count ?? 0;

    // Fetch limit+1 to determine whether a next page exists
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (unreadOnly) query = query.is('read_at', null);
    if (cursor) query = query.lt('created_at', cursor);

    const { data, error } = await query;
    if (error) throw new AppError(500, 'Failed to fetch notifications');

    const rows = (data ?? []) as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toNotificationRow);
    const nextCursor = hasMore ? items[items.length - 1].createdAt : null;

    return { items, unreadCount, nextCursor };
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id, recipient_user_id, read_at')
      .eq('id', notificationId)
      .maybeSingle();

    if (error) throw new AppError(500, 'Failed to fetch notification');
    if (!data) throw new AppError(404, 'Notification not found');

    const row = data as Record<string, unknown>;
    if (row.recipient_user_id !== userId) throw new AppError(403, 'Access denied');
    if (row.read_at) return; // already read — idempotent

    const { error: updateErr } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (updateErr) throw new AppError(500, 'Failed to mark notification as read');
  }

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_user_id', userId)
      .is('read_at', null);

    if (error) throw new AppError(500, 'Failed to mark all notifications as read');
  }

  async registerDevice(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    deviceId?: string,
  ): Promise<DeviceTokenRow> {
    const now = new Date().toISOString();

    // Upsert on (provider, token) — reactivates an existing token and reassigns
    // it to the current user if the same physical device is used by a new account.
    const { data, error } = await supabaseAdmin
      .from('device_tokens')
      .upsert({
        user_id: userId,
        provider: 'expo',
        token,
        platform,
        device_id: deviceId ?? null,
        is_active: true,
        last_seen_at: now,
        updated_at: now,
      }, { onConflict: 'provider,token' })
      .select('*')
      .single();

    if (error || !data) throw new AppError(500, 'Failed to register device');
    return toDeviceTokenRow(data as Record<string, unknown>);
  }

  async disableDevice(deviceTokenId: string, userId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('device_tokens')
      .select('id, user_id, is_active')
      .eq('id', deviceTokenId)
      .maybeSingle();

    if (error) throw new AppError(500, 'Failed to fetch device');
    if (!data) throw new AppError(404, 'Device not found');

    const row = data as Record<string, unknown>;
    if (row.user_id !== userId) throw new AppError(403, 'Access denied');
    if (!row.is_active) return; // already disabled — idempotent

    const { error: updateErr } = await supabaseAdmin
      .from('device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', deviceTokenId);

    if (updateErr) throw new AppError(500, 'Failed to disable device');
  }

  // Internal helper — creates a notification outside a pg transaction.
  // When a notification must be atomic with other DB writes (e.g. completeReview),
  // use a direct pg INSERT inside the BEGIN/COMMIT block instead.
  async createNotification(input: CreateNotificationInput): Promise<NotificationRow> {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        recipient_user_id: input.recipientUserId,
        actor_user_id: input.actorUserId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        data: input.data ?? {},
        channel: 'in_app',
        delivery_status: 'pending',
      })
      .select('*')
      .single();

    if (error || !data) throw new AppError(500, 'Failed to create notification');
    return toNotificationRow(data as Record<string, unknown>);
  }
}

export const notificationService = new NotificationService();
