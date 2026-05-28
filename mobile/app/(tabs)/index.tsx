import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getStudentAssignments } from '@/api/assignments';
import type { AssignmentSummary } from '@/types/api';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Active',
  submitted: 'Submitted',
  reviewed: 'Teacher Reviewed',
  completed: 'Completed',
  needs_resubmission: 'Returned for Practice',
  archived: 'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  assigned: '#1B4F72',
  submitted: '#D97706',
  reviewed: '#7C3AED',
  completed: '#059669',
  needs_resubmission: '#DC2626',
  archived: '#9CA3AF',
};

export default function AssignmentsScreen() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await getStudentAssignments();
      setAssignments(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message="Loading assignments…" />;
  if (error) return <ErrorScreen message={error} onRetry={() => load()} />;

  return (
    <View style={styles.container}>
      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
          />
        }
        contentContainerStyle={
          assignments.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No assignments yet. Your teacher will assign you pages soon.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/assignments/${item.id}`)}
            activeOpacity={0.75}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title ?? (item.pageNumber ? `Page ${item.pageNumber}` : 'Assignment')}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: STATUS_COLORS[item.status] ?? '#6B7280' },
                ]}
              >
                <Text style={styles.badgeText}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            {item.pageNumber != null && (
              <Text style={styles.cardMeta}>Quran Page {item.pageNumber}</Text>
            )}
            {item.dueAt && (
              <Text style={styles.cardMeta}>
                Due {new Date(item.dueAt).toLocaleDateString()}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  list: { padding: 16, gap: 12 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: { color: '#6B7280', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
});
