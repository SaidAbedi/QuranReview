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
import { useTheme } from '@/hooks/useTheme';

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

const ACTION_STATUSES = new Set(['reviewed', 'needs_resubmission']);

// ── Action cards ──────────────────────────────────────────────────────────────

function ActionCard({
  assignment,
  onAction,
}: {
  assignment: AssignmentSummary;
  onAction: () => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  const isRerecord = assignment.status === 'needs_resubmission';
  const accentColor = isRerecord ? T.error : T.info;
  return (
    <View style={[s.actionCard, { backgroundColor: T.surface, shadowColor: T.shadow }]}>
      <View style={[s.actionAccent, { backgroundColor: accentColor }]} />
      <View style={s.actionBody}>
        <Text style={[s.actionStatus, { color: accentColor }]}>
          {isRerecord ? 'Practice needed' : 'Feedback ready'}
        </Text>
        <Text style={[s.actionTitle, { color: T.textPrimary }]} numberOfLines={1}>{pageLabel(assignment)}</Text>
        <Text style={[s.actionHint, { color: T.textMuted }]}>
          {isRerecord
            ? 'Your teacher asked you to re-record this page.'
            : 'Your teacher has left annotations on your recitation.'}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.actionBtn, { backgroundColor: accentColor }]}
        onPress={onAction}
        activeOpacity={0.8}
      >
        <Text style={[s.actionBtnText, { color: T.surface }]}>{isRerecord ? 'Re-record' : 'View'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AssignmentsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;

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
    for (const sub of submissions) map.set(sub.assignmentId, sub);
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
    router.push(`/assignments/${assignment.id}` as '/');
  };

  if (loading) return <LoadingScreen message="Loading…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  const hasAny = assignments.length > 0;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: T.backgroundAlt }]}
      contentContainerStyle={hasAny ? s.content : s.emptyContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={T.brandPrimary}
        />
      }
    >
      {!hasAny && (
        <View style={s.emptyState}>
          <Text style={[s.emptyTitle, { color: T.textPrimary }]}>
            Welcome!
          </Text>
          <Text style={[s.emptySubtitle, { color: T.textMuted }]}>
            Let's start our first lesson to get you started. Your teacher will assign your first page soon.
          </Text>
          <View style={s.bismillahContainer}>
            <Text style={[s.bismillahArabic, { color: T.brandPrimary }]}>
              بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
            </Text>
            <Text style={[s.bismillahEnglish, { color: T.textMuted }]}>
              In the name of Allah, the Most Gracious, the Most Merciful
            </Text>
          </View>
        </View>
      )}

      {/* ── Needs attention ── */}
      {actionItems.length > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: T.textMuted }]}>NEEDS ATTENTION</Text>
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
          {actionItems.length > 0 && <Text style={[s.sectionLabel, { color: T.textMuted }]}>ALL ASSIGNMENTS</Text>}
          <View style={s.cards}>
            {allAssignments.map((item) => {
              const chip = theme.chips[item.status as keyof typeof theme.chips];
              const chipBg   = chip ? chip.bg   : T.backgroundAlt;
              const chipText = chip ? chip.text  : T.textMuted;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.listCard, { backgroundColor: T.surface, borderColor: T.border }]}
                  onPress={() => router.push(`/assignments/${item.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.listCardTop}>
                    <Text style={[s.listCardTitle, { color: T.textPrimary }]} numberOfLines={1}>
                      {pageLabel(item)}
                    </Text>
                    <View style={[s.badge, { backgroundColor: chipBg }]}>
                      <Text style={[s.badgeText, { color: chipText }]}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Text>
                    </View>
                  </View>
                  {pageSub(item) && <Text style={[s.listCardSub, { color: T.textMuted }]}>{pageSub(item)}</Text>}
                  {item.dueAt && (
                    <Text style={[s.listCardSub, { color: T.textMuted }]}>Due {new Date(item.dueAt).toLocaleDateString()}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1 },
  content:      { padding: 16, gap: 4, paddingBottom: 32 },
  emptyContent:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText:      { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyState:     { alignItems: 'center', gap: 16 },
  emptyTitle:     { fontSize: 26, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
  emptySubtitle:  { fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 280 },

  section:      { gap: 8, marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
  },
  cards: { gap: 10 },

  // ── Action card ──
  actionCard: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  actionAccent: { width: 4, alignSelf: 'stretch' },
  actionBody:   { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 3 },
  actionStatus: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  actionTitle:  { fontSize: 15, fontWeight: '600' },
  actionHint:   { fontSize: 12, lineHeight: 16 },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 12,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  // ── List card ──
  listCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  listCardTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  listCardSub:   { fontSize: 12, marginTop: 1 },

  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  bismillahContainer: { gap: 6, marginTop: 16, alignItems: 'center' },
  bismillahArabic:    { fontSize: 18, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
  bismillahEnglish:   { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
