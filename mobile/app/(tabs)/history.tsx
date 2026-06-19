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

const STATUS_LABELS: Record<string, string> = {
  draft:              'Draft',
  submitted:          'Teacher Reviewing',
  in_review:          'Teacher Reviewing',
  reviewed:           'Feedback Ready',
  needs_resubmission: 'Returned for Practice',
  completed:          'Completed',
  archived:           'Archived',
};

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface HistoryItem {
  submission: SubmissionRow;
  assignment: AssignmentSummary | null;
  sortKey: string;
}

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = useMemo<HistoryItem[]>(() => {
    const asgMap = new Map<string, AssignmentSummary>();
    for (const a of assignments) asgMap.set(a.id, a);

    return submissions
      .filter((s) => s.status !== 'draft')
      .map((s) => ({
        submission: s,
        assignment: asgMap.get(s.assignmentId) ?? null,
        sortKey: s.updatedAt ?? s.createdAt,
      }))
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [submissions, assignments]);

  if (loading) return <LoadingScreen message="Loading history…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: T.backgroundAlt }]}
      contentContainerStyle={items.length === 0 ? s.emptyContent : s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={T.brandPrimary}
        />
      }
    >
      {items.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={[s.emptyTitle, { color: T.brandPrimary }]}>No recitations yet</Text>
          <Text style={[s.emptyBody, { color: T.textMuted }]}>
            Your submitted recitations will appear here with their feedback status.
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          {items.map(({ submission, assignment }) => {
            const chip = theme.chips[submission.status as keyof typeof theme.chips];
            const chipBg   = chip?.bg   ?? T.backgroundAlt;
            const chipText = chip?.text ?? T.textMuted;
            const pageLabel = assignment?.surahNameEnglish && assignment.pageNumber != null
              ? `${assignment.surahNameEnglish} · Page ${assignment.pageNumber}`
              : assignment?.pageNumber != null
                ? `Page ${assignment.pageNumber}`
                : 'Page';
            const date = submission.updatedAt ?? submission.createdAt;
            const isComplete = submission.status === 'completed';
            const hasFeedback = ['reviewed', 'needs_resubmission', 'completed'].includes(submission.status);

            return (
              <TouchableOpacity
                key={submission.id}
                style={[s.card, { backgroundColor: T.surface, borderColor: T.border }]}
                onPress={() => router.push(`/assignments/${submission.assignmentId}`)}
                activeOpacity={0.75}
              >
                {/* Gold left accent for completed pages */}
                {isComplete && <View style={[s.accent, { backgroundColor: T.brandPrimary }]} />}

                <View style={s.cardMain}>
                  <View style={s.cardTop}>
                    <Text style={[s.pageLabel, { color: T.textPrimary }]} numberOfLines={1}>
                      {pageLabel}
                    </Text>
                    <Text style={[s.date, { color: T.textMuted }]}>{relativeDate(date)}</Text>
                  </View>

                  <View style={s.cardBottom}>
                    <View style={[s.badge, { backgroundColor: chipBg }]}>
                      <Text style={[s.badgeText, { color: chipText }]}>
                        {STATUS_LABELS[submission.status] ?? submission.status}
                      </Text>
                    </View>
                    {hasFeedback && (
                      <Text style={[s.feedbackHint, { color: T.info }]}>View feedback ›</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  content:      { padding: 16, paddingBottom: 32 },
  emptyContent: { flex: 1 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  list: { gap: 10 },

  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accent: { width: 3 },
  cardMain: { flex: 1, padding: 14, gap: 8 },

  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  date:      { fontSize: 12 },

  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  feedbackHint: { fontSize: 12, fontWeight: '500' },
});
