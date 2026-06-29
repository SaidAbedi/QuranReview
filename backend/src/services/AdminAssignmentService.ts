import { supabaseAdmin } from '../db/client';
import { AppError, AssignmentRequestStatus } from '../types';
import { notificationService } from './NotificationService';

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface UnassignedStudentRow {
  id: string;
  email: string;
  displayName: string;
  requestId: string;
  requestStatus: AssignmentRequestStatus;
  createdAt: string;
}

export interface AssignmentRequestRow {
  id: string;
  studentId: string;
  studentEmail: string;
  studentDisplayName: string;
  requestedTeacherId: string | null;
  assignedTeacherId: string | null;
  assignedBy: string | null;
  status: AssignmentRequestStatus;
  notes: string | null;
  createdAt: string;
  assignedAt: string | null;
}

export interface TeacherStudentRelationshipRow {
  id: string;
  teacherId: string;
  studentId: string;
  // Allowed statuses are defined by the DB CHECK constraint.
  // 'paused' / 'ended' / 'archived' require a schema migration before use.
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

export interface TeacherOptionRow {
  id: string;
  displayName: string;
  email: string;
  currentLoad: number;
  capacity: number | null;
}

export interface EnrichedRelationshipRow {
  id: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toAssignmentRequestRow(
  r: Record<string, unknown>,
  studentEmail: string,
  studentDisplayName: string,
): AssignmentRequestRow {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    studentEmail,
    studentDisplayName,
    requestedTeacherId: (r.requested_teacher_id as string | null) ?? null,
    assignedTeacherId: (r.assigned_teacher_id as string | null) ?? null,
    assignedBy: (r.assigned_by as string | null) ?? null,
    status: r.status as AssignmentRequestStatus,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    assignedAt: (r.assigned_at as string | null) ?? null,
  };
}

function toRelationshipRow(r: Record<string, unknown>): TeacherStudentRelationshipRow {
  return {
    id: r.id as string,
    teacherId: r.teacher_id as string,
    studentId: r.student_id as string,
    status: r.status as TeacherStudentRelationshipRow['status'],
    createdAt: r.created_at as string,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

// Handles admin/super_admin workflows for assigning students to teachers.
// New students enter a pending queue; only admins/super_admins can assign.
export class AdminAssignmentService {
  // Returns students whose most-recent assignment_request has status = 'pending_assignment'.
  async getUnassignedStudents(): Promise<UnassignedStudentRow[]> {
    const { data: requests, error } = await supabaseAdmin
      .from('student_assignment_requests')
      .select('id, student_id, status, created_at')
      .eq('status', 'pending_assignment')
      .order('created_at', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch unassigned students');
    if (!requests || requests.length === 0) return [];

    const studentIds = (requests as Record<string, unknown>[]).map((r) => r.student_id as string);

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name')
      .in('id', studentIds);

    const userMap = new Map(
      (users ?? []).map((u) => {
        const row = u as Record<string, unknown>;
        return [row.id as string, row];
      }),
    );

    return (requests as Record<string, unknown>[]).map((r) => {
      const user = userMap.get(r.student_id as string);
      return {
        id: r.student_id as string,
        email: (user?.email as string) ?? '',
        displayName: (user?.display_name as string) ?? '',
        requestId: r.id as string,
        requestStatus: r.status as AssignmentRequestStatus,
        createdAt: r.created_at as string,
      };
    });
  }

  // Returns all assignment requests, optionally filtered by status.
  async getAssignmentRequests(
    status?: AssignmentRequestStatus,
  ): Promise<AssignmentRequestRow[]> {
    let query = supabaseAdmin
      .from('student_assignment_requests')
      .select('id, student_id, requested_teacher_id, assigned_teacher_id, assigned_by, status, notes, created_at, assigned_at')
      .order('created_at', { ascending: true });

    if (status) query = query.eq('status', status);

    const { data: requests, error } = await query;
    if (error) throw new AppError(500, 'Failed to fetch assignment requests');
    if (!requests || requests.length === 0) return [];

    const studentIds = [...new Set(
      (requests as Record<string, unknown>[]).map((r) => r.student_id as string),
    )];

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name')
      .in('id', studentIds);

    const userMap = new Map(
      (users ?? []).map((u) => {
        const row = u as Record<string, unknown>;
        return [row.id as string, row];
      }),
    );

    return (requests as Record<string, unknown>[]).map((r) => {
      const user = userMap.get(r.student_id as string);
      return {
        id: r.id as string,
        studentId: r.student_id as string,
        studentEmail: (user?.email as string) ?? '',
        studentDisplayName: (user?.display_name as string) ?? '',
        requestedTeacherId: (r.requested_teacher_id as string | null) ?? null,
        assignedTeacherId: (r.assigned_teacher_id as string | null) ?? null,
        assignedBy: (r.assigned_by as string | null) ?? null,
        status: r.status as AssignmentRequestStatus,
        notes: (r.notes as string | null) ?? null,
        createdAt: r.created_at as string,
        assignedAt: (r.assigned_at as string | null) ?? null,
      };
    });
  }

  // Assigns a teacher to a pending student. Sequential operations:
  //   1. Validates teacher role (immutable — safe pre-flight)
  //   2. Validates request status, updates request → 'assigned'
  //   3. Upserts teacher_student_relationships → status 'active'
  //   4. Updates student user_profiles.onboarding_status → 'active'
  // Notifications (student + teacher) are created after — non-blocking.
  async assignTeacher(
    requestId: string,
    teacherId: string,
    assignedBy: string,
  ): Promise<AssignmentRequestRow> {
    // ── Pre-flight: validate teacher only (role is immutable) ─────────────────
    const { data: teacherRow } = await supabaseAdmin
      .from('users')
      .select('id, display_name, role')
      .eq('id', teacherId)
      .maybeSingle();

    if (!teacherRow) throw new AppError(404, 'Teacher not found');
    const teacher = teacherRow as Record<string, unknown>;
    if (teacher.role !== 'teacher') {
      throw new AppError(400, 'Specified user is not a teacher');
    }

    // ── Validate and update request ───────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('student_assignment_requests')
      .select('id, student_id, status')
      .eq('id', requestId)
      .maybeSingle();

    if (!existing) throw new AppError(404, 'Assignment request not found');

    const req = existing as Record<string, unknown>;
    if (req.status === 'assigned') {
      throw new AppError(409, 'Student is already assigned to a teacher');
    }
    if (req.status !== 'pending_assignment') {
      throw new AppError(409, `Request has status "${req.status}" and cannot be assigned`);
    }

    const studentId = req.student_id as string;

    // 1. Update assignment request
    const { data: updatedReq, error: reqError } = await supabaseAdmin
      .from('student_assignment_requests')
      .update({
        status: 'assigned',
        assigned_teacher_id: teacherId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('*')
      .single();

    if (reqError || !updatedReq) throw new AppError(500, 'Failed to update assignment request');

    // 2. Upsert teacher_student_relationships — reactivates if previously deactivated
    await supabaseAdmin
      .from('teacher_student_relationships')
      .upsert(
        { teacher_id: teacherId, student_id: studentId, status: 'active' },
        { onConflict: 'teacher_id,student_id' },
      );

    // 3. Mark student profile as active
    await supabaseAdmin
      .from('user_profiles')
      .update({ onboarding_status: 'active', updated_at: new Date().toISOString() })
      .eq('user_id', studentId);

    // 4. Seed Surah Al-Fatiha (page 1) as the student's first assignment — idempotent
    await this.seedFatihaAssignment(studentId, teacherId);

    // ── Notifications (fire-and-forget) ───────────────────────────────────────
    const { data: studentInfo } = await supabaseAdmin
      .from('users')
      .select('email, display_name')
      .eq('id', studentId)
      .maybeSingle();
    const si = (studentInfo as Record<string, unknown>) ?? {};

    notificationService.createNotification({
      recipientUserId: studentId,
      actorUserId: assignedBy,
      type: 'student_assigned_to_teacher',
      title: 'You have been assigned to a teacher',
      body: `${teacher.display_name as string} is your teacher.`,
      data: { requestId, teacherId },
    }).catch((err) => {
      console.error('[AdminAssignmentService] Student notification failed:', err);
    });

    notificationService.createNotification({
      recipientUserId: teacherId,
      actorUserId: assignedBy,
      type: 'admin_assigned_teacher',
      title: 'A new student has been assigned to you',
      body: `${(si.display_name as string) ?? 'A student'} has been added to your students.`,
      data: { requestId, studentId },
    }).catch((err) => {
      console.error('[AdminAssignmentService] Teacher notification failed:', err);
    });

    return toAssignmentRequestRow(
      updatedReq as Record<string, unknown>,
      (si.email as string) ?? '',
      (si.display_name as string) ?? '',
    );
  }

  // Updates the status of a teacher-student relationship.
  // Allowed values: 'active' | 'inactive' | 'pending' (DB constraint).
  // Note: 'paused', 'ended', 'archived' require a schema migration — not yet supported.
  // Note: teacher_student_relationships has no updated_by column — updatedBy is used
  //       only as notification actorUserId.
  async updateTeacherStudentRelationship(
    relationshipId: string,
    status: 'active' | 'inactive' | 'pending',
    updatedBy: string,
  ): Promise<TeacherStudentRelationshipRow> {
    const { data: existing } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id, student_id, status')
      .eq('id', relationshipId)
      .maybeSingle();

    if (!existing) throw new AppError(404, 'Teacher-student relationship not found');

    const rel = existing as Record<string, unknown>;
    const previousStatus = rel.status as string;

    const { data, error } = await supabaseAdmin
      .from('teacher_student_relationships')
      .update({ status })
      .eq('id', relationshipId)
      .select('*')
      .single();

    if (error || !data) throw new AppError(500, 'Failed to update relationship');

    const result = toRelationshipRow(data as Record<string, unknown>);

    // Fire-and-forget in-app notifications for meaningful status transitions.
    if (status !== previousStatus && status !== 'pending') {
      const studentId = rel.student_id as string;
      if (status === 'inactive') {
        notificationService.createNotification({
          recipientUserId: studentId,
          actorUserId: updatedBy,
          type: 'relationship_deactivated',
          title: 'Your teacher assignment has been paused',
          body: 'Your teacher assignment has been set to inactive. Contact your admin if you have questions.',
          data: { relationshipId },
        }).catch((err) => {
          console.error('[AdminAssignmentService] Deactivated notification failed:', err);
        });
      } else if (status === 'active') {
        notificationService.createNotification({
          recipientUserId: studentId,
          actorUserId: updatedBy,
          type: 'relationship_reactivated',
          title: 'Your teacher assignment has been reactivated',
          body: 'You have been reactivated with your teacher.',
          data: { relationshipId },
        }).catch((err) => {
          console.error('[AdminAssignmentService] Reactivated notification failed:', err);
        });
      }
    }

    return result;
  }

  // Returns all users with role='teacher', including their current student load.
  async getTeachers(): Promise<TeacherOptionRow[]> {
    const { data: teachers, error } = await supabaseAdmin
      .from('users')
      .select('id, display_name, email')
      .eq('role', 'teacher')
      .order('display_name', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch teachers');
    if (!teachers || teachers.length === 0) return [];

    const teacherIds = (teachers as Record<string, unknown>[]).map((t) => t.id as string);

    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, teacher_current_load, teacher_capacity')
      .in('user_id', teacherIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => {
        const row = p as Record<string, unknown>;
        return [row.user_id as string, row];
      }),
    );

    return (teachers as Record<string, unknown>[]).map((t) => {
      const profile = profileMap.get(t.id as string);
      return {
        id: t.id as string,
        displayName: (t.display_name as string) ?? '',
        email: (t.email as string) ?? '',
        currentLoad: profile ? (Number(profile.teacher_current_load) || 0) : 0,
        capacity: profile ? ((profile.teacher_capacity as number | null) ?? null) : null,
      };
    });
  }

  // Creates a Surah Al-Fatiha (page 1) assignment for a newly assigned student.
  // Safe to call multiple times — skips creation if the student already has
  // any assignment for page 1.
  private async seedFatihaAssignment(studentId: string, teacherId: string): Promise<void> {
    try {
      // Resolve quran_page_id for page 1 (Madani Mushaf, mushaf_id=1)
      const { data: mapping } = await supabaseAdmin
        .from('quran_page_mappings')
        .select('quran_page_id')
        .eq('page_number', 1)
        .eq('provider_mushaf_id', 1)
        .maybeSingle();

      if (!mapping) {
        console.warn('[AdminAssignmentService] Fatiha seed skipped: page 1 mapping not found');
        return;
      }

      const quranPageId = (mapping as Record<string, unknown>).quran_page_id as string;

      // Idempotency guard — skip if student already has an assignment for page 1
      const { data: existing } = await supabaseAdmin
        .from('assignments')
        .select('id')
        .eq('student_id', studentId)
        .eq('quran_page_id', quranPageId)
        .maybeSingle();

      if (existing) return;

      await supabaseAdmin.from('assignments').insert({
        teacher_id: teacherId,
        student_id: studentId,
        quran_page_id: quranPageId,
        title: 'Surah Al-Fatiha',
        instructions: 'Begin with Surah Al-Fatiha. Recite clearly and at a comfortable pace.',
        status: 'assigned',
        assignment_type: 'teacher_assigned',
      });
    } catch (err) {
      // Non-fatal — log and continue. The teacher can manually assign Fatiha if needed.
      console.error('[AdminAssignmentService] Fatiha seed failed:', (err as Error).message);
    }
  }

  // Returns all teacher-student relationships enriched with display names.
  async getRelationships(
    status?: 'active' | 'inactive' | 'pending',
  ): Promise<EnrichedRelationshipRow[]> {
    let query = supabaseAdmin
      .from('teacher_student_relationships')
      .select('id, teacher_id, student_id, status, created_at')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: relationships, error } = await query;
    if (error) throw new AppError(500, 'Failed to fetch relationships');
    if (!relationships || relationships.length === 0) return [];

    const relList = relationships as Record<string, unknown>[];
    const teacherIds = [...new Set(relList.map((r) => r.teacher_id as string))];
    const studentIds = [...new Set(relList.map((r) => r.student_id as string))];
    const allIds = [...new Set([...teacherIds, ...studentIds])];

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, display_name')
      .in('id', allIds);

    const nameMap = new Map(
      (users ?? []).map((u) => {
        const row = u as Record<string, unknown>;
        return [row.id as string, (row.display_name as string | null) ?? ''];
      }),
    );

    return relList.map((r) => ({
      id: r.id as string,
      teacherId: r.teacher_id as string,
      teacherName: nameMap.get(r.teacher_id as string) ?? '',
      studentId: r.student_id as string,
      studentName: nameMap.get(r.student_id as string) ?? '',
      status: r.status as EnrichedRelationshipRow['status'],
      createdAt: r.created_at as string,
    }));
  }
}

export const adminAssignmentService = new AdminAssignmentService();
