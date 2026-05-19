import { supabaseAdmin, requirePgPool } from '../db/client';
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
}

export interface JuzSnapshotEntry {
  juzNumber: number;
  pagesCompleted: number;
  pagesAssigned: number;
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

    if (snap) {
      const s = snap as Record<string, unknown>;
      const surahSnap = (s.surah_progress as Record<string, Record<string, unknown>>) ?? {};
      const juzSnap = (s.juz_progress as Record<string, Record<string, unknown>>) ?? {};

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
        })).sort((a, b) => a.surahNumber - b.surahNumber),
        juzBreakdown: Object.entries(juzSnap).map(([k, v]) => ({
          juzNumber: parseInt(k, 10),
          pagesCompleted: (v.pages_completed as number) ?? 0,
          pagesAssigned: (v.pages_assigned as number) ?? 0,
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

    const pool = requirePgPool();

    const [pagesResult, totalResult, surahResult] = await Promise.all([
      // Page-level detail: LEFT JOIN so pages with no progress show as not_started
      pool.query<{
        page_number: number;
        quran_page_id: string;
        status: string;
        attempt_count: number;
        completed_at: string | null;
      }>(`
        SELECT
          qpm.page_number,
          qpm.quran_page_id::text,
          COALESCE(spp.status, 'not_started') AS status,
          COALESCE(spp.attempt_count, 0)      AS attempt_count,
          spp.completed_at
        FROM quran_page_mappings qpm
        LEFT JOIN student_page_progress spp
          ON spp.quran_page_id = qpm.quran_page_id
         AND spp.student_id = $1
        WHERE qpm.surah_number = $2
          AND qpm.provider_mushaf_id = 1
        ORDER BY qpm.page_number
      `, [studentId, surahNumber]),

      // Total distinct pages in this surah across all mapped pages
      pool.query<{ total: string }>(`
        SELECT COUNT(DISTINCT quran_page_id) AS total
        FROM quran_page_mappings
        WHERE surah_number = $1 AND provider_mushaf_id = 1
      `, [surahNumber]),

      // Surah name
      pool.query<{ name_english: string | null; name_arabic: string | null }>(`
        SELECT name_english, name_arabic
        FROM surahs
        WHERE surah_number = $1
        LIMIT 1
      `, [surahNumber]),
    ]);

    const pages = pagesResult.rows;
    const totalPages = parseInt(totalResult.rows[0]?.total ?? '0', 10);
    const surahName = surahResult.rows[0]?.name_english ?? null;

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
      pages: pages.map((p) => ({
        pageNumber: p.page_number,
        quranPageId: p.quran_page_id,
        status: p.status,
        attemptCount: Number(p.attempt_count),
        completedAt: p.completed_at ?? null,
      })),
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

    const pool = requirePgPool();

    const [pagesResult, totalResult] = await Promise.all([
      pool.query<{
        page_number: number;
        quran_page_id: string;
        status: string;
        attempt_count: number;
        completed_at: string | null;
      }>(`
        SELECT
          qpm.page_number,
          qpm.quran_page_id::text,
          COALESCE(spp.status, 'not_started') AS status,
          COALESCE(spp.attempt_count, 0)      AS attempt_count,
          spp.completed_at
        FROM quran_page_mappings qpm
        LEFT JOIN student_page_progress spp
          ON spp.quran_page_id = qpm.quran_page_id
         AND spp.student_id = $1
        WHERE qpm.juz_number = $2
          AND qpm.provider_mushaf_id = 1
        ORDER BY qpm.page_number
      `, [studentId, juzNumber]),

      pool.query<{ total: string }>(`
        SELECT COUNT(DISTINCT quran_page_id) AS total
        FROM quran_page_mappings
        WHERE juz_number = $1 AND provider_mushaf_id = 1
      `, [juzNumber]),
    ]);

    const pages = pagesResult.rows;
    const totalPages = parseInt(totalResult.rows[0]?.total ?? '0', 10);

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
      pages: pages.map((p) => ({
        pageNumber: p.page_number,
        quranPageId: p.quran_page_id,
        status: p.status,
        attemptCount: Number(p.attempt_count),
        completedAt: p.completed_at ?? null,
      })),
    };
  }

  // Called by AttemptService.completeReview after the pg COMMIT.
  // Recalculates the snapshot from student_page_progress + quran_page_mappings.
  // Failures are non-critical: snapshot is a read model — it will be corrected on the next review.
  async recalculateSnapshot(studentId: string): Promise<void> {
    const pool = requirePgPool();

    // Single query: join progress with mappings, aggregate per surah and juz
    const { rows } = await pool.query<{
      surah_number: number | null;
      juz_number: number | null;
      pages_completed: string;
      pages_assigned: string;
    }>(`
      SELECT
        qpm.surah_number,
        qpm.juz_number,
        COUNT(*) FILTER (WHERE spp.status = 'completed') AS pages_completed,
        COUNT(*)                                          AS pages_assigned
      FROM student_page_progress spp
      LEFT JOIN quran_page_mappings qpm
        ON qpm.quran_page_id = spp.quran_page_id
       AND qpm.provider_mushaf_id = 1
      WHERE spp.student_id = $1
      GROUP BY qpm.surah_number, qpm.juz_number
    `, [studentId]);

    const surahProgress: Record<string, Record<string, number>> = {};
    const juzProgress: Record<string, Record<string, number>> = {};
    let totalCompleted = 0;

    for (const r of rows) {
      const completed = parseInt(r.pages_completed, 10);
      const assigned = parseInt(r.pages_assigned, 10);
      totalCompleted += completed;

      if (r.surah_number !== null) {
        const key = String(r.surah_number);
        surahProgress[key] = {
          pages_completed: (surahProgress[key]?.pages_completed ?? 0) + completed,
          pages_assigned: (surahProgress[key]?.pages_assigned ?? 0) + assigned,
        };
      }
      if (r.juz_number !== null) {
        const key = String(r.juz_number);
        juzProgress[key] = {
          pages_completed: (juzProgress[key]?.pages_completed ?? 0) + completed,
          pages_assigned: (juzProgress[key]?.pages_assigned ?? 0) + assigned,
        };
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
