import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowCounterClockwise,
  CheckCircle,
  PencilSimple,
  TextAa,
  UserCircle,
  Microphone,
  Play,
  Pause,
} from 'phosphor-react-native';
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
  getRecordingUrl,
  getReviewVoiceNote,
  getReviewVoiceNoteReadUrl,
  getReviewVoiceNoteUploadUrl,
  saveReviewVoiceNote,
} from '@/api/teacher';
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

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatSeconds(secs: number): string {
  const s = Math.floor(secs);
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

const GOLD = '#C9A84C';
const SPEEDS = [0.75, 1, 1.5] as const;

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

  // ── Annotation data ────────────────────────────────────────────────────────
  const [savedAnnotations, setSavedAnnotations] = useState<AnnotationRow[]>([]);
  const [localAnnotations, setLocalAnnotations] = useState<LocalAnnotation[]>([]);
  const [categories, setCategories] = useState<MistakeCategoryRow[]>([]);
  const [attemptHistory, setAttemptHistory] = useState<AttemptRow[]>([]);
  const [pageImageUrl, setPageImageUrl]         = useState<string | null>(initialPageImageUrl ?? null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ── Student recording player ───────────────────────────────────────────────
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.75 | 1 | 1.5>(1);
  const recPlayer = useAudioPlayer(recUrl ?? undefined);
  const recStatus = useAudioPlayerStatus(recPlayer);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [marking, setMarking] = useState(false);
  const [wordTapMode, setWordTapMode] = useState(false);
  const [detailsAnnotation, setDetailsAnnotation] = useState<AnnotationRow | null>(null);
  const [studentPanelOpen, setStudentPanelOpen] = useState(false);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);

  // ── Word tap ───────────────────────────────────────────────────────────────
  const [wordBounds, setWordBounds] = useState<PageWordBounds | null>(null);
  const [wordBoundsLoading, setWordBoundsLoading] = useState(false);
  const [wordTapPending, setWordTapPending] = useState<{ normX: number; normY: number } | null>(null);

  // ── Review voice note ──────────────────────────────────────────────────────
  const [reviewVoiceNote, setReviewVoiceNote] = useState<ReviewVoiceNoteRow | null>(null);
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

    // Load student recording signed URL
    setRecLoading(true);
    setRecError(false);
    getRecordingUrl(submissionId, attemptId)
      .then((r) => setRecUrl(r.url))
      .catch(() => setRecError(true))
      .finally(() => setRecLoading(false));

    if (pageNumber) {
      const pNum = parseInt(pageNumber, 10);
      getQuranPage(pNum)
        .then((page) => {
          if (page.imageUrl) setPageImageUrl(page.imageUrl);
          if (page.width && page.height) setImageNaturalSize({ width: page.width, height: page.height });
        })
        .catch(() => {});
      setWordBoundsLoading(true);
      getPageWordBounds(pNum)
        .then(setWordBounds)
        .catch(() => {})
        .finally(() => setWordBoundsLoading(false));
    }
  }, [loadAnnotations, submissionId, attemptId, pageNumber]);

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
      playsInSilentMode: true, allowsRecording: false,
      shouldRouteThroughEarpiece: false, interruptionMode: 'duckOthers',
    }).then(() => rvnPlayer.play()).catch(() => {});
  }, [rvnPlayUrl, rvnPlayer]);

  // ── Student recording play/pause ───────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!recUrl || recError) return;
    if (recStatus.playing) {
      recPlayer.pause();
      return;
    }
    await setAudioModeAsync({
      playsInSilentMode: true, allowsRecording: false,
      shouldRouteThroughEarpiece: false, interruptionMode: 'duckOthers',
    });
    const dur = recStatus.duration ?? 0;
    const cur = recStatus.currentTime ?? 0;
    if (dur > 0 && cur >= dur - 0.5) await recPlayer.seekTo(0);
    recPlayer.play();
  }, [recUrl, recError, recStatus, recPlayer]);

  const handleSpeedChange = useCallback((speed: 0.75 | 1 | 1.5) => {
    setPlaybackSpeed(speed);
    recPlayer.setPlaybackRate(speed);
  }, [recPlayer]);

  // ── Annotation handlers ────────────────────────────────────────────────────
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

  const handleUndo = useCallback(async () => {
    if (savedAnnotations.length === 0) return;
    const last = savedAnnotations[savedAnnotations.length - 1];
    setSavedAnnotations((prev) => prev.slice(0, -1));
    try {
      await deleteAnnotation(last.id);
    } catch {
      setSavedAnnotations((prev) => [...prev, last]);
      Alert.alert('Undo Failed', 'Could not remove last annotation.');
    }
  }, [savedAnnotations]);

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
      ...prev, { localId, points: [{ x: normX, y: normY }], status: 'saving', strokeColor },
    ]);
    try {
      const saved = await createAnnotation(submissionId, attemptId, {
        annotationType: 'word_marker', anchorType: 'word',
        points: [{ x: normX, y: normY }],
        style: { strokeColor, strokeWidth: 3 },
        verseKey: word.verseKey, wordId: word.id,
        wordPosition: word.position, lineNumber: word.lineNumber,
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
    setStudentPanelOpen(false);
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

  const handleSwitchAttempt = (attempt: AttemptRow) => {
    if (attempt.id === attemptId) return;
    setStudentPanelOpen(false);
    router.replace({
      pathname: '/(teacher)/review/[submissionId]',
      params: {
        submissionId, attemptId: attempt.id,
        pageNumber: pageNumber ?? '',
        pageImageUrl: initialPageImageUrl ?? '',
        studentName: studentName ?? '',
        attemptNumber: String(attempt.attemptNumber),
        assignmentTitle: assignmentTitle ?? '',
      },
    });
  };

  // ── RVN handlers ───────────────────────────────────────────────────────────
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
        allowsRecording: false, playsInSilentMode: true,
        shouldRouteThroughEarpiece: false, interruptionMode: 'duckOthers',
      });
      if (uri) await uploadRvn(uri, rvnDurationMs);
    } catch (e) {
      setRvnState('idle');
      Alert.alert('Recording Error', e instanceof Error ? e.message : 'Could not stop recording');
    }
  };

  const uploadRvn = async (uri: string, durationMs: number) => {
    if (!UploadModule) { Alert.alert('Upload Error', 'File upload not available.'); setRvnState('idle'); return; }
    setRvnState('uploading');
    try {
      const contentType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
      const { uploadUrl, storageKey } = await getReviewVoiceNoteUploadUrl(submissionId, attemptId, contentType);
      const result = await UploadModule.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        uploadType: UploadModule.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': contentType },
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);

      let sizeBytes = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FS = require('expo-file-system/legacy');
        const info = await FS.getInfoAsync(uri);
        if (info.exists && 'size' in info) sizeBytes = (info as { size: number }).size;
      } catch { /* best effort */ }

      const saved = await saveReviewVoiceNote(submissionId, attemptId, {
        audioStorageKey: storageKey, durationMs, contentType, sizeBytes,
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
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true, allowsRecording: false,
        shouldRouteThroughEarpiece: false, interruptionMode: 'duckOthers',
      });
      const d = rvnPlayerStatus.duration ?? 0;
      const t = rvnPlayerStatus.currentTime ?? 0;
      if (d > 0 && t >= d - 0.5) await rvnPlayer.seekTo(0);
      rvnPlayer.play();
    } catch {
      Alert.alert('Playback Error', 'Could not load review voice note.');
    }
  };

  const handleDeleteRvn = () => {
    Alert.alert('Remove Voice Note', 'Remove the voice note for this review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
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
    ]);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const failedAnnotations = localAnnotations.filter((a) => a.status === 'failed');
  const savingCount = localAnnotations.filter((a) => a.status === 'saving').length;
  const isPlaying = recStatus.playing;
  const currentTime = recStatus.currentTime ?? 0;
  const duration = recStatus.duration ?? 0;
  const canUndo = savedAnnotations.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: T.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top bar ── */}
      <View style={[s.topBar, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
        <TouchableOpacity style={s.topBarBtn} onPress={() => router.back()}>
          <Text style={[s.topBarBack, { color: T.brandPrimary }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <Text style={[s.topBarTitle, { color: T.textPrimary }]} numberOfLines={1}>
            {studentName || 'Review'}
          </Text>
          <Text style={[s.topBarSub, { color: T.textMuted }]}>
            {assignmentTitle ? `${assignmentTitle} · ` : `Page ${pageNumber ?? '?'} · `}
            Attempt {attemptNumber ?? '1'}
          </Text>
        </View>
        {/* Attempt dots */}
        {attemptHistory.length > 1 && (
          <View style={s.attemptDots}>
            {attemptHistory.map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => handleSwitchAttempt(a)}
                style={[
                  s.attemptDot,
                  { backgroundColor: a.id === attemptId ? GOLD : T.border },
                ]}
              />
            ))}
          </View>
        )}
        {attemptHistory.length <= 1 && <View style={{ width: 44 }} />}
      </View>

      {/* ── Canvas ── */}
      <View
        style={[s.canvasArea, { backgroundColor: T.backgroundAlt }]}
        onLayout={(e) => setCanvasSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })}
      >
        {!pageImageUrl && (
          <View style={s.pagePlaceholder}>
            <Text style={[s.pagePlaceholderText, { color: T.textDisabled }]}>Page unavailable</Text>
          </View>
        )}
        {loadingAnnotations && (
          <View style={s.canvasLoading}>
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
        <View key={local.localId} style={[s.failedBanner, { backgroundColor: T.errorBg, borderTopColor: T.error }]}>
          <Text style={[s.failedText, { color: T.error }]}>⚠ Failed to save</Text>
          <TouchableOpacity style={[s.failedBtn, { backgroundColor: T.error }]} onPress={() => handleRetryFailed(local)}>
            <Text style={[s.failedBtnText, { color: T.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.failedBtnOutline, { borderColor: T.error }]} onPress={() => handleDiscardFailed(local.localId)}>
            <Text style={[s.failedBtnOutlineText, { color: T.error }]}>Discard</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* ── Bottom bar ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8, backgroundColor: T.surface, borderTopColor: T.border }]}>

        {/* Left cluster: annotation tools */}
        <View style={s.toolCluster}>
          {/* Pen */}
          <TouchableOpacity
            style={[s.toolBtn, { backgroundColor: (marking && !wordTapMode) ? GOLD : T.surfaceRaised }]}
            onPress={() => { setMarking((v) => !v); setWordTapMode(false); }}
            accessibilityLabel="Draw mode"
          >
            <PencilSimple
              size={20}
              color={(marking && !wordTapMode) ? '#000' : T.textSecondary}
              weight={(marking && !wordTapMode) ? 'fill' : 'regular'}
            />
          </TouchableOpacity>

          {/* Word tap */}
          {(wordBounds || wordBoundsLoading) && (
            <TouchableOpacity
              style={[s.toolBtn, { backgroundColor: wordTapMode ? T.info : T.surfaceRaised }]}
              onPress={() => { setWordTapMode((v) => !v); setMarking(false); }}
              accessibilityLabel="Word tap mode"
            >
              <TextAa
                size={20}
                color={wordTapMode ? '#fff' : T.textSecondary}
                weight={wordTapMode ? 'fill' : 'regular'}
              />
            </TouchableOpacity>
          )}

          {/* Undo */}
          <TouchableOpacity
            style={[s.toolBtn, { backgroundColor: T.surfaceRaised, opacity: canUndo ? 1 : 0.35 }]}
            onPress={handleUndo}
            disabled={!canUndo}
            accessibilityLabel="Undo last annotation"
          >
            <ArrowCounterClockwise size={20} color={T.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Student context */}
        <TouchableOpacity
          style={[s.toolBtn, { backgroundColor: T.surfaceRaised }]}
          onPress={() => setStudentPanelOpen(true)}
          accessibilityLabel="Student context"
        >
          <UserCircle size={20} color={T.textSecondary} />
          {savingCount > 0 && (
            <View style={[s.savingDot, { backgroundColor: GOLD }]} />
          )}
        </TouchableOpacity>

        {/* FAB — play/pause student recording */}
        <Pressable
          onPress={handlePlayPause}
          onLongPress={() => setAudioPanelOpen(true)}
          delayLongPress={400}
          style={[
            s.fab,
            { backgroundColor: recError ? T.surfaceRaised : GOLD },
            recLoading && s.fabLoading,
          ]}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play student recording'}
        >
          {recLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : recError ? (
            <Text style={s.fabErrorText}>!</Text>
          ) : isPlaying ? (
            <Pause size={22} color="#000" weight="fill" />
          ) : (
            <Play size={22} color="#000" weight="fill" />
          )}
        </Pressable>
      </View>

      {/* ── Student context / history / completion panel ── */}
      <Modal
        visible={studentPanelOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setStudentPanelOpen(false)}
      >
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setStudentPanelOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[s.sheet, { paddingBottom: insets.bottom + 8, backgroundColor: T.surfaceRaised }]}
          >
            <View style={[s.sheetHandle, { backgroundColor: T.border }]} />

            {/* Student header */}
            <View style={s.panelHeader}>
              <View style={[s.panelAvatar, { backgroundColor: GOLD }]}>
                <Text style={s.panelAvatarText}>
                  {(studentName ?? 'S').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={s.panelHeaderInfo}>
                <Text style={[s.panelStudentName, { color: T.textPrimary }]}>{studentName ?? 'Student'}</Text>
                <Text style={[s.panelPageInfo, { color: T.textMuted }]}>
                  Page {pageNumber ?? '?'} · {savedAnnotations.length} mark{savedAnnotations.length !== 1 ? 's' : ''}
                  {savingCount > 0 ? ` · ${savingCount} saving…` : ''}
                </Text>
              </View>
            </View>

            <View style={[s.sheetDivider, { backgroundColor: T.divider }]} />

            {/* Attempt history */}
            {attemptHistory.length > 0 && (
              <ScrollView style={s.historyScroll} showsVerticalScrollIndicator={false}>
                {attemptHistory.map((a) => {
                  const isCurrent = a.id === attemptId;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[
                        s.historyRow,
                        { borderTopColor: T.divider },
                        isCurrent && { backgroundColor: T.infoBg },
                      ]}
                      onPress={() => handleSwitchAttempt(a)}
                      disabled={isCurrent}
                    >
                      <Text style={[s.historyNum, { color: isCurrent ? T.info : T.textSecondary }, isCurrent && { fontWeight: '700' }]}>
                        Attempt {a.attemptNumber}{isCurrent ? ' · current' : ''}
                      </Text>
                      <Text style={[s.historyStatus, { color: T.textMuted }]}>
                        {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                      </Text>
                      <Text style={[s.historyDate, { color: T.textDisabled }]}>{relativeDate(a.submittedAt)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={[s.sheetDivider, { backgroundColor: T.divider }]} />

            {/* Completion actions */}
            <View style={s.completionRow}>
              <TouchableOpacity
                style={[s.completeBtn, { backgroundColor: GOLD }, submitting && { opacity: 0.5 }]}
                onPress={() => handleCompleteReview('completed')}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#000" size="small" />
                  : <>
                      <CheckCircle size={18} color="#000" weight="fill" />
                      <Text style={s.completeBtnText}>Mark Complete</Text>
                    </>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.retryBtn, { borderColor: T.error }, submitting && { opacity: 0.5 }]}
                onPress={() => handleCompleteReview('needs_resubmission')}
                disabled={submitting}
              >
                <Text style={[s.retryBtnText, { color: T.error }]}>Request Retry</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Audio panel (long-press FAB) ── */}
      <Modal
        visible={audioPanelOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAudioPanelOpen(false)}
      >
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setAudioPanelOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[s.sheet, s.audioPanelSheet, { paddingBottom: insets.bottom + 16, backgroundColor: T.surfaceRaised }]}
          >
            <View style={[s.sheetHandle, { backgroundColor: T.border }]} />
            <Text style={[s.audioPanelTitle, { color: T.textPrimary }]}>Student Recording</Text>

            {/* Time display */}
            <Text style={[s.audioTime, { color: T.textMuted }]}>
              {formatSeconds(currentTime)}{duration > 0 ? ` / ${formatSeconds(duration)}` : ''}
            </Text>

            {/* Play/pause */}
            <TouchableOpacity
              style={[s.audioPanelPlay, { backgroundColor: GOLD }]}
              onPress={() => { setAudioPanelOpen(false); handlePlayPause(); }}
            >
              {isPlaying
                ? <Pause size={24} color="#000" weight="fill" />
                : <Play size={24} color="#000" weight="fill" />
              }
              <Text style={s.audioPanelPlayText}>{isPlaying ? 'Pause' : 'Play'}</Text>
            </TouchableOpacity>

            {/* Speed */}
            <View style={s.speedRow}>
              {SPEEDS.map((spd) => (
                <TouchableOpacity
                  key={spd}
                  style={[
                    s.speedBtn,
                    { backgroundColor: playbackSpeed === spd ? GOLD : T.surfaceRaised },
                  ]}
                  onPress={() => handleSpeedChange(spd)}
                >
                  <Text style={[s.speedBtnText, { color: playbackSpeed === spd ? '#000' : T.textSecondary }]}>
                    {spd}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[s.sheetDivider, { backgroundColor: T.divider, marginVertical: 12 }]} />

            {/* Voice note */}
            {rvnState === 'recording' ? (
              <View style={s.rvnRecRow}>
                <View style={[s.rvnRecIndicator, { borderColor: T.error, backgroundColor: T.errorBg }]}>
                  <View style={[s.rvnRecDot, { backgroundColor: T.error }]} />
                  <Text style={[s.rvnRecTimer, { color: T.error }]}>{formatDuration(rvnDurationMs)}</Text>
                </View>
                <TouchableOpacity style={[s.rvnStopBtn, { backgroundColor: T.error }]} onPress={handleStopRvnRecording}>
                  <Text style={[s.rvnStopText, { color: '#fff' }]}>■  Stop</Text>
                </TouchableOpacity>
              </View>
            ) : rvnState === 'uploading' ? (
              <View style={s.rvnUploadRow}>
                <ActivityIndicator size="small" color={T.brandPrimary} />
                <Text style={[s.rvnUploadText, { color: T.textMuted }]}>Saving voice note…</Text>
              </View>
            ) : (reviewVoiceNote || rvnState === 'done') ? (
              <View style={s.rvnExistsRow}>
                <TouchableOpacity
                  style={[s.rvnPlayBtn, { backgroundColor: T.infoBg, borderColor: T.info }]}
                  onPress={handlePlayRvn}
                >
                  <Microphone size={16} color={T.info} weight="fill" />
                  <Text style={[s.rvnPlayText, { color: T.info }]}>
                    {rvnPlayerStatus.playing ? 'Pause message' : 'Play message'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.rvnReRecordBtn, { backgroundColor: T.surfaceRaised }]}
                  onPress={handleStartRvnRecording}
                >
                  <Text style={[s.rvnReRecordText, { color: T.textSecondary }]}>Re-record</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteRvn}>
                  <Text style={[s.rvnDeleteText, { color: T.error }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.rvnRecordBtn, { backgroundColor: T.surfaceRaised, borderColor: T.border }]}
                onPress={handleStartRvnRecording}
              >
                <Microphone size={18} color={T.textSecondary} />
                <Text style={[s.rvnRecordText, { color: T.textSecondary }]}>Record voice note for student</Text>
              </TouchableOpacity>
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
        canvasWidth={canvasSize?.width ?? 0}
        canvasHeight={canvasSize?.height ?? 0}
        imageWidth={imageNaturalSize?.width ?? null}
        imageHeight={imageNaturalSize?.height ?? null}
        onSelect={handleWordSelect}
        onClose={() => setWordTapPending(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    height: 52, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarBack: { fontSize: 28, lineHeight: 32 },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 15, fontWeight: '700' },
  topBarSub: { fontSize: 12, marginTop: 1 },
  attemptDots: { flexDirection: 'row', gap: 6, paddingRight: 12 },
  attemptDot: { width: 8, height: 8, borderRadius: 4 },

  // Canvas
  canvasArea: { flex: 1, overflow: 'hidden' },
  pagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagePlaceholderText: { fontSize: 13 },
  canvasLoading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },

  // Failed banners
  failedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1,
  },
  failedText: { flex: 1, fontSize: 13, fontWeight: '500' },
  failedBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  failedBtnText: { fontSize: 12, fontWeight: '700' },
  failedBtnOutline: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  failedBtnOutlineText: { fontSize: 12, fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 10, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolCluster: { flexDirection: 'row', gap: 8 },
  toolBtn: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  savingDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 4,
  },

  // FAB
  fab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
    elevation: 6,
  },
  fabLoading: { opacity: 0.7 },
  fabErrorText: { fontSize: 20, fontWeight: '700', color: '#fff' },

  // Sheet base
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 4 },

  // Student panel
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  panelAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  panelAvatarText: { fontSize: 18, fontWeight: '700', color: '#000' },
  panelHeaderInfo: { flex: 1 },
  panelStudentName: { fontSize: 16, fontWeight: '700' },
  panelPageInfo: { fontSize: 12, marginTop: 2 },

  historyScroll: { maxHeight: 200, paddingHorizontal: 20 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  historyNum: { fontSize: 13, fontWeight: '500', flex: 1 },
  historyStatus: { fontSize: 12 },
  historyDate: { fontSize: 12, minWidth: 60, textAlign: 'right' },

  completionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  completeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, paddingVertical: 13,
  },
  completeBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  retryBtn: {
    paddingHorizontal: 16, paddingVertical: 13,
    borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center',
  },
  retryBtnText: { fontSize: 13, fontWeight: '600' },

  // Audio panel
  audioPanelSheet: { paddingHorizontal: 20, paddingTop: 8 },
  audioPanelTitle: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  audioTime: { fontSize: 13, textAlign: 'center', marginBottom: 16, fontVariant: ['tabular-nums'] },
  audioPanelPlay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14, marginBottom: 12,
  },
  audioPanelPlayText: { fontSize: 15, fontWeight: '700', color: '#000' },
  speedRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  speedBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10 },
  speedBtnText: { fontSize: 14, fontWeight: '700' },

  // RVN in audio panel
  rvnRecordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  rvnRecordText: { fontSize: 14, fontWeight: '500' },
  rvnRecRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rvnRecIndicator: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  rvnRecDot: { width: 10, height: 10, borderRadius: 5 },
  rvnRecTimer: { fontSize: 13, fontWeight: '700' },
  rvnStopBtn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center' },
  rvnStopText: { fontSize: 13, fontWeight: '700' },
  rvnUploadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rvnUploadText: { fontSize: 13 },
  rvnExistsRow: { gap: 8 },
  rvnPlayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  rvnPlayText: { fontSize: 14, fontWeight: '600' },
  rvnReRecordBtn: { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  rvnReRecordText: { fontSize: 13, fontWeight: '500' },
  rvnDeleteText: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 6 },
});
