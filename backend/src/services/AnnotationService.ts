import { AppError, AnnotationType, AnchorType, MistakeType, PaginationParams, PaginatedResult } from '../types';

export interface AnnotationPointInput {
  x: number;
  y: number;
}

export interface VisualBoundsInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CreateAnnotationInput {
  annotationType: AnnotationType;
  anchorType: AnchorType;
  points: AnnotationPointInput[];
  style?: Record<string, unknown>;
  visualBounds?: VisualBoundsInput;
  verseKey?: string;
  wordId?: number;
  wordPosition?: number;
  lineNumber?: number;
  mistakeType?: MistakeType;
  mistakeOptionId?: string;
  quickLabel?: string;
  noteText?: string;
  recordingTimestampMs?: number;
}

export interface UpdateAnnotationInput extends Partial<CreateAnnotationInput> {}

export interface AnnotationRow {
  id: string;
  submissionId: string;
  submissionAttemptId: string;
  teacherId: string;
  quranPageId: string;
  annotationType: AnnotationType;
  anchorType: AnchorType;
  points: AnnotationPointInput[];
  pointCount: number;
  isSimplified: boolean;
  mistakeType: MistakeType | null;
  mistakeOptionId: string | null;
  quickLabel: string | null;
  noteText: string | null;
  recordingTimestampMs: number | null;
  hasVoiceNote?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Lightweight shape returned by the /annotation-markers endpoint.
// Used for audio playback timeline only — no path data included.
export interface AnnotationMarker {
  id: string;
  recordingTimestampMs: number | null;
  mistakeType: MistakeType | null;
  hasVoiceNote: boolean;
}

export class AnnotationService {
  // Full paths are loaded only on the review screen (paginated).
  async getAnnotations(
    submissionId: string,
    attemptId: string,
    requestingUserId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AnnotationRow>> {
    throw new AppError(501, 'Not implemented');
  }

  // Lightweight markers for audio playback timeline — no points returned.
  async getAnnotationMarkers(
    submissionId: string,
    attemptId: string,
    requestingUserId: string,
  ): Promise<AnnotationMarker[]> {
    throw new AppError(501, 'Not implemented');
  }

  async createAnnotation(
    submissionId: string,
    attemptId: string,
    teacherId: string,
    input: CreateAnnotationInput,
  ): Promise<AnnotationRow> {
    throw new AppError(501, 'Not implemented');
  }

  // Batch save — max 50 per request (blueprint §17).
  async batchCreateAnnotations(
    submissionId: string,
    attemptId: string,
    teacherId: string,
    items: CreateAnnotationInput[],
  ): Promise<AnnotationRow[]> {
    throw new AppError(501, 'Not implemented');
  }

  async updateAnnotation(
    annotationId: string,
    teacherId: string,
    input: UpdateAnnotationInput,
  ): Promise<AnnotationRow> {
    throw new AppError(501, 'Not implemented');
  }

  // Soft-deletes the annotation (sets deleted_at).
  async deleteAnnotation(annotationId: string, teacherId: string): Promise<void> {
    throw new AppError(501, 'Not implemented');
  }

  async addVoiceNote(
    annotationId: string,
    teacherId: string,
    audioStorageKey: string,
    durationMs?: number,
    contentType?: string,
    sizeBytes?: number,
  ): Promise<{ id: string; audioStorageKey: string }> {
    throw new AppError(501, 'Not implemented');
  }
}

export const annotationService = new AnnotationService();
