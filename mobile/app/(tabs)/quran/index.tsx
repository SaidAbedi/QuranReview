import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { getStudentAssignments } from '@/api/assignments';
import type { AssignmentSummary } from '@/types/api';

// ── Status dot config ────────────────────────────────────────────────────────
// Colors are resolved at render time from theme tokens — see STATUS_DOT_KEY below.

type StatusDotKey = 'error' | 'info' | 'warning' | 'success';

const STATUS_DOT_KEY: Record<string, { key: StatusDotKey; label: string }> = {
  needs_resubmission: { key: 'error',   label: 'Practice needed' },
  reviewed:           { key: 'info',    label: 'Feedback ready'  },
  submitted:          { key: 'warning', label: 'Under review'    },
  in_review:          { key: 'warning', label: 'Under review'    },
  completed:          { key: 'success', label: 'Completed'       },
};

// ── Static page list (pages 1–20, Hafs Uthmani) ─────────────────────────────

const PAGES = Array.from({ length: 20 }, (_, i) => {
  const pageNumber = i + 1;
  return {
    pageNumber,
    surahName:   pageNumber === 1 ? 'Al-Fatiha' : 'Al-Baqarah',
    surahArabic: pageNumber === 1 ? 'الفاتحة' : 'البقرة',
    juz: 1,
  };
});

// ── My Pages strip ───────────────────────────────────────────────────────────

function MyPagesStrip({
  assignments,
  onPress,
}: {
  assignments: AssignmentSummary[];
  onPress: (a: AssignmentSummary) => void;
}) {
  const theme = useTheme();
  const T = theme.colors;

  if (assignments.length === 0) return null;

  return (
    <View style={[strip.wrapper, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
      <Text style={[strip.heading, { color: T.textMuted }]}>MY PAGES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={strip.row}>
        {assignments.map((a) => {
          const dotEntry = STATUS_DOT_KEY[a.status];
          const dotColor = dotEntry ? T[dotEntry.key] : undefined;
          return (
            <TouchableOpacity key={a.id} style={strip.chip} onPress={() => onPress(a)} activeOpacity={0.75}>
              <View style={[strip.chipInner, { backgroundColor: T.brandPrimarySoft }]}>
                <Text style={[strip.chipPage, { color: T.brandPrimary }]}>{a.pageNumber ?? '—'}</Text>
                {dotColor && (
                  <View style={[strip.dot, { backgroundColor: dotColor, borderColor: T.surface }]} />
                )}
              </View>
              <Text style={[strip.chipSurah, { color: T.textMuted }]} numberOfLines={1}>
                {a.surahNameEnglish ?? ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Page row ─────────────────────────────────────────────────────────────────

function PageRow({
  item,
  dotColor,
  onPress,
}: {
  item: (typeof PAGES)[number];
  dotColor?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  return (
    <TouchableOpacity style={[styles.row, { backgroundColor: T.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.pageNumWrap,
        { backgroundColor: T.brandPrimarySoft },
        dotColor ? { borderWidth: 2, borderColor: dotColor } : undefined,
      ]}>
        <Text style={[styles.pageNum, { color: T.brandPrimary }]}>{item.pageNumber}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={[styles.surahName, { color: T.textPrimary }]}>{item.surahArabic}</Text>
        <Text style={[styles.surahLatin, { color: T.textMuted }]}>
          {item.surahName} · Juz {item.juz}
        </Text>
      </View>
      {dotColor && <View style={[styles.statusDot, { backgroundColor: dotColor }]} />}
      <Text style={[styles.chevron, { color: T.textDisabled }]}>›</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function QuranBrowserScreen() {
  const router = useRouter();
  const theme = useTheme();
  const T = theme.colors;

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      getStudentAssignments().then(setAssignments).catch(() => {});
    }, []),
  );

  // Map page numbers to their dot color (resolved from theme at render time)
  const dotColorByPage = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of assignments) {
      if (a.pageNumber == null) continue;
      const entry = STATUS_DOT_KEY[a.status];
      if (entry) map.set(a.pageNumber, T[entry.key]);
    }
    return map;
  }, [assignments, T]);

  // Filter assignments that have a real page number for the strip
  const myPageAssignments = useMemo(
    () => assignments.filter((a) => a.pageNumber != null),
    [assignments],
  );

  const navigateToPage = (pageNumber: number) =>
    router.push({
      pathname: '/(tabs)/quran/[pageNumber]',
      params: { pageNumber: String(pageNumber) },
    });

  const navigateToAssignment = (a: AssignmentSummary) => {
    if (a.pageNumber != null) {
      navigateToPage(a.pageNumber);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: T.backgroundAlt }]}>
      <View style={[styles.header, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
        <Text style={[styles.headerTitle, { color: T.textPrimary }]}>Pages 1–20</Text>
        <Text style={[styles.headerSub, { color: T.textMuted }]}>Juz 1 · Madinah Mushaf</Text>
      </View>

      <MyPagesStrip assignments={myPageAssignments} onPress={navigateToAssignment} />

      <FlatList
        data={PAGES}
        keyExtractor={(item) => String(item.pageNumber)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: T.divider }]} />}
        renderItem={({ item }) => (
          <PageRow
            item={item}
            dotColor={dotColorByPage.get(item.pageNumber)}
            onPress={() => navigateToPage(item.pageNumber)}
          />
        )}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const strip = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
  },
  heading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  row: { paddingHorizontal: 12, gap: 8 },
  chip: {
    alignItems: 'center',
    width: 60,
    gap: 4,
  },
  chipInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPage: { fontSize: 18, fontWeight: '700' },
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  chipSurah: { fontSize: 10, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub:   { fontSize: 13, marginTop: 2 },

  list: { paddingVertical: 8 },
  sep:  { height: StyleSheet.hairlineWidth, marginLeft: 68 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },

  pageNumWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  pageNum: { fontSize: 16, fontWeight: '700' },

  rowMeta:   { flex: 1 },
  surahName: { fontSize: 18, fontWeight: '600', textAlign: 'left' },
  surahLatin:{ fontSize: 12, marginTop: 1 },

  statusDot: { width: 10, height: 10, borderRadius: 5 },
  chevron:   { fontSize: 22, fontWeight: '300' },
});
