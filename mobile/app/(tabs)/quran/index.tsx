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
import { SURAHS, surahForPage, juzForPage, type SurahMeta } from '@/constants/surahs';
import { getRecentPages } from '@/lib/recentPages';

// ── Per-surah status derived from a student's assignments ─────────────────────
// "Needs attention" statuses sort to the top and show a coloured circle badge.

type StatusKey = 'needs_resubmission' | 'reviewed' | 'submitted' | 'completed';

const STATUS_META: Record<StatusKey, { priority: number; colorKey: 'error' | 'info' | 'warning' | 'success'; label: string; attention: boolean }> = {
  needs_resubmission: { priority: 4, colorKey: 'error',   label: 'Needs Practice',  attention: true  },
  reviewed:           { priority: 3, colorKey: 'info',    label: 'Feedback Ready',  attention: true  },
  submitted:          { priority: 2, colorKey: 'warning', label: 'Under Review',    attention: false },
  completed:          { priority: 1, colorKey: 'success', label: 'Completed',       attention: false },
};

// Map a raw assignment/submission status onto our compact StatusKey.
function normalizeStatus(raw: string): StatusKey | null {
  if (raw === 'needs_resubmission') return 'needs_resubmission';
  if (raw === 'reviewed') return 'reviewed';
  if (raw === 'submitted' || raw === 'in_review') return 'submitted';
  if (raw === 'completed') return 'completed';
  return null;
}

interface SurahRowData extends SurahMeta {
  status: StatusKey | null;
  percent: number; // 0–100 completion
}

// ── Search bar ────────────────────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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

// ── Recently read strip ───────────────────────────────────────────────────────

