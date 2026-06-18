import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { getAnnotations, getVoiceNoteReadUrl } from '@/api/annotations';
import { getReviewVoiceNote, getReviewVoiceNoteReadUrl } from '@/api/teacher';
import { getQuranPage } from '@/api/quran';
import AnnotationCanvas from '@/components/AnnotationCanvas';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useTheme } from '@/hooks/useTheme';
import type { AnnotationRow, ReviewVoiceNoteRow } from '@/types/api';

const MISTAKE_LABEL_COLORS: Record<string, string> = {
  tajweed: '#7C3AED', harakat: '#D97706', wrong_word: '#DC2626',
  wrong_ayah: '#DC2626', makhraj: '#0369A1', madd: '#059669',
  ghunnah: '#059669', waqf: '#6B7280', pronunciation: '#D97706',
  memorization: '#DC2626', other: '#6B7280',
};

const MISTAKE_DISPLAY_NAMES: Record<string, string> = {
  tajweed: 'Tajweed', harakat: 'Harakat', wrong_word: 'Wrong Word',
  wrong_ayah: 'Wrong Ayah', makhraj: 'Makhraj', madd: 'Madd',
  ghunnah: 'Ghunnah', waqf: 'Waqf', pronunciation: 'Pronunciation',
  memorization: 'Memorization', other: 'Other',
};

// ── Annotation detail popup ────────────────────────────────────────────────

