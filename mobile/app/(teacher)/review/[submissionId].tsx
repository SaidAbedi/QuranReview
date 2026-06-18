import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  createAnnotation,
  deleteAnnotation,
  getAnnotations,
  updateAnnotation,
} from '@/api/annotations';
import { getQuranPage, getPageWordBounds, PageWordBounds, PageWord } from '@/api/quran';
import {
  completeReview,
  deleteReviewVoiceNote,
  getAttemptHistory,
  getMistakeCategories,
  getReviewVoiceNote,
  getReviewVoiceNoteReadUrl,
  getReviewVoiceNoteUploadUrl,
  saveReviewVoiceNote,
} from '@/api/teacher';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import AnnotationCanvas, { LocalAnnotation } from '@/components/AnnotationCanvas';
import AnnotationDetailsSheet from '@/components/AnnotationDetailsSheet';
import WordTapSheet from '@/components/WordTapSheet';
import { useTheme } from '@/hooks/useTheme';
import type {
  AnnotationPoint,
  AnnotationRow,
  AttemptRow,
  MistakeCategoryRow,
  ReviewVoiceNoteRow,
} from '@/types/api';

let UploadModule: {
  uploadAsync: typeof import('expo-file-system/legacy').uploadAsync;
  FileSystemUploadType: typeof import('expo-file-system/legacy').FileSystemUploadType;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  UploadModule = require('expo-file-system/legacy');
} catch { /* not available in this runtime */ }

type RvnState = 'idle' | 'recording' | 'uploading' | 'done';

function formatRvnDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  in_review: 'In Review',
  reviewed: 'Reviewed',
  needs_resubmission: 'Returned for Practice',
  completed: 'Completed',
};

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

let localIdCounter = 0;
function nextLocalId() { return `local-${Date.now()}-${localIdCounter++}`; }

