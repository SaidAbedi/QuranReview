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
import { useTheme } from '@/hooks/useTheme';

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
  const theme = useTheme();
  const T = theme.colors;
  const chip = theme.chips.submitted; // "Pending Assignment" maps closest to submitted styling

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.name, { color: T.textPrimary }]}>{item.displayName}</Text>
        <Text style={[styles.date, { color: T.textMuted }]}>{relativeDate(item.createdAt)}</Text>
      </View>
      <Text style={[styles.email, { color: T.textMuted }]}>{item.email}</Text>
      <View style={styles.cardFooter}>
        <View style={[styles.badge, { backgroundColor: chip.bg }]}>
          <Text style={[styles.badgeText, { color: chip.text }]}>Pending Assignment</Text>
        </View>
        <Text style={[styles.chevron, { color: T.brandPrimary }]}>Assign ›</Text>
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
  const theme = useTheme();
  const T = theme.colors;

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
      style={[styles.list, { backgroundColor: T.backgroundAlt }]}
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
          <Text style={[styles.emptyTitle, { color: T.textSecondary }]}>No Pending Requests</Text>
          <Text style={[styles.emptyBody, { color: T.textMuted }]}>
            All students have been assigned to a teacher.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  date: { fontSize: 12 },
  email: { fontSize: 13 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  chevron: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center' },
});
