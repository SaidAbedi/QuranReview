import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getStudentAssignment } from '@/api/assignments';
import { getQuranPage } from '@/api/quran';
import { getStudentSubmissions, getSubmissionAttempts } from '@/api/submissions';
import type { AssignmentSummary, AttemptRow, SubmissionRow } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useTheme } from '@/hooks/useTheme';

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Teacher Reviewing',
  in_review: 'Teacher Reviewing',
  reviewed: 'Feedback Available',
  needs_resubmission: 'Needs Practice',
  completed: 'Completed',
  archived: 'Archived',
};

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Teacher Reviewing',
  in_review: 'Teacher Reviewing',
  reviewed: 'Feedback Available',
  needs_resubmission: 'Needs Practice',
  completed: 'Completed',
};

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const T = theme.colors;

  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptsOpen, setAttemptsOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [asgn, allSubmissions] = await Promise.all([
        getStudentAssignment(id),
        getStudentSubmissions(),
      ]);
      setAssignment(asgn);

      const existing = allSubmissions.find((s) => s.assignmentId === asgn.id) ?? null;
      setSubmission(existing);

      if (existing) {
        try {
          const atts = await getSubmissionAttempts(existing.id);
          setAttempts(atts);
        } catch { /* non-fatal */ }
      } else {
        setAttempts([]);
      }

      if (asgn.pageNumber != null) {
        try {
          const page = await getQuranPage(asgn.pageNumber);
          setPageImageUrl(page.imageUrl);
        } catch {
          setPageImageUrl(null);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Reload silently on focus so status updates after recording or viewing feedback
  useFocusEffect(
    useCallback(() => { load(true); }, [load]),
  );

  const canRecord =
    !submission ||
    submission.status === 'needs_resubmission' ||
    submission.status === 'draft';

  const canViewFeedback =
    submission !== null &&
    submission.currentAttemptId !== null &&
    (submission.status === 'reviewed' ||
      submission.status === 'completed' ||
      submission.status === 'needs_resubmission');

  const handleRecord = () => {
    router.push({
      pathname: '/assignments/[id]/record',
      params: submission ? { id, submissionId: submission.id } : { id },
    });
  };

  const handleViewFeedback = () => {
    if (!submission?.currentAttemptId) return;
    const currentAttempt = attempts.find((a) => a.id === submission.currentAttemptId);
    router.push({
      pathname: '/assignments/[id]/feedback/[attemptId]',
      params: {
        id,
        attemptId: submission.currentAttemptId,
        submissionId: submission.id,
        pageNumber: assignment?.pageNumber?.toString() ?? '',
        attemptNumber: currentAttempt?.attemptNumber?.toString() ?? '',
      },
    });
  };

  const handleViewAttemptFeedback = (attempt: AttemptRow) => {
    if (!submission) return;
    setAttemptsOpen(false);
    router.push({
      pathname: '/assignments/[id]/feedback/[attemptId]',
      params: {
        id,
        attemptId: attempt.id,
        submissionId: submission.id,
        pageNumber: assignment?.pageNumber?.toString() ?? '',
        attemptNumber: attempt.attemptNumber.toString(),
      },
    });
  };

  if (loading) return <LoadingScreen message="Loading assignment…" />;
  if (error || !assignment)
    return <ErrorScreen message={error ?? 'Assignment not found'} onRetry={() => load()} />;

  const title =
    assignment.title && assignment.title !== `Page ${assignment.pageNumber}`
      ? assignment.title
      : assignment.surahNameEnglish && assignment.pageNumber != null
        ? `${assignment.surahNameEnglish} — Page ${assignment.pageNumber}`
        : assignment.pageNumber != null
          ? `Page ${assignment.pageNumber}`
          : 'Assignment';
  const statusLabel = submission
    ? (SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status)
    : null;
  const statusChip = submission
    ? (theme.chips[submission.status as keyof typeof theme.chips] ?? null)
    : null;
  const hasAttempts = attempts.length > 0;

  // Bottom bar layout logic:
  // canRecord + canViewFeedback (needs_resubmission) → [📋] [🎙 Record flex:1] [Feedback]
  // canRecord only (no sub / draft)                  → [🎙 Start/Record flex:1]
  // canViewFeedback only (reviewed/completed)        → [📋] [View Feedback flex:1]
  // neither (submitted/in_review)                   → [📋?] [status indicator flex:1]

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: T.surface }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()}>
          <Text style={[styles.topBarBack, { color: T.brandPrimary }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={[styles.topBarTitle, { color: T.textPrimary }]} numberOfLines={1}>{title}</Text>
          {assignment.surahNameEnglish != null && (
            <Text style={[styles.topBarSub, { color: T.textMuted }]}>{assignment.surahNameEnglish}</Text>
          )}
        </View>
        {statusLabel && statusChip && (
          <View style={[styles.statusPill, { backgroundColor: statusChip.bg }]}>
            <Text style={[styles.statusPillText, { color: statusChip.text }]} numberOfLines={1}>{statusLabel}</Text>
          </View>
        )}
      </View>

      {/* ── Full-screen page image ── */}
      <View style={[styles.canvasArea, { backgroundColor: T.backgroundAlt }]}>
        {pageImageUrl ? (
          <Image
            source={{ uri: pageImageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.pagePlaceholder}>
            <Text style={[styles.pagePlaceholderText, { color: T.textMuted }]}>
              {assignment.pageNumber ? `Page ${assignment.pageNumber}` : 'Page unavailable'}
            </Text>
          </View>
        )}

        {assignment.instructions && (
          <View style={styles.instructionsOverlay}>
            <Text style={styles.instructionsText} numberOfLines={3}>
              📝 {assignment.instructions}
            </Text>
          </View>
        )}
      </View>

      {/* ── Bottom bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8, backgroundColor: T.surface, borderTopColor: T.border }]}>

        {hasAttempts && (
          <TouchableOpacity style={[styles.attemptsBtn, { backgroundColor: T.backgroundAlt }]} onPress={() => setAttemptsOpen(true)}>
            <Text style={styles.attemptsBtnIcon}>📋</Text>
            {attempts.length > 1 && (
              <View style={[styles.attemptsBadge, { backgroundColor: T.brandPrimary }]}>
                <Text style={[styles.attemptsBadgeText, { color: T.brandOnPrimary }]}>{attempts.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {canRecord && canViewFeedback ? (
          // needs_resubmission: record is primary, feedback secondary
          <>
            <TouchableOpacity style={[styles.recordBtn, { backgroundColor: T.brandPrimary }]} onPress={handleRecord}>
              <Text style={[styles.recordBtnText, { color: T.brandOnPrimary }]}>🎙  Record New Attempt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.feedbackBtnSecondary, { borderColor: T.info }]} onPress={handleViewFeedback}>
              <Text style={[styles.feedbackBtnSecondaryText, { color: T.info }]}>Feedback</Text>
            </TouchableOpacity>
          </>
        ) : canRecord ? (
          // no submission or draft: full-width record button
          <TouchableOpacity style={[styles.recordBtn, { backgroundColor: T.brandPrimary }]} onPress={handleRecord}>
            <Text style={[styles.recordBtnText, { color: T.brandOnPrimary }]}>
              {submission ? '🎙  Record New Attempt' : '🎙  Start Recording'}
            </Text>
          </TouchableOpacity>
        ) : canViewFeedback ? (
          // reviewed or completed: feedback is the only action
          <TouchableOpacity style={[styles.feedbackBtnPrimary, { backgroundColor: T.info }]} onPress={handleViewFeedback}>
            <Text style={[styles.feedbackBtnPrimaryText, { color: T.textInverse }]}>View Teacher Feedback</Text>
          </TouchableOpacity>
        ) : (
          // submitted / in_review: waiting state
          <View style={styles.statusIndicator}>
            {submission?.status === 'in_review' && (
              <ActivityIndicator
                size="small"
                color={T.warning}
                style={styles.statusSpinner}
              />
            )}
            <Text style={[styles.statusIndicatorText, { color: T.textMuted }]}>{statusLabel}</Text>
          </View>
        )}
      </View>

      {/* ── Attempt history sheet ── */}
      <Modal
        visible={attemptsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAttemptsOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setAttemptsOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { paddingBottom: insets.bottom + 12, backgroundColor: T.surface }]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: T.border }]} />
            <Text style={[styles.sheetTitle, { color: T.textPrimary }]}>Your Attempts</Text>

            {(assignment.dueAt || assignment.instructions) && (
              <View style={styles.sheetMeta}>
                {assignment.dueAt && (
                  <Text style={[styles.sheetMetaText, { color: T.textMuted }]}>
                    Due {new Date(assignment.dueAt).toLocaleDateString()}
                  </Text>
                )}
                {assignment.instructions && (
                  <Text style={[styles.sheetInstructions, { color: T.textSecondary }]}>{assignment.instructions}</Text>
                )}
              </View>
            )}

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
            >
              {attempts.length === 0 ? (
                <Text style={[styles.sheetEmpty, { color: T.textMuted }]}>No attempts yet.</Text>
              ) : (
                [...attempts].reverse().map((a) => {
                  const hasFeedback =
                    a.status === 'reviewed' ||
                    a.status === 'completed' ||
                    a.status === 'needs_resubmission';
                  const isCurrent = a.id === submission?.currentAttemptId;
                  const aChip = theme.chips[a.status as keyof typeof theme.chips];
                  const aChipBg = aChip?.bg ?? T.backgroundAlt;
                  const aChipText = aChip?.text ?? T.textMuted;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[
                        styles.attemptRow,
                        { borderTopColor: T.backgroundAlt },
                        isCurrent && { backgroundColor: T.brandPrimarySoft, marginHorizontal: -20, paddingHorizontal: 20 },
                      ]}
                      onPress={() => hasFeedback && handleViewAttemptFeedback(a)}
                      disabled={!hasFeedback}
                      activeOpacity={hasFeedback ? 0.6 : 1}
                    >
                      <View style={styles.attemptRowInfo}>
                        <Text style={[
                          styles.attemptNum,
                          { color: T.textSecondary },
                          isCurrent && { color: T.brandPrimary, fontWeight: '700' },
                        ]}>
                          Attempt {a.attemptNumber}
                          {isCurrent ? ' · current' : ''}
                        </Text>
                        <Text style={[styles.attemptDate, { color: T.textMuted }]}>{relativeDate(a.submittedAt)}</Text>
                      </View>
                      <View style={[styles.attemptStatusBadge, { backgroundColor: aChipBg }]}>
                        <Text style={[styles.attemptStatusText, { color: aChipText }]}>
                          {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                        </Text>
                      </View>
                      {hasFeedback && <Text style={[styles.attemptChevron, { color: T.textMuted }]}>›</Text>}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarBack: { fontSize: 28, lineHeight: 32 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 15, fontWeight: '700' },
  topBarSub: { fontSize: 12, marginTop: 1 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    maxWidth: 120,
  },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  // Canvas / page
  canvasArea: {
    flex: 1,
    overflow: 'hidden',
  },
  pagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagePlaceholderText: { fontSize: 13 },
  instructionsOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  instructionsText: { fontSize: 13, color: '#fff', lineHeight: 18 },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attemptsBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  attemptsBtnIcon: { fontSize: 20 },
  attemptsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 6,
    minWidth: 14,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  attemptsBadgeText: { fontSize: 9, fontWeight: '800' },

  recordBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  recordBtnText: { fontSize: 14, fontWeight: '700' },

  feedbackBtnPrimary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  feedbackBtnPrimaryText: { fontSize: 14, fontWeight: '700' },

  feedbackBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  feedbackBtnSecondaryText: { fontSize: 13, fontWeight: '700' },

  statusIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  statusSpinner: { marginRight: 8 },
  statusIndicatorText: { fontSize: 14, fontWeight: '500' },

  // Attempt history sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 8 },
  sheetMeta: { paddingHorizontal: 20, marginBottom: 12, gap: 4 },
  sheetMetaText: { fontSize: 12 },
  sheetInstructions: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  sheetScroll: { paddingHorizontal: 20 },
  sheetEmpty: { fontSize: 14, paddingVertical: 20, textAlign: 'center' },

  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  attemptRowInfo: { flex: 1 },
  attemptNum: { fontSize: 14, fontWeight: '600' },
  attemptDate: { fontSize: 12, marginTop: 2 },
  attemptStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  attemptStatusText: { fontSize: 11, fontWeight: '700' },
  attemptChevron: { fontSize: 20 },
});
