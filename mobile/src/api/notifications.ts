import { api } from './client';
import type { NotificationsListResult } from '@/types/api';

export const getNotifications = (params?: { limit?: number; cursor?: string; unreadOnly?: boolean }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.unreadOnly) qs.set('unreadOnly', 'true');
  const query = qs.toString();
  return api.get<NotificationsListResult>(`/notifications${query ? `?${query}` : ''}`);
};

export const markNotificationRead = (id: string) =>
  api.post<void>(`/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.post<void>('/notifications/read-all');
