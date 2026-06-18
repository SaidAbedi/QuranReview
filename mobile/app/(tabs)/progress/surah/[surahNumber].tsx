import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getSurahProgress } from '@/api/progress';
import { useTheme } from '@/hooks/useTheme';
import { getSurahInfo } from '@/constants/quranData';
import type { PageProgressItem, SurahProgressDetail } from '@/types/api';
import { STATUS_LABELS, focusPercent } from '@/utils/progressUtils';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

function PageRow({ page }: { page: PageProgressItem }) {
  const theme = useTheme();
  const T = theme.colors;
  const label = STATUS_LABELS[page.status] ?? page.status;
  const chip  = theme.chips[page.status as keyof typeof theme.chips];
  const color = chip?.text ?? T.textMuted;
  const bg    = chip?.bg   ?? T.backgroundAlt;
  const isCompleted = page.status === 'completed';

  return (
    <View style={styles.pageRow}>
      <View style={[styles.pageDot, { backgroundColor: color }]} />
      <View style={styles.pageInfo}>
        <Text style={[styles.pageNum, { color: T.textPrimary }]}>Page {page.pageNumber}</Text>
        {page.attemptCount > 0 && (
          <Text style={[styles.pageMeta, { color: T.textMuted }]}>
            {page.attemptCount} attempt{page.attemptCount !== 1 ? 's' : ''}
            {isCompleted && page.completedAt
              ? ` · Completed ${new Date(page.completedAt).toLocaleDateString()}`
              : ''}
          </Text>
        )}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: bg }]}>
        <Text style={[styles.statusText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

export default function SurahDetailScreen() {
  const { surahNumber } = useLocalSearchParams<{ surahNumber: string }>();
  const surahNum = parseInt(surahNumber, 10);
  const surahInfo = getSurahInfo(surahNum);
  const theme = useTheme();
  const T = theme.colors;

  const [detail, setDetail]   = useState<SurahProgressDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getSurahProgress(surahNum));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load surah progress');
    } finally {
      setLoading(false);
    }
  }, [surahNum]);

  useEffect(() => { load(); }, [load]);

  const displayName = detail?.surahName ?? surahInfo.nameTransliterated;
  const pct = detail ? focusPercent(detail.pagesCompleted, detail.totalPagesInSurah) : 0;

  return (
    <>
      <Stack.Screen options={{ title: displayName }} />

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={T.brandPrimary} size="large" />
        </View>
      )}

      {error && <ErrorScreen message={error} onRetry={load} />}

      {!loading && !error && detail && (
        <ScrollView style={[styles.container, { backgroundColor: T.backgroundAlt }]} contentContainerStyle={styles.content}>
          {/* Header summary */}
          <View style={[styles.summaryCard, { backgroundColor: T.surface, shadowColor: T.shadow }]}>
            <Text style={[styles.summaryName, { color: T.textPrimary }]}>{displayName}</Text>
            <Text style={[styles.summaryMeaning, { color: T.textMuted }]}>{surahInfo.nameEnglish}</Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: T.success }]}>{detail.pagesCompleted}</Text>
                <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Completed</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: T.brandPrimary }]}>{detail.pagesAssigned}</Text>
                <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Assigned</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: T.textMuted }]}>{detail.totalPagesInSurah}</Text>
                <Text style={[styles.summaryLabel, { color: T.textMuted }]}>Total Pages</Text>
              </View>
            </View>
            <View style={[styles.barTrack, { backgroundColor: T.border }]}>
              <View
                style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: pct === 100 ? T.success : T.brandPrimary }]}
              />
            </View>
            <Text style={[styles.barLabel, { color: T.textMuted }]}>{pct}% of assigned pages complete</Text>
          </View>

          {/* Page list */}
          {detail.pages.length === 0 ? (
            <Text style={[styles.empty, { color: T.textMuted }]}>No pages assigned in this surah yet.</Text>
          ) : (
            <View>
              <Text style={[styles.listHeader, { color: T.textMuted }]}>Pages</Text>
              <View style={[styles.listCard, { backgroundColor: T.surface, shadowColor: T.shadow }]}>
                {detail.pages.map((p, i) => (
                  <View key={p.pageNumber}>
                    {i > 0 && <View style={[styles.divider, { backgroundColor: T.border }]} />}
                    <PageRow page={p} />
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content:   { padding: 16, paddingBottom: 32 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  summaryName:    { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  summaryMeaning: { fontSize: 13, marginBottom: 14 },
  summaryStats:   { flexDirection: 'row', marginBottom: 14 },
  summaryStat:    { flex: 1, alignItems: 'center' },
  summaryNum:     { fontSize: 28, fontWeight: '800' },
  summaryLabel:   { fontSize: 11, marginTop: 2 },
  barTrack:       { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barFill:        { height: 8, borderRadius: 4 },
  barLabel:       { fontSize: 12 },

  listHeader: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  listCard:   {
    borderRadius: 14,
    overflow: 'hidden',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },

  pageRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  pageDot:     { width: 10, height: 10, borderRadius: 5 },
  pageInfo:    { flex: 1 },
  pageNum:     { fontSize: 14, fontWeight: '600' },
  pageMeta:    { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  empty: { fontSize: 14, textAlign: 'center', marginTop: 32 },
});
