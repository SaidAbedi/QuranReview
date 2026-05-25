import { api } from './client';
import type { AnnotationRow, BatchAnnotationsResult, CreateAnnotationInput } from '@/types/api';

export const getAnnotations = (
  submissionId: string,
  attemptId: string,
  cursor?: string,
): Promise<BatchAnnotationsResult> =>
  api.get<BatchAnnotationsResult>(
    `/submissions/${submissionId}/attempts/${attemptId}/annotations${cursor ? `?cursor=${cursor}` : ''}`,
  );

export const batchSaveAnnotations = (
  submissionId: string,
  attemptId: string,
  annotations: CreateAnnotationInput[],
): Promise<AnnotationRow[]> =>
  api.post<AnnotationRow[]>(
    `/submissions/${submissionId}/attempts/${attemptId}/annotations/batch`,
    { annotations },
  );

export const deleteAnnotation = (annotationId: string): Promise<void> =>
  api.delete<void>(`/annotations/${annotationId}`);
