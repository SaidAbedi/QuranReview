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
import { C } from '@/constants/colors';
import { getStudentAssignments } from '@/api/assignments';
import type { AssignmentSummary } from '@/types/api';

// ── Status dot config ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  needs_resubmission: { color: C.red,    label: 'Practice needed' },
  reviewed:           { color: C.purple, label: 'Feedback ready'  },
  submitted:          { color: C.amber,  label: 'Under review'    },
  in_review:          { color: C.amber,  label: 'Under review'    },
  completed:          { color: C.green,  label: 'Completed'       },
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
  if (assignments.length === 0) return null;

  return (
    <View style={strip.wrapper}>
      <Text style={strip.heading}>MY PAGES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={strip.row}>
        {assignments.map((a) => {
          const dot = STATUS_DOT[a.status];
          return (
            <TouchableOpacity key={a.id} style={strip.chip} onPress={() => onPress(a)} activeOpacity={0.75}>
              <View style={strip.chipInner}>
                <Text style={strip.chipPage}>{a.pageNumber ?? '—'}</Text>
                {dot && (
                  <View style={[strip.dot, { backgroundColor: dot.color }]} />
                )}
              </View>
              <Text style={strip.chipSurah} numberOfLines={1}>
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
  dot,
  onPress,
}: {
  item: (typeof PAGES)[number];
  dot?: { color: string } | undefined;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.pageNumWrap, dot && { borderWidth: 2, borderColor: dot.color }]}>
        <Text style={styles.pageNum}>{item.pageNumber}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.surahName}>{item.surahArabic}</Text>
        <Text style={styles.surahLatin}>
          {item.surahName} · Juz {item.juz}
        </Text>
      </View>
      {dot && <View style={[styles.statusDot, { backgroundColor: dot.color }]} />}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function QuranBrowserScreen() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      getStudentAssignments().then(setAssignments).catch(() => {});
    }, []),
  );

  // Map page numbers to their assignment status dot
  const dotByPage = useMemo(() => {
    const map = new Map<number, { color: string }>();
    for (const a of assignments) {
      if (a.pageNumber == null) continue;
      const dot = STATUS_DOT[a.status];
      if (dot) map.set(a.pageNumber, dot);
    }
    return map;
  }, [assignments]);

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pages 1–20</Text>
        <Text style={styles.headerSub}>Juz 1 · Madinah Mushaf</Text>
      </View>

      <MyPagesStrip assignments={myPageAssignments} onPress={navigateToAssignment} />

      <FlatList
        data={PAGES}
        keyExtractor={(item) => String(item.pageNumber)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <PageRow
            item={item}
            dot={dotByPage.get(item.pageNumber)}
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
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    paddingBottom: 12,
  },
  heading: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textMuted,
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
    backgroundColor: C.blueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPage: { fontSize: 18, fontWeight: '700', color: C.blue },
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.white,
  },
  chipSurah: { fontSize: 10, color: C.textMuted, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 13, color: C.textMuted, marginTop: 2 },

  list: { paddingVertical: 8 },
  sep:  { height: StyleSheet.hairlineWidth, backgroundColor: C.divider, marginLeft: 68 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.white,
    gap: 12,
  },

  pageNumWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.blueBg,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  pageNum: { fontSize: 16, fontWeight: '700', color: C.blue },

  rowMeta:   { flex: 1 },
  surahName: { fontSize: 18, fontWeight: '600', color: C.text, textAlign: 'left' },
  surahLatin:{ fontSize: 12, color: C.textMuted, marginTop: 1 },

  statusDot: { width: 10, height: 10, borderRadius: 5 },
  chevron:   { fontSize: 22, color: C.grayLight, fontWeight: '300' },
});
