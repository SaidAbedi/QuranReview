import { api, normalizeUrl } from './client';
import type { QuranPageSummary } from '@/types/api';

export const getQuranPage = async (pageNumber: number): Promise<QuranPageSummary> => {
  const data = await api.get<QuranPageSummary>(`/quran/pages/${pageNumber}`);
  return {
    ...data,
    imageUrl: normalizeUrl(data.imageUrl),
    width: data.width ?? null,
    height: data.height ?? null,
  };
};

export interface PageWord {
  id: number;
  verseKey: string;
  position: number;       // position within verse
  lineNumber: number;
  positionInLine: number; // 1 = rightmost on line (Arabic RTL)
  text: string;
  code: string;           // QCF V2 glyph code
  // Normalised 0–1 bounding box from glyph-bounds atlas (present on all pages)
  bounds?: { x0: number; y0: number; x1: number; y1: number };
}

export interface PageWordBounds {
  page: number;
  wordCount: number;
  words: PageWord[];
}

export const getPageWordBounds = async (pageNumber: number): Promise<PageWordBounds> => {
  return api.get<PageWordBounds>(`/quran/pages/${pageNumber}/word-bounds`);
};
