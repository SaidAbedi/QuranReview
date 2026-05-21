import { supabaseAdmin, requirePgPool } from '../db/client';
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
    const pool = requirePgPool();
    const { rows } = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      request_id: string;
      request_status: string;
      created_at: string;
    }>(`
      SELECT
        u.id,
        u.email,
        u.display_name,
        sar.id          AS request_id,
        sar.status      AS request_status,
        sar.created_at
      FROM student_assignment_requests sar
      JOIN users u ON u.id = sar.student_id
      WHERE sar.status = 'pending_assignment'
      ORDER BY sar.created_at ASC
    `);

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      requestId: r.request_id,
      requestStatus: r.request_status as AssignmentRequestStatus,
      createdAt: r.created_at,
    }));
  }

  // Returns all assignment requests, optionally filtered by status.
  async getAssignmentRequests(
    status?: AssignmentRequestStatus,
  ): Promise<AssignmentRequestRow[]> {
    const pool = requirePgPool();

    const conditions = status ? 'WHERE sar.status = $1' : '';
    const params = status ? [status] : [];

    const { rows } = await pool.query<{
      id: string;
      student_id: string;
      student_email: string;
      student_display_name: string;
      requested_teacher_id: string | null;
      assigned_teacher_id: string | null;
      assigned_by: string | null;
      status: string;
      notes: string | null;
      created_at: string;
      assigned_at: string | null;
    }>(`
      SELECT
        sar.id,
        sar.student_id,
        u.email         AS student_email,
        u.display_name  AS student_display_name,
        sar.requested_teacher_id,
        sar.assigned_teacher_id,
        sar.assigned_by,
        sar.status,
        sar.notes,
        sar.created_at,
        sar.assigned_at
      FROM student_assignment_requests sar
      JOIN users u ON u.id = sar.student_id
      ${conditions}
      ORDER BY sar.created_at ASC
    `, params);

    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentEmail: r.student_email,
      studentDisplayName: r.student_display_name,
      requestedTeacherId: r.requested_teacher_id ?? null,
      assignedTeacherId: r.assigned_teacher_id ?? null,
      assignedBy: r.assigned_by ?? null,
      status: r.status as AssignmentRequestStatus,
      notes: r.notes ?? null,
      createdAt: r.created_at,
      assignedAt: r.assigned_at ?? null,
    }));
  }

  // Assigns a teacher to a pending student. Runs atomically:
  //   1. Marks assignment_request → 'assigned'
  //   2. Upserts teacher_student_relationships → status 'active'
  //   3. Updates student user_profiles.onboarding_status → 'active'
  // All request-state guards run inside the transaction after the FOR UPDATE lock
  // to eliminate the race window between pre-flight checks and the UPDATE.
  // Notifications (student + teacher) are created after the COMMIT — non-blocking.
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

    // ── Transaction ───────────────────────────────────────────────────────────
    const pool = requirePgPool();
    const client = await pool.connect();
    let updatedRequest: Record<string, unknown>;
    let studentId!: string;

    try {
      await client.query('BEGIN');

      // Lock the row first — all request-state checks happen here so they are
      // consistent with the subsequent UPDATE (no pre-flight/lock race window).
      const { rows: lockRows } = await client.query<{
        id: string;
        student_id: string;
        status: string;
      }>(
        'SELECT id, student_id, status FROM student_assignment_requests WHERE id = $1 FOR UPDATE',
        [requestId],
      );

      if (lockRows.length === 0) throw new AppError(404, 'Assignment request not found');

      const locked = lockRows[0];
      if (locked.status === 'assigned') {
        throw new AppError(409, 'Student is already assigned to a teacher');
      }
      if (locked.status !== 'pending_assignment') {
        throw new AppError(409, `Request has status "${locked.status}" and cannot be assigned`);
      }

      studentId = locked.student_id;

      // 1. Update assignment request
      const { rows: [ar] } = await client.query<Record<string, unknown>>(`
        UPDATE student_assignment_requests
        SET
          status              = 'assigned',
          assigned_teacher_id = $1,
          assigned_by         = $2,
          assigned_at         = now(),
          updated_at          = now()
        WHERE id = $3
        RETURNING *
      `, [teacherId, assignedBy, requestId]);

      if (!ar) throw new AppError(500, 'Failed to update assignment request');
      updatedRequest = ar;

      // 2. Upsert teacher_student_relationships — reactivates if previously deactivated
      await client.query(`
        INSERT INTO teacher_student_relationships (teacher_id, student_id, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (teacher_id, student_id) DO UPDATE SET status = 'active'
      `, [teacherId, studentId]);

      // 3. Mark student profile as active
      await client.query(`
        UPDATE user_profiles
        SET onboarding_status = 'active', updated_at = now()
        WHERE user_id = $1
      `, [studentId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err instanceof AppError ? err : new AppError(500, 'Failed to assign teacher');
    } finally {
      client.release();
    }

    // ── Notifications (fire-and-forget after COMMIT) ───────────────────────
    // Fetch student info for notification body and response shape
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
      updatedRequest!,
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
}

export const adminAssignmentService = new AdminAssignmentService();
