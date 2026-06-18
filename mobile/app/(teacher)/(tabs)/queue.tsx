import { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getTeacherAllSubmissions, getTeacherReviewQueue } from '@/api/teacher';
import { useTheme } from '@/hooks/useTheme';
import type { TeacherQueueItem } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

type Filter = 'needs_review' | 'all';

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  submitted:          'Needs Review',
  in_review:          'In Review',
  reviewed:           'Feedback Given',
  needs_resubmission: 'Needs Practice',
  completed:          'Completed',
};

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function QueueCard({ item, onPress }: { item: TeacherQueueItem; onPress: () => void }) {
  const theme = useTheme();
  const T = theme.colors;
  const status = item.submissionStatus ?? item.status;
  const label  = SUBMISSION_STATUS_LABELS[status] ?? status;
  const chip   = theme.chips[status as keyof typeof theme.chips] ?? { bg: T.backgroundAlt, text: T.textMuted };
  const attemptLabel = item.attemptNumber != null && item.attemptNumber > 1
    ? `Attempt ${item.attemptNumber}`
    : 'First attempt';
  const canOpen = !!item.submissionId && !!item.currentAttemptId;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: T.surface }, !canOpen && styles.cardDim]}
      onPress={onPress}
      activeOpacity={canOpen ? 0.7 : 1}
      disabled={!canOpen}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.studentName, { color: T.textPrimary }]}>{item.studentName}</Text>
        <Text style={[styles.dateText, { color: T.textMuted }]}>{relativeDate(item.submittedAt ?? item.updatedAt)}</Text>
      </View>
      <Text style={[styles.pageText, { color: T.textSecondary }]}>
        Page {item.pageNumber ?? '?'}{item.title ? ` — ${item.title}` : ''}
      </Text>
      <View style={styles.cardBottom}>
        <View style={[styles.statusBadge, { backgroundColor: chip.bg }]}>
          <Text style={[styles.statusText, { color: chip.text }]}>{label}</Text>
        </View>
        <Text style={[styles.attemptLabel, { color: T.textMuted }]}>{attemptLabel}</Text>
        {canOpen && <Text style={[styles.chevron, { color: T.textMuted }]}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

function FilterBar({ active, onChange, counts }: {
  active: Filter;
  onChange: (f: Filter) => void;
  counts: { needs_review: number; all: number };
}) {
  const theme = useTheme();
  const T = theme.colors;
  return (
    <View style={[styles.filterBar, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
      {(['needs_review', 'all'] as Filter[]).map((f) => {
        const isActive = active === f;
        const label = f === 'needs_review' ? 'Needs Review' : 'All Recent';
        const count = counts[f];
        return (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              { backgroundColor: isActive ? T.brandPrimary : T.backgroundAlt },
            ]}
            onPress={() => onChange(f)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterText,
              { color: isActive ? T.brandOnPrimary : T.textMuted },
            ]}>
              {label}
              {count > 0 ? `  ${count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function QueueScreen() {
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;
  const [filter, setFilter]       = useState<Filter>('needs_review');
  const [pendingItems, setPending] = useState<TeacherQueueItem[]>([]);
  const [allItems, setAll]         = useState<TeacherQueueItem[]>([]);
  const [loading, setLoading]      = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]          = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [pending, all] = await Promise.all([
        getTeacherReviewQueue(),
        getTeacherAllSubmissions(),
      ]);
      setPending(pending);
      setAll(all);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePress = (item: TeacherQueueItem) => {
    if (!item.submissionId || !item.currentAttemptId) return;
    router.push({
      pathname: '/(teacher)/review/[submissionId]',
      params: {
        submissionId: item.submissionId,
        attemptId: item.currentAttemptId,
        pageNumber: String(item.pageNumber ?? ''),
        pageImageUrl: item.imageUrl ?? '',
        studentName: item.studentName,
        attemptNumber: String(item.attemptNumber ?? 1),
        assignmentTitle: item.title ?? '',
      },
    });
  };

  if (loading) return <LoadingScreen message="Loading queue…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  const items = filter === 'needs_review' ? pendingItems : allItems;

  return (
    <View style={[styles.container, { backgroundColor: T.backgroundAlt }]}>
      <FilterBar
        active={filter}
        onChange={setFilter}
        counts={{ needs_review: pendingItems.length, all: allItems.length }}
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.brandPrimary} />
        }
        renderItem={({ item }) => <QueueCard item={item} onPress={() => handlePress(item)} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: T.brandPrimary }]}>
              {filter === 'needs_review' ? 'All caught up!' : 'No submissions yet'}
            </Text>
            <Text style={[styles.emptyBody, { color: T.textMuted }]}>
              {filter === 'needs_review'
                ? 'No pending submissions. Check "All Recent" to see past reviews.'
                : 'Submissions will appear here once students start recording.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  filterBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  filterText: { fontSize: 13, fontWeight: '600' },

  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  emptyWrap:   { flex: 1 },

  card: {
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
    gap: 6,
  },
  cardDim: { opacity: 0.6 },
  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  studentName: { fontSize: 15, fontWeight: '700' },
  dateText:    { fontSize: 12 },
  pageText:    { fontSize: 13 },
  cardBottom:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  attemptLabel:{ fontSize: 11, flex: 1 },
  chevron:     { fontSize: 20 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
