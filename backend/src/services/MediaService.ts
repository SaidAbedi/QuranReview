import { AppError } from '../types';

export type MediaFileType = 'student_recording' | 'teacher_voice_note';

export interface SignedUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export interface SignedReadUrlResult {
  url: string;
  expiresAt: string;
}

// Generates short-lived Supabase Storage signed URLs.
// The mobile app stores the stable storageKey in DB; signed URLs are never persisted.
// Mobile must call getSignedReadUrl before each playback session.
export class MediaService {
  async getSignedUploadUrl(
    userId: string,
    fileType: MediaFileType,
    contentType: string,
    assignmentId: string,
  ): Promise<SignedUploadUrlResult> {
    throw new AppError(501, 'Not implemented');
  }

  async getSignedReadUrl(
    requestingUserId: string,
    mediaType: MediaFileType,
    storageKey: string,
  ): Promise<SignedReadUrlResult> {
    throw new AppError(501, 'Not implemented');
  }
}

export const mediaService = new MediaService();
