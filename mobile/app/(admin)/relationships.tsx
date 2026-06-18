import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRelationships, updateRelationship } from '@/api/admin';
import type { AdminRelationshipRow } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useTheme } from '@/hooks/useTheme';

function statusColor(status: string, T: ReturnType<typeof useTheme>['colors']): string {
  if (status === 'active') return T.success;
  if (status === 'pending') return T.warning;
  return T.textMuted;
}

function RelationshipCard({
  item,
  onToggle,
}: {
  item: AdminRelationshipRow;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  const isActive = item.status === 'active';
  const dotColor = statusColor(item.status, T);

  return (
    <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: T.textMuted }]}>Teacher</Text>
          <Text style={[styles.value, { color: T.textPrimary }]}>{item.teacherName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: T.textMuted }]}>Student</Text>
          <Text style={[styles.value, { color: T.textPrimary }]}>{item.studentName}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
        <Text style={[styles.statusText, { color: dotColor }]}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
        <TouchableOpacity
          style={[styles.toggleBtn, { backgroundColor: T.backgroundAlt }]}
          onPress={onToggle}
        >
          <Text style={[styles.toggleBtnText, { color: T.textSecondary }]}>
            {isActive ? 'Deactivate' : 'Reactivate'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function RelationshipsScreen() {
  const [relationships, setRelationships] = useState<AdminRelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const T = theme.colors;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setRelationships(await getRelationships());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load relationships');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = (rel: AdminRelationshipRow) => {
    const next = rel.status === 'active' ? 'inactive' : 'active';
    const label = next === 'inactive' ? 'Deactivate' : 'Reactivate';
    const body =
      next === 'inactive'
        ? `${rel.studentName} will be notified that their assignment has been paused.`
        : `${rel.studentName} will be notified that their assignment has been reactivated.`;

    Alert.alert(label, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: next === 'inactive' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await updateRelationship(rel.id, next);
            setRelationships((prev) =>
              prev.map((r) => (r.id === rel.id ? { ...r, status: next } : r)),
            );
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Update failed');
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingScreen message="Loading relationships…" />;
  if (error) return <ErrorScreen message={error} onRetry={load} />;

  return (
    <FlatList
      style={[styles.list, { backgroundColor: T.backgroundAlt }]}
      contentContainerStyle={relationships.length === 0 ? styles.emptyContainer : styles.content}
      data={relationships}
      keyExtractor={(r) => r.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
        />
      }
      renderItem={({ item }) => (
        <RelationshipCard item={item} onToggle={() => handleToggle(item)} />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: T.textSecondary }]}>No Relationships</Text>
          <Text style={[styles.emptyBody, { color: T.textMuted }]}>No teacher-student pairs exist yet.</Text>
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
    gap: 10,
  },
  cardBody: { gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  label: { fontSize: 12, fontWeight: '600', width: 56 },
  value: { fontSize: 14, flex: 1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleBtnText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center' },
});
