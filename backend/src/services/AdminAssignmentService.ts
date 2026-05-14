import { AppError, AssignmentRequestStatus } from '../types';

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
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

// Handles admin/super_admin workflows for assigning students to teachers.
// New students enter a pending queue; only admins can assign.
export class AdminAssignmentService {
  // Returns students whose assignment_request.status = 'pending_assignment'.
  async getUnassignedStudents(): Promise<UnassignedStudentRow[]> {
    throw new AppError(501, 'Not implemented');
  }

  async getAssignmentRequests(
    status?: AssignmentRequestStatus,
  ): Promise<AssignmentRequestRow[]> {
    throw new AppError(501, 'Not implemented');
  }

  // Assigns a teacher to a student:
  //   1. Updates assignment_request status to 'assigned'.
  //   2. Upserts teacher_student_relationships row.
  //   3. Creates notifications for both teacher and student.
  async assignTeacher(
    requestId: string,
    teacherId: string,
    assignedBy: string,
  ): Promise<AssignmentRequestRow> {
    throw new AppError(501, 'Not implemented');
  }

  async updateTeacherStudentRelationship(
    relationshipId: string,
    status: 'active' | 'inactive' | 'pending',
    updatedBy: string,
  ): Promise<TeacherStudentRelationshipRow> {
    throw new AppError(501, 'Not implemented');
  }
}

export const adminAssignmentService = new AdminAssignmentService();
