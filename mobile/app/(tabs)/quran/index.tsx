import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { getStudentAssignments } from '@/api/assignments';
import { getStudentProgress } from '@/api/progress';
import type { AssignmentSummary, StudentProgressSummary } from '@/types/api';
import {
  SURAHS,
  surahForPage,
  juzForPage,
  juzPageRange,
  JUZ_START_PAGES,
  type SurahMeta,
} from '@/constants/surahs';
import { getRecentPages } from '@/lib/recentPages';

// ── Per-surah status derived from a student's assignments ─────────────────────

type StatusKey = 'needs_resubmission' | 'reviewed' | 'submitted' | 'pending' | 'completed';
type ColorKey = 'error' | 'info' | 'warning' | 'brandPrimary' | 'success';

const STATUS_META: Record<StatusKey, { priority: number; colorKey: ColorKey; label: string }> = {
  needs_resubmission: { priority: 5, colorKey: 'error',        label: 'Needs Attention' },
  reviewed:           { priority: 4, colorKey: 'info',         label: 'Feedback Ready'  },
  submitted:          { priority: 3, colorKey: 'warning',      label: 'Under Review'    },
  pending:            { priority: 2, colorKey: 'brandPrimary', label: 'Pending'         },
  completed:          { priority: 1, colorKey: 'success',      label: 'Completed'       },
};

function normalizeStatus(raw: string): StatusKey | null {
  if (raw === 'needs_resubmission') return 'needs_resubmission';
  if (raw === 'reviewed') return 'reviewed';
  if (raw === 'submitted' || raw === 'in_review') return 'submitted';
  if (raw === 'completed') return 'completed';
  if (raw === 'assigned' || raw === 'draft') return 'pending';
  return null;
}

// ── Chapters-tab list model: juz headers interleaved with surah rows ──────────

type ListItem =
  | { type: 'juzHeader'; juz: number; key: string }
  | { type: 'surah'; surah: SurahMeta; status: StatusKey | null; percent: number; key: string };

