import { api } from './client';
import type {
  UnassignedStudentRow,
  TeacherOption,
  AdminRelationshipRow,
} from '@/types/api';

export const getUnassignedStudents = (): Promise<UnassignedStudentRow[]> =>
  api.get('/admin/students/unassigned');

export const getTeachers = (): Promise<TeacherOption[]> =>
  api.get('/admin/teachers');

export const assignTeacher = (
  requestId: string,
  teacherId: string,
): Promise<void> =>
  api.post(`/admin/assignment-requests/${requestId}/assign-teacher`, { teacherId });

export const getRelationships = (
  status?: 'active' | 'inactive' | 'pending',
): Promise<AdminRelationshipRow[]> => {
  const path = status ? `/admin/relationships?status=${status}` : '/admin/relationships';
  return api.get(path);
};

export const updateRelationship = (
  relationshipId: string,
  status: 'active' | 'inactive' | 'pending',
): Promise<void> =>
  api.patch(`/admin/teacher-student-relationships/${relationshipId}`, { status });
