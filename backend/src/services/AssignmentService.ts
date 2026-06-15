import { supabaseAdmin } from '../db/client';
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

export interface TeacherStudentSummary {
  studentId: string;
  studentName: string;
  pagesAssigned: number;
  pagesCompleted: number;
  pagesNeedsResubmission: number;
  lastActivityAt: string;
}

export interface TeacherStudentSubmission {
  submissionId: string;
  assignmentId: string;
  pageNumber: number | null;
  assignmentTitle: string | null;
  status: string;
  attemptCount: number;
  currentAttemptId: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

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

    // Fetch submissions, then look up attempt_number for each current_attempt_id.
    const { data: subs } = await supabaseAdmin
      .from('submissions')
      .select('id, assignment_id, current_attempt_id, status, submitted_at')
      .in('assignment_id', assignmentIds);

    const subsList = (subs ?? []) as Record<string, unknown>[];
    const currentAttemptIds = subsList
      .map((s) => s.current_attempt_id as string | null)
      .filter((id): id is string => id !== null);

    let attemptNumMap = new Map<string, number>();
    if (currentAttemptIds.length > 0) {
      const { data: attempts } = await supabaseAdmin
        .from('submission_attempts')
        .select('id, attempt_number')
        .in('id', currentAttemptIds);
      attemptNumMap = new Map(
        (attempts ?? []).map((a) => {
          const row = a as Record<string, unknown>;
          return [row.id as string, row.attempt_number as number];
        }),
      );
    }

    const submissionRows = subsList.map((s) => {
      const caid = s.current_attempt_id as string | null;
      return { ...s, attempt_number: caid ? (attemptNumMap.get(caid) ?? null) : null } as Record<string, unknown>;
    });

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

