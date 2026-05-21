import { api } from './client';
import type { StudentProgressSummary } from '@/types/api';

export const getStudentProgress = () =>
  api.get<StudentProgressSummary>('/student/progress');
