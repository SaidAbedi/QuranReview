import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getTeacherStudentSubmissions } from '@/api/teacher';
import { useTheme } from '@/hooks/useTheme';
import type { TeacherStudentSubmission } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

const STATUS_LABELS: Record<string, string> = {
  draft:              'Draft',
  submitted:          'Needs Review',
  in_review:          'In Review',
  reviewed:           'Feedback Given',
  needs_resubmission: 'Needs Practice',
  completed:          'Completed',
  archived:           'Archived',
};

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SubmissionRow({
  submission,
  onPress,
}: {
  submission: TeacherStudentSubmission;
  onPress: () => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  const label = STATUS_LABELS[submission.status] ?? submission.status;
  const chip  = theme.chips[submission.status as keyof typeof theme.chips] ?? { bg: T.backgroundAlt, text: T.textMuted };
  const canOpen = !!submission.currentAttemptId &&
    ['submitted', 'in_review', 'reviewed', 'needs_resubmission', 'completed'].includes(submission.status);
  const lastDate = submission.completedAt ?? submission.reviewedAt ?? submission.submittedAt ?? submission.createdAt;

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: T.surface }, !canOpen && styles.rowDim]}
      onPress={onPress}
      activeOpacity={canOpen ? 0.7 : 1}
      disabled={!canOpen}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowPage, { color: T.textPrimary }]}>
          Page {submission.pageNumber ?? '?'}
          {submission.assignmentTitle ? ` — ${submission.assignmentTitle}` : ''}
        </Text>
        <View style={styles.rowMeta}>
          <View style={[styles.statusBadge, { backgroundColor: chip.bg }]}>
            <Text style={[styles.statusText, { color: chip.text }]}>{label}</Text>
          </View>
          {submission.attemptCount > 0 && (
            <Text style={[styles.attemptText, { color: T.textMuted }]}>
              {submission.attemptCount} attempt{submission.attemptCount !== 1 ? 's' : ''}
            </Text>
          )}
          <Text style={[styles.dateText, { color: T.textMuted }]}>{relativeDate(lastDate)}</Text>
        </View>
      </View>
      {canOpen && <Text style={[styles.chevron, { color: T.textMuted }]}>›</Text>}
    </TouchableOpacity>
  );
}

export default function StudentDetailScreen() {
  const { studentId, studentName } = useLocalSearchParams<{ studentId: string; studentName: string }>();
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;

  const [submissions, setSubmissions] = useState<TeacherStudentSubmission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      setSubmissions(await getTeacherStudentSubmissions(studentId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const handlePress = (submission: TeacherStudentSubmission) => {
    if (!submission.currentAttemptId) return;
    router.push({
      pathname: '/(teacher)/review/[submissionId]',
      params: {
        submissionId: submission.submissionId,
        attemptId: submission.currentAttemptId,
        pageNumber: String(submission.pageNumber ?? ''),
        pageImageUrl: '',
        studentName: studentName ?? '',
        attemptNumber: String(submission.attemptCount),
        assignmentTitle: submission.assignmentTitle ?? '',
      },
    });
  };

  // Summary stats
  const completed = submissions.filter((s) => s.status === 'completed').length;
  const needsPractice = submissions.filter((s) => s.status === 'needs_resubmission').length;
  const needsReview = submissions.filter((s) => s.status === 'submitted' || s.status === 'in_review').length;

  if (loading) return <LoadingScreen message="Loading history…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  return (
    <>
      <Stack.Screen options={{ title: studentName ?? 'Student' }} />
      <FlatList
        style={[styles.list, { backgroundColor: T.backgroundAlt }]}
        contentContainerStyle={submissions.length === 0 ? styles.emptyWrap : styles.listContent}
        data={submissions}
        keyExtractor={(s) => s.submissionId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.brandPrimary} />
        }
        ListHeaderComponent={
          submissions.length > 0 ? (
            <View style={[styles.summaryCard, { backgroundColor: T.surface }]}>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryNum, { color: T.brandPrimary }]}>{submissions.length}</Text>
                  <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Total</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryNum, { color: T.success }]}>{completed}</Text>
                  <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Completed</Text>
                </View>
                {needsPractice > 0 && (
                  <View style={styles.summaryStat}>
                    <Text style={[styles.summaryNum, { color: T.error }]}>{needsPractice}</Text>
                    <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Needs Practice</Text>
                  </View>
                )}
                {needsReview > 0 && (
                  <View style={styles.summaryStat}>
                    <Text style={[styles.summaryNum, { color: T.warning }]}>{needsReview}</Text>
                    <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Awaiting Review</Text>
                  </View>
                )}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View>
            {index > 0 && <View style={[styles.divider, { backgroundColor: T.border }]} />}
            <SubmissionRow submission={item} onPress={() => handlePress(item)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: T.brandPrimary }]}>No submissions yet</Text>
            <Text style={[styles.emptyBody, { color: T.textMuted }]}>
              {studentName ?? 'This student'} hasn't submitted any recordings yet.
            </Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  emptyWrap:   { flex: 1 },

  summaryCard: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryStat:  { alignItems: 'center' },
  summaryNum:   { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 11, marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  rowDim:   { opacity: 0.6 },
  rowLeft:  { flex: 1, gap: 6 },
  rowPage:  { fontSize: 14, fontWeight: '600' },
  rowMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  attemptText: { fontSize: 11 },
  dateText:    { fontSize: 11 },
  chevron:     { fontSize: 20 },

  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
