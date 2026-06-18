import type { StudentProgressSummary } from '@/types/api';

export type CurrentFocus =
  | { type: 'juz';  juzNumber: number;   pagesCompleted: number; pagesAssigned: number }
  | { type: 'surah'; surahNumber: number; pagesCompleted: number; pagesAssigned: number }
  | { type: 'pages'; pagesCompleted: number; pagesAssigned: number }
  | { type: 'all_done' }
  | { type: 'no_assignments' };

export function deriveCurrentFocus(
  progress: StudentProgressSummary,
  onboardingStatus?: string,
): CurrentFocus {
  if (onboardingStatus === 'pending_assignment' || progress.pagesAssigned === 0) {
    return { type: 'no_assignments' };
  }

  const incompleteJuz = progress.juzBreakdown.filter(
    (j) => j.pagesCompleted < j.pagesAssigned,
  );
  const incompleteSurahs = progress.surahBreakdown.filter(
    (s) => s.pagesCompleted < s.pagesAssigned,
  );

  if (incompleteJuz.length === 0) {
    return { type: 'all_done' };
  }

  if (incompleteJuz.length === 1) {
    const j = incompleteJuz[0];
    return { type: 'juz', juzNumber: j.juzNumber, pagesCompleted: j.pagesCompleted, pagesAssigned: j.pagesAssigned };
  }

  if (incompleteSurahs.length === 1) {
    const s = incompleteSurahs[0];
    return { type: 'surah', surahNumber: s.surahNumber, pagesCompleted: s.pagesCompleted, pagesAssigned: s.pagesAssigned };
  }

  const totalAssigned  = incompleteJuz.reduce((sum, j) => sum + j.pagesAssigned, 0);
  const totalCompleted = incompleteJuz.reduce((sum, j) => sum + j.pagesCompleted, 0);
  return { type: 'pages', pagesCompleted: totalCompleted, pagesAssigned: totalAssigned };
}

export function focusPercent(pagesCompleted: number, pagesAssigned: number): number {
  if (pagesAssigned === 0) return 0;
  return Math.round((pagesCompleted / pagesAssigned) * 100);
}

export function encouragingMessage(pagesCompleted: number, pagesAssigned: number): string {
  if (pagesAssigned === 0) return '';
  const ratio = pagesCompleted / pagesAssigned;
  if (ratio === 0)   return 'Every journey begins with a single page.';
  if (ratio < 0.25)  return 'Great start — keep going!';
  if (ratio < 0.5)   return 'Making steady progress!';
  if (ratio < 0.75)  return "You're over halfway there!";
  if (ratio < 1)     return 'Almost done — keep it up!';
  return 'Excellent — all pages complete!';
}

// Student-friendly status labels
export const STATUS_LABELS: Record<string, string> = {
  not_started:       'Not Started',
  draft:             'Draft',
  submitted:         'Teacher Reviewing',
  in_review:         'Teacher Reviewing',
  reviewed:          'Feedback Available',
  needs_resubmission:'Needs Practice',
  completed:         'Completed',
  archived:          'Archived',
};

