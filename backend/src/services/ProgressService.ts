import { supabaseAdmin } from '../db/client';
import { AppError, UserRole } from '../types';

const TOTAL_QURAN_PAGES = 604;

// ── Response shapes ───────────────────────────────────────────────────────────

export interface StudentProgressSummary {
  studentId: string;
  totalPagesInQuran: number;
  pagesAssigned: number;
  pagesCompleted: number;
  pagesNeedsResubmission: number;
  overallCompletionPercent: number;
  surahBreakdown: SurahSnapshotEntry[];
  juzBreakdown: JuzSnapshotEntry[];
  snapshotFresh: boolean;
  calculatedAt: string;
}

export interface SurahSnapshotEntry {
  surahNumber: number;
  pagesCompleted: number;
  pagesAssigned: number;
  totalPagesInSurah: number;
}

export interface JuzSnapshotEntry {
  juzNumber: number;
  pagesCompleted: number;
  pagesAssigned: number;
  totalPagesInJuz: number;
}

export interface SurahProgressDetail {
  surahNumber: number;
  surahName: string | null;
  totalPagesInSurah: number;
  pagesAssigned: number;
  pagesCompleted: number;
  completionPercent: number;
  pages: PageProgressItem[];
}

export interface JuzProgressDetail {
  juzNumber: number;
  totalPagesInJuz: number;
  pagesAssigned: number;
  pagesCompleted: number;
  completionPercent: number;
  pages: PageProgressItem[];
}

