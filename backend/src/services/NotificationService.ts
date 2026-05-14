import { AppError, NotificationType, PaginationParams, PaginatedResult } from '../types';

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

export interface CreateNotificationInput {
  recipientUserId: string;
  actorUserId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  async getNotifications(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<NotificationRow>> {
    throw new AppError(501, 'Not implemented');
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    throw new AppError(501, 'Not implemented');
  }

  async markAllRead(userId: string): Promise<void> {
    throw new AppError(501, 'Not implemented');
  }

  async registerDevice(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    deviceId?: string,
  ): Promise<{ id: string }> {
    throw new AppError(501, 'Not implemented');
  }

  async disableDevice(deviceTokenId: string, userId: string): Promise<void> {
    throw new AppError(501, 'Not implemented');
  }

  // Internal — called by other services after important events.
  // Writes the notification row and optionally triggers a push via Expo.
  async createNotification(input: CreateNotificationInput): Promise<NotificationRow> {
    throw new AppError(501, 'Not implemented');
  }
}

export const notificationService = new NotificationService();