function AnnotationDetailPopup({
  annotation,
  onClose,
}: {
  annotation: AnnotationRow;
  onClose: () => void;
}) {
  const theme = useTheme('dark');
  const T = theme.colors;
  const insets = useSafeAreaInsets();
  const color = annotation.mistakeType
    ? (MISTAKE_LABEL_COLORS[annotation.mistakeType] ?? T.textMuted)
    : T.brandPrimary;
  const label = annotation.quickLabel
    ?? (annotation.mistakeType ? MISTAKE_DISPLAY_NAMES[annotation.mistakeType] : null);

  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const player = useAudioPlayer(voiceUrl ?? '');
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => { if (voiceUrl) player.play(); }, [voiceUrl, player]);

  const handlePlayVoiceNote = async () => {
    if (voiceUrl) { playerStatus.playing ? player.pause() : player.play(); return; }
    setLoadingVoice(true);
    try {
      const key = `teacher-voice-notes/${annotation.teacherId}/${annotation.submissionId}/${annotation.submissionAttemptId}/${annotation.id}.m4a`;
      const { url } = await getVoiceNoteReadUrl(key);
      setVoiceUrl(url);
    } catch {
      Alert.alert('Playback Error', 'Could not load voice note.');
    } finally {
      setLoadingVoice(false);
    }
  };

  const hasContent = label || annotation.noteText || annotation.hasVoiceNote;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[popupStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View style={[popupStyles.sheet, { backgroundColor: T.surface, paddingBottom: insets.bottom + 8 }]}>
          <View style={[popupStyles.handle, { backgroundColor: T.border }]} />
          <View style={[popupStyles.header, { borderBottomColor: T.divider }]}>
            <View style={[popupStyles.colorBar, { backgroundColor: color }]} />
            <Text style={[popupStyles.title, { color: T.textPrimary }]}>Teacher's Note</Text>
            <TouchableOpacity onPress={onClose} style={popupStyles.closeBtn}>
              <Text style={[popupStyles.closeBtnText, { color: T.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {!hasContent ? (
            <View style={popupStyles.emptyBody}>
              <Text style={[popupStyles.emptyText, { color: T.textDisabled }]}>Freehand mark — no note added</Text>
            </View>
          ) : (
            <View style={popupStyles.body}>
              {label && (
                <View style={[popupStyles.chip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Text style={[popupStyles.chipText, { color }]}>{label}</Text>
                </View>
              )}
              {annotation.noteText && (
                <Text style={[popupStyles.noteText, { color: T.textSecondary }]}>{annotation.noteText}</Text>
              )}
              {annotation.hasVoiceNote && (
                <TouchableOpacity
                  style={[popupStyles.voiceBtn, { backgroundColor: T.infoBg, borderColor: T.info }]}
                  onPress={handlePlayVoiceNote}
                  disabled={loadingVoice}
                >
                  {loadingVoice
                    ? <ActivityIndicator size="small" color={T.info} />
                    : <Text style={[popupStyles.voiceBtnText, { color: T.info }]}>
                        {playerStatus.playing ? '⏸  Pause Voice Note' : '▶  Play Voice Note'}
                      </Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[popupStyles.doneBtn, { backgroundColor: T.brandPrimary, marginHorizontal: 16 }]}
            onPress={onClose}
          >
            <Text style={[popupStyles.doneBtnText, { color: T.brandOnPrimary }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function FeedbackViewerScreen() {
  const theme = useTheme('dark');
  const T = theme.colors;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, attemptId, submissionId, pageNumber, attemptNumber } = useLocalSearchParams<{
    id: string; attemptId: string; submissionId: string; pageNumber: string; attemptNumber: string;
  }>();

  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationRow | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reviewVoiceNote, setReviewVoiceNote] = useState<ReviewVoiceNoteRow | null>(null);
  const [rvnPlayUrl, setRvnPlayUrl] = useState<string | null>(null);
  const rvnPlayer = useAudioPlayer(rvnPlayUrl ?? '');
  const rvnPlayerStatus = useAudioPlayerStatus(rvnPlayer);

  const loadAnnotations = useCallback(async () => {
    setLoadingAnnotations(true);
    try {
      const all: AnnotationRow[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      while (hasMore) {
        const result = await getAnnotations(submissionId, attemptId, cursor);
        all.push(...result.data);
        hasMore = result.hasMore;
        cursor = result.nextCursor;
      }
      setAnnotations(all);
    } catch { /* non-fatal */ } finally {
      setLoadingAnnotations(false);
    }
  }, [submissionId, attemptId]);

  useEffect(() => {
    loadAnnotations();
    getReviewVoiceNote(submissionId, attemptId).then(setReviewVoiceNote).catch(() => {});
    if (pageNumber) {
      getQuranPage(parseInt(pageNumber, 10))
        .then((page) => { if (page.imageUrl) setPageImageUrl(page.imageUrl); })
        .catch(() => {})
        .finally(() => setLoadingPage(false));
    } else {
      setLoadingPage(false);
    }
  }, [loadAnnotations, submissionId, attemptId, pageNumber]);

  useEffect(() => {
    if (!rvnPlayUrl) return;
    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    }).then(() => rvnPlayer.play()).catch(() => {});
  }, [rvnPlayUrl, rvnPlayer]);

  const handlePlayRvn = async () => {
    if (rvnPlayerStatus.playing) { rvnPlayer.pause(); return; }
    try {
      if (!rvnPlayUrl && reviewVoiceNote) {
        const { url } = await getReviewVoiceNoteReadUrl(reviewVoiceNote.audioStorageKey);
        setRvnPlayUrl(url);
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });
      rvnPlayer.play();
    } catch {
      Alert.alert('Playback Error', 'Could not load teacher voice note.');
    }
  };

  if (loadingPage) return <LoadingScreen message="Loading feedback…" />;

  const labelledAnnotations = annotations.filter(
    (a) => a.quickLabel || a.mistakeType || a.noteText || a.hasVoiceNote,
  );

  return (
    <View style={[styles.root, { backgroundColor: T.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()}>
          <Text style={[styles.topBarBtnText, { color: T.brandPrimary }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={[styles.topBarTitle, { color: T.textPrimary }]}>Teacher Feedback</Text>
          <Text style={[styles.topBarSub, { color: T.textMuted }]}>
            Page {pageNumber ?? '?'}{attemptNumber ? ` · Attempt ${attemptNumber}` : ''}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* ── Canvas area ── */}
      <View
        style={[styles.canvasArea, { backgroundColor: T.backgroundAlt }]}
        onLayout={(e) => setCanvasSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })}
      >
        {!pageImageUrl && (
          <View style={styles.pagePlaceholder}>
            <Text style={[styles.pagePlaceholderText, { color: T.textDisabled }]}>Page unavailable</Text>
          </View>
        )}

        {loadingAnnotations && (
          <View style={styles.canvasLoading}>
            <ActivityIndicator color={T.brandPrimary} />
          </View>
        )}

        {canvasSize && (
          <AnnotationCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            imageUrl={pageImageUrl ?? undefined}
            savedAnnotations={annotations}
            localAnnotations={[]}
            drawEnabled={false}
            readOnly
            onAnnotationTap={setSelectedAnnotation}
          />
        )}

        {/* Tap hint — sits inside the canvas, below the top bar */}
        {!loadingAnnotations && annotations.length > 0 && (
          <View style={styles.tapHintBar}>
            <Text style={[styles.tapHintText, { color: T.textSecondary, backgroundColor: T.surfaceOverlay, borderColor: T.border }]}>
              Tap a dot to see feedback
            </Text>
          </View>
        )}
      </View>

      {/* ── Bottom bar ── */}
      <View style={[styles.bottomBar, { backgroundColor: T.surface, borderTopColor: T.border, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.bottomSection}>
          <AudioPlayerBar submissionId={submissionId} attemptId={attemptId} compact />
        </View>

        {reviewVoiceNote && (
          <TouchableOpacity style={styles.rvnMsgBtn} onPress={handlePlayRvn}>
            <Text style={[styles.rvnMsgIcon, { color: T.brandPrimary }]}>{rvnPlayerStatus.playing ? '⏸' : '🎙'}</Text>
            <Text style={[styles.rvnMsgLabel, { color: T.textMuted }]}>Message</Text>
          </TouchableOpacity>
        )}

        {!loadingAnnotations && (
          <Text style={[styles.annotationCount, { color: T.textDisabled }]}>
            {annotations.length === 0
              ? 'No marks'
              : `${annotations.length} mark${annotations.length !== 1 ? 's' : ''}`}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.menuBtn, { backgroundColor: T.divider }, labelledAnnotations.length === 0 && styles.menuBtnDisabled]}
          onPress={() => setNotesOpen(true)}
          disabled={labelledAnnotations.length === 0}
        >
          <Text style={[styles.menuBtnText, { color: T.textSecondary }]}>···</Text>
        </TouchableOpacity>
      </View>

      {/* ── Feedback notes sheet ── */}
      <Modal
        visible={notesOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setNotesOpen(false)}
      >
        <TouchableOpacity
          style={[styles.sheetOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          activeOpacity={1}
          onPress={() => setNotesOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { backgroundColor: T.surface, paddingBottom: insets.bottom + 8 }]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: T.border }]} />
            <Text style={[styles.sheetTitle, { color: T.textPrimary }]}>Feedback Notes</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {labelledAnnotations.length === 0 ? (
                <Text style={[styles.sheetEmpty, { color: T.textDisabled }]}>No labelled annotations on this attempt.</Text>
              ) : (
                labelledAnnotations.map((ann, i) => {
                  const color = ann.mistakeType
                    ? (MISTAKE_LABEL_COLORS[ann.mistakeType] ?? T.textMuted)
                    : T.brandPrimary;
                  const label = ann.quickLabel
                    ?? (ann.mistakeType ? MISTAKE_DISPLAY_NAMES[ann.mistakeType] : null);
                  return (
                    <TouchableOpacity
                      key={ann.id}
                      style={[styles.noteRow, { borderTopColor: T.divider }]}
                      onPress={() => { setNotesOpen(false); setSelectedAnnotation(ann); }}
                    >
                      <View style={[styles.noteIndex, { backgroundColor: color }]}>
                        <Text style={[styles.noteIndexText, { color: T.surface }]}>{i + 1}</Text>
                      </View>
                      <View style={styles.noteBody}>
                        {label && <Text style={[styles.noteLabel, { color }]}>{label}</Text>}
                        {ann.noteText && <Text style={[styles.noteText, { color: T.textMuted }]}>{ann.noteText}</Text>}
                        {!label && !ann.noteText && <Text style={[styles.noteText, { color: T.textMuted }]}>Freehand mark</Text>}
                        {ann.hasVoiceNote && <Text style={[styles.voiceTag, { color: T.info }]}>🎙 Voice note</Text>}
                      </View>
                      <Text style={[styles.noteChevron, { color: T.borderStrong }]}>›</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Annotation detail popup ── */}
      {selectedAnnotation && (
        <AnnotationDetailPopup
          annotation={selectedAnnotation}
          onClose={() => setSelectedAnnotation(null)}
        />
      )}
    </View>
  );
}

const popupStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10, borderBottomWidth: 1 },
  colorBar: { width: 4, height: 20, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18 },
  emptyBody: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  body: { padding: 16, gap: 12 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '700' },
  noteText: { fontSize: 15, lineHeight: 22 },
  voiceBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  voiceBtnText: { fontSize: 14, fontWeight: '600' },
  doneBtn: { paddingVertical: 13, alignItems: 'center', borderRadius: 12, marginTop: 4 },
  doneBtnText: { fontSize: 15, fontWeight: '700' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Top bar — matches teacher review and student assignment screens
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarBtnText: { fontSize: 28, lineHeight: 32 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 15, fontWeight: '700' },
  topBarSub: { fontSize: 12, marginTop: 1 },

  // Canvas area — flex: 1 between bars, same as teacher screen
  canvasArea: {
    flex: 1,
    overflow: 'hidden',
  },
  pagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagePlaceholderText: { fontSize: 13 },
  canvasLoading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  tapHintBar: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  tapHintText: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Bottom bar — matches teacher review and student assignment screens
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomSection: { flex: 1 },
  annotationCount: { fontSize: 12 },
  menuBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  menuBtnDisabled: { opacity: 0.4 },
  menuBtnText: { fontSize: 18, letterSpacing: 1 },
  rvnMsgBtn: { alignItems: 'center', gap: 2 },
  rvnMsgIcon: { fontSize: 18 },
  rvnMsgLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },

  // Notes sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, marginBottom: 8 },
  sheetEmpty: { fontSize: 14, padding: 20, textAlign: 'center' },
  noteRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 13,
    borderTopWidth: 1, alignItems: 'center',
  },
  noteIndex: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noteIndexText: { fontSize: 11, fontWeight: '700' },
  noteBody: { flex: 1, gap: 2 },
  noteLabel: { fontSize: 14, fontWeight: '600' },
  noteText: { fontSize: 13, lineHeight: 18 },
  voiceTag: { fontSize: 12 },
  noteChevron: { fontSize: 18 },
});
