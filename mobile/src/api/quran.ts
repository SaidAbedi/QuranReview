import { api } from './client';
import type { QuranPageSummary } from '@/types/api';

export const getQuranPage = (pageNumber: number) =>
  api.get<QuranPageSummary>(`/quran/pages/${pageNumber}`);
