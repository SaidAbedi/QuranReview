import { supabaseAdmin } from '../db/client';
import { AppError, AnnotationType, AnchorType, MistakeType, PaginationParams, PaginatedResult, UserRole } from '../types';

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
  points?: AnnotationPointInput[];
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
  points: AnnotationPointInput[] | null;
  pointCount: number;
  isSimplified: boolean;
  visualBounds: VisualBoundsInput | null;
  style: Record<string, unknown>;
  verseKey: string | null;
  wordId: number | null;
  wordPosition: number | null;
  lineNumber: number | null;
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
  annotationType: AnnotationType;
  recordingTimestampMs: number | null;
  mistakeType: MistakeType | null;
  quickLabel: string | null;
  hasVoiceNote: boolean;
}

const MAX_POINTS_PER_ANNOTATION = 500;
const MAX_BATCH_SIZE = 50;

export class AnnotationService {
  // Resolves submission → assignment → checks teacher ownership or student ownership.
  private async resolveAccess(
    submissionId: string,
    attemptId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ studentId: string; teacherId: string; quranPageId: string }> {
    const { data: sub } = await supabaseAdmin
      .from('submissions')
      .select('student_id, quran_page_id, assignments!inner(teacher_id)')
      .eq('id', submissionId)
      .maybeSingle();

    if (!sub) throw new AppError(404, 'Submission not found');

    const subRow = sub as Record<string, unknown>;
    const assignment = subRow.assignments as Record<string, unknown>;
    const studentId = subRow.student_id as string;
    const teacherId = assignment.teacher_id as string;
    const quranPageId = subRow.quran_page_id as string;

    if (userRole === 'student' && studentId !== userId) {
      throw new AppError(403, 'Access denied');
    }
    if (userRole === 'teacher' && teacherId !== userId) {
      throw new AppError(403, 'Access denied: not your assignment');
    }

    // Verify the attempt belongs to this submission
    const { data: att } = await supabaseAdmin
      .from('submission_attempts')
      .select('id')
      .eq('id', attemptId)
      .eq('submission_id', submissionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!att) throw new AppError(404, 'Attempt not found');

    return { studentId, teacherId, quranPageId };
  }

