import { api } from './client';
import type { CreateSubmissionResult, CreateAttemptResult, SubmissionRow, AttemptRow } from '@/types/api';

export const createSubmission = (assignmentId: string) =>
  api.post<CreateSubmissionResult>('/submissions', { assignmentId });

export const createAttempt = (submissionId: string) =>
  api.post<CreateAttemptResult>(`/submissions/${submissionId}/attempts`);

export const getStudentSubmissions = () =>
  api.get<SubmissionRow[]>('/student/submissions');

export const getSubmissionAttempts = (submissionId: string) =>
  api.get<AttemptRow[]>(`/submissions/${submissionId}/attempts`);

export const getSignedReadUrl = (storagePath: string) =>
  api.post<{ signedUrl: string }>('/media/signed-read-url', { storagePath });
