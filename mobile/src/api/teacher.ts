import { api, normalizeUrl } from './client';
import type {
  AttemptRow,
  TeacherQueueItem,
  CompleteReviewResult,
  SignedReadUrlResult,
  MistakeCategoryRow,
} from '@/types/api';

const normalizeQueueItem = (item: TeacherQueueItem): TeacherQueueItem => ({
  ...item,
  imageUrl: normalizeUrl(item.imageUrl),
});

export const getTeacherReviewQueue = async (): Promise<TeacherQueueItem[]> => {
  const data = await api.get<TeacherQueueItem[]>('/teacher/review-queue');
  return data.map(normalizeQueueItem);
};

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
