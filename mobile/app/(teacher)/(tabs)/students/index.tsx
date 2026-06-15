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
import { getTeacherStudents } from '@/api/teacher';
import { C } from '@/constants/colors';
import type { TeacherStudentSummary } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: 4, borderRadius: 2 },
});

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function StudentCard({ student, onPress }: { student: TeacherStudentSummary; onPress: () => void }) {
  const allDone = student.pagesAssigned > 0 && student.pagesCompleted >= student.pagesAssigned;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{student.studentName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.studentName}>{student.studentName}</Text>
          <Text style={styles.activityText}>Active {relativeDate(student.lastActivityAt)}</Text>
        </View>
        {student.pagesNeedsResubmission > 0 && (
          <View style={styles.needsPracticeBadge}>
            <Text style={styles.needsPracticeText}>{student.pagesNeedsResubmission} needs practice</Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: C.blue }]}>{student.pagesAssigned}</Text>
          <Text style={styles.statLabel}>Assigned</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: C.green }]}>{student.pagesCompleted}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: C.red }]}>{student.pagesNeedsResubmission}</Text>
          <Text style={styles.statLabel}>Needs Practice</Text>
        </View>
        <View style={{ flex: 2 }}>
          <ProgressBar
            value={student.pagesCompleted}
            total={student.pagesAssigned}
            color={allDone ? C.green : C.blue}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function StudentsScreen() {
  const router = useRouter();
  const [students, setStudents]     = useState<TeacherStudentSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await getTeacherStudents();
      // Sort: needs practice first, then alphabetical
      setStudents(
        [...data].sort((a, b) => {
          if (b.pagesNeedsResubmission !== a.pagesNeedsResubmission)
            return b.pagesNeedsResubmission - a.pagesNeedsResubmission;
          return a.studentName.localeCompare(b.studentName);
        }),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load students');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingScreen message="Loading students…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={students.length === 0 ? styles.emptyWrap : styles.listContent}
      data={students}
      keyExtractor={(s) => s.studentId}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />
      }
      renderItem={({ item }) => (
        <StudentCard
          student={item}
          onPress={() =>
            router.push({
              pathname: '/(teacher)/(tabs)/students/[studentId]',
              params: { studentId: item.studentId, studentName: item.studentName },
            })
          }
        />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No students yet</Text>
          <Text style={styles.emptyBody}>
            Students will appear here once they are assigned to you.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: C.surface },
  listContent: { padding: 16, gap: 12 },
  emptyWrap:   { flex: 1 },

  card: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
    gap: 12,
  },
  cardTop:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:   {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.blueBg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 18, fontWeight: '700', color: C.blue },
  cardInfo:    { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '700', color: C.text },
  activityText:{ fontSize: 12, color: C.textMuted, marginTop: 1 },

  needsPracticeBadge: {
    backgroundColor: C.redBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  needsPracticeText: { fontSize: 10, fontWeight: '700', color: C.red },
  chevron: { fontSize: 20, color: C.grayLight },

  statsRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stat:      { alignItems: 'center', minWidth: 44 },
  statNum:   { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: C.textMuted, marginTop: 1 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.blue, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
});
