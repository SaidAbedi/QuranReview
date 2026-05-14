import { AppError } from '../types';

export interface CreateAssignmentInput {
  studentId: string;
  quranPageId: string;
  title?: string;
  instructions?: string;
  dueAt?: string;
}

export interface AssignmentRow {
  id: string;
  teacherId: string;
  studentId: string;
  quranPageId: string;
  title: string | null;
  instructions: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class AssignmentService {
  async createAssignment(
    teacherId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentRow> {
    throw new AppError(501, 'Not implemented');
  }

  async getStudentAssignments(studentId: string): Promise<AssignmentRow[]> {
    throw new AppError(501, 'Not implemented');
  }

  // Returns teacher's review queue: submitted/in_review attempts, most recent first.
  async getTeacherReviewQueue(teacherId: string): Promise<AssignmentRow[]> {
    throw new AppError(501, 'Not implemented');
  }
}

export const assignmentService = new AssignmentService();