export default function ReviewDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme('dark');
  const T = theme.colors;
  const {
    submissionId, attemptId, pageNumber,
    pageImageUrl: initialPageImageUrl,
    studentName, attemptNumber, assignmentTitle,
  } = useLocalSearchParams<{
    submissionId: string; attemptId: string; pageNumber: string;
    pageImageUrl: string; studentName: string; attemptNumber: string; assignmentTitle: string;
  }>();

  // ── Data ───────────────────────────────────────────────────────────────────
  const [savedAnnotations, setSavedAnnotations] = useState<AnnotationRow[]>([]);
  const [localAnnotations, setLocalAnnotations] = useState<LocalAnnotation[]>([]);
  const [categories, setCategories] = useState<MistakeCategoryRow[]>([]);
  const [attemptHistory, setAttemptHistory] = useState<AttemptRow[]>([]);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(initialPageImageUrl ?? null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [marking, setMarking] = useState(false);
  const [wordTapMode, setWordTapMode] = useState(false);
  const [detailsAnnotation, setDetailsAnnotation] = useState<AnnotationRow | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Word tap ───────────────────────────────────────────────────────────────
  const [wordBounds, setWordBounds] = useState<PageWordBounds | null>(null);
  const [wordBoundsLoading, setWordBoundsLoading] = useState(false);
  const [wordTapPending, setWordTapPending] = useState<{ normX: number; normY: number } | null>(null);

  // ── Review voice note ──────────────────────────────────────────────────────
  const [reviewVoiceNote, setReviewVoiceNote] = useState<ReviewVoiceNoteRow | null>(null);
  const [rvnOpen, setRvnOpen] = useState(false);
  const [rvnState, setRvnState] = useState<RvnState>('idle');
  const [rvnDurationMs, setRvnDurationMs] = useState(0);
  const [rvnPlayUrl, setRvnPlayUrl] = useState<string | null>(null);
  const rvnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rvnRecordingRef = useRef(false);
  const rvnRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rvnPlayer = useAudioPlayer(rvnPlayUrl ?? undefined);
  const rvnPlayerStatus = useAudioPlayerStatus(rvnPlayer);

  // ── Load ───────────────────────────────────────────────────────────────────
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
      setSavedAnnotations(all);
    } catch { /* non-fatal */ } finally {
      setLoadingAnnotations(false);
    }
  }, [submissionId, attemptId]);

  useEffect(() => {
    loadAnnotations();
    getMistakeCategories().then(setCategories).catch(() => {});
    getAttemptHistory(submissionId).then(setAttemptHistory).catch(() => {});
    getReviewVoiceNote(submissionId, attemptId).then(setReviewVoiceNote).catch(() => {});
    if (pageNumber) {
      const pNum = parseInt(pageNumber, 10);
      getQuranPage(pNum)
        .then((page) => { if (page.imageUrl) setPageImageUrl(page.imageUrl); })
        .catch(() => {});
      // Load word bounds (available for pages 1-20 only — silently ignore 404)
      setWordBoundsLoading(true);
      getPageWordBounds(pNum)
        .then(setWordBounds)
        .catch(() => {})
        .finally(() => setWordBoundsLoading(false));
    }
  }, [loadAnnotations, submissionId, attemptId, pageNumber]);

  // Clear canvas immediately when switching to a different attempt so the
  // previous attempt's marks don't show while the new fetch is in flight.
  useEffect(() => {
    setSavedAnnotations([]);
    setLocalAnnotations([]);
  }, [attemptId]);

  useEffect(() => {
    return () => {
      if (rvnTimerRef.current) clearInterval(rvnTimerRef.current);
      if (rvnRecordingRef.current) rvnRecorder.stop().catch(() => {});
    };
  }, [rvnRecorder]);

  useEffect(() => {
    if (!rvnPlayUrl) return;
    setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    }).then(() => rvnPlayer.play()).catch(() => {});
  }, [rvnPlayUrl, rvnPlayer]);

  // ── Stroke → auto-save ────────────────────────────────────────────────────
  const handleStrokeComplete = useCallback(async (points: AnnotationPoint[]) => {
    const localId = nextLocalId();
    const strokeColor = '#DC2626';
    setLocalAnnotations((prev) => [...prev, { localId, points, status: 'saving', strokeColor }]);
    try {
      const saved = await createAnnotation(submissionId, attemptId, {
        annotationType: 'freehand', anchorType: 'page_region',
        points, style: { strokeColor, strokeWidth: 3 },
      });
      setLocalAnnotations((prev) => prev.filter((a) => a.localId !== localId));
      setSavedAnnotations((prev) => [...prev, saved]);
      setDetailsAnnotation(saved);
    } catch {
      setLocalAnnotations((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, status: 'failed' } : a)),
      );
    }
  }, [submissionId, attemptId]);

  const handleAnnotationTap = useCallback((ann: AnnotationRow) => {
    setDetailsAnnotation(ann);
  }, []);

  const handleRetryFailed = useCallback(async (local: LocalAnnotation) => {
    const strokeColor = local.strokeColor ?? '#DC2626';
    setLocalAnnotations((prev) =>
      prev.map((a) => (a.localId === local.localId ? { ...a, status: 'saving' } : a)),
    );
    try {
      const saved = await createAnnotation(submissionId, attemptId, {
        annotationType: 'freehand', anchorType: 'page_region',
        points: local.points, style: { strokeColor, strokeWidth: 3 },
      });
      setLocalAnnotations((prev) => prev.filter((a) => a.localId !== local.localId));
      setSavedAnnotations((prev) => [...prev, saved]);
      setDetailsAnnotation(saved);
    } catch {
      setLocalAnnotations((prev) =>
        prev.map((a) => (a.localId === local.localId ? { ...a, status: 'failed' } : a)),
      );
      Alert.alert('Save Failed', 'Check your connection and try again.');
    }
  }, [submissionId, attemptId]);

  const handleDiscardFailed = useCallback((localId: string) => {
    setLocalAnnotations((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  const handleWordTap = useCallback((normX: number, normY: number) => {
    setWordTapPending({ normX, normY });
  }, []);

  const handleWordSelect = useCallback(async (word: PageWord, normX: number, normY: number) => {
    setWordTapPending(null);
    const localId = nextLocalId();
    const strokeColor = '#7C3AED';
    setLocalAnnotations((prev) => [
      ...prev,
      { localId, points: [{ x: normX, y: normY }], status: 'saving', strokeColor },
    ]);
    try {
      const saved = await createAnnotation(submissionId, attemptId, {
        annotationType: 'word_marker',
        anchorType: 'word',
        points: [{ x: normX, y: normY }],
        style: { strokeColor, strokeWidth: 3 },
        verseKey: word.verseKey,
        wordId: word.id,
        wordPosition: word.position,
        lineNumber: word.lineNumber,
      });
      setLocalAnnotations((prev) => prev.filter((a) => a.localId !== localId));
      setSavedAnnotations((prev) => [...prev, saved]);
      setDetailsAnnotation(saved);
    } catch {
      setLocalAnnotations((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, status: 'failed' } : a)),
      );
    }
  }, [submissionId, attemptId]);

  const handleUpdateMetadata = useCallback(async (
    annotationId: string,
    input: { mistakeOptionId?: string; quickLabel?: string; noteText?: string },
  ) => {
    const updated = await updateAnnotation(annotationId, input);
    setSavedAnnotations((prev) => prev.map((a) => (a.id === annotationId ? updated : a)));
  }, []);

  const handleDeleteSaved = useCallback(async (annotationId: string) => {
    setSavedAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    try {
      await deleteAnnotation(annotationId);
    } catch {
      loadAnnotations();
      throw new Error('Delete failed');
    }
  }, [loadAnnotations]);

  // ── Complete review ────────────────────────────────────────────────────────
  const hasPendingSaves = localAnnotations.some((a) => a.status === 'saving');

  const handleCompleteReview = (pageStatus: 'completed' | 'needs_resubmission') => {
    setActionsOpen(false);
    if (hasPendingSaves) {
      Alert.alert('Saving…', 'Please wait for corrections to finish saving.');
      return;
    }
    const label = pageStatus === 'completed' ? 'Mark as Complete' : 'Request Another Attempt';
    const body = pageStatus === 'completed'
      ? 'Mark this recitation as complete? The student will be notified.'
      : 'Ask the student to re-record? They will be notified to resubmit.';

    Alert.alert(label, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: pageStatus === 'completed' ? 'default' : 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await completeReview(submissionId, attemptId, pageStatus);
            Alert.alert(
              'Done',
              pageStatus === 'completed'
                ? 'Recitation marked as complete.'
                : 'Student has been asked to re-record.',
              [{ text: 'OK', onPress: () => router.back() }],
            );
          } catch (e) {
            setSubmitting(false);
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not complete review');
          }
        },
      },
    ]);
  };

  // ── Navigate to a different attempt ───────────────────────────────────────
  const handleSwitchAttempt = (attempt: AttemptRow) => {
    if (attempt.id === attemptId) return;
    setActionsOpen(false);
    router.replace({
      pathname: '/(teacher)/review/[submissionId]',
      params: {
        submissionId,
        attemptId: attempt.id,
        pageNumber: pageNumber ?? '',
        pageImageUrl: initialPageImageUrl ?? '',
        studentName: studentName ?? '',
        attemptNumber: String(attempt.attemptNumber),
        assignmentTitle: assignmentTitle ?? '',
      },
    });
  };

  // ── Review voice note handlers ─────────────────────────────────────────────

  const handleStartRvnRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone Required', 'Allow microphone access in Settings to record a voice note.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await rvnRecorder.prepareToRecordAsync();
      rvnRecorder.record();
      rvnRecordingRef.current = true;
      setRvnDurationMs(0);
      setRvnState('recording');
      rvnTimerRef.current = setInterval(() => setRvnDurationMs((p) => p + 1000), 1000);
    } catch (e) {
      Alert.alert('Recording Error', e instanceof Error ? e.message : 'Could not start recording');
    }
  };

  const handleStopRvnRecording = async () => {
    if (rvnTimerRef.current) { clearInterval(rvnTimerRef.current); rvnTimerRef.current = null; }
    try {
      await rvnRecorder.stop();
      rvnRecordingRef.current = false;
      const uri = rvnRecorder.uri;
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });
      if (uri) await uploadRvn(uri, rvnDurationMs);
    } catch (e) {
      setRvnState('idle');
      Alert.alert('Recording Error', e instanceof Error ? e.message : 'Could not stop recording');
    }
  };

  const uploadRvn = async (uri: string, durationMs: number) => {
    if (!UploadModule) {
      Alert.alert('Upload Error', 'File upload is not available in this environment.');
      setRvnState('idle');
      return;
    }
    setRvnState('uploading');
    try {
      const contentType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
      const { uploadUrl, storageKey } = await getReviewVoiceNoteUploadUrl(submissionId, attemptId, contentType);

      const uploadResult = await UploadModule.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        uploadType: UploadModule.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': contentType },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed: ${uploadResult.status}`);
      }

      let sizeBytes = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileSystem = require('expo-file-system/legacy');
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && 'size' in info) sizeBytes = (info as { size: number }).size;
      } catch { /* best effort */ }

      const saved = await saveReviewVoiceNote(submissionId, attemptId, {
        audioStorageKey: storageKey,
        durationMs,
        contentType,
        sizeBytes,
      });

      setReviewVoiceNote(saved);
      setRvnPlayUrl(null);
      setRvnState('done');
    } catch (e) {
      setRvnState('idle');
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Could not save review voice note.');
    }
  };

  const handlePlayRvn = async () => {
    if (rvnPlayerStatus.playing) { rvnPlayer.pause(); return; }
    try {
      if (!rvnPlayUrl && reviewVoiceNote) {
        const { url } = await getReviewVoiceNoteReadUrl(reviewVoiceNote.audioStorageKey);
        setRvnPlayUrl(url);
        return; // useEffect fires and calls play
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });
      // Seek to start if at end so replay works on physical device.
      const d = rvnPlayerStatus.duration ?? 0;
      const t = rvnPlayerStatus.currentTime ?? 0;
      if (d > 0 && t >= d - 0.5) {
        await rvnPlayer.seekTo(0);
      }
      rvnPlayer.play();
    } catch {
      Alert.alert('Playback Error', 'Could not load review voice note.');
    }
  };

  const handleDeleteRvn = () => {
    Alert.alert(
      'Remove Voice Note',
      'Remove the overall voice note for this review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReviewVoiceNote(submissionId, attemptId);
              setReviewVoiceNote(null);
              setRvnState('idle');
              setRvnPlayUrl(null);
            } catch {
              Alert.alert('Error', 'Could not remove voice note.');
            }
          },
        },
      ],
    );
  };

  const failedAnnotations = localAnnotations.filter((a) => a.status === 'failed');
  const savingCount = localAnnotations.filter((a) => a.status === 'saving').length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: T.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()}>
          <Text style={[styles.topBarBack, { color: T.brandPrimary }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={[styles.topBarTitle, { color: T.textPrimary }]} numberOfLines={1}>
            {studentName || 'Review'}
          </Text>
          <Text style={[styles.topBarSub, { color: T.textMuted }]}>
            Page {pageNumber ?? '?'} · Attempt {attemptNumber ?? '1'}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* ── Canvas area (sits between top bar and toolbar) ── */}
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
            savedAnnotations={savedAnnotations}
            localAnnotations={localAnnotations}
            drawEnabled={marking && !wordTapMode}
            onStrokeComplete={handleStrokeComplete}
            onAnnotationTap={wordTapMode ? undefined : handleAnnotationTap}
            onWordTap={wordTapMode ? handleWordTap : undefined}
          />
        )}
      </View>

      {/* ── Failed save banners ── */}
      {failedAnnotations.map((local) => (
        <View key={local.localId} style={[styles.failedBanner, { backgroundColor: T.errorBg, borderTopColor: T.error }]}>
          <Text style={[styles.failedText, { color: T.error }]}>⚠ Failed to save correction</Text>
          <TouchableOpacity style={[styles.failedBtn, { backgroundColor: T.error }]} onPress={() => handleRetryFailed(local)}>
            <Text style={[styles.failedBtnText, { color: T.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.failedBtnOutline, { borderColor: T.error }]} onPress={() => handleDiscardFailed(local.localId)}>
            <Text style={[styles.failedBtnOutlineText, { color: T.error }]}>Discard</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* ── Bottom bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8, backgroundColor: T.surface, borderTopColor: T.border }]}>
        {/* Mini audio player */}
        <AudioPlayerBar submissionId={submissionId} attemptId={attemptId} compact />

        {/* Mark as Complete — primary action */}
        <TouchableOpacity
          style={[styles.completeBtn, { backgroundColor: T.brandPrimary }, submitting && styles.disabledBtn]}
          onPress={() => handleCompleteReview('completed')}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={T.brandOnPrimary} size="small" />
          ) : (
            <Text style={[styles.completeBtnText, { color: T.brandOnPrimary }]}>✓ Complete</Text>
          )}
        </TouchableOpacity>

        {/* Review voice note button */}
        <TouchableOpacity
          style={[
            styles.rvnBtn,
            { borderColor: T.border, backgroundColor: T.surfaceRaised },
            reviewVoiceNote && { backgroundColor: T.brandPrimary, borderColor: T.brandPrimary },
          ]}
          onPress={() => setRvnOpen(true)}
          accessibilityLabel="Review voice note"
        >
          <Text style={styles.rvnBtnText}>🎙</Text>
        </TouchableOpacity>

        {/* Mark (draw corrections) toggle */}
        <TouchableOpacity
          style={[
            styles.markBtn,
            { borderColor: T.border },
            marking && !wordTapMode && { backgroundColor: T.brandPrimary, borderColor: T.brandPrimary },
          ]}
          onPress={() => { setMarking((v) => !v); setWordTapMode(false); }}
        >
          <Text style={[styles.markBtnText, { color: (marking && !wordTapMode) ? T.brandOnPrimary : T.textSecondary }]}>
            {(marking && !wordTapMode) ? '✏️ On' : '✏️'}
          </Text>
        </TouchableOpacity>

        {/* Word tap mode toggle (only shown when word bounds are available) */}
        {(wordBounds || wordBoundsLoading) && (
          <TouchableOpacity
            style={[
              styles.markBtn,
              { borderColor: T.border },
              wordTapMode && { backgroundColor: T.info, borderColor: T.info },
            ]}
            onPress={() => { setWordTapMode((v) => !v); setMarking(false); }}
          >
            <Text style={[styles.markBtnText, { color: wordTapMode ? '#fff' : T.textSecondary }]}>
              {wordTapMode ? 'ء On' : 'ء'}
            </Text>
          </TouchableOpacity>
        )}

        {/* More actions */}
        <TouchableOpacity style={[styles.menuBtn, { backgroundColor: T.surfaceRaised }]} onPress={() => setActionsOpen(true)}>
          <Text style={[styles.menuBtnText, { color: T.textSecondary }]}>···</Text>
        </TouchableOpacity>
      </View>

      {/* ── Actions sheet ── */}
      <Modal
        visible={actionsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setActionsOpen(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setActionsOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: insets.bottom + 8, backgroundColor: T.surfaceRaised }]}>
            <View style={[styles.sheetHandle, { backgroundColor: T.border }]} />

            <View style={styles.sheetMetaRow}>
              <Text style={[styles.sheetMeta, { color: T.textMuted }]}>
                {savedAnnotations.length} correction{savedAnnotations.length !== 1 ? 's' : ''}
                {savingCount > 0 ? ` · ${savingCount} saving…` : ''}
              </Text>
            </View>

            <View style={[styles.sheetDivider, { backgroundColor: T.divider }]} />

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => handleCompleteReview('needs_resubmission')}
              disabled={submitting}
            >
              <Text style={styles.sheetActionIcon}>↩</Text>
              <Text style={[styles.sheetActionTextDestructive, { color: T.error }]}>Request Another Attempt</Text>
            </TouchableOpacity>

            {attemptHistory.length > 0 && (
              <>
                <View style={[styles.sheetDivider, { backgroundColor: T.divider }]} />
                <TouchableOpacity
                  style={styles.sheetAction}
                  onPress={() => setShowHistory((v) => !v)}
                >
                  <Text style={styles.sheetActionIcon}>📋</Text>
                  <Text style={[styles.sheetActionText, { color: T.textPrimary }]}>
                    Attempt History ({attemptHistory.length})
                  </Text>
                  <Text style={[styles.sheetChevron, { color: T.textMuted }]}>{showHistory ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {showHistory && attemptHistory.map((a) => {
                  const isCurrent = a.id === attemptId;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.historyRow, { borderTopColor: T.divider }, isCurrent && { backgroundColor: T.infoBg }]}
                      onPress={() => handleSwitchAttempt(a)}
                      disabled={isCurrent}
                    >
                      <Text style={[styles.historyNum, { color: isCurrent ? T.info : T.textSecondary }, isCurrent && styles.historyNumCurrent]}>
                        Attempt {a.attemptNumber}{isCurrent ? ' · current' : ''}
                      </Text>
                      <Text style={[styles.historyStatus, { color: T.textMuted }]}>
                        {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                      </Text>
                      <Text style={[styles.historyDate, { color: T.textDisabled }]}>{relativeDate(a.submittedAt)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Annotation details sheet ── */}
      <AnnotationDetailsSheet
        visible={detailsAnnotation !== null}
        annotation={detailsAnnotation}
        categories={categories}
        onUpdateMetadata={handleUpdateMetadata}
        onDelete={handleDeleteSaved}
        onClose={() => setDetailsAnnotation(null)}
      />

      {/* ── Word tap sheet ── */}
      <WordTapSheet
        visible={wordTapPending !== null}
        normX={wordTapPending?.normX ?? 0}
        normY={wordTapPending?.normY ?? 0}
        wordBounds={wordBounds}
        loading={wordBoundsLoading}
        onSelect={handleWordSelect}
        onClose={() => setWordTapPending(null)}
      />

      {/* ── Review voice note modal ── */}
      <Modal
        visible={rvnOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRvnOpen(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setRvnOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, styles.rvnSheet, { paddingBottom: insets.bottom + 16, backgroundColor: T.surfaceRaised }]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: T.border }]} />
            <Text style={[styles.rvnTitle, { color: T.textPrimary }]}>Review Voice Note</Text>
            <Text style={[styles.rvnHint, { color: T.textMuted }]}>
              Leave an overall message for the student about this recitation
            </Text>

            <View style={styles.rvnControls}>
              {/* Has voice note and not actively recording/uploading */}
              {(reviewVoiceNote !== null || rvnState === 'done') &&
               rvnState !== 'recording' &&
               rvnState !== 'uploading' ? (
                <>
                  <TouchableOpacity style={[styles.rvnPlayBtn, { backgroundColor: T.infoBg, borderColor: T.info }]} onPress={handlePlayRvn}>
                    <Text style={[styles.rvnPlayBtnText, { color: T.info }]}>
                      {rvnPlayerStatus.playing ? '⏸  Playing…' : '▶  Play Message'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.rvnReRecordBtn, { backgroundColor: T.successBg, borderColor: T.success }]} onPress={handleStartRvnRecording}>
                    <Text style={[styles.rvnReRecordBtnText, { color: T.success }]}>🎙  Re-record</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rvnDeleteBtn} onPress={handleDeleteRvn}>
                    <Text style={[styles.rvnDeleteBtnText, { color: T.error }]}>Remove Voice Note</Text>
                  </TouchableOpacity>
                </>
              ) : rvnState === 'recording' ? (
                <View style={styles.rvnRecordingRow}>
                  <View style={[styles.rvnRecordingIndicator, { backgroundColor: T.errorBg, borderColor: T.error }]}>
                    <View style={[styles.rvnRecDot, { backgroundColor: T.error }]} />
                    <Text style={[styles.rvnRecTimer, { color: T.error }]}>{formatRvnDuration(rvnDurationMs)}</Text>
                  </View>
                  <TouchableOpacity style={[styles.rvnStopBtn, { backgroundColor: T.error }]} onPress={handleStopRvnRecording}>
                    <Text style={[styles.rvnStopBtnText, { color: T.textPrimary }]}>■  Stop</Text>
                  </TouchableOpacity>
                </View>
              ) : rvnState === 'uploading' ? (
                <View style={styles.rvnUploadingRow}>
                  <ActivityIndicator size="small" color={T.brandPrimary} />
                  <Text style={[styles.rvnUploadingText, { color: T.brandPrimary }]}>Saving voice note…</Text>
                </View>
              ) : (
                <TouchableOpacity style={[styles.rvnRecordBtn, { backgroundColor: T.successBg, borderColor: T.success }]} onPress={handleStartRvnRecording}>
                  <Text style={[styles.rvnRecordBtnText, { color: T.success }]}>🎙  Record Voice Note</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.rvnDoneBtn, { backgroundColor: T.brandPrimary }]}
              onPress={() => setRvnOpen(false)}
            >
              <Text style={[styles.rvnDoneBtnText, { color: T.brandOnPrimary }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarBack: { fontSize: 28, lineHeight: 32 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 15, fontWeight: '700' },
  topBarSub: { fontSize: 12, marginTop: 1 },

  // Canvas area
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

  // Failed banners
  failedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1,
  },
  failedText: { flex: 1, fontSize: 13, fontWeight: '500' },
  failedBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  failedBtnText: { fontSize: 12, fontWeight: '700' },
  failedBtnOutline: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  failedBtnOutlineText: { fontSize: 12, fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completeBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.5 },
  completeBtnText: { fontSize: 14, fontWeight: '700' },
  markBtn: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5,
  },
  markBtnText: { fontSize: 13, fontWeight: '700' },
  menuBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  menuBtnText: { fontSize: 18, letterSpacing: 1 },

  // Review voice note button in bottom bar
  rvnBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1.5,
  },
  rvnBtnText: { fontSize: 17 },

  // Review voice note modal
  rvnSheet: { paddingHorizontal: 20, paddingTop: 8 },
  rvnTitle: { fontSize: 17, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  rvnHint: { fontSize: 13, marginBottom: 20, lineHeight: 18 },
  rvnControls: { gap: 10, marginBottom: 16 },
  rvnRecordBtn: {
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center',
  },
  rvnRecordBtnText: { fontSize: 15, fontWeight: '600' },
  rvnRecordingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rvnRecordingIndicator: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    padding: 14,
  },
  rvnRecDot: { width: 10, height: 10, borderRadius: 5 },
  rvnRecTimer: { fontSize: 14, fontWeight: '700' },
  rvnStopBtn: {
    paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: 12, alignItems: 'center',
  },
  rvnStopBtnText: { fontSize: 14, fontWeight: '700' },
  rvnUploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  rvnUploadingText: { fontSize: 14 },
  rvnPlayBtn: {
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center',
  },
  rvnPlayBtnText: { fontSize: 14, fontWeight: '600' },
  rvnReRecordBtn: {
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, alignItems: 'center',
  },
  rvnReRecordBtnText: { fontSize: 13, fontWeight: '600' },
  rvnDeleteBtn: { paddingVertical: 10, alignItems: 'center' },
  rvnDeleteBtnText: { fontSize: 13, fontWeight: '600' },
  rvnDoneBtn: {
    paddingVertical: 14, alignItems: 'center',
    borderRadius: 12,
  },
  rvnDoneBtnText: { fontSize: 15, fontWeight: '700' },

  // Actions sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetMetaRow: { paddingHorizontal: 20, paddingBottom: 10 },
  sheetMeta: { fontSize: 13, textAlign: 'center' },
  sheetDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 4 },
  sheetAction: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  sheetActionIcon: { fontSize: 18, width: 28 },
  sheetActionText: { fontSize: 16, fontWeight: '500', flex: 1 },
  sheetActionTextDestructive: { fontSize: 16, fontWeight: '500', flex: 1 },
  sheetChevron: { fontSize: 12 },

  // History rows
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 60, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  historyNum: { fontSize: 13, fontWeight: '500', flex: 1 },
  historyNumCurrent: { fontWeight: '700' },
  historyStatus: { fontSize: 12 },
  historyDate: { fontSize: 12, minWidth: 60, textAlign: 'right' },
});
