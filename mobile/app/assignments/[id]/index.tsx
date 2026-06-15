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

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Teacher Reviewing',
  in_review: 'Teacher Reviewing',
  reviewed: 'Feedback Available',
  needs_resubmission: 'Needs Practice',
  completed: 'Completed',
  archived: 'Archived',
};

const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280',
  submitted: '#1B4F72',
  in_review: '#D97706',
  reviewed: '#7C3AED',
  needs_resubmission: '#DC2626',
  completed: '#059669',
  archived: '#9CA3AF',
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
    assignment.title ?? (assignment.pageNumber ? `Page ${assignment.pageNumber}` : 'Assignment');
  const statusLabel = submission
    ? (SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status)
    : null;
  const statusColor = submission
    ? (SUBMISSION_STATUS_COLORS[submission.status] ?? '#6B7280')
    : null;
  const hasAttempts = attempts.length > 0;

  // Bottom bar layout logic:
  // canRecord + canViewFeedback (needs_resubmission) → [📋] [🎙 Record flex:1] [Feedback]
  // canRecord only (no sub / draft)                  → [🎙 Start/Record flex:1]
  // canViewFeedback only (reviewed/completed)        → [📋] [View Feedback flex:1]
  // neither (submitted/in_review)                   → [📋?] [status indicator flex:1]

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()}>
          <Text style={styles.topBarBack}>‹</Text>
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
          {assignment.pageNumber != null && (
            <Text style={styles.topBarSub}>Quran Page {assignment.pageNumber}</Text>
          )}
        </View>
        {statusLabel && statusColor && (
          <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
            <Text style={styles.statusPillText} numberOfLines={1}>{statusLabel}</Text>
          </View>
        )}
      </View>

      {/* ── Full-screen page image ── */}
      <View style={styles.canvasArea}>
        {pageImageUrl ? (
          <Image
            source={{ uri: pageImageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.pagePlaceholder}>
            <Text style={styles.pagePlaceholderText}>
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
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>

        {hasAttempts && (
          <TouchableOpacity style={styles.attemptsBtn} onPress={() => setAttemptsOpen(true)}>
            <Text style={styles.attemptsBtnIcon}>📋</Text>
            {attempts.length > 1 && (
              <View style={styles.attemptsBadge}>
                <Text style={styles.attemptsBadgeText}>{attempts.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {canRecord && canViewFeedback ? (
          // needs_resubmission: record is primary, feedback secondary
          <>
            <TouchableOpacity style={styles.recordBtn} onPress={handleRecord}>
              <Text style={styles.recordBtnText}>🎙  Record New Attempt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.feedbackBtnSecondary} onPress={handleViewFeedback}>
              <Text style={styles.feedbackBtnSecondaryText}>Feedback</Text>
            </TouchableOpacity>
          </>
        ) : canRecord ? (
          // no submission or draft: full-width record button
          <TouchableOpacity style={styles.recordBtn} onPress={handleRecord}>
            <Text style={styles.recordBtnText}>
              {submission ? '🎙  Record New Attempt' : '🎙  Start Recording'}
            </Text>
          </TouchableOpacity>
        ) : canViewFeedback ? (
          // reviewed or completed: feedback is the only action
          <TouchableOpacity style={styles.feedbackBtnPrimary} onPress={handleViewFeedback}>
            <Text style={styles.feedbackBtnPrimaryText}>View Teacher Feedback</Text>
          </TouchableOpacity>
        ) : (
          // submitted / in_review: waiting state
          <View style={styles.statusIndicator}>
            {submission?.status === 'in_review' && (
              <ActivityIndicator
                size="small"
                color="#D97706"
                style={styles.statusSpinner}
              />
            )}
            <Text style={styles.statusIndicatorText}>{statusLabel}</Text>
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
            style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Your Attempts</Text>

            {(assignment.dueAt || assignment.instructions) && (
              <View style={styles.sheetMeta}>
                {assignment.dueAt && (
                  <Text style={styles.sheetMetaText}>
                    Due {new Date(assignment.dueAt).toLocaleDateString()}
                  </Text>
                )}
                {assignment.instructions && (
                  <Text style={styles.sheetInstructions}>{assignment.instructions}</Text>
                )}
              </View>
            )}

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
            >
              {attempts.length === 0 ? (
                <Text style={styles.sheetEmpty}>No attempts yet.</Text>
              ) : (
                [...attempts].reverse().map((a) => {
                  const hasFeedback =
                    a.status === 'reviewed' ||
                    a.status === 'completed' ||
                    a.status === 'needs_resubmission';
                  const isCurrent = a.id === submission?.currentAttemptId;
                  const aColor = SUBMISSION_STATUS_COLORS[a.status] ?? '#6B7280';
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.attemptRow, isCurrent && styles.attemptRowCurrent]}
                      onPress={() => hasFeedback && handleViewAttemptFeedback(a)}
                      disabled={!hasFeedback}
                      activeOpacity={hasFeedback ? 0.6 : 1}
                    >
                      <View style={styles.attemptRowInfo}>
                        <Text style={[styles.attemptNum, isCurrent && styles.attemptNumCurrent]}>
                          Attempt {a.attemptNumber}
                          {isCurrent ? ' · current' : ''}
                        </Text>
                        <Text style={styles.attemptDate}>{relativeDate(a.submittedAt)}</Text>
                      </View>
                      <View style={[styles.attemptStatusBadge, { backgroundColor: aColor }]}>
                        <Text style={styles.attemptStatusText}>
                          {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                        </Text>
                      </View>
                      {hasFeedback && <Text style={styles.attemptChevron}>›</Text>}
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
  root: { flex: 1, backgroundColor: '#fff' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 4,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  topBarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarBack: { fontSize: 28, color: '#1B4F72', lineHeight: 32 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  topBarSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    maxWidth: 120,
  },
  statusPillText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Canvas / page
  canvasArea: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    overflow: 'hidden',
  },
  pagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagePlaceholderText: { fontSize: 13, color: '#9CA3AF' },
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
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  attemptsBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  attemptsBtnIcon: { fontSize: 20 },
  attemptsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#1B4F72',
    borderRadius: 6,
    minWidth: 14,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  attemptsBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  recordBtn: {
    flex: 1,
    backgroundColor: '#1B4F72',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  recordBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  feedbackBtnPrimary: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  feedbackBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  feedbackBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  feedbackBtnSecondaryText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  statusIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  statusSpinner: { marginRight: 8 },
  statusIndicatorText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },

  // Attempt history sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111827', paddingHorizontal: 20, marginBottom: 8 },
  sheetMeta: { paddingHorizontal: 20, marginBottom: 12, gap: 4 },
  sheetMetaText: { fontSize: 12, color: '#9CA3AF' },
  sheetInstructions: { fontSize: 13, color: '#374151', lineHeight: 18, marginTop: 4 },
  sheetScroll: { paddingHorizontal: 20 },
  sheetEmpty: { fontSize: 14, color: '#9CA3AF', paddingVertical: 20, textAlign: 'center' },

  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  attemptRowCurrent: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  attemptRowInfo: { flex: 1 },
  attemptNum: { fontSize: 14, fontWeight: '600', color: '#374151' },
  attemptNumCurrent: { color: '#1D4ED8', fontWeight: '700' },
  attemptDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  attemptStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  attemptStatusText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  attemptChevron: { fontSize: 20, color: '#9CA3AF' },
});
