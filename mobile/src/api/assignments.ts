import { api, normalizeUrl } from './client';
import type { AssignmentSummary } from '@/types/api';

const normalize = (a: AssignmentSummary): AssignmentSummary => ({
  ...a,
  imageUrl: normalizeUrl(a.imageUrl),
});

export const getStudentAssignments = async (): Promise<AssignmentSummary[]> => {
  const data = await api.get<AssignmentSummary[]>('/student/assignments');
  return data.map(normalize);
};

export const getStudentAssignment = async (id: string): Promise<AssignmentSummary> => {
  const data = await api.get<AssignmentSummary>(`/student/assignments/${id}`);
  return normalize(data);
};
