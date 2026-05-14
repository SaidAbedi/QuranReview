import { AppError } from '../types';

export interface QuranPageSummary {
  id: string;
  pageNumber: number;
  mushaId: string;
  imageUrl: string | null;
}

export interface QuranPageContent extends QuranPageSummary {
  surahNumber: number;
  juzNumber: number;
  firstVerseKey: string;
  lastVerseKey: string;
  versesCount: number;
  words?: unknown[];
}

export interface PageLookupResult {
  pageNumber: number;
  surahNumber?: number;
  juzNumber?: number;
}

// Proxies Quran.Foundation API through the backend.
// Caches stable metadata in Supabase Postgres.
// Mobile app must never call Quran.Foundation directly.
export class QuranContentService {
  async getPage(pageNumber: number): Promise<QuranPageSummary> {
    throw new AppError(501, 'Not implemented');
  }

  async getPageContent(
    pageNumber: number,
    includeWords: boolean,
  ): Promise<QuranPageContent> {
    throw new AppError(501, 'Not implemented');
  }

  async lookupBySurahNumber(surahNumber: number): Promise<PageLookupResult[]> {
    throw new AppError(501, 'Not implemented');
  }

  async lookupByJuzNumber(juzNumber: number): Promise<PageLookupResult[]> {
    throw new AppError(501, 'Not implemented');
  }
}

export const quranContentService = new QuranContentService();
