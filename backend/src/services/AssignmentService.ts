import { supabaseAdmin } from '../db/client';
import { AppError, UserRole } from '../types';

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
      .select('id')
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
  async getTeacherReviewQueue(teacherId: string): Promise<AssignmentSummary[]> {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('teacher_id', teacherId)
      .eq('status', 'submitted')
      .order('updated_at', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch review queue');
    return (data ?? []).map(toAssignmentSummary);
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
