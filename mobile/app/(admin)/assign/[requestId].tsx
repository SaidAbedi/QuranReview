import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTeachers, assignTeacher } from '@/api/admin';
import type { TeacherOption } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

function capacityLabel(t: TeacherOption): string {
  if (t.capacity == null) return `${t.currentLoad} student${t.currentLoad !== 1 ? 's' : ''}`;
  return `${t.currentLoad} / ${t.capacity}`;
}

function capacityColor(t: TeacherOption): string {
  if (t.capacity == null) return '#6B7280';
  const pct = t.currentLoad / t.capacity;
  if (pct >= 1) return '#DC2626';
  if (pct >= 0.8) return '#D97706';
  return '#059669';
}

function TeacherCard({
  teacher,
  onSelect,
  disabled,
}: {
  teacher: TeacherOption;
  onSelect: () => void;
  disabled: boolean;
}) {
  const full = teacher.capacity != null && teacher.currentLoad >= teacher.capacity;
  return (
    <TouchableOpacity
      style={[styles.card, full && styles.cardFull]}
      onPress={onSelect}
      disabled={disabled || full}
      activeOpacity={0.7}
    >
      <View style={styles.cardBody}>
        <Text style={styles.teacherName}>{teacher.displayName}</Text>
        <Text style={styles.teacherEmail}>{teacher.email}</Text>
      </View>
      <View style={styles.loadBadge}>
        <Text style={[styles.loadText, { color: capacityColor(teacher) }]}>
          {capacityLabel(teacher)}
        </Text>
        {full && <Text style={styles.fullLabel}>Full</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function AssignTeacherScreen() {
  const { requestId, studentName, studentEmail } = useLocalSearchParams<{
    requestId: string;
    studentName: string;
    studentEmail: string;
  }>();
  const router = useRouter();

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setTeachers(await getTeachers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load teachers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = (teacher: TeacherOption) => {
    Alert.alert(
      'Confirm Assignment',
      `Assign ${studentName} to ${teacher.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign',
          onPress: async () => {
            setAssigning(true);
            try {
              await assignTeacher(requestId, teacher.id);
              Alert.alert(
                'Assigned',
                `${studentName} has been assigned to ${teacher.displayName}. Both have been notified.`,
                [{ text: 'OK', onPress: () => router.back() }],
              );
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Assignment failed');
            } finally {
              setAssigning(false);
            }
          },
        },
      ],
    );
  };

  if (loading) return <LoadingScreen message="Loading teachers…" />;
  if (error) return <ErrorScreen message={error} onRetry={load} />;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={teachers}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{studentName}</Text>
          <Text style={styles.headerSub}>{studentEmail}</Text>
          <Text style={styles.headerLabel}>Select a teacher to assign:</Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
        />
      }
      renderItem={({ item }) => (
        <TeacherCard
          teacher={item}
          onSelect={() => handleAssign(item)}
          disabled={assigning}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No teachers found in the system.</Text>
      }
      ListFooterComponent={
        assigning ? (
          <View style={styles.assigningRow}>
            <ActivityIndicator color="#1B4F72" />
            <Text style={styles.assigningText}>Assigning…</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, gap: 10 },
  header: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    gap: 4,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6B7280' },
  headerLabel: { fontSize: 13, color: '#374151', marginTop: 8, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardFull: { opacity: 0.5 },
  cardBody: { flex: 1, gap: 2 },
  teacherName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  teacherEmail: { fontSize: 12, color: '#9CA3AF' },
  loadBadge: { alignItems: 'flex-end', gap: 2 },
  loadText: { fontSize: 13, fontWeight: '600' },
  fullLabel: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#9CA3AF', fontSize: 14, marginTop: 32 },
  assigningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  assigningText: { fontSize: 14, color: '#6B7280' },
});
