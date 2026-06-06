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
import { getUnassignedStudents } from '@/api/admin';
import type { UnassignedStudentRow } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function RequestCard({
  item,
  onPress,
}: {
  item: UnassignedStudentRow;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.date}>{relativeDate(item.createdAt)}</Text>
      </View>
      <Text style={styles.email}>{item.email}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Pending Assignment</Text>
        </View>
        <Text style={styles.chevron}>Assign ›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AdminRequestsScreen() {
  const router = useRouter();
  const [students, setStudents] = useState<UnassignedStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await getUnassignedStudents();
      setStudents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingScreen message="Loading requests…" />;
  if (error) return <ErrorScreen message={error} onRetry={load} />;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={students.length === 0 ? styles.emptyContainer : styles.content}
      data={students}
      keyExtractor={(item) => item.requestId}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
        />
      }
      renderItem={({ item }) => (
        <RequestCard
          item={item}
          onPress={() =>
            router.push({
              pathname: '/(admin)/assign/[requestId]',
              params: {
                requestId: item.requestId,
                studentName: item.displayName,
                studentEmail: item.email,
              },
            } as never)
          }
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No Pending Requests</Text>
          <Text style={styles.emptyBody}>
            All students have been assigned to a teacher.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: '#111827' },
  date: { fontSize: 12, color: '#9CA3AF' },
  email: { fontSize: 13, color: '#6B7280' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  chevron: { fontSize: 13, color: '#1B4F72', fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptyBody: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
});
