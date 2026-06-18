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
import { C } from '@/constants/colors';
import type { AssignmentSummary, SubmissionRow } from '@/types/api';

// ── Card components ──────────────────────────────────────────────────────────

function PageLabel({ assignment }: { assignment: AssignmentSummary }) {
  return (
    <Text style={styles.cardPage}>
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
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: C.red }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardStatus, { color: C.red }]}>Practice needed</Text>
        <PageLabel assignment={assignment} />
        <Text style={styles.cardHint}>Your teacher asked you to re-record this page.</Text>
      </View>
      <TouchableOpacity style={[styles.cardBtn, styles.cardBtnRed]} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.cardBtnText}>Re-record</Text>
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
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: C.purple }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardStatus, { color: C.purple }]}>Feedback ready</Text>
        <PageLabel assignment={assignment} />
        <Text style={styles.cardHint}>Your teacher has left annotations on your recitation.</Text>
      </View>
      <TouchableOpacity style={[styles.cardBtn, styles.cardBtnPurple]} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.cardBtnText}>View</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const router = useRouter();
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
    for (const s of submissions) map.set(s.assignmentId, s);
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
      <View style={styles.centerWrap}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />
      }
    >
      {/* ── Needs attention ── */}
      <Text style={styles.sectionLabel}>NEEDS ATTENTION</Text>

      {actionCount === 0 ? (
        <View style={styles.allCaughtUp}>
          <Text style={styles.allCaughtUpIcon}>✓</Text>
          <Text style={styles.allCaughtUpTitle}>All caught up</Text>
          <Text style={styles.allCaughtUpBody}>
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
            <Text style={styles.sectionLabel}>RECENTLY COMPLETED</Text>
            <Text style={styles.completedChev}>{completedOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {completedOpen && (
            <View style={styles.completedList}>
              {recentlyCompleted.map((a) => (
                <View key={a.id} style={styles.completedRow}>
                  <Text style={styles.completedCheck}>✓</Text>
                  <View style={styles.completedMeta}>
                    <Text style={styles.completedPage}>
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
  container: { flex: 1, backgroundColor: C.surface },
  content:   { padding: 16, gap: 8, paddingBottom: 32 },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: C.textMuted, fontSize: 14 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Action cards ──
  cards: { gap: 10 },

  card: {
    backgroundColor: C.white,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 3 },
  cardStatus: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  cardPage:   { fontSize: 14, fontWeight: '600', color: C.text },
  cardHint:   { fontSize: 12, color: C.textMuted, lineHeight: 16 },

  cardBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 12,
    alignItems: 'center',
  },
  cardBtnRed:    { backgroundColor: C.red },
  cardBtnPurple: { backgroundColor: C.purple },
  cardBtnText:   { fontSize: 13, fontWeight: '700', color: C.white },

  // ── All caught up ──
  allCaughtUp: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  allCaughtUpIcon:  { fontSize: 36, color: C.green },
  allCaughtUpTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  allCaughtUpBody:  {
    fontSize: 14,
    color: C.textMuted,
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
  completedChev: { fontSize: 11, color: C.textMuted },
  completedList: {
    backgroundColor: C.white,
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
    borderTopColor: C.border,
  },
  completedCheck: { fontSize: 14, color: C.green, fontWeight: '700' },
  completedMeta:  { flex: 1 },
  completedPage:  { fontSize: 14, color: C.text },
});
