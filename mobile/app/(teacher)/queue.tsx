import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getTeacherReviewQueue } from '@/api/teacher';
import type { TeacherQueueItem } from '@/types/api';

function statusLabel(item: TeacherQueueItem): string {
  const n = item.attemptNumber;
  return n != null && n > 1 ? `Attempt ${n}` : 'First attempt';
}

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function QueueItem({
  item,
  onPress,
}: {
  item: TeacherQueueItem;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.studentName}>{item.studentName}</Text>
        <Text style={styles.dateText}>{relativeDate(item.submittedAt)}</Text>
      </View>
      <Text style={styles.pageText}>
        Page {item.pageNumber ?? '?'}
        {item.title ? ` — ${item.title}` : ''}
      </Text>
      <View style={styles.cardFooter}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{statusLabel(item)}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ReviewQueueScreen() {
  const router = useRouter();
  const [items, setItems] = useState<TeacherQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getTeacherReviewQueue();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B4F72" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1B4F72" />
      }
      renderItem={({ item }) => (
        <QueueItem
          item={item}
          onPress={() => {
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
          }}
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pending reviews</Text>
          <Text style={styles.emptyBody}>
            You'll see submissions here once your students record and submit.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F8F9FA' },
  listContent: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  studentName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dateText: { fontSize: 12, color: '#9CA3AF' },
  pageText: { fontSize: 14, color: '#374151' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  badge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, color: '#1D4ED8', fontWeight: '600' },
  chevron: { fontSize: 20, color: '#9CA3AF' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1B4F72', textAlign: 'center' },
  emptyBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#1B4F72',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