  // All non-pending submissions for the teacher's queue — includes submitted,
  // in_review, reviewed, needs_resubmission, completed. Used for the "All" filter.
  async getTeacherAllSubmissions(teacherId: string): Promise<TeacherQueueItem[]> {
    const ACTIVE_STATUSES = ['submitted', 'in_review', 'reviewed', 'needs_resubmission', 'completed'];
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('teacher_id', teacherId)
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false });

    if (error) throw new AppError(500, 'Failed to fetch submissions');
    if (!data || data.length === 0) return [];

    const assignments = data as Record<string, unknown>[];
    const assignmentIds = assignments.map((a) => a.id as string);
    const studentIds = [...new Set(assignments.map((a) => a.student_id as string))];

    const { data: students } = await supabaseAdmin
      .from('users')
      .select('id, display_name')
      .in('id', studentIds);

    const nameMap = new Map(
      (students ?? []).map((s) => {
        const r = s as Record<string, unknown>;
        return [r.id as string, (r.display_name as string | null) ?? 'Unknown'];
      }),
    );

    const { data: subs } = await supabaseAdmin
      .from('submissions')
      .select('id, assignment_id, current_attempt_id, status, submitted_at')
      .in('assignment_id', assignmentIds);

    const subsList = (subs ?? []) as Record<string, unknown>[];
    const currentAttemptIds = subsList
      .map((s) => s.current_attempt_id as string | null)
      .filter((id): id is string => id !== null);

    let attemptNumMap = new Map<string, number>();
    if (currentAttemptIds.length > 0) {
      const { data: attempts } = await supabaseAdmin
        .from('submission_attempts')
        .select('id, attempt_number')
        .in('id', currentAttemptIds);
      attemptNumMap = new Map(
        (attempts ?? []).map((a) => {
          const r = a as Record<string, unknown>;
          return [r.id as string, r.attempt_number as number];
        }),
      );
    }

    const submissionRows = subsList.map((s) => {
      const caid = s.current_attempt_id as string | null;
      return { ...s, attempt_number: caid ? (attemptNumMap.get(caid) ?? null) : null } as Record<string, unknown>;
    });

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

  async getTeacherStudents(teacherId: string): Promise<TeacherStudentSummary[]> {
    const { data: assignments, error } = await supabaseAdmin
      .from('assignments')
      .select('student_id, updated_at')
      .eq('teacher_id', teacherId)
      .neq('status', 'archived');

    if (error) throw new AppError(500, 'Failed to fetch students');
    if (!assignments || assignments.length === 0) return [];

    const rows = assignments as Record<string, unknown>[];

    // Deduplicate students, track assignment count and latest activity
    const studentMeta = new Map<string, { count: number; lastActivityAt: string }>();
    for (const a of rows) {
      const sid = a.student_id as string;
      const updatedAt = a.updated_at as string;
      const existing = studentMeta.get(sid);
      if (existing) {
        existing.count++;
        if (updatedAt > existing.lastActivityAt) existing.lastActivityAt = updatedAt;
      } else {
        studentMeta.set(sid, { count: 1, lastActivityAt: updatedAt });
      }
    }

    const studentIds = [...studentMeta.keys()];

    const [{ data: users }, { data: pageProgress }] = await Promise.all([
      supabaseAdmin.from('users').select('id, display_name').in('id', studentIds),
      supabaseAdmin
        .from('student_page_progress')
        .select('student_id, status')
        .in('student_id', studentIds),
    ]);

    const nameMap = new Map(
      (users ?? []).map((u) => {
        const r = u as Record<string, unknown>;
        return [r.id as string, (r.display_name as string) ?? 'Unknown'];
      }),
    );

    const progressMap = new Map<string, { completed: number; needsPractice: number }>();
    for (const sid of studentIds) progressMap.set(sid, { completed: 0, needsPractice: 0 });
    for (const p of (pageProgress ?? []) as Record<string, unknown>[]) {
      const sid = p.student_id as string;
      const status = p.status as string;
      const entry = progressMap.get(sid);
      if (entry) {
        if (status === 'completed') entry.completed++;
        if (status === 'needs_resubmission') entry.needsPractice++;
      }
    }

    return studentIds.map((sid) => {
      const meta = studentMeta.get(sid)!;
      const prog = progressMap.get(sid)!;
      return {
        studentId: sid,
        studentName: nameMap.get(sid) ?? 'Unknown',
        pagesAssigned: meta.count,
        pagesCompleted: prog.completed,
        pagesNeedsResubmission: prog.needsPractice,
        lastActivityAt: meta.lastActivityAt,
      };
    });
  }

  async getTeacherStudentSubmissions(
    teacherId: string,
    studentId: string,
  ): Promise<TeacherStudentSubmission[]> {
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .select(
        'id, assignment_id, current_attempt_id, status, submitted_at, reviewed_at, completed_at, created_at, updated_at, assignments!inner(teacher_id, title, quran_pages(page_number))',
      )
      .eq('student_id', studentId)
      .eq('assignments.teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (error) throw new AppError(500, 'Failed to fetch student submissions');
    if (!data || data.length === 0) return [];

    const rows = data as Record<string, unknown>[];
    const submissionIds = rows.map((r) => r.id as string);

    const { data: attempts } = await supabaseAdmin
      .from('submission_attempts')
      .select('submission_id')
      .in('submission_id', submissionIds)
      .is('deleted_at', null);

    const attemptCountMap = new Map<string, number>();
    for (const a of (attempts ?? []) as Record<string, unknown>[]) {
      const sid = a.submission_id as string;
      attemptCountMap.set(sid, (attemptCountMap.get(sid) ?? 0) + 1);
    }

    return rows.map((r) => {
      const asgn = r.assignments as Record<string, unknown>;
      const page = asgn.quran_pages as Record<string, unknown> | null;
      return {
        submissionId: r.id as string,
        assignmentId: r.assignment_id as string,
        pageNumber: page ? (page.page_number as number) : null,
        assignmentTitle: (asgn.title as string | null) ?? null,
        status: r.status as string,
        attemptCount: attemptCountMap.get(r.id as string) ?? 0,
        currentAttemptId: (r.current_attempt_id as string | null) ?? null,
        submittedAt: (r.submitted_at as string | null) ?? null,
        reviewedAt: (r.reviewed_at as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        createdAt: r.created_at as string,
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
