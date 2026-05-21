import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getStudentProgress } from '@/api/progress';
import type { StudentProgressSummary } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function ProgressScreen() {
  const [progress, setProgress] = useState<StudentProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await getStudentProgress();
      setProgress(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load progress');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message="Loading progress…" />;
  if (error) return <ErrorScreen message={error} onRetry={() => load()} />;
  if (!progress) return null;

  const pct = Math.min(100, Math.max(0, progress.completionPercent ?? 0));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(true);
          }}
        />
      }
    >
      <Text style={styles.sectionTitle}>Quran Progress</Text>

      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      <Text style={styles.pctLabel}>{pct.toFixed(1)}% complete</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Assigned" value={progress.pagesAssigned} color="#1B4F72" />
        <StatCard label="Completed" value={progress.pagesCompleted} color="#059669" />
        <StatCard label="In Progress" value={progress.pagesInProgress ?? 0} color="#D97706" />
        <StatCard label="Not Started" value={progress.pagesNotStarted ?? 0} color="#6B7280" />
      </View>

      {progress.snapshotUpdatedAt && (
        <Text style={styles.updatedAt}>
          Last updated {new Date(progress.snapshotUpdatedAt).toLocaleString()}
        </Text>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B4F72',
    marginBottom: 16,
  },
  progressBarTrack: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1B4F72',
    borderRadius: 6,
  },
  pctLabel: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 32, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 13, color: '#6B7280' },
  updatedAt: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
});
