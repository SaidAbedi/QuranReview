import { api } from './client';
import type { JuzProgressDetail, StudentProgressSummary, SurahProgressDetail } from '@/types/api';

export const getStudentProgress = () =>
  api.get<StudentProgressSummary>('/student/progress');

export const getSurahProgress = (surahNumber: number) =>
  api.get<SurahProgressDetail>(`/student/progress/surahs/${surahNumber}`);

export const getJuzProgress = (juzNumber: number) =>
  api.get<JuzProgressDetail>(`/student/progress/juz/${juzNumber}`);
