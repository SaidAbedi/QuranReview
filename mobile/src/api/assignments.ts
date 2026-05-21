import { api } from './client';
import type { AssignmentSummary } from '@/types/api';

export const getStudentAssignments = () =>
  api.get<AssignmentSummary[]>('/student/assignments');

export const getStudentAssignment = (id: string) =>
  api.get<AssignmentSummary>(`/student/assignments/${id}`);
