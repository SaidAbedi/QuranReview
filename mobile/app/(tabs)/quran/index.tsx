import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';

// Static page metadata for pages 1–20 (Madinah Mushaf, Hafs).
// All within Juz 1. Surah marker shown only on the page where a new surah begins.
const PAGES = Array.from({ length: 20 }, (_, i) => {
  const pageNumber = i + 1;
  const isAlFatiha = pageNumber === 1;
  const isAlBaqarahStart = pageNumber === 2;
  return {
    pageNumber,
    surahName: isAlFatiha ? 'Al-Fatiha' : 'Al-Baqarah',
    surahArabic: isAlFatiha ? 'الفاتحة' : 'البقرة',
    juz: 1,
    newSurah: isAlFatiha || isAlBaqarahStart,
  };
});

function PageRow({
  item,
  onPress,
}: {
  item: (typeof PAGES)[number];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.pageNumWrap}>
        <Text style={styles.pageNum}>{item.pageNumber}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.surahName}>{item.surahArabic}</Text>
        <Text style={styles.surahLatin}>
          {item.surahName} · Juz {item.juz}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function QuranBrowserScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pages 1–20</Text>
        <Text style={styles.headerSub}>Juz 1 · Madinah Mushaf</Text>
      </View>
      <FlatList
        data={PAGES}
        keyExtractor={(item) => String(item.pageNumber)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <PageRow
            item={item}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/quran/[pageNumber]',
                params: { pageNumber: String(item.pageNumber) },
              })
            }
          />
        )}
      />
    </View>
  );
}

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

  chevron: { fontSize: 22, color: C.grayLight, fontWeight: '300' },
});
