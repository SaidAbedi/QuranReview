import { AppError, SubmissionStatus } from '../types';

export interface CreateSubmissionInput {
  assignmentId: string;
  recordingStorageKey: string;
  recordingDurationMs?: number;
  originalFileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface SubmissionRow {
  id: string;
  assignmentId: string;
  studentId: string;
  quranPageId: string;
  currentAttemptId: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class SubmissionService {
  // Creates submission + first attempt in a single transaction.
  // Sets current_attempt_id after inserting the attempt.
  async createSubmission(
    studentId: string,
    input: CreateSubmissionInput,
  ): Promise<SubmissionRow> {
    throw new AppError(501, 'Not implemented');
  }

  // Verifies the requesting user is the student or assigned teacher.
  async getSubmission(
    submissionId: string,
    requestingUserId: string,
  ): Promise<SubmissionRow> {
    throw new AppError(501, 'Not implemented');
  }
}

export const submissionService = new SubmissionService();