function RecentlyRead({
  pages,
  onPress,
}: {
  pages: number[];
  onPress: (page: number) => void;
}) {
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
              <Text style={[rr.cardSurah, { color: T.textPrimary }]} numberOfLines={1}>
                {surah.english}
              </Text>
              <Text style={[rr.cardJuz, { color: T.textMuted }]}>Juz {juzForPage(page)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Surah row ─────────────────────────────────────────────────────────────────

function SurahRow({ item, onPress }: { item: SurahRowData; onPress: () => void }) {
  const { colors: T } = useTheme();
  const meta = item.status ? STATUS_META[item.status] : null;
  const badgeColor = meta ? T[meta.colorKey] : undefined;

  return (
    <TouchableOpacity style={[row.container, { backgroundColor: T.surface }]} onPress={onPress} activeOpacity={0.7}>
      {/* Number medallion + attention badge */}
      <View style={row.numWrap}>
        <View style={[
          row.numCircle,
          { backgroundColor: T.brandPrimarySoft },
          meta?.attention ? { borderWidth: 2, borderColor: badgeColor } : undefined,
        ]}>
          <Text style={[row.num, { color: T.brandPrimary }]}>{item.number}</Text>
        </View>
        {meta?.attention && (
          <View style={[row.badge, { backgroundColor: badgeColor, borderColor: T.surface }]} />
        )}
      </View>

      {/* Names + meta */}
      <View style={row.meta}>
        <Text style={[row.arabic, { color: T.textPrimary }]} numberOfLines={1}>{item.arabic}</Text>
        <Text style={[row.latin, { color: T.textMuted }]} numberOfLines={1}>
          {item.english} · Juz {juzForPage(item.startPage)} · {item.ayahs} ayahs
        </Text>

        {/* Progress bar (only when there is progress) */}
        {item.percent > 0 && (
          <View style={row.progressRow}>
            <View style={[row.track, { backgroundColor: T.surfaceSunken }]}>
              <View style={[row.fill, { width: `${item.percent}%`, backgroundColor: badgeColor ?? T.success }]} />
            </View>
            <Text style={[row.percent, { color: T.textMuted }]}>{item.percent}%</Text>
          </View>
        )}
      </View>

      <Text style={[row.chevron, { color: T.textDisabled }]}>›</Text>
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

  useFocusEffect(
    useCallback(() => {
      getStudentAssignments().then(setAssignments).catch(() => {});
      getStudentProgress().then(setProgress).catch(() => {});
      getRecentPages().then(setRecent).catch(() => {});
    }, []),
  );

  // surahNumber → most urgent status, from assignments mapped by page.
  const statusBySurah = useMemo(() => {
    const map = new Map<number, StatusKey>();
    for (const a of assignments) {
      if (a.pageNumber == null) continue;
      const key = normalizeStatus(a.status);
      if (!key) continue;
      const surahNum = surahForPage(a.pageNumber).number;
      const existing = map.get(surahNum);
      if (!existing || STATUS_META[key].priority > STATUS_META[existing].priority) {
        map.set(surahNum, key);
      }
    }
    return map;
  }, [assignments]);

  // surahNumber → completion percent, from progress snapshot.
  const percentBySurah = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of progress?.surahBreakdown ?? []) {
      if (s.totalPagesInSurah > 0) {
        map.set(s.surahNumber, Math.round((s.pagesCompleted / s.totalPagesInSurah) * 100));
      }
    }
    return map;
  }, [progress]);

  // Build, filter, and sort the surah rows.
  const rows = useMemo<SurahRowData[]>(() => {
    const q = query.trim().toLowerCase();

    const enriched: SurahRowData[] = SURAHS.map((s) => ({
      ...s,
      status: statusBySurah.get(s.number) ?? null,
      percent: percentBySurah.get(s.number) ?? 0,
    }));

    const filtered = q
      ? enriched.filter((s) => {
          const asNum = Number(q);
          if (!Number.isNaN(asNum)) {
            // Numeric query matches surah number or a page within the surah's start.
            return s.number === asNum || s.startPage === asNum;
          }
          return (
            s.english.toLowerCase().includes(q) ||
            s.arabic.includes(query.trim())
          );
        })
      : enriched;

    // Needs-attention surahs first (by priority), then by surah number.
    return filtered.sort((a, b) => {
      const ap = a.status && STATUS_META[a.status].attention ? STATUS_META[a.status].priority : 0;
      const bp = b.status && STATUS_META[b.status].attention ? STATUS_META[b.status].priority : 0;
      if (ap !== bp) return bp - ap;
      return a.number - b.number;
    });
  }, [query, statusBySurah, percentBySurah]);

  const goToPage = (page: number) =>
    router.push({ pathname: '/(tabs)/quran/[pageNumber]', params: { pageNumber: String(page) } });

  // If the query is a valid page number, offer a direct jump.
  const pageJump = useMemo(() => {
    const n = Number(query.trim());
    if (!Number.isNaN(n) && n >= 1 && n <= 604) return n;
    return null;
  }, [query]);

  return (
    <View style={[styles.container, { backgroundColor: T.backgroundAlt }]}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.number)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: T.divider }]} />}
        ListHeaderComponent={
          <View>
            <View style={styles.searchWrap}>
              <SearchBar value={query} onChange={setQuery} />
            </View>

            {query.length === 0 && <RecentlyRead pages={recent} onPress={goToPage} />}

            {pageJump != null && (
              <TouchableOpacity
                style={[styles.jump, { backgroundColor: T.brandPrimarySoft }]}
                onPress={() => goToPage(pageJump)}
                activeOpacity={0.8}
              >
                <Text style={[styles.jumpText, { color: T.brandPrimary }]}>
                  Go to page {pageJump} →
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.sectionLabel, { color: T.textMuted }]}>
              {query.length === 0 ? 'ALL SURAHS' : `${rows.length} RESULT${rows.length === 1 ? '' : 'S'}`}
            </Text>
          </View>
        }
        renderItem={({ item }) => <SurahRow item={item} onPress={() => goToPage(item.startPage)} />}
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
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  jump: { marginHorizontal: 16, marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  jumpText: { fontSize: 14, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});

const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },
});

const rr = StyleSheet.create({
  wrap: { paddingTop: 12 },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 8 },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 120, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 2 },
  cardPage: { fontSize: 13, fontWeight: '700' },
  cardSurah: { fontSize: 14, fontWeight: '600' },
  cardJuz: { fontSize: 11 },
});

const row = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  numWrap: { width: 44, height: 44 },
  numCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 15, fontWeight: '700' },
  badge: { position: 'absolute', top: -1, right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  meta: { flex: 1, gap: 3 },
  arabic: { fontSize: 17, fontWeight: '600', writingDirection: 'rtl' },
  latin: { fontSize: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  percent: { fontSize: 11, fontWeight: '600', minWidth: 32, textAlign: 'right' },
  chevron: { fontSize: 22, fontWeight: '300' },
});
