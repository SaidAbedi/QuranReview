import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getStudentProgress } from '@/api/progress';
import { C } from '@/constants/colors';
import { getSurahName } from '@/constants/quranData';
import type { JuzSnapshotEntry, StudentProgressSummary, SurahSnapshotEntry } from '@/types/api';
import {
  CurrentFocus,
  deriveCurrentFocus,
  encouragingMessage,
  focusPercent,
} from '@/utils/progressUtils';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// ─── Shared primitives ────────────────────────────────────────────────────────

function ProgressBar({
  percent,
  color = C.blue,
  height = 8,
}: {
  percent: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <View style={[bar.track, { height }]}>
      <View style={[bar.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color, height }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  fill:  { borderRadius: 4 },
});

// ─── A. Current Focus card ────────────────────────────────────────────────────

function CurrentFocusCard({ focus }: { focus: CurrentFocus }) {
  if (focus.type === 'no_assignments') {
    return (
      <View style={[styles.focusCard, { borderLeftColor: C.grayLight }]}>
        <Text style={styles.focusChip}>Getting Started</Text>
        <Text style={styles.focusTitle}>Waiting for Assignment</Text>
        <Text style={styles.focusSub}>Your teacher will assign your first page soon.</Text>
      </View>
    );
  }

  if (focus.type === 'all_done') {
    return (
      <View style={[styles.focusCard, { borderLeftColor: C.green }]}>
        <Text style={[styles.focusChip, { color: C.green }]}>Well done!</Text>
        <Text style={styles.focusTitle}>All pages complete!</Text>
        <Text style={styles.focusSub}>Waiting for your next assignment.</Text>
      </View>
    );
  }

  let title = '';
  let completed = 0;
  let assigned  = 0;

  if (focus.type === 'juz') {
    title     = `Juz ${focus.juzNumber}`;
    completed = focus.pagesCompleted;
    assigned  = focus.pagesAssigned;
  } else if (focus.type === 'surah') {
    title     = getSurahName(focus.surahNumber);
    completed = focus.pagesCompleted;
    assigned  = focus.pagesAssigned;
  } else {
    title     = 'Assigned Pages';
    completed = focus.pagesCompleted;
    assigned  = focus.pagesAssigned;
  }

  const pct = focusPercent(completed, assigned);
  const msg = encouragingMessage(completed, assigned);

  return (
    <View style={[styles.focusCard, { borderLeftColor: C.gold }]}>
      <Text style={[styles.focusChip, { color: C.gold }]}>Current Focus</Text>
      <Text style={styles.focusTitle}>{title}</Text>
      <Text style={styles.focusSub}>
        {completed} of {assigned} assigned page{assigned !== 1 ? 's' : ''} completed
      </Text>
      <View style={styles.focusBarRow}>
        <View style={{ flex: 1 }}>
          <ProgressBar percent={pct} color={C.gold} height={6} />
        </View>
        <Text style={styles.focusPct}>{pct}%</Text>
      </View>
      <Text style={styles.focusMsg}>{msg}</Text>
    </View>
  );
}

// ─── B. Status cards ──────────────────────────────────────────────────────────

function StatusCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.statusCard, { backgroundColor: bg }]}>
      <Text style={[styles.statusValue, { color }]}>{value}</Text>
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ─── C. Juz row ───────────────────────────────────────────────────────────────

