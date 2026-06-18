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
import { useTheme } from '@/hooks/useTheme';
import type { TeacherStudentSummary } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const theme = useTheme();
  const T = theme.colors;
  return (
    <View style={[bar.track, { backgroundColor: T.border }]}>
      <View style={[bar.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
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
  const theme = useTheme();
  const T = theme.colors;
  const allDone = student.pagesAssigned > 0 && student.pagesCompleted >= student.pagesAssigned;
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: T.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: T.brandPrimarySoft }]}>
          <Text style={[styles.avatarText, { color: T.brandPrimary }]}>{student.studentName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.studentName, { color: T.textPrimary }]}>{student.studentName}</Text>
          <Text style={[styles.activityText, { color: T.textMuted }]}>Active {relativeDate(student.lastActivityAt)}</Text>
        </View>
        {student.pagesNeedsResubmission > 0 && (
          <View style={[styles.needsPracticeBadge, { backgroundColor: T.errorBg }]}>
            <Text style={[styles.needsPracticeText, { color: T.error }]}>{student.pagesNeedsResubmission} needs practice</Text>
          </View>
        )}
        <Text style={[styles.chevron, { color: T.textMuted }]}>›</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: T.brandPrimary }]}>{student.pagesAssigned}</Text>
          <Text style={[styles.statLabel, { color: T.textMuted }]}>Assigned</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: T.success }]}>{student.pagesCompleted}</Text>
          <Text style={[styles.statLabel, { color: T.textMuted }]}>Completed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: T.error }]}>{student.pagesNeedsResubmission}</Text>
          <Text style={[styles.statLabel, { color: T.textMuted }]}>Needs Practice</Text>
        </View>
        <View style={{ flex: 2 }}>
          <ProgressBar
            value={student.pagesCompleted}
            total={student.pagesAssigned}
            color={allDone ? T.success : T.brandPrimary}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function StudentsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;
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
      style={[styles.list, { backgroundColor: T.backgroundAlt }]}
      contentContainerStyle={students.length === 0 ? styles.emptyWrap : styles.listContent}
      data={students}
      keyExtractor={(s) => s.studentId}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.brandPrimary} />
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
          <Text style={[styles.emptyTitle, { color: T.brandPrimary }]}>No students yet</Text>
          <Text style={[styles.emptyBody, { color: T.textMuted }]}>
            Students will appear here once they are assigned to you.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyWrap:   { flex: 1 },

  card: {
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
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 18, fontWeight: '700' },
  cardInfo:    { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '700' },
  activityText:{ fontSize: 12, marginTop: 1 },

  needsPracticeBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  needsPracticeText: { fontSize: 10, fontWeight: '700' },
  chevron: { fontSize: 20 },

  statsRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stat:      { alignItems: 'center', minWidth: 44 },
  statNum:   { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, marginTop: 1 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
