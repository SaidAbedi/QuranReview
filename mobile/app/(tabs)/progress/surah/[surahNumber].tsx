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
import { C } from '@/constants/colors';
import { getSurahInfo } from '@/constants/quranData';
import type { PageProgressItem, SurahProgressDetail } from '@/types/api';
import { STATUS_BG_COLORS, STATUS_COLORS, STATUS_LABELS, focusPercent } from '@/utils/progressUtils';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

function PageRow({ page }: { page: PageProgressItem }) {
  const label = STATUS_LABELS[page.status]   ?? page.status;
  const color = STATUS_COLORS[page.status]   ?? C.gray;
  const bg    = STATUS_BG_COLORS[page.status] ?? C.grayBg;
  const isCompleted = page.status === 'completed';

  return (
    <View style={styles.pageRow}>
      <View style={[styles.pageDot, { backgroundColor: color }]} />
      <View style={styles.pageInfo}>
        <Text style={styles.pageNum}>Page {page.pageNumber}</Text>
        {page.attemptCount > 0 && (
          <Text style={styles.pageMeta}>
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
          <ActivityIndicator color={C.blue} size="large" />
        </View>
      )}

      {error && <ErrorScreen message={error} onRetry={load} />}

      {!loading && !error && detail && (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {/* Header summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryName}>{displayName}</Text>
            <Text style={styles.summaryMeaning}>{surahInfo.nameEnglish}</Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: C.green }]}>{detail.pagesCompleted}</Text>
                <Text style={styles.summaryLabel}>Completed</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: C.blue }]}>{detail.pagesAssigned}</Text>
                <Text style={styles.summaryLabel}>Assigned</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryNum, { color: C.textMuted }]}>{detail.totalPagesInSurah}</Text>
                <Text style={styles.summaryLabel}>Total Pages</Text>
              </View>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[styles.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: pct === 100 ? C.green : C.blue }]}
              />
            </View>
            <Text style={styles.barLabel}>{pct}% of assigned pages complete</Text>
          </View>

          {/* Page list */}
          {detail.pages.length === 0 ? (
            <Text style={styles.empty}>No pages assigned in this surah yet.</Text>
          ) : (
            <View>
              <Text style={styles.listHeader}>Pages</Text>
              <View style={styles.listCard}>
                {detail.pages.map((p, i) => (
                  <View key={p.pageNumber}>
                    {i > 0 && <View style={styles.divider} />}
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
  container: { flex: 1, backgroundColor: C.surface },
  content:   { padding: 16, paddingBottom: 32 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  summaryName:    { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 2 },
  summaryMeaning: { fontSize: 13, color: C.textMuted, marginBottom: 14 },
  summaryStats:   { flexDirection: 'row', marginBottom: 14 },
  summaryStat:    { flex: 1, alignItems: 'center' },
  summaryNum:     { fontSize: 28, fontWeight: '800' },
  summaryLabel:   { fontSize: 11, color: C.textMuted, marginTop: 2 },
  barTrack:       { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barFill:        { height: 8, borderRadius: 4 },
  barLabel:       { fontSize: 12, color: C.textMuted },

  listHeader: { fontSize: 13, fontWeight: '700', color: C.textMuted, marginBottom: 8 },
  listCard:   {
    backgroundColor: C.white,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 46 },

  pageRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  pageDot:     { width: 10, height: 10, borderRadius: 5 },
  pageInfo:    { flex: 1 },
  pageNum:     { fontSize: 14, fontWeight: '600', color: C.text },
  pageMeta:    { fontSize: 12, color: C.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  empty: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 32 },
});