// ── Search bar ────────────────────────────────────────────────────────────────

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors: T } = useTheme();
  return (
    <View style={[sb.wrap, { backgroundColor: T.surfaceSunken, borderColor: T.border }]}>
      <MagnifyingGlass size={18} color={T.textMuted} weight="bold" />
      <TextInput
        style={[sb.input, { color: T.textPrimary }]}
        value={value}
        onChangeText={onChange}
        placeholder="Search surah, number, or page…"
        placeholderTextColor={T.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={8}>
          <X size={16} color={T.textMuted} weight="bold" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Recently read ─────────────────────────────────────────────────────────────

function RecentlyRead({ pages, onPress }: { pages: number[]; onPress: (page: number) => void }) {
  const { colors: T } = useTheme();
  if (pages.length === 0) return null;
  return (
    <View style={rr.wrap}>
      <Text style={[rr.heading, { color: T.textMuted }]}>RECENTLY READ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rr.row}>
        {pages.map((page) => {
          const surah = surahForPage(page);
          return (
            <TouchableOpacity
              key={page}
              style={[rr.card, { backgroundColor: T.surface, borderColor: T.border }]}
              onPress={() => onPress(page)}
              activeOpacity={0.75}
            >
              <Text style={[rr.cardPage, { color: T.brandPrimary }]}>Page {page}</Text>
              <Text style={[rr.cardSurah, { color: T.textPrimary }]} numberOfLines={1}>{surah.english}</Text>
              <Text style={[rr.cardJuz, { color: T.textMuted }]}>Juz {juzForPage(page)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Segmented tabs ────────────────────────────────────────────────────────────

function Tabs({ tab, onChange }: { tab: 'chapters' | 'juz'; onChange: (t: 'chapters' | 'juz') => void }) {
  const { colors: T } = useTheme();
  const options: Array<{ key: 'chapters' | 'juz'; label: string }> = [
    { key: 'chapters', label: 'Chapters' },
    { key: 'juz', label: 'Juz' },
  ];
  return (
    <View style={[tb.wrap, { backgroundColor: T.surfaceSunken }]}>
      {options.map((o) => {
        const active = tab === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[tb.pill, active && { backgroundColor: T.brandPrimary }]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
          >
            <Text style={[tb.pillText, { color: active ? T.brandOnPrimary : T.textMuted }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Surah row (Tarteel style) ─────────────────────────────────────────────────

function SurahRow({ surah, status, percent, onPress }: {
  surah: SurahMeta; status: StatusKey | null; percent: number; onPress: () => void;
}) {
  const { colors: T } = useTheme();
  const meta = status ? STATUS_META[status] : null;
  const statusColor = meta ? T[meta.colorKey] : undefined;

  return (
    <TouchableOpacity
      style={[row.wrap, { backgroundColor: T.surface, borderBottomColor: T.divider }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* status accent bar */}
      <View style={[row.accent, { backgroundColor: statusColor ?? 'transparent' }]} />

      {/* number */}
      <Text style={[row.number, { color: T.brandPrimary }]}>{surah.number}</Text>

      {/* english + meta */}
      <View style={row.mid}>
        <Text style={[row.english, { color: T.textPrimary }]} numberOfLines={1}>{surah.english}</Text>
        <Text style={[row.sub, { color: T.textMuted }]}>Juz {juzForPage(surah.startPage)} · {surah.ayahs} ayahs</Text>
        {meta && (
          <View style={[row.statusPill, { backgroundColor: (statusColor ?? T.textMuted) + '22' }]}>
            <View style={[row.dot, { backgroundColor: statusColor }]} />
            <Text style={[row.statusText, { color: statusColor }]}>{meta.label}</Text>
          </View>
        )}
      </View>

      {/* arabic */}
      <Text style={[row.arabic, { color: T.textPrimary }]} numberOfLines={1}>{surah.arabic}</Text>

      {/* progress underline */}
      {percent > 0 && (
        <View style={row.progressTrack}>
          <View style={[row.progressFill, { width: `${percent}%`, backgroundColor: T.success }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Juz header (divider inside chapters list) ─────────────────────────────────

function JuzHeader({ juz }: { juz: number }) {
  const { colors: T } = useTheme();
  return (
    <View style={[jh.wrap, { backgroundColor: T.backgroundAlt }]}>
      <Text style={[jh.text, { color: T.textMuted }]}>Juz {juz}</Text>
      <View style={[jh.line, { backgroundColor: T.divider }]} />
    </View>
  );
}

// ── Juz row (Juz tab) ─────────────────────────────────────────────────────────

function JuzRow({ juz, percent, onPress }: { juz: number; percent: number; onPress: () => void }) {
  const { colors: T } = useTheme();
  const [start, end] = juzPageRange(juz);
  return (
    <TouchableOpacity
      style={[row.wrap, { backgroundColor: T.surface, borderBottomColor: T.divider }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[row.number, { color: T.brandPrimary }]}>{juz}</Text>
      <View style={row.mid}>
        <Text style={[row.english, { color: T.textPrimary }]}>Juz {juz}</Text>
        <Text style={[row.sub, { color: T.textMuted }]}>Pages {start}–{end}</Text>
      </View>
      <Text style={[row.chevron, { color: T.textDisabled }]}>›</Text>
      {percent > 0 && (
        <View style={row.progressTrack}>
          <View style={[row.progressFill, { width: `${percent}%`, backgroundColor: T.success }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function QuranBrowserScreen() {
  const router = useRouter();
  const { colors: T } = useTheme();

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [progress, setProgress] = useState<StudentProgressSummary | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'chapters' | 'juz'>('chapters');

  useFocusEffect(
    useCallback(() => {
      getStudentAssignments().then(setAssignments).catch(() => {});
      getStudentProgress().then(setProgress).catch(() => {});
      getRecentPages().then(setRecent).catch(() => {});
    }, []),
  );

  const statusBySurah = useMemo(() => {
    const map = new Map<number, StatusKey>();
    for (const a of assignments) {
      if (a.pageNumber == null) continue;
      const key = normalizeStatus(a.status);
      if (!key) continue;
      const surahNum = surahForPage(a.pageNumber).number;
      const existing = map.get(surahNum);
      if (!existing || STATUS_META[key].priority > STATUS_META[existing].priority) map.set(surahNum, key);
    }
    return map;
  }, [assignments]);

  const percentBySurah = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of progress?.surahBreakdown ?? []) {
      if (s.totalPagesInSurah > 0) map.set(s.surahNumber, Math.round((s.pagesCompleted / s.totalPagesInSurah) * 100));
    }
    return map;
  }, [progress]);

  const percentByJuz = useMemo(() => {
    const map = new Map<number, number>();
    for (const j of progress?.juzBreakdown ?? []) {
      if (j.totalPagesInJuz > 0) map.set(j.juzNumber, Math.round((j.pagesCompleted / j.totalPagesInJuz) * 100));
    }
    return map;
  }, [progress]);

  const q = query.trim().toLowerCase();

  // Chapters tab: merge juz-start events and surah-start events, ordered by page
  // (juz header before a surah that starts on the same page). Searching flattens
  // to matching surahs only (no juz separators).
  const chapterItems = useMemo<ListItem[]>(() => {
    if (q) {
      return SURAHS.filter((s) => {
        const n = Number(q);
        if (!Number.isNaN(n)) return s.number === n || s.startPage === n;
        return s.english.toLowerCase().includes(q) || s.arabic.includes(query.trim());
      }).map((s) => ({
        type: 'surah' as const,
        surah: s,
        status: statusBySurah.get(s.number) ?? null,
        percent: percentBySurah.get(s.number) ?? 0,
        key: `s${s.number}`,
      }));
    }

    type Ev = { page: number; order: number; juz?: number; surah?: SurahMeta };
    const events: Ev[] = [
      ...JUZ_START_PAGES.map((page, i) => ({ page, order: 0, juz: i + 1 })),
      ...SURAHS.map((s) => ({ page: s.startPage, order: 1, surah: s })),
    ].sort((a, b) => (a.page - b.page) || (a.order - b.order));

    return events.map((e): ListItem =>
      e.juz != null
        ? { type: 'juzHeader', juz: e.juz, key: `j${e.juz}` }
        : {
            type: 'surah',
            surah: e.surah!,
            status: statusBySurah.get(e.surah!.number) ?? null,
            percent: percentBySurah.get(e.surah!.number) ?? 0,
            key: `s${e.surah!.number}`,
          },
    );
  }, [q, query, statusBySurah, percentBySurah]);

  const juzItems = useMemo(() => {
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    const filtered = q ? all.filter((j) => String(j).includes(q)) : all;
    return filtered.map((juz) => ({ juz, percent: percentByJuz.get(juz) ?? 0 }));
  }, [q, percentByJuz]);

  const goToPage = (page: number) =>
    router.push({ pathname: '/(tabs)/quran/[pageNumber]', params: { pageNumber: String(page) } });

  // Direct jump when the query is a valid page number (1–604).
  const pageJump = useMemo(() => {
    const n = Number(query.trim());
    return !Number.isNaN(n) && n >= 1 && n <= 604 ? n : null;
  }, [query]);

  const header = (
    <View>
      <View style={styles.searchWrap}><SearchBar value={query} onChange={setQuery} /></View>
      {q.length === 0 && <RecentlyRead pages={recent} onPress={goToPage} />}
      {pageJump != null && (
        <TouchableOpacity
          style={[styles.jump, { backgroundColor: T.brandPrimarySoft }]}
          onPress={() => goToPage(pageJump)}
          activeOpacity={0.8}
        >
          <Text style={[styles.jumpText, { color: T.brandPrimary }]}>Go to page {pageJump} →</Text>
        </TouchableOpacity>
      )}
      <View style={styles.tabsWrap}><Tabs tab={tab} onChange={setTab} /></View>
    </View>
  );

  if (tab === 'juz') {
    return (
      <View style={[styles.container, { backgroundColor: T.backgroundAlt }]}>
        <FlatList
          data={juzItems}
          keyExtractor={(it) => `j${it.juz}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <JuzRow juz={item.juz} percent={item.percent} onPress={() => goToPage(juzPageRange(item.juz)[0])} />
          )}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: T.backgroundAlt }]}>
      <FlatList
        data={chapterItems}
        keyExtractor={(it) => it.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          item.type === 'juzHeader' ? (
            <JuzHeader juz={item.juz} />
          ) : (
            <SurahRow
              surah={item.surah}
              status={item.status}
              percent={item.percent}
              onPress={() => goToPage(item.surah.startPage)}
            />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: T.textMuted }]}>No surahs match “{query}”.</Text>
          </View>
        }
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingBottom: 32 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  tabsWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  jump: { marginHorizontal: 16, marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  jumpText: { fontSize: 14, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});

const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },
});

const rr = StyleSheet.create({
  wrap: { paddingTop: 12 },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 8 },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 130, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 2 },
  cardPage: { fontSize: 13, fontWeight: '700' },
  cardSurah: { fontSize: 14, fontWeight: '600' },
  cardJuz: { fontSize: 11 },
});

const tb = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  pillText: { fontSize: 14, fontWeight: '700' },
});

const jh = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, gap: 14,
    overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  number: { width: 30, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  mid: { flex: 1, gap: 3 },
  english: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 12.5 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  arabic: { fontSize: 22, fontWeight: '600', writingDirection: 'rtl', maxWidth: 140, textAlign: 'right' },
  chevron: { fontSize: 22, fontWeight: '300' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  progressFill: { position: 'absolute', left: 0, height: 3 },
});