function JuzRow({ juz, onPress }: { juz: JuzSnapshotEntry; onPress: () => void }) {
  const pct      = focusPercent(juz.pagesCompleted, juz.pagesAssigned);
  const complete = juz.pagesAssigned > 0 && juz.pagesCompleted >= juz.pagesAssigned;
  return (
    <TouchableOpacity style={styles.drillRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.drillLeft}>
        <Text style={styles.drillTitle}>Juz {juz.juzNumber}</Text>
        <Text style={styles.drillSub}>
          {juz.pagesCompleted} / {juz.pagesAssigned} pages
        </Text>
        <View style={styles.drillBarWrap}>
          <ProgressBar percent={pct} color={complete ? C.green : C.gold} height={4} />
        </View>
      </View>
      <View style={styles.drillRight}>
        <Text style={[styles.drillPct, { color: complete ? C.green : C.gold }]}>{pct}%</Text>
        <Text style={styles.drillChev}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── D. Surah row ─────────────────────────────────────────────────────────────

function SurahRow({ surah, onPress }: { surah: SurahSnapshotEntry; onPress: () => void }) {
  const pct      = focusPercent(surah.pagesCompleted, surah.pagesAssigned);
  const complete = surah.pagesAssigned > 0 && surah.pagesCompleted >= surah.pagesAssigned;
  return (
    <TouchableOpacity style={styles.drillRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.drillLeft}>
        <Text style={styles.drillTitle}>
          {surah.surahNumber}. {getSurahName(surah.surahNumber)}
        </Text>
        <Text style={styles.drillSub}>
          {surah.pagesCompleted} / {surah.pagesAssigned} pages
        </Text>
        <View style={styles.drillBarWrap}>
          <ProgressBar percent={pct} color={complete ? C.green : C.blue} height={4} />
        </View>
      </View>
      <View style={styles.drillRight}>
        <Text style={[styles.drillPct, { color: complete ? C.green : C.blue }]}>{pct}%</Text>
        <Text style={styles.drillChev}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── E. Whole Quran card ──────────────────────────────────────────────────────

function WholeQuranCard({ progress }: { progress: StudentProgressSummary }) {
  const { pagesCompleted, totalPagesInQuran, overallCompletionPercent } = progress;
  const pct       = Math.min(100, Math.max(0, overallCompletionPercent ?? 0));
  const prominent = pagesCompleted >= 100;

  return (
    <View style={styles.quranCard}>
      <Text style={styles.quranTitle}>Your Quran Journey</Text>
      {pagesCompleted < 10 ? (
        <Text style={styles.quranHero}>
          {pagesCompleted} page{pagesCompleted !== 1 ? 's' : ''} completed so far
        </Text>
      ) : (
        <Text style={styles.quranHero}>
          {pagesCompleted} / {totalPagesInQuran} pages
        </Text>
      )}
      <ProgressBar percent={pct} color={C.blue} height={prominent ? 10 : 6} />
      {pagesCompleted >= 10 && (
        <Text style={styles.quranPct}>{pct.toFixed(1)}% of the Quran</Text>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const router = useRouter();
  const [progress, setProgress]   = useState<StudentProgressSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setProgress(await getStudentProgress());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load progress');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading)   return <LoadingScreen message="Loading progress…" />;
  if (error)     return <ErrorScreen message={error} onRetry={() => load()} />;
  if (!progress) return null;

  const focus = deriveCurrentFocus(progress);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
        />
      }
    >
      {/* A. Current Focus */}
      <CurrentFocusCard focus={focus} />

      {/* B. Status cards */}
      <View style={styles.statusRow}>
        <StatusCard
          label="Assigned"
          value={progress.pagesAssigned}
          color={C.blue}
          bg={C.blueBg}
        />
        <StatusCard
          label="Completed"
          value={progress.pagesCompleted}
          color={C.green}
          bg={C.greenBg}
        />
        <StatusCard
          label="Needs Practice"
          value={progress.pagesNeedsResubmission ?? 0}
          color={C.red}
          bg={C.redBg}
        />
      </View>

      {/* C. Juz Progress */}
      {progress.juzBreakdown.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Juz</Text>
          <View style={styles.sectionCard}>
            {progress.juzBreakdown.map((j, i) => (
              <View key={j.juzNumber}>
                {i > 0 && <View style={styles.divider} />}
                <JuzRow
                  juz={j}
                  onPress={() =>
                    router.push({
                      pathname: '/progress/juz/[juzNumber]',
                      params: { juzNumber: j.juzNumber },
                    })
                  }
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* D. Surah Progress */}
      {progress.surahBreakdown.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Surah</Text>
          <View style={styles.sectionCard}>
            {progress.surahBreakdown.map((s, i) => (
              <View key={s.surahNumber}>
                {i > 0 && <View style={styles.divider} />}
                <SurahRow
                  surah={s}
                  onPress={() =>
                    router.push({
                      pathname: '/progress/surah/[surahNumber]',
                      params: { surahNumber: s.surahNumber },
                    })
                  }
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* E. Whole Quran (secondary) */}
      <WholeQuranCard progress={progress} />

      {progress.calculatedAt && (
        <Text style={styles.updatedAt}>
          Updated {new Date(progress.calculatedAt).toLocaleDateString()}
        </Text>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  content:   { padding: 16, paddingBottom: 32 },

  // Focus card
  focusCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  focusChip:  { fontSize: 11, fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  focusTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  focusSub:   { fontSize: 14, color: C.textMuted, marginBottom: 12 },
  focusBarRow:{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  focusPct:   { fontSize: 14, fontWeight: '700', color: C.gold, minWidth: 36, textAlign: 'right' },
  focusMsg:   { fontSize: 13, color: C.textMuted, fontStyle: 'italic' },

  // Status cards
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statusCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statusValue: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  statusLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // Sections
  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },
  sectionCard:  {
    backgroundColor: C.white,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 16 },

  // Drill-down rows
  drillRow:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  drillLeft:   { flex: 1 },
  drillTitle:  { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  drillSub:    { fontSize: 12, color: C.textMuted, marginBottom: 6 },
  drillBarWrap:{ marginTop: 2 },
  drillRight:  { alignItems: 'flex-end', gap: 4 },
  drillPct:    { fontSize: 13, fontWeight: '700' },
  drillChev:   { fontSize: 20, color: C.grayLight },

  // Whole Quran card
  quranCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  quranTitle: { fontSize: 12, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  quranHero:  { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 10 },
  quranPct:   { fontSize: 13, color: C.textMuted, marginTop: 6 },

  updatedAt: { fontSize: 11, color: C.textLight, textAlign: 'center', marginTop: 4 },
});
