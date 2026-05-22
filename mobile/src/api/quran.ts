import { api, normalizeUrl } from './client';
import type { QuranPageSummary } from '@/types/api';

export const getQuranPage = async (pageNumber: number): Promise<QuranPageSummary> => {
  const data = await api.get<QuranPageSummary>(`/quran/pages/${pageNumber}`);
  return { ...data, imageUrl: normalizeUrl(data.imageUrl) };
};
