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

export const createAnnotation = (
  submissionId: string,
  attemptId: string,
  input: CreateAnnotationInput,
): Promise<AnnotationRow> =>
  api.post<AnnotationRow>(
    `/submissions/${submissionId}/attempts/${attemptId}/annotations`,
    input,
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

export const updateAnnotation = (
  annotationId: string,
  input: Partial<Pick<CreateAnnotationInput, 'mistakeType' | 'mistakeOptionId' | 'quickLabel' | 'noteText'>>,
): Promise<AnnotationRow> =>
  api.patch<AnnotationRow>(`/annotations/${annotationId}`, input);

export const deleteAnnotation = (annotationId: string): Promise<void> =>
  api.delete<void>(`/annotations/${annotationId}`);
