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

const STATUS_COLORS: Record<string, string> = {
  active: '#059669',
  inactive: '#9CA3AF',
  pending: '#D97706',
};

function RelationshipCard({
  item,
  onToggle,
}: {
  item: AdminRelationshipRow;
  onToggle: () => void;
}) {
  const isActive = item.status === 'active';
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Text style={styles.label}>Teacher</Text>
          <Text style={styles.value}>{item.teacherName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Student</Text>
          <Text style={styles.value}>{item.studentName}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? '#9CA3AF' }]} />
        <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] ?? '#9CA3AF' }]}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
        <TouchableOpacity style={styles.toggleBtn} onPress={onToggle}>
          <Text style={styles.toggleBtnText}>
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
      style={styles.list}
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
          <Text style={styles.emptyTitle}>No Relationships</Text>
          <Text style={styles.emptyBody}>No teacher-student pairs exist yet.</Text>
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
    gap: 10,
  },
  cardBody: { gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', width: 56 },
  value: { fontSize: 14, color: '#111827', flex: 1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  toggleBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptyBody: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
});