export interface PageProgressItem {
  pageNumber: number;
  quranPageId: string;
  status: string;
  attemptCount: number;
  completedAt: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ProgressService {
  // Caller must pass their own id and role; students see only themselves,
  // teachers see only their assigned students, admins/super_admins see all.
  private async assertAccess(
    studentId: string,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<void> {
    if (requesterRole === 'student') {
      if (studentId !== requesterId) throw new AppError(403, 'Access denied');
      return;
    }
    if (requesterRole === 'teacher') {
      const { data: rel } = await supabaseAdmin
        .from('teacher_student_relationships')
        .select('id')
        .eq('teacher_id', requesterId)
        .eq('student_id', studentId)
        .eq('status', 'active')
        .maybeSingle();
      if (!rel) throw new AppError(403, 'Access denied: no active relationship with this student');
      return;
    }
    // admin / super_admin: no check
  }

  // Overall progress summary. Reads from snapshot if fresh; falls back to live count.
  async getStudentProgress(
    studentId: string,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<StudentProgressSummary> {
    await this.assertAccess(studentId, requesterId, requesterRole);

    // Try snapshot first (written by recalculateSnapshot after each review)
    const { data: snap } = await supabaseAdmin
      .from('student_progress_snapshots')
      .select('total_pages_completed, quran_progress_percent, surah_progress, juz_progress, calculated_at')
      .eq('student_id', studentId)
      .maybeSingle();

    // Always get the live assignment count (cheap)
    const { data: progressRows } = await supabaseAdmin
      .from('student_page_progress')
      .select('status')
      .eq('student_id', studentId);

    const rows = (progressRows ?? []) as Record<string, unknown>[];
    const pagesAssigned = rows.length;
    const pagesCompleted = rows.filter((r) => r.status === 'completed').length;
    const pagesNeedsResubmission = rows.filter((r) => r.status === 'needs_resubmission').length;

    // Fetch total pages per surah and juz (for all surahs/juz with progress)
    let surahTotalPages: Record<string, number> = {};
    let juzTotalPages: Record<string, number> = {};

    if (snap) {
      const s = snap as Record<string, unknown>;
      const surahSnap = (s.surah_progress as Record<string, Record<string, unknown>>) ?? {};
      const juzSnap = (s.juz_progress as Record<string, Record<string, unknown>>) ?? {};

      // Get list of surahs/juzs with progress
      const surahNumbers = Object.keys(surahSnap).map((k) => parseInt(k, 10));
      const juzNumbers = Object.keys(juzSnap).map((k) => parseInt(k, 10));

      // Fetch total pages per surah
      if (surahNumbers.length > 0) {
        const { data: surahMappings } = await supabaseAdmin
          .from('quran_page_mappings')
          .select('surah_number, quran_page_id')
          .eq('provider_mushaf_id', 1)
          .in('surah_number', surahNumbers);

        const seenPages = new Set<string>();
        for (const m of (surahMappings ?? [])) {
          const row = m as Record<string, unknown>;
          const surah = String(row.surah_number);
          const pid = row.quran_page_id as string;
          if (!seenPages.has(pid)) {
            if (!surahTotalPages[surah]) surahTotalPages[surah] = 0;
            surahTotalPages[surah]++;
            seenPages.add(pid);
          }
        }
      }

      // Fetch total pages per juz
      if (juzNumbers.length > 0) {
        const { data: juzMappings } = await supabaseAdmin
          .from('quran_page_mappings')
          .select('juz_number, quran_page_id')
          .eq('provider_mushaf_id', 1)
          .in('juz_number', juzNumbers);

        const seenPages = new Set<string>();
        for (const m of (juzMappings ?? [])) {
          const row = m as Record<string, unknown>;
          const juz = String(row.juz_number);
          const pid = row.quran_page_id as string;
          if (!seenPages.has(pid)) {
            if (!juzTotalPages[juz]) juzTotalPages[juz] = 0;
            juzTotalPages[juz]++;
            seenPages.add(pid);
          }
        }
      }

      return {
        studentId,
        totalPagesInQuran: TOTAL_QURAN_PAGES,
        pagesAssigned,
        pagesCompleted,
        pagesNeedsResubmission,
        overallCompletionPercent: parseFloat(
          (pagesCompleted / TOTAL_QURAN_PAGES * 100).toFixed(2),
        ),
        surahBreakdown: Object.entries(surahSnap).map(([k, v]) => ({
          surahNumber: parseInt(k, 10),
          pagesCompleted: (v.pages_completed as number) ?? 0,
          pagesAssigned: (v.pages_assigned as number) ?? 0,
          totalPagesInSurah: surahTotalPages[k] ?? 0,
        })).sort((a, b) => a.surahNumber - b.surahNumber),
        juzBreakdown: Object.entries(juzSnap).map(([k, v]) => ({
          juzNumber: parseInt(k, 10),
          pagesCompleted: (v.pages_completed as number) ?? 0,
          pagesAssigned: (v.pages_assigned as number) ?? 0,
          totalPagesInJuz: juzTotalPages[k] ?? 0,
        })).sort((a, b) => a.juzNumber - b.juzNumber),
        snapshotFresh: true,
        calculatedAt: s.calculated_at as string,
      };
    }

    // No snapshot yet (student has no completed pages)
    return {
      studentId,
      totalPagesInQuran: TOTAL_QURAN_PAGES,
      pagesAssigned,
      pagesCompleted,
      pagesNeedsResubmission,
      overallCompletionPercent: parseFloat(
        (pagesCompleted / TOTAL_QURAN_PAGES * 100).toFixed(2),
      ),
      surahBreakdown: [],
      juzBreakdown: [],
      snapshotFresh: false,
      calculatedAt: new Date().toISOString(),
    };
  }

  // Page-level detail for a surah. Live query — joins student_page_progress + quran_page_mappings.
  // Pages with no progress row are shown as status='not_started'.
  async getSurahProgress(
    studentId: string,
    surahNumber: number,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<SurahProgressDetail> {
    await this.assertAccess(studentId, requesterId, requesterRole);

    // Fetch all mapping rows for this surah, then deduplicate by quran_page_id
    const { data: mappingRows } = await supabaseAdmin
      .from('quran_page_mappings')
      .select('page_number, quran_page_id')
      .eq('surah_number', surahNumber)
      .eq('provider_mushaf_id', 1)
      .order('page_number', { ascending: true });

    const seenPages = new Set<string>();
    const uniquePages = (mappingRows ?? []).filter((m) => {
      const row = m as Record<string, unknown>;
      const pid = row.quran_page_id as string;
      if (seenPages.has(pid)) return false;
      seenPages.add(pid);
      return true;
    });
    const quranPageIds = uniquePages.map((m) => (m as Record<string, unknown>).quran_page_id as string);

    const [progressResult, surahResult] = await Promise.all([
      quranPageIds.length > 0
        ? supabaseAdmin
            .from('student_page_progress')
            .select('quran_page_id, status, attempt_count, completed_at')
            .eq('student_id', studentId)
            .in('quran_page_id', quranPageIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      supabaseAdmin
        .from('surahs')
        .select('name_english')
        .eq('surah_number', surahNumber)
        .limit(1)
        .maybeSingle(),
    ]);

    const progressMap = new Map(
      ((progressResult.data ?? []) as Record<string, unknown>[]).map((p) => [
        p.quran_page_id as string, p,
      ]),
    );
    const surahName = surahResult.data
      ? ((surahResult.data as Record<string, unknown>).name_english as string | null)
      : null;

    const pages = uniquePages.map((m) => {
      const row = m as Record<string, unknown>;
      const progress = progressMap.get(row.quran_page_id as string);
      return {
        pageNumber: row.page_number as number,
        quranPageId: row.quran_page_id as string,
        status: progress ? (progress.status as string) : 'not_started',
        attemptCount: progress ? Number(progress.attempt_count) : 0,
        completedAt: progress ? ((progress.completed_at as string | null) ?? null) : null,
      };
    });

    const totalPages = uniquePages.length;
    const pagesCompleted = pages.filter((p) => p.status === 'completed').length;
    const pagesAssigned = pages.filter((p) => p.status !== 'not_started').length;

    return {
      surahNumber,
      surahName,
      totalPagesInSurah: totalPages,
      pagesAssigned,
      pagesCompleted,
      completionPercent: totalPages > 0
        ? parseFloat((pagesCompleted / totalPages * 100).toFixed(2))
        : 0,
      pages,
    };
  }

  // Page-level detail for a juz. Live query — mirrors getSurahProgress.
  async getJuzProgress(
    studentId: string,
    juzNumber: number,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<JuzProgressDetail> {
    await this.assertAccess(studentId, requesterId, requesterRole);

    const { data: mappingRows } = await supabaseAdmin
      .from('quran_page_mappings')
      .select('page_number, quran_page_id')
      .eq('juz_number', juzNumber)
      .eq('provider_mushaf_id', 1)
      .order('page_number', { ascending: true });

    const seenPages = new Set<string>();
    const uniquePages = (mappingRows ?? []).filter((m) => {
      const row = m as Record<string, unknown>;
      const pid = row.quran_page_id as string;
      if (seenPages.has(pid)) return false;
      seenPages.add(pid);
      return true;
    });
    const quranPageIds = uniquePages.map((m) => (m as Record<string, unknown>).quran_page_id as string);

    const { data: progressData } = quranPageIds.length > 0
      ? await supabaseAdmin
          .from('student_page_progress')
          .select('quran_page_id, status, attempt_count, completed_at')
          .eq('student_id', studentId)
          .in('quran_page_id', quranPageIds)
      : { data: [] as Record<string, unknown>[] };

    const progressMap = new Map(
      ((progressData ?? []) as Record<string, unknown>[]).map((p) => [
        p.quran_page_id as string, p,
      ]),
    );

    const pages = uniquePages.map((m) => {
      const row = m as Record<string, unknown>;
      const progress = progressMap.get(row.quran_page_id as string);
      return {
        pageNumber: row.page_number as number,
        quranPageId: row.quran_page_id as string,
        status: progress ? (progress.status as string) : 'not_started',
        attemptCount: progress ? Number(progress.attempt_count) : 0,
        completedAt: progress ? ((progress.completed_at as string | null) ?? null) : null,
      };
    });

    const totalPages = uniquePages.length;
    const pagesCompleted = pages.filter((p) => p.status === 'completed').length;
    const pagesAssigned = pages.filter((p) => p.status !== 'not_started').length;

    return {
      juzNumber,
      totalPagesInJuz: totalPages,
      pagesAssigned,
      pagesCompleted,
      completionPercent: totalPages > 0
        ? parseFloat((pagesCompleted / totalPages * 100).toFixed(2))
        : 0,
      pages,
    };
  }

  // Called by AttemptService.completeReview after the pg COMMIT.
  // Recalculates the snapshot from student_page_progress + quran_page_mappings.
  // Failures are non-critical: snapshot is a read model — it will be corrected on the next review.
  async recalculateSnapshot(studentId: string): Promise<void> {
    const { data: progressRows } = await supabaseAdmin
      .from('student_page_progress')
      .select('quran_page_id, status')
      .eq('student_id', studentId);

    const progressList = (progressRows ?? []) as Record<string, unknown>[];

    const surahProgress: Record<string, Record<string, number>> = {};
    const juzProgress: Record<string, Record<string, number>> = {};
    let totalCompleted = 0;

    if (progressList.length > 0) {
      const quranPageIds = progressList.map((p) => p.quran_page_id as string);

      // Get mappings for all pages in progress
      const { data: mappingRows } = await supabaseAdmin
        .from('quran_page_mappings')
        .select('quran_page_id, surah_number, juz_number')
        .eq('provider_mushaf_id', 1)
        .in('quran_page_id', quranPageIds);

      // Also get total page counts per surah and juz for the entire Quran
      const { data: allSurahMappings } = await supabaseAdmin
        .from('quran_page_mappings')
        .select('surah_number, quran_page_id')
        .eq('provider_mushaf_id', 1);

      const { data: allJuzMappings } = await supabaseAdmin
        .from('quran_page_mappings')
        .select('juz_number, quran_page_id')
        .eq('provider_mushaf_id', 1);

      // Count total pages per surah/juz (dedup by quran_page_id)
      const surahTotalPages: Record<string, Set<string>> = {};
      const juzTotalPages: Record<string, Set<string>> = {};

      for (const m of (allSurahMappings ?? [])) {
        const row = m as Record<string, unknown>;
        const surah = String(row.surah_number);
        const pid = row.quran_page_id as string;
        if (!surahTotalPages[surah]) surahTotalPages[surah] = new Set();
        surahTotalPages[surah].add(pid);
      }

      for (const m of (allJuzMappings ?? [])) {
        const row = m as Record<string, unknown>;
        const juz = String(row.juz_number);
        const pid = row.quran_page_id as string;
        if (!juzTotalPages[juz]) juzTotalPages[juz] = new Set();
        juzTotalPages[juz].add(pid);
      }

      const pageToMapping = new Map<string, { surah_number: number | null; juz_number: number | null }>();
      for (const m of (mappingRows ?? [])) {
        const row = m as Record<string, unknown>;
        const pid = row.quran_page_id as string;
        if (!pageToMapping.has(pid)) {
          pageToMapping.set(pid, {
            surah_number: row.surah_number as number | null,
            juz_number: row.juz_number as number | null,
          });
        }
      }

      for (const p of progressList) {
        const pid = p.quran_page_id as string;
        const completed = (p.status as string) === 'completed' ? 1 : 0;
        totalCompleted += completed;

        const mapping = pageToMapping.get(pid);
        if (mapping?.surah_number != null) {
          const key = String(mapping.surah_number);
          surahProgress[key] = {
            pages_completed: (surahProgress[key]?.pages_completed ?? 0) + completed,
            pages_assigned: (surahProgress[key]?.pages_assigned ?? 0) + 1,
            total_pages_in_surah: surahTotalPages[key]?.size ?? 0,
          };
        }
        if (mapping?.juz_number != null) {
          const key = String(mapping.juz_number);
          juzProgress[key] = {
            pages_completed: (juzProgress[key]?.pages_completed ?? 0) + completed,
            pages_assigned: (juzProgress[key]?.pages_assigned ?? 0) + 1,
            total_pages_in_juz: juzTotalPages[key]?.size ?? 0,
          };
        }
      }
    }

    const { error } = await supabaseAdmin.from('student_progress_snapshots').upsert({
      student_id: studentId,
      total_pages_completed: totalCompleted,
      quran_progress_percent: parseFloat((totalCompleted / TOTAL_QURAN_PAGES * 100).toFixed(2)),
      surah_progress: surahProgress,
      juz_progress: juzProgress,
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'student_id' });

    if (error) {
      // Log but do not throw — snapshot failure must not block the review response
      console.error('[ProgressService] recalculateSnapshot failed:', error.message);
    }
  }
}

export const progressService = new ProgressService();
