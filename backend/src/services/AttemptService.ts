import { AppError, AttemptStatus } from '../types';

export interface CreateAttemptInput {
  recordingStorageKey: string;
  recordingDurationMs?: number;
  originalFileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface AttemptRow {
  id: string;
  submissionId: string;
  studentId: string;
  quranPageId: string;
  attemptNumber: number;
  recordingStorageKey: string;
  recordingDurationMs: number | null;
  status: AttemptStatus;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CompleteReviewPageStatus = 'completed' | 'needs_resubmission';

export class AttemptService {
  // Calculates next attempt_number (max + 1) inside a transaction.
  // Retries once on UNIQUE constraint violation from a race.
  async createAttempt(
    submissionId: string,
    studentId: string,
    input: CreateAttemptInput,
  ): Promise<AttemptRow> {
    throw new AppError(501, 'Not implemented');
  }

  // Teacher marks an attempt as completed or needs_resubmission.
  // Also updates submission status, assignment status, student_page_progress,
  // and recalculates student_progress_snapshots — all in one backend transaction.
  async completeReview(
    submissionId: string,
    attemptId: string,
    teacherId: string,
    pageStatus: CompleteReviewPageStatus,
  ): Promise<AttemptRow> {
    throw new AppError(501, 'Not implemented');
  }
}

export const attemptService = new AttemptService();
