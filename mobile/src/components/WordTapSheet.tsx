import { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { PageWord, PageWordBounds } from '@/api/quran';

/**
 * Convert a canvas-space tap (normX, normY) into page-image-space coordinates,
 * correcting for the letterbox produced by resizeMode="contain".
 */
function canvasToPageCoords(
  normX: number,
  normY: number,
  canvasW: number,
  canvasH: number,
  imageW: number,
  imageH: number,
): { pageX: number; pageY: number } | null {
  if (canvasW <= 0 || canvasH <= 0 || imageW <= 0 || imageH <= 0) return null;
  const scale    = Math.min(canvasW / imageW, canvasH / imageH);
  const rendered = { w: imageW * scale, h: imageH * scale };
  const pad      = { x: (canvasW - rendered.w) / 2, y: (canvasH - rendered.h) / 2 };
  const tapPx    = { x: normX * canvasW, y: normY * canvasH };
  const pageX    = Math.min(1, Math.max(0, (tapPx.x - pad.x) / rendered.w));
  const pageY    = Math.min(1, Math.max(0, (tapPx.y - pad.y) / rendered.h));
  return { pageX, pageY };
}

/**
 * Pick the best word using exact glyph bounding boxes (bounds.x0/y0/x1/y1).
 * Strategy:
 *   1. Find all words whose bbox contains the tap (with a small padding).
 *   2. If exactly one hit → return it.
 *   3. If multiple hits → return the one whose center is nearest.
 *   4. If no hit → return the word with the nearest center distance overall.
 */
function pickBestWordByBounds(
  pageX: number,
  pageY: number,
  bounded: PageWord[],
): PageWord | null {
  if (!bounded.length) return null;

  const PAD = 0.008;
  const hits = bounded.filter((w) => {
    const { x0, y0, x1, y1 } = w.bounds!;
    return pageX >= x0 - PAD && pageX <= x1 + PAD &&
           pageY >= y0 - PAD && pageY <= y1 + PAD;
  });

  const pool = hits.length > 0 ? hits : bounded;
  let best = pool[0];
  let bestDist = Infinity;
  for (const w of pool) {
    const cx = (w.bounds!.x0 + w.bounds!.x1) / 2;
    const cy = (w.bounds!.y0 + w.bounds!.y1) / 2;
    const d = Math.hypot(cx - pageX, cy - pageY);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  return best;
}

// Fallback constants for pages without glyph bounds
const LINE_TOP    = 0.08;
const LINE_HEIGHT = 0.056;

/**
 * Pick the best word for a tap. Uses exact glyph bounds when available,
 * falling back to line/position estimation for pages without bounds data.
 */
function pickBestWord(
  normX: number,
  normY: number,
  words: PageWord[],
  canvasW: number,
  canvasH: number,
  imageW: number | null,
  imageH: number | null,
): PageWord | null {
  if (!words.length) return null;

  let pageX = normX;
  let pageY = normY;

  if (imageW && imageH) {
    const coords = canvasToPageCoords(normX, normY, canvasW, canvasH, imageW, imageH);
    if (coords) { pageX = coords.pageX; pageY = coords.pageY; }
  }

  // Use exact bounding boxes when available
  const bounded = words.filter((w) => w.bounds);
  if (bounded.length > 0) return pickBestWordByBounds(pageX, pageY, bounded);

  // Fallback: linear line/position estimation
  const rawLine = Math.round((pageY - LINE_TOP) / LINE_HEIGHT) + 1;
  const estimatedLine = Math.min(15, Math.max(1, rawLine));
  let lineWords = words.filter((w) => w.lineNumber === estimatedLine);
  if (lineWords.length === 0) lineWords = words.filter((w) => Math.abs(w.lineNumber - estimatedLine) <= 1);
  if (lineWords.length === 0) return null;

  const N = lineWords.length;
  const approxPos = Math.round((1 - pageX) * N + 0.5);
  const clampedPos = Math.min(N, Math.max(1, approxPos));
  let best = lineWords[0];
  let bestDist = Infinity;
  for (const w of lineWords) {
    const d = Math.abs(w.positionInLine - clampedPos);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  return best;
}

interface Props {
  visible: boolean;
  normX: number;
  normY: number;
  wordBounds: PageWordBounds | null;
  loading: boolean;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number | null;
  imageHeight: number | null;
  onSelect: (word: PageWord, normX: number, normY: number) => void;
  onClose: () => void;
}

export default function WordTapSheet({
  visible,
  normX,
  normY,
  wordBounds,
  loading,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
  onSelect,
  onClose,
}: Props) {
  const T = useTheme('dark').colors;
  const [showAll, setShowAll] = useState(false);

  // Reset "show all" every time the sheet opens for a new tap
  const bestWord = useMemo(() => {
    if (!wordBounds) return null;
    return pickBestWord(normX, normY, wordBounds.words, canvasWidth, canvasHeight, imageWidth, imageHeight);
  }, [wordBounds, normX, normY, canvasWidth, canvasHeight, imageWidth, imageHeight]);

  // All words grouped by verse for the fallback list
  const verseGroups = useMemo(() => {
    if (!wordBounds) return [];
    const groups = new Map<string, PageWord[]>();
    for (const w of wordBounds.words) {
      (groups.get(w.verseKey) ?? (groups.set(w.verseKey, []), groups.get(w.verseKey)!)).push(w);
    }
    return Array.from(groups.entries())
      .map(([verseKey, words]) => ({
        verseKey,
        words: [...words].sort((a, b) => a.positionInLine - b.positionInLine),
        minLine: Math.min(...words.map((w) => w.lineNumber)),
      }))
      .sort((a, b) => a.minLine - b.minLine);
  }, [wordBounds]);

  const handleOpen = () => setShowAll(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border }]}>
          <View style={[styles.handle, { backgroundColor: T.border }]} />

          {loading && (
            <Text style={[styles.hint, { color: T.textMuted }]}>Loading words…</Text>
          )}

          {!loading && !wordBounds && (
            <Text style={[styles.hint, { color: T.textMuted }]}>
              Word data not available. Use freehand drawing instead.
            </Text>
          )}

          {/* ── Primary: single best word ── */}
          {!loading && wordBounds && !showAll && (
            <>
              <Text style={[styles.title, { color: T.textPrimary }]}>Annotate this word?</Text>

              {bestWord ? (
                <>
                  <TouchableOpacity
                    style={[styles.bestWordBtn, { backgroundColor: T.brandPrimarySoft, borderColor: T.brandPrimary }]}
                    onPress={() => { onClose(); onSelect(bestWord, normX, normY); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.bestWordArabic, { color: T.textPrimary }]}>{bestWord.text}</Text>
                    <Text style={[styles.bestWordVerse, { color: T.textMuted }]}>{bestWord.verseKey}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setShowAll(true)} style={styles.wrongWordBtn}>
                    <Text style={[styles.wrongWordText, { color: T.textMuted }]}>Wrong word? Pick from page →</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.hint, { color: T.textMuted }]}>
                    Couldn't identify the exact word. Pick it from the list below.
                  </Text>
                  <TouchableOpacity onPress={() => setShowAll(true)} style={[styles.showAllBtn, { backgroundColor: T.surface, borderColor: T.border }]}>
                    <Text style={[styles.showAllBtnText, { color: T.textSecondary }]}>Show all words</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── Fallback: full word list ── */}
          {!loading && wordBounds && showAll && (
            <>
              <View style={styles.fallbackHeader}>
                <Text style={[styles.title, { color: T.textPrimary }]}>Pick a word</Text>
                <TouchableOpacity onPress={() => setShowAll(false)}>
                  <Text style={[styles.backBtn, { color: T.brandPrimary }]}>← Back</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
                {verseGroups.map(({ verseKey, words }) => (
                  <View key={verseKey} style={styles.verseGroup}>
                    <Text style={[styles.verseLabel, { color: T.textMuted }]}>{verseKey}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wordRow}>
                      {words.map((word) => (
                        <TouchableOpacity
                          key={word.id}
                          style={[styles.wordChip, { backgroundColor: T.backgroundAlt, borderColor: T.border }]}
                          onPress={() => { onClose(); setShowAll(false); onSelect(word, normX, normY); }}
                        >
                          <Text style={[styles.wordText, { color: T.textPrimary }]}>{word.text}</Text>
                          <Text style={[styles.wordPos, { color: T.textMuted }]}>{word.position}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          <TouchableOpacity style={[styles.cancelBtn, { borderColor: T.border }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: T.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },

  title: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  hint:  { fontSize: 14, textAlign: 'center', marginVertical: 16 },

  bestWordBtn: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  bestWordArabic: { fontSize: 32, fontWeight: '600', writingDirection: 'rtl' },
  bestWordVerse:  { fontSize: 13 },

  wrongWordBtn: { alignItems: 'center', paddingVertical: 8 },
  wrongWordText: { fontSize: 13 },

  showAllBtn: {
    borderRadius: 10, borderWidth: 1,
    paddingVertical: 12, alignItems: 'center', marginBottom: 8,
  },
  showAllBtnText: { fontSize: 14, fontWeight: '600' },

  fallbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: { fontSize: 14, fontWeight: '600' },

  scroll: { flexGrow: 0, maxHeight: 360 },

  verseGroup:  { marginBottom: 14 },
  verseLabel:  { fontSize: 12, marginBottom: 6 },
  wordRow:     { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  wordChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center', minWidth: 60,
  },
  wordText: { fontSize: 20, textAlign: 'center', writingDirection: 'rtl' },
  wordPos:  { fontSize: 10, marginTop: 2 },

  cancelBtn: {
    marginTop: 12, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
