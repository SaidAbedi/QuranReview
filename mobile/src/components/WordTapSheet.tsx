import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { PageWord, PageWordBounds } from '@/api/quran';

// Madani Mushaf line geometry (normalized, applies to pages with 15 lines).
// Line N (1-15) centre: Y = 0.08 + (N - 0.5) * 0.056
const LINE_TOP    = 0.08;
const LINE_HEIGHT = 0.056;
const LINE_MIN    = 1;
const LINE_MAX    = 15;

function estimateLineNumber(normY: number): number {
  const raw = Math.round((normY - LINE_TOP) / LINE_HEIGHT + 0.5);
  return Math.min(LINE_MAX, Math.max(LINE_MIN, raw));
}

function wordsNearTap(
  words: PageWord[],
  normY: number,
): { primary: PageWord[]; context: string } {
  const line = estimateLineNumber(normY);
  const onLine = words.filter((w) => w.lineNumber === line);
  if (onLine.length > 0) return { primary: onLine, context: `Line ${line}` };
  // Fall back: adjacent lines
  const adjacent = words.filter(
    (w) => Math.abs(w.lineNumber - line) <= 1,
  );
  return { primary: adjacent, context: `Near line ${line}` };
}

interface Props {
  visible: boolean;
  normX: number;
  normY: number;
  wordBounds: PageWordBounds | null;
  loading: boolean;
  onSelect: (word: PageWord, normX: number, normY: number) => void;
  onClose: () => void;
}

export default function WordTapSheet({
  visible,
  normX,
  normY,
  wordBounds,
  loading,
  onSelect,
  onClose,
}: Props) {
  const T = useTheme('dark').colors;

  const { primary: nearbyWords, context } = useMemo(() => {
    if (!wordBounds) return { primary: [], context: '' };
    return wordsNearTap(wordBounds.words, normY);
  }, [wordBounds, normY]);

  // Group by verse for display
  const byVerse = useMemo(() => {
    const groups: Record<string, PageWord[]> = {};
    for (const w of nearbyWords) {
      (groups[w.verseKey] ??= []).push(w);
    }
    return groups;
  }, [nearbyWords]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border }]}>
          <View style={[styles.handle, { backgroundColor: T.border }]} />

          <Text style={[styles.title, { color: T.textPrimary }]}>
            Which word?
          </Text>
          <Text style={[styles.subtitle, { color: T.textMuted }]}>
            {context} — tap the word to annotate
          </Text>

          {loading && (
            <ActivityIndicator color={T.brandPrimary} style={styles.loader} />
          )}

          {!loading && nearbyWords.length === 0 && (
            <Text style={[styles.empty, { color: T.textMuted }]}>
              No words found near this tap. Try tapping closer to the text.
            </Text>
          )}

          {!loading && Object.entries(byVerse).map(([verseKey, words]) => (
            <View key={verseKey} style={styles.verseGroup}>
              <Text style={[styles.verseLabel, { color: T.textMuted }]}>
                {verseKey}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.wordRow}
              >
                {/* Arabic RTL: display in reading order (positionInLine 1 = rightmost) */}
                {[...words].sort((a, b) => a.positionInLine - b.positionInLine).map((word) => (
                  <TouchableOpacity
                    key={word.id}
                    style={[styles.wordChip, { backgroundColor: T.backgroundAlt, borderColor: T.border }]}
                    onPress={() => onSelect(word, normX, normY)}
                  >
                    <Text style={[styles.wordText, { color: T.textPrimary }]}>
                      {word.text}
                    </Text>
                    <Text style={[styles.wordPos, { color: T.textMuted }]}>
                      {word.position}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: T.border }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: T.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  backdrop:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 16,
    paddingBottom: 32,
    minHeight: 220,
    maxHeight: '60%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title:     { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  subtitle:  { fontSize: 13, marginBottom: 16 },
  loader:    { marginVertical: 24 },
  empty:     { fontSize: 14, textAlign: 'center', marginVertical: 20 },
  verseGroup:{ marginBottom: 12 },
  verseLabel:{ fontSize: 12, marginBottom: 6 },
  wordRow:   { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  wordChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 60,
  },
  wordText:  { fontSize: 20, textAlign: 'center', writingDirection: 'rtl' },
  wordPos:   { fontSize: 10, marginTop: 2 },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText:{ fontSize: 15, fontWeight: '600' },
});
