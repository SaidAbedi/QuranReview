import { AppError } from '../types';

export interface StudentProgressSummary {
  totalPagesCompleted: number;
  quranProgressPercent: number;
  surahProgress: Record<string, unknown>;
  juzProgress: Record<string, unknown>;
  calculatedAt: string;
}

export interface SurahProgressDetail {
  surahNumber: number;
  totalPages: number;
  completedPages: number;
  progressPercent: number;
  pages: PageProgressItem[];
}

export interface JuzProgressDetail {
  juzNumber: number;
  totalPages: number;
  completedPages: number;
  progressPercent: number;
  pages: PageProgressItem[];
}

export interface PageProgressItem {
  pageNumber: number;
  status: string;
  completedAt: string | null;
  attemptCount: number;
}

export class ProgressService {
  async getStudentProgress(studentId: string): Promise<StudentProgressSummary> {
    throw new AppError(501, 'Not implemented');
  }

  async getSurahProgress(
    studentId: string,
    surahNumber: number,
  ): Promise<SurahProgressDetail> {
    throw new AppError(501, 'Not implemented');
  }

  async getJuzProgress(
    studentId: string,
    juzNumber: number,
  ): Promise<JuzProgressDetail> {
    throw new AppError(501, 'Not implemented');
  }

  // Called internally by AttemptService.completeReview — not exposed as an API endpoint.
  // Upserts student_page_progress and recalculates student_progress_snapshots.
  async recalculateSnapshot(studentId: string): Promise<void> {
    throw new AppError(501, 'Not implemented');
  }
}

export const progressService = new ProgressService();