  // Full paths are loaded only on the review screen (paginated).
  async getAnnotations(
    submissionId: string,
    attemptId: string,
    requestingUserId: string,
    pagination: PaginationParams,
    userRole: UserRole = 'student',
  ): Promise<PaginatedResult<AnnotationRow>> {
    await this.resolveAccess(submissionId, attemptId, requestingUserId, userRole);

    let query = supabaseAdmin
      .from('annotations')
      .select(`
        id, submission_id, submission_attempt_id, teacher_id, quran_page_id,
        annotation_type, anchor_type,
        points, visual_bounds, point_count, is_simplified, style,
        verse_key, word_id, word_position, line_number,
        mistake_type, mistake_option_id, quick_label,
        note_text, recording_timestamp_ms,
        created_at, updated_at,
        annotation_voice_notes(id)
      `)
      .eq('submission_attempt_id', attemptId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(pagination.limit + 1);

    if (pagination.cursor) {
      query = query.gt('created_at', pagination.cursor);
    }

    const { data, error } = await query;
    if (error) throw new AppError(500, 'Failed to fetch annotations');

    const rows = (data ?? []) as Record<string, unknown>[];
    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;

    return {
      data: page.map(toAnnotationRow),
      nextCursor: hasMore ? (page[page.length - 1].created_at as string) : undefined,
      hasMore,
    };
  }

  // Lightweight markers for audio playback timeline — no points returned.
  async getAnnotationMarkers(
    submissionId: string,
    attemptId: string,
    requestingUserId: string,
    userRole: UserRole = 'student',
  ): Promise<AnnotationMarker[]> {
    await this.resolveAccess(submissionId, attemptId, requestingUserId, userRole);

    const { data, error } = await supabaseAdmin
      .from('annotations')
      .select(`
        id, annotation_type, recording_timestamp_ms, mistake_type, quick_label,
        annotation_voice_notes(id)
      `)
      .eq('submission_attempt_id', attemptId)
      .is('deleted_at', null)
      .order('recording_timestamp_ms', { ascending: true, nullsFirst: false });

    if (error) throw new AppError(500, 'Failed to fetch annotation markers');

    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const voiceNotes = row.annotation_voice_notes as unknown[];
      return {
        id: row.id as string,
        annotationType: row.annotation_type as AnnotationType,
        recordingTimestampMs: (row.recording_timestamp_ms as number | null) ?? null,
        mistakeType: (row.mistake_type as MistakeType | null) ?? null,
        quickLabel: (row.quick_label as string | null) ?? null,
        hasVoiceNote: Array.isArray(voiceNotes) && voiceNotes.length > 0,
      };
    });
  }

  async createAnnotation(
    submissionId: string,
    attemptId: string,
    teacherId: string,
    input: CreateAnnotationInput,
    userRole: UserRole = 'teacher',
  ): Promise<AnnotationRow> {
    const { quranPageId } = await this.resolveAccess(
      submissionId, attemptId, teacherId, userRole,
    );

    validatePoints(input.points);

    const { data, error } = await supabaseAdmin
      .from('annotations')
      .insert(buildInsertRow(submissionId, attemptId, teacherId, quranPageId, input))
      .select(`
        id, submission_id, submission_attempt_id, teacher_id, quran_page_id,
        annotation_type, anchor_type,
        points, visual_bounds, point_count, is_simplified, style,
        verse_key, word_id, word_position, line_number,
        mistake_type, mistake_option_id, quick_label,
        note_text, recording_timestamp_ms,
        created_at, updated_at
      `)
      .single();

    if (error || !data) throw new AppError(500, 'Failed to create annotation');
    return toAnnotationRow(data as Record<string, unknown>);
  }

  // Batch save — max 50 per request (blueprint §17).
  async batchCreateAnnotations(
    submissionId: string,
    attemptId: string,
    teacherId: string,
    items: CreateAnnotationInput[],
    userRole: UserRole = 'teacher',
  ): Promise<AnnotationRow[]> {
    if (items.length > MAX_BATCH_SIZE) {
      throw new AppError(400, `Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    const { quranPageId } = await this.resolveAccess(
      submissionId, attemptId, teacherId, userRole,
    );

    for (const item of items) {
      validatePoints(item.points);
    }

    const rows = items.map((item) =>
      buildInsertRow(submissionId, attemptId, teacherId, quranPageId, item),
    );

    const { data, error } = await supabaseAdmin
      .from('annotations')
      .insert(rows)
      .select(`
        id, submission_id, submission_attempt_id, teacher_id, quran_page_id,
        annotation_type, anchor_type,
        points, visual_bounds, point_count, is_simplified, style,
        verse_key, word_id, word_position, line_number,
        mistake_type, mistake_option_id, quick_label,
        note_text, recording_timestamp_ms,
        created_at, updated_at
      `);

    if (error || !data) throw new AppError(500, 'Failed to batch create annotations');
    return (data as Record<string, unknown>[]).map(toAnnotationRow);
  }

  async updateAnnotation(
    annotationId: string,
    teacherId: string,
    input: UpdateAnnotationInput,
  ): Promise<AnnotationRow> {
    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from('annotations')
      .select('id, teacher_id')
      .eq('id', annotationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) throw new AppError(404, 'Annotation not found');
    if ((existing as Record<string, unknown>).teacher_id !== teacherId) {
      throw new AppError(403, 'Access denied: not your annotation');
    }

    if (input.points !== undefined) {
      validatePoints(input.points);
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.annotationType !== undefined) update.annotation_type = input.annotationType;
    if (input.anchorType !== undefined) update.anchor_type = input.anchorType;
    if (input.points !== undefined) {
      update.points = input.points ?? null;
      update.point_count = (input.points ?? []).length;
    }
    if (input.style !== undefined) update.style = input.style;
    if (input.visualBounds !== undefined) update.visual_bounds = input.visualBounds;
    if (input.verseKey !== undefined) update.verse_key = input.verseKey;
    if (input.wordId !== undefined) update.word_id = input.wordId;
    if (input.wordPosition !== undefined) update.word_position = input.wordPosition;
    if (input.lineNumber !== undefined) update.line_number = input.lineNumber;
    if (input.mistakeType !== undefined) update.mistake_type = input.mistakeType;
    if (input.mistakeOptionId !== undefined) update.mistake_option_id = input.mistakeOptionId;
    if (input.quickLabel !== undefined) update.quick_label = input.quickLabel;
    if (input.noteText !== undefined) update.note_text = input.noteText;
    if (input.recordingTimestampMs !== undefined) {
      update.recording_timestamp_ms = input.recordingTimestampMs;
    }

    const { data, error } = await supabaseAdmin
      .from('annotations')
      .update(update)
      .eq('id', annotationId)
      .select(`
        id, submission_id, submission_attempt_id, teacher_id, quran_page_id,
        annotation_type, anchor_type,
        points, visual_bounds, point_count, is_simplified, style,
        verse_key, word_id, word_position, line_number,
        mistake_type, mistake_option_id, quick_label,
        note_text, recording_timestamp_ms,
        created_at, updated_at
      `)
      .single();

    if (error || !data) throw new AppError(500, 'Failed to update annotation');
    return toAnnotationRow(data as Record<string, unknown>);
  }

  // Soft-deletes the annotation (sets deleted_at).
  async deleteAnnotation(annotationId: string, teacherId: string): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('annotations')
      .select('id, teacher_id')
      .eq('id', annotationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) throw new AppError(404, 'Annotation not found');
    if ((existing as Record<string, unknown>).teacher_id !== teacherId) {
      throw new AppError(403, 'Access denied: not your annotation');
    }

    const { error } = await supabaseAdmin
      .from('annotations')
      .update({ deleted_at: new Date().toISOString(), deleted_by: teacherId })
      .eq('id', annotationId);

    if (error) throw new AppError(500, 'Failed to delete annotation');
  }

  async addVoiceNote(
    annotationId: string,
    teacherId: string,
    audioStorageKey: string,
    durationMs?: number,
    contentType?: string,
    sizeBytes?: number,
  ): Promise<{ id: string; audioStorageKey: string }> {
    // Verify annotation exists and teacher owns it
    const { data: annotation } = await supabaseAdmin
      .from('annotations')
      .select('id, teacher_id')
      .eq('id', annotationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!annotation) throw new AppError(404, 'Annotation not found');
    if ((annotation as Record<string, unknown>).teacher_id !== teacherId) {
      throw new AppError(403, 'Access denied: not your annotation');
    }

    // One voice note per annotation: check if one already exists
    const { data: existing } = await supabaseAdmin
      .from('annotation_voice_notes')
      .select('id')
      .eq('annotation_id', annotationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) throw new AppError(409, 'Voice note already exists for this annotation');

    const { data, error } = await supabaseAdmin
      .from('annotation_voice_notes')
      .insert({
        annotation_id: annotationId,
        teacher_id: teacherId,
        audio_storage_key: audioStorageKey,
        duration_ms: durationMs ?? null,
        content_type: contentType ?? null,
        size_bytes: sizeBytes ?? null,
      })
      .select('id, audio_storage_key')
      .single();

    if (error || !data) throw new AppError(500, 'Failed to add voice note');
    const row = data as Record<string, unknown>;
    return { id: row.id as string, audioStorageKey: row.audio_storage_key as string };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validatePoints(points: AnnotationPointInput[] | undefined): void {
  if (points && points.length > MAX_POINTS_PER_ANNOTATION) {
    throw new AppError(
      400,
      `Annotation exceeds maximum of ${MAX_POINTS_PER_ANNOTATION} points`,
    );
  }
}

function buildInsertRow(
  submissionId: string,
  attemptId: string,
  teacherId: string,
  quranPageId: string,
  input: CreateAnnotationInput,
): Record<string, unknown> {
  const points = input.points ?? null;
  return {
    submission_id: submissionId,
    submission_attempt_id: attemptId,
    teacher_id: teacherId,
    quran_page_id: quranPageId,
    annotation_type: input.annotationType,
    anchor_type: input.anchorType,
    points,
    visual_bounds: input.visualBounds ?? null,
    point_count: points ? points.length : 0,
    is_simplified: false,
    style: input.style ?? {},
    verse_key: input.verseKey ?? null,
    word_id: input.wordId ?? null,
    word_position: input.wordPosition ?? null,
    line_number: input.lineNumber ?? null,
    mistake_type: input.mistakeType ?? null,
    mistake_option_id: input.mistakeOptionId ?? null,
    quick_label: input.quickLabel ?? null,
    note_text: input.noteText ?? null,
    recording_timestamp_ms: input.recordingTimestampMs ?? null,
  };
}

function toAnnotationRow(row: Record<string, unknown>): AnnotationRow {
  const voiceNotes = row.annotation_voice_notes as unknown[] | undefined;
  return {
    id: row.id as string,
    submissionId: row.submission_id as string,
    submissionAttemptId: row.submission_attempt_id as string,
    teacherId: row.teacher_id as string,
    quranPageId: row.quran_page_id as string,
    annotationType: row.annotation_type as AnnotationType,
    anchorType: row.anchor_type as AnchorType,
    points: (row.points as AnnotationPointInput[] | null) ?? null,
    pointCount: (row.point_count as number) ?? 0,
    isSimplified: (row.is_simplified as boolean) ?? false,
    visualBounds: (row.visual_bounds as VisualBoundsInput | null) ?? null,
    style: (row.style as Record<string, unknown>) ?? {},
    verseKey: (row.verse_key as string | null) ?? null,
    wordId: (row.word_id as number | null) ?? null,
    wordPosition: (row.word_position as number | null) ?? null,
    lineNumber: (row.line_number as number | null) ?? null,
    mistakeType: (row.mistake_type as MistakeType | null) ?? null,
    mistakeOptionId: (row.mistake_option_id as string | null) ?? null,
    quickLabel: (row.quick_label as string | null) ?? null,
    noteText: (row.note_text as string | null) ?? null,
    recordingTimestampMs: (row.recording_timestamp_ms as number | null) ?? null,
    hasVoiceNote: voiceNotes !== undefined
      ? Array.isArray(voiceNotes) && voiceNotes.length > 0
      : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const annotationService = new AnnotationService();
