import { api, normalizeUrl } from './client';
import type {
  AttemptRow,
  ReviewVoiceNoteRow,
  TeacherQueueItem,
  TeacherStudentSummary,
  TeacherStudentSubmission,
  CompleteReviewResult,
  SignedReadUrlResult,
  MistakeCategoryRow,
} from '@/types/api';

export interface ReviewVoiceNoteUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

const normalizeQueueItem = (item: TeacherQueueItem): TeacherQueueItem => ({
  ...item,
  imageUrl: normalizeUrl(item.imageUrl),
});

export const getTeacherReviewQueue = async (): Promise<TeacherQueueItem[]> => {
  const data = await api.get<TeacherQueueItem[]>('/teacher/review-queue');
  return data.map(normalizeQueueItem);
};

export const getTeacherAllSubmissions = async (): Promise<TeacherQueueItem[]> => {
  const data = await api.get<TeacherQueueItem[]>('/teacher/all-submissions');
  return data.map(normalizeQueueItem);
};

export const getTeacherStudents = (): Promise<TeacherStudentSummary[]> =>
  api.get<TeacherStudentSummary[]>('/teacher/students');

export const getTeacherStudentSubmissions = (studentId: string): Promise<TeacherStudentSubmission[]> =>
  api.get<TeacherStudentSubmission[]>(`/teacher/students/${studentId}/submissions`);

export const getRecordingUrl = (
  submissionId: string,
  attemptId: string,
): Promise<SignedReadUrlResult> =>
  api.get<SignedReadUrlResult>(
    `/submissions/${submissionId}/attempts/${attemptId}/recording-url`,
  );

export const completeReview = (
  submissionId: string,
  attemptId: string,
  pageStatus: 'completed' | 'needs_resubmission',
): Promise<CompleteReviewResult> =>
  api.post<CompleteReviewResult>(
    `/submissions/${submissionId}/attempts/${attemptId}/complete-review`,
    { pageStatus },
  );

export const getMistakeCategories = (): Promise<MistakeCategoryRow[]> =>
  api.get<MistakeCategoryRow[]>('/mistake-categories');

export const getAttemptHistory = (submissionId: string): Promise<AttemptRow[]> =>
  api.get<AttemptRow[]>(`/submissions/${submissionId}/attempts`);

export const getReviewVoiceNote = (
  submissionId: string,
  attemptId: string,
): Promise<ReviewVoiceNoteRow | null> =>
  api.get<ReviewVoiceNoteRow | null>(
    `/submissions/${submissionId}/attempts/${attemptId}/review-voice-note`,
  );

export const getReviewVoiceNoteUploadUrl = (
  submissionId: string,
  attemptId: string,
  contentType: string,
): Promise<ReviewVoiceNoteUploadUrlResult> =>
  api.post<ReviewVoiceNoteUploadUrlResult>('/media/review-voice-note-upload-url', {
    submissionId,
    attemptId,
    contentType,
  });

export const saveReviewVoiceNote = (
  submissionId: string,
  attemptId: string,
  input: { audioStorageKey: string; durationMs: number; contentType: string; sizeBytes: number },
): Promise<ReviewVoiceNoteRow> =>
  api.post<ReviewVoiceNoteRow>(
    `/submissions/${submissionId}/attempts/${attemptId}/review-voice-note`,
    input,
  );

export const deleteReviewVoiceNote = (
  submissionId: string,
  attemptId: string,
): Promise<{ success: boolean }> =>
  api.delete<{ success: boolean }>(
    `/submissions/${submissionId}/attempts/${attemptId}/review-voice-note`,
  );

export const getReviewVoiceNoteReadUrl = (storageKey: string): Promise<SignedReadUrlResult> =>
  api.post<SignedReadUrlResult>('/media/signed-read-url', {
    mediaType: 'review_voice_note',
    storageKey,
  });
