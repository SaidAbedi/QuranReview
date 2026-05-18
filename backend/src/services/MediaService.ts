import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../db/client';
import { env } from '../config/env';
import { AppError, UserRole } from '../types';

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

const BUCKET_STUDENT_RECORDINGS = 'student-recordings';
const BUCKET_TEACHER_VOICE_NOTES = 'teacher-voice-notes';

// Signed upload URL is valid for 10 minutes — enough for recording + upload.
const UPLOAD_EXPIRES_IN_SECONDS = 600;
// Signed read URL is valid for 1 hour.
const READ_EXPIRES_IN_SECONDS = 3600;

// Accepted audio MIME types for student recordings.
const AUDIO_MIME_TYPES = [
  'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac',
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/webm',
];

export class MediaService {
  private bucketsReady = false;

  // Called at server startup. Only auto-creates buckets when
  // AUTO_CREATE_STORAGE_BUCKETS is enabled (defaults to true outside production).
  // In production, create buckets manually or via deploy script.
  async ensureBuckets(): Promise<void> {
    if (this.bucketsReady) return;

    if (!env.AUTO_CREATE_STORAGE_BUCKETS) {
      // Verify buckets exist without creating them.
      await this.assertBucketExists(BUCKET_STUDENT_RECORDINGS);
      await this.assertBucketExists(BUCKET_TEACHER_VOICE_NOTES);
      this.bucketsReady = true;
      return;
    }

    await this.ensureBucket(BUCKET_STUDENT_RECORDINGS, {
      allowedMimeTypes: AUDIO_MIME_TYPES,
      fileSizeLimit: 52428800, // 50 MB
    });
    await this.ensureBucket(BUCKET_TEACHER_VOICE_NOTES, {
      allowedMimeTypes: AUDIO_MIME_TYPES,
      fileSizeLimit: 20971520, // 20 MB
    });
    this.bucketsReady = true;
  }

  // Generates a signed upload URL for a student recording.
  // Returns the stable storageKey — mobile must store this and pass it to
  // POST /submissions or POST /submissions/:id/attempts.
  //
  // Key format: student-recordings/{studentId}/{assignmentId}/{uuid}.m4a
  // The uuid is server-generated so the client cannot inject arbitrary paths.
  async getSignedUploadUrl(
    userId: string,
    fileType: MediaFileType,
    contentType: string,
    assignmentId: string,
  ): Promise<SignedUploadUrlResult> {
    if (fileType !== 'student_recording') {
      throw new AppError(400, 'Only student_recording uploads are supported in Phase 5');
    }

    await this.ensureBuckets();

    const storageKey = `${userId}/${assignmentId}/${randomUUID()}.m4a`;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_STUDENT_RECORDINGS)
      .createSignedUploadUrl(storageKey);

    if (error || !data) {
      throw new AppError(503, `Failed to create upload URL: ${error?.message ?? 'unknown'}`);
    }

    const expiresAt = new Date(Date.now() + UPLOAD_EXPIRES_IN_SECONDS * 1000).toISOString();

    return {
      uploadUrl: data.signedUrl,
      // Qualify with bucket prefix so callers always get a fully-resolvable key.
      storageKey: `${BUCKET_STUDENT_RECORDINGS}/${storageKey}`,
      expiresAt,
    };
  }

  // Returns a short-lived signed read URL for a stored recording.
  // Enforces ownership before signing:
  //   student  — must own the recording (userId embedded in key path)
  //   teacher  — must have an active teacher_student_relationships row with the recording owner
  //   admin/super_admin — unrestricted
  async getSignedReadUrl(
    requestingUserId: string,
    mediaType: MediaFileType,
    storageKey: string,
    role: UserRole = 'student',
  ): Promise<SignedReadUrlResult> {
    if (mediaType !== 'student_recording') {
      throw new AppError(400, 'Only student_recording read URLs are supported in Phase 5');
    }

    await this.ensureBuckets();
    await this.verifyReadAccess(storageKey, requestingUserId, role);

    // Strip the bucket prefix before calling the storage API.
    const objectPath = storageKey.startsWith(`${BUCKET_STUDENT_RECORDINGS}/`)
      ? storageKey.slice(`${BUCKET_STUDENT_RECORDINGS}/`.length)
      : storageKey;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_STUDENT_RECORDINGS)
      .createSignedUrl(objectPath, READ_EXPIRES_IN_SECONDS);

    if (error || !data) {
      throw new AppError(503, `Failed to create read URL: ${error?.message ?? 'unknown'}`);
    }

    const expiresAt = new Date(Date.now() + READ_EXPIRES_IN_SECONDS * 1000).toISOString();
    return { url: data.signedUrl, expiresAt };
  }

  private async verifyReadAccess(storageKey: string, userId: string, role: UserRole): Promise<void> {
    // Admins and super_admins can read any recording.
    if (role === 'admin' || role === 'super_admin') return;

    // Extract the recording owner's ID from the key path.
    // Key format after bucket prefix: {ownerId}/{assignmentId}/{uuid}.m4a
    const withoutBucket = storageKey.startsWith(`${BUCKET_STUDENT_RECORDINGS}/`)
      ? storageKey.slice(`${BUCKET_STUDENT_RECORDINGS}/`.length)
      : storageKey;
    const ownerId = withoutBucket.split('/')[0];

    if (!ownerId) throw new AppError(400, 'Malformed storage key');

    if (role === 'student') {
      if (ownerId !== userId) throw new AppError(403, 'Access denied: not your recording');
      return;
    }

    if (role === 'teacher') {
      // Teacher must have an active relationship with the recording owner.
      const { data } = await supabaseAdmin
        .from('teacher_student_relationships')
        .select('id')
        .eq('teacher_id', userId)
        .eq('student_id', ownerId)
        .eq('status', 'active')
        .maybeSingle();

      if (!data) throw new AppError(403, 'Access denied: student not assigned to you');
      return;
    }

    throw new AppError(403, 'Access denied');
  }

  private async assertBucketExists(name: string): Promise<void> {
    const { data, error } = await supabaseAdmin.storage.getBucket(name);
    if (!data || error) {
      throw new AppError(
        500,
        `Storage bucket "${name}" does not exist. ` +
        'Create it manually or set AUTO_CREATE_STORAGE_BUCKETS=true for the initial deploy.',
      );
    }
  }

  private async ensureBucket(
    name: string,
    opts: { allowedMimeTypes: string[]; fileSizeLimit: number },
  ): Promise<void> {
    const { data: existing } = await supabaseAdmin.storage.getBucket(name);
    if (existing) return;

    const { error } = await supabaseAdmin.storage.createBucket(name, {
      public: false,
      allowedMimeTypes: opts.allowedMimeTypes,
      fileSizeLimit: opts.fileSizeLimit,
    });

    // Ignore "already exists" races.
    if (error && !error.message.includes('already exists')) {
      throw new AppError(500, `Failed to create storage bucket ${name}: ${error.message}`);
    }
  }
}

export const mediaService = new MediaService();
