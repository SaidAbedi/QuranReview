import { supabaseAdmin, requirePgPool } from '../db/client';
import { AppError, UserRole } from '../types';
import { quranContentService } from './QuranContentService';

export interface CreateAssignmentInput {
  studentId: string;
  quranPageId: string;
  title?: string;
  instructions?: string;
  dueAt?: string;
}

export interface AssignmentSummary {
  id: string;
  teacherId: string;
  studentId: string;
  quranPageId: string;
  pageNumber: number | null;
  imageUrl: string | null;
  title: string | null;
  instructions: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Enriched queue item returned by getTeacherReviewQueue.
// Includes student name and current submission/attempt info for the review queue UI.
export interface TeacherQueueItem extends AssignmentSummary {
  studentName: string;
  submissionId: string | null;
  currentAttemptId: string | null;
  attemptNumber: number | null;
  submissionStatus: string | null;
  submittedAt: string | null;
}

// Legacy alias used by the route stub — keep for backward compat.
export type AssignmentRow = AssignmentSummary;

const ASSIGNMENT_SELECT = `
  id, teacher_id, student_id, quran_page_id,
  title, instructions, due_at, status,
  created_at, updated_at,
  quran_pages ( page_number, image_url )
`;

export class AssignmentService {
  async createAssignment(
    teacherId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentSummary> {
    // Teacher must have an active relationship with this student.
    const { data: rel } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('student_id', input.studentId)
      .eq('status', 'active')
      .maybeSingle();

    if (!rel) {
      throw new AppError(403, 'No active teacher-student relationship for this student');
    }

    const { data: page } = await supabaseAdmin
      .from('quran_pages')
      .select('id, page_number')
      .eq('id', input.quranPageId)
      .maybeSingle();

    if (!page) throw new AppError(404, 'Quran page not found');

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .insert({
        teacher_id: teacherId,
        student_id: input.studentId,
        quran_page_id: input.quranPageId,
        title: input.title ?? null,
        instructions: input.instructions ?? null,
        due_at: input.dueAt ?? null,
        status: 'assigned',
      })
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error || !data) throw new AppError(500, 'Failed to create assignment');

    // Move student from pending_assignment → active when they get their first assignment.
    await supabaseAdmin
      .from('user_profiles')
      .update({ onboarding_status: 'active', updated_at: new Date().toISOString() })
      .eq('user_id', input.studentId)
      .eq('onboarding_status', 'pending_assignment');

    // Ensure quran_page_mappings is populated for this page so that surah/juz
    // progress breakdowns work as soon as the first assignment is created.
    const pageNumber = (page as Record<string, unknown>).page_number as number;
    quranContentService.getPageContent(pageNumber, false).catch((err) => {
      console.error('[AssignmentService] Failed to populate quran_page_mappings for page', pageNumber, err);
    });

    return toAssignmentSummary(data);
  }

  async getStudentAssignments(studentId: string): Promise<AssignmentSummary[]> {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('student_id', studentId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) throw new AppError(500, 'Failed to fetch assignments');
    return (data ?? []).map(toAssignmentSummary);
  }

  async getTeacherAssignments(teacherId: string): Promise<AssignmentSummary[]> {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('teacher_id', teacherId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) throw new AppError(500, 'Failed to fetch assignments');
    return (data ?? []).map(toAssignmentSummary);
  }

  async getAssignmentById(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<AssignmentSummary> {
    const { data } = await supabaseAdmin
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (!data) throw new AppError(404, 'Assignment not found');

    if (role === 'student' && (data as Record<string, unknown>).student_id !== userId) {
      throw new AppError(403, 'Access denied');
    }
    if (role === 'teacher' && (data as Record<string, unknown>).teacher_id !== userId) {
      throw new AppError(403, 'Access denied');
    }

    return toAssignmentSummary(data);
  }

  // Teacher's pending review queue: assignments where the student has submitted
  // and the teacher has not yet reviewed. 'reviewed' assignments are excluded
  // because they represent completed or returned-for-practice reviews.
  // Returns enriched items including student name and current submission/attempt info.
  async getTeacherReviewQueue(teacherId: string): Promise<TeacherQueueItem[]> {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('teacher_id', teacherId)
      .eq('status', 'submitted')
      .order('updated_at', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch review queue');
    if (!data || data.length === 0) return [];

    const assignments = data as Record<string, unknown>[];
    const assignmentIds = assignments.map((a) => a.id as string);
    const studentIds = [...new Set(assignments.map((a) => a.student_id as string))];

    // Fetch student display names in one query.
    const { data: students } = await supabaseAdmin
      .from('users')
      .select('id, display_name')
      .in('id', studentIds);

    const nameMap = new Map(
      (students ?? []).map((s) => {
        const row = s as Record<string, unknown>;
        return [row.id as string, (row.display_name as string | null) ?? 'Unknown'];
      }),
    );

    // Fetch submissions + current attempt number via a raw JOIN query.
    const pool = requirePgPool();
    const { rows: submissionRows } = await pool.query<Record<string, unknown>>(`
      SELECT s.id, s.assignment_id, s.current_attempt_id, s.status, s.submitted_at,
             sa.attempt_number
      FROM submissions s
      LEFT JOIN submission_attempts sa ON sa.id = s.current_attempt_id
      WHERE s.assignment_id = ANY($1)
    `, [assignmentIds]);

    const subByAssignment = new Map(
      submissionRows.map((r) => [r.assignment_id as string, r]),
    );

    return assignments.map((a) => {
      const base = toAssignmentSummary(a);
      const sub = subByAssignment.get(a.id as string) ?? null;
      return {
        ...base,
        studentName: nameMap.get(a.student_id as string) ?? 'Unknown',
        submissionId: sub ? (sub.id as string) : null,
        currentAttemptId: sub ? ((sub.current_attempt_id as string | null) ?? null) : null,
        attemptNumber: sub ? ((sub.attempt_number as number | null) ?? null) : null,
        submissionStatus: sub ? (sub.status as string) : null,
        submittedAt: sub ? ((sub.submitted_at as string | null) ?? null) : null,
      };
    });
  }
}

function toAssignmentSummary(row: Record<string, unknown>): AssignmentSummary {
  const p = row.quran_pages as Record<string, unknown> | null;
  return {
    id: row.id as string,
    teacherId: row.teacher_id as string,
    studentId: row.student_id as string,
    quranPageId: row.quran_page_id as string,
    pageNumber: (p?.page_number as number | null) ?? null,
    imageUrl: (p?.image_url as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    instructions: (row.instructions as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    status: row.status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const assignmentService = new AssignmentService();
