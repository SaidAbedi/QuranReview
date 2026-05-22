// API response types mirroring backend service interfaces.
// Keep in sync with backend/src/services/*.ts and backend/src/types/index.ts.

export type UserRole = 'student' | 'teacher' | 'admin' | 'super_admin';
export type OnboardingStatus = 'new' | 'pending_assignment' | 'active' | 'inactive';

export interface UserProfile {
  preferredLanguage: string | null;
  timezone: string | null;
  studentAgeGroup: string | null;
  teacherCapacity: number | null;
  teacherCurrentLoad: number;
  onboardingStatus: OnboardingStatus;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  profile: UserProfile;
}

// ── Assignments ─────────────────────────────────────────────────────────────

export interface AssignmentSummary {
  id: string;
  teacherId: string;
  studentId: string;
  quranPageId: string;
  pageNumber: number | null;
  imageUrl?: string | null;
  title: string | null;
  instructions: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
}

// ── Submissions / Attempts ───────────────────────────────────────────────────

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'reviewed'
  | 'needs_resubmission'
  | 'completed';

export interface SubmissionRow {
  id: string;
  assignmentId: string;
  studentId: string;
  quranPageId: string;
  currentAttemptId: string | null;
  status: SubmissionStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttemptRow {
  id: string;
  submissionId: string;
  studentId: string;
  quranPageId: string;
  attemptNumber: number;
  recordingStorageKey: string;
  recordingDurationMs: number | null;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmissionResult {
  submission: SubmissionRow;
  attempt: AttemptRow;
  uploadUrl: string;
}

export interface CreateAttemptResult {
  attempt: AttemptRow;
  uploadUrl: string;
}

// ── Quran pages ──────────────────────────────────────────────────────────────

export interface QuranPageSummary {
  pageNumber: number;
  mushafId?: string;
  imageUrl: string | null;
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsListResult {
  items: NotificationRow[];
  unreadCount: number;
  nextCursor: string | null;
}

// ── Progress ─────────────────────────────────────────────────────────────────

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
  calculatedAt: string | null;
}
