import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getStudentAssignments } from '@/api/assignments';
import { getStudentSubmissions } from '@/api/submissions';
import type { AssignmentSummary, SubmissionRow } from '@/types/api';
import { useTheme } from '@/hooks/useTheme';

// ── Card components ──────────────────────────────────────────────────────────

function PageLabel({ assignment, color }: { assignment: AssignmentSummary; color: string }) {
  return (
    <Text style={[styles.cardPage, { color }]}>
      {assignment.surahNameEnglish
        ? `${assignment.surahNameEnglish} · Page ${assignment.pageNumber}`
        : `Page ${assignment.pageNumber}`}
    </Text>
  );
}

function RerecordCard({
  assignment,
  onPress,
}: {
  assignment: AssignmentSummary;
  onPress: () => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  return (
    <View style={[styles.card, { backgroundColor: T.surface, shadowColor: T.shadow }]}>
      <View style={[styles.cardAccent, { backgroundColor: T.error }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardStatus, { color: T.error }]}>Practice needed</Text>
        <PageLabel assignment={assignment} color={T.textPrimary} />
        <Text style={[styles.cardHint, { color: T.textMuted }]}>Your teacher asked you to re-record this page.</Text>
      </View>
      <TouchableOpacity style={[styles.cardBtn, { backgroundColor: T.error }]} onPress={onPress} activeOpacity={0.8}>
        <Text style={[styles.cardBtnText, { color: T.surface }]}>Re-record</Text>
      </TouchableOpacity>
    </View>
  );
}

function FeedbackCard({
  assignment,
  onPress,
}: {
  assignment: AssignmentSummary;
  onPress: () => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  return (
    <View style={[styles.card, { backgroundColor: T.surface, shadowColor: T.shadow }]}>
      <View style={[styles.cardAccent, { backgroundColor: T.info }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardStatus, { color: T.info }]}>Feedback ready</Text>
        <PageLabel assignment={assignment} color={T.textPrimary} />
        <Text style={[styles.cardHint, { color: T.textMuted }]}>Your teacher has left annotations on your recitation.</Text>
      </View>
      <TouchableOpacity style={[styles.cardBtn, { backgroundColor: T.info }]} onPress={onPress} activeOpacity={0.8}>
        <Text style={[styles.cardBtnText, { color: T.surface }]}>View</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const [asgns, subs] = await Promise.all([
        getStudentAssignments(),
        getStudentSubmissions(),
      ]);
      setAssignments(asgns);
      setSubmissions(subs);
    } catch { /* silent — stale data is fine */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const subByAssignment = useMemo(() => {
    const map = new Map<string, SubmissionRow>();
    for (const sub of submissions) map.set(sub.assignmentId, sub);
    return map;
  }, [submissions]);

  const needsRerecord = useMemo(
    () => assignments.filter((a) => a.status === 'needs_resubmission'),
    [assignments],
  );
  const feedbackReady = useMemo(
    () => assignments.filter((a) => a.status === 'reviewed'),
    [assignments],
  );
  const recentlyCompleted = useMemo(
    () =>
      assignments
        .filter((a) => a.status === 'completed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    [assignments],
  );

  const actionCount = needsRerecord.length + feedbackReady.length;

  const handleRerecord = (assignment: AssignmentSummary) => {
    router.push({
      pathname: '/assignments/[id]/record',
      params: { id: assignment.id },
    });
  };

  const handleViewFeedback = (assignment: AssignmentSummary) => {
    const sub = subByAssignment.get(assignment.id);
    if (!sub?.currentAttemptId) {
      router.push(`/assignments/${assignment.id}` as '/');
      return;
    }
    router.push({
      pathname: '/assignments/[id]/feedback/[attemptId]',
      params: {
        id: assignment.id,
        attemptId: sub.currentAttemptId,
        submissionId: sub.id,
        pageNumber: assignment.pageNumber?.toString() ?? '',
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: T.backgroundAlt }]}>
        <Text style={[styles.loadingText, { color: T.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: T.backgroundAlt }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.brandPrimary} />
      }
    >
      {/* ── Needs attention ── */}
      <Text style={[styles.sectionLabel, { color: T.textMuted }]}>NEEDS ATTENTION</Text>

      {actionCount === 0 ? (
        <View style={[styles.allCaughtUp, { backgroundColor: T.surface }]}>
          <Text style={[styles.allCaughtUpIcon, { color: T.success }]}>✓</Text>
          <Text style={[styles.allCaughtUpTitle, { color: T.textPrimary }]}>All caught up</Text>
          <Text style={[styles.allCaughtUpBody, { color: T.textMuted }]}>
            Nothing to do right now. Your teacher will notify you when they review your recitation.
          </Text>
        </View>
      ) : (
        <View style={styles.cards}>
          {needsRerecord.map((a) => (
            <RerecordCard
              key={a.id}
              assignment={a}
              onPress={() => handleRerecord(a)}
            />
          ))}
          {feedbackReady.map((a) => (
            <FeedbackCard
              key={a.id}
              assignment={a}
              onPress={() => handleViewFeedback(a)}
            />
          ))}
        </View>
      )}

      {/* ── Recently completed ── */}
      {recentlyCompleted.length > 0 && (
        <View style={styles.completedSection}>
          <TouchableOpacity
            style={styles.completedHeader}
            onPress={() => setCompletedOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sectionLabel, { color: T.textMuted }]}>RECENTLY COMPLETED</Text>
            <Text style={[styles.completedChev, { color: T.textMuted }]}>{completedOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {completedOpen && (
            <View style={[styles.completedList, { backgroundColor: T.surface }]}>
              {recentlyCompleted.map((a) => (
                <View key={a.id} style={[styles.completedRow, { borderTopColor: T.border }]}>
                  <Text style={[styles.completedCheck, { color: T.success }]}>✓</Text>
                  <View style={styles.completedMeta}>
                    <Text style={[styles.completedPage, { color: T.textPrimary }]}>
                      {a.surahNameEnglish
                        ? `${a.surahNameEnglish} · Page ${a.pageNumber}`
                        : `Page ${a.pageNumber}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content:   { padding: 16, gap: 8, paddingBottom: 32 },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Action cards ──
  cards: { gap: 10 },

  card: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 3 },
  cardStatus: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  cardPage:   { fontSize: 14, fontWeight: '600' },
  cardHint:   { fontSize: 12, lineHeight: 16 },

  cardBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 12,
    alignItems: 'center',
  },
  cardBtnText: { fontSize: 13, fontWeight: '700' },

  // ── All caught up ──
  allCaughtUp: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  allCaughtUpIcon:  { fontSize: 36 },
  allCaughtUpTitle: { fontSize: 18, fontWeight: '700' },
  allCaughtUpBody:  {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Recently completed ──
  completedSection: { marginTop: 16 },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  completedChev: { fontSize: 11 },
  completedList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completedCheck: { fontSize: 14, fontWeight: '700' },
  completedMeta:  { flex: 1 },
  completedPage:  { fontSize: 14 },
});
