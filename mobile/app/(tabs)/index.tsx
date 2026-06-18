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
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { C } from '@/constants/colors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pageLabel(item: AssignmentSummary) {
  if (item.title && item.title !== `Page ${item.pageNumber}`) return item.title;
  if (item.surahNameEnglish && item.pageNumber != null)
    return `${item.surahNameEnglish} — Page ${item.pageNumber}`;
  if (item.pageNumber != null) return `Page ${item.pageNumber}`;
  return 'Assignment';
}

function pageSub(item: AssignmentSummary) {
  if (item.surahNameEnglish && item.pageNumber != null)
    return `${item.surahNameEnglish} · Page ${item.pageNumber}`;
  if (item.pageNumber != null) return `Page ${item.pageNumber}`;
  return null;
}

const STATUS_LABELS: Record<string, string> = {
  assigned:           'Active',
  submitted:          'Submitted',
  reviewed:           'Teacher Reviewed',
  completed:          'Completed',
  needs_resubmission: 'Returned for Practice',
  archived:           'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  assigned:           C.blue,
  submitted:          C.amber,
  reviewed:           C.purple,
  completed:          C.green,
  needs_resubmission: C.red,
  archived:           C.grayLight,
};

const ACTION_STATUSES = new Set(['reviewed', 'needs_resubmission']);

// ── Action cards ──────────────────────────────────────────────────────────────

function ActionCard({
  assignment,
  onAction,
}: {
  assignment: AssignmentSummary;
  onAction: () => void;
}) {
  const isRerecord = assignment.status === 'needs_resubmission';
  return (
    <View style={s.actionCard}>
      <View style={[s.actionAccent, { backgroundColor: isRerecord ? C.red : C.purple }]} />
      <View style={s.actionBody}>
        <Text style={[s.actionStatus, { color: isRerecord ? C.red : C.purple }]}>
          {isRerecord ? 'Practice needed' : 'Feedback ready'}
        </Text>
        <Text style={s.actionTitle} numberOfLines={1}>{pageLabel(assignment)}</Text>
        <Text style={s.actionHint}>
          {isRerecord
            ? 'Your teacher asked you to re-record this page.'
            : 'Your teacher has left annotations on your recitation.'}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.actionBtn, { backgroundColor: isRerecord ? C.red : C.purple }]}
        onPress={onAction}
        activeOpacity={0.8}
      >
        <Text style={s.actionBtnText}>{isRerecord ? 'Re-record' : 'View'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AssignmentsScreen() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [asgns, subs] = await Promise.all([
        getStudentAssignments(),
        getStudentSubmissions(),
      ]);
      setAssignments(asgns);
      setSubmissions(subs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
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

  const actionItems = useMemo(
    () => assignments.filter((a) => ACTION_STATUSES.has(a.status)),
    [assignments],
  );

  const allAssignments = useMemo(
    () => assignments.filter((a) => !ACTION_STATUSES.has(a.status)),
    [assignments],
  );

  const handleAction = (assignment: AssignmentSummary) => {
    if (assignment.status === 'needs_resubmission') {
      router.push({ pathname: '/assignments/[id]/record', params: { id: assignment.id } });
      return;
    }
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

  if (loading) return <LoadingScreen message="Loading…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  const hasAny = assignments.length > 0;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={hasAny ? s.content : s.emptyContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={C.blue}
        />
      }
    >
      {!hasAny && (
        <Text style={s.emptyText}>
          No assignments yet. Your teacher will assign you pages soon.
        </Text>
      )}

      {/* ── Needs attention ── */}
      {actionItems.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>NEEDS ATTENTION</Text>
          <View style={s.cards}>
            {actionItems.map((a) => (
              <ActionCard key={a.id} assignment={a} onAction={() => handleAction(a)} />
            ))}
          </View>
        </View>
      )}

      {/* ── All assignments ── */}
      {allAssignments.length > 0 && (
        <View style={s.section}>
          {actionItems.length > 0 && <Text style={s.sectionLabel}>ALL ASSIGNMENTS</Text>}
          <View style={s.cards}>
            {allAssignments.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={s.listCard}
                onPress={() => router.push(`/assignments/${item.id}`)}
                activeOpacity={0.75}
              >
                <View style={s.listCardTop}>
                  <Text style={s.listCardTitle} numberOfLines={1}>
                    {pageLabel(item)}
                  </Text>
                  <View style={[s.badge, { backgroundColor: STATUS_COLORS[item.status] ?? C.gray }]}>
                    <Text style={s.badgeText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
                  </View>
                </View>
                {pageSub(item) && <Text style={s.listCardSub}>{pageSub(item)}</Text>}
                {item.dueAt && (
                  <Text style={s.listCardSub}>Due {new Date(item.dueAt).toLocaleDateString()}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.surface },
  content:      { padding: 16, gap: 4, paddingBottom: 32 },
  emptyContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText:    { color: C.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  section:      { gap: 8, marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
  },
  cards: { gap: 10 },

  // ── Action card ──
  actionCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  actionAccent: { width: 4, alignSelf: 'stretch' },
  actionBody:   { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 3 },
  actionStatus: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  actionTitle:  { fontSize: 15, fontWeight: '600', color: C.text },
  actionHint:   { fontSize: 12, color: C.textMuted, lineHeight: 16 },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 12,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: C.white },

  // ── List card ──
  listCard: {
    backgroundColor: C.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  listCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  listCardTitle: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  listCardSub:   { fontSize: 12, color: C.textMuted, marginTop: 1 },

  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: C.white, fontSize: 11, fontWeight: '600' },
});
