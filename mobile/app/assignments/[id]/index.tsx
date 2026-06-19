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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { BookOpen, Eye, ListBullets, Microphone } from 'phosphor-react-native';
import { getStudentAssignment } from '@/api/assignments';
import { getQuranPage } from '@/api/quran';
import { getStudentSubmissions, getSubmissionAttempts } from '@/api/submissions';
import { getAnnotations, getVoiceNoteReadUrl } from '@/api/annotations';
import { getReviewVoiceNote, getReviewVoiceNoteReadUrl } from '@/api/teacher';
import AnnotationCanvas from '@/components/AnnotationCanvas';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useTheme } from '@/hooks/useTheme';
import type {
  AnnotationRow,
  AssignmentSummary,
  AttemptRow,
  ReviewVoiceNoteRow,
  SubmissionRow,
} from '@/types/api';

const GOLD = '#C9A84C';

const MISTAKE_COLORS: Record<string, string> = {
  tajweed: '#7C3AED', harakat: '#D97706', wrong_word: '#DC2626',
  wrong_ayah: '#DC2626', makhraj: '#0369A1', madd: '#059669',
  ghunnah: '#059669', waqf: '#6B7280', pronunciation: '#D97706',
  memorization: '#DC2626', other: '#6B7280',
};

const MISTAKE_NAMES: Record<string, string> = {
  tajweed: 'Tajweed', harakat: 'Harakat', wrong_word: 'Wrong Word',
  wrong_ayah: 'Wrong Ayah', makhraj: 'Makhraj', madd: 'Madd',
  ghunnah: 'Ghunnah', waqf: 'Waqf', pronunciation: 'Pronunciation',
  memorization: 'Memorization', other: 'Other',
};

const ATTEMPT_LABELS: Record<string, string> = {
  submitted: 'Under Review',
  in_review: 'Under Review',
  reviewed: 'Feedback Ready',
  needs_resubmission: 'Practice Needed',
  completed: 'Completed',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Teacher Reviewing',
  in_review: 'Teacher Reviewing',
  reviewed: 'Feedback Available',
  needs_resubmission: 'Needs Practice',
  completed: 'Completed',
  archived: 'Archived',
};

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

// ── Annotation detail sheet ───────────────────────────────────────────────────

function AnnotationDetailSheet({
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
    ? (MISTAKE_COLORS[annotation.mistakeType] ?? T.textMuted)
    : T.brandPrimary;
  const label = annotation.quickLabel
    ?? (annotation.mistakeType ? MISTAKE_NAMES[annotation.mistakeType] : null);

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
      <View style={[ds.overlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View style={[ds.sheet, { backgroundColor: T.surface, paddingBottom: insets.bottom + 8 }]}>
          <View style={[ds.handle, { backgroundColor: T.border }]} />
          <View style={[ds.header, { borderBottomColor: T.divider }]}>
            <View style={[ds.colorBar, { backgroundColor: color }]} />
            <Text style={[ds.title, { color: T.textPrimary }]}>Teacher's Note</Text>
            <TouchableOpacity onPress={onClose} style={ds.closeBtn}>
              <Text style={[ds.closeBtnText, { color: T.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          {!hasContent ? (
            <View style={ds.emptyBody}>
              <Text style={[ds.emptyText, { color: T.textDisabled }]}>Freehand mark — no note added</Text>
            </View>
          ) : (
            <View style={ds.body}>
              {label && (
                <View style={[ds.chip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Text style={[ds.chipText, { color }]}>{label}</Text>
                </View>
              )}
              {annotation.noteText && (
                <Text style={[ds.noteText, { color: T.textSecondary }]}>{annotation.noteText}</Text>
              )}
              {annotation.hasVoiceNote && (
                <TouchableOpacity
                  style={[ds.voiceBtn, { backgroundColor: T.infoBg, borderColor: T.info }]}
                  onPress={handlePlayVoiceNote}
                  disabled={loadingVoice}
                >
                  {loadingVoice
                    ? <ActivityIndicator size="small" color={T.info} />
                    : <Text style={[ds.voiceBtnText, { color: T.info }]}>
                        {playerStatus.playing ? '⏸  Pause Voice Note' : '▶  Play Voice Note'}
                      </Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}
          <TouchableOpacity
            style={[ds.doneBtn, { backgroundColor: T.brandPrimary, marginHorizontal: 16 }]}
            onPress={onClose}
          >
            <Text style={[ds.doneBtnText, { color: T.brandOnPrimary }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Mode = 'page' | 'feedback';

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme('dark');
  const T = theme.colors;

  // ── Core data ───────────────────────────────────────────────────────────────
  const [assignment, setAssignment]     = useState<AssignmentSummary | null>(null);
  const [submission, setSubmission]     = useState<SubmissionRow | null>(null);
  const [attempts, setAttempts]         = useState<AttemptRow[]>([]);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [mode, setMode]                   = useState<Mode>('page');
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [canvasSize, setCanvasSize]       = useState<{ width: number; height: number } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationRow | null>(null);

  // ── Feedback state ──────────────────────────────────────────────────────────
  const [selectedAttemptId, setSelectedAttemptId]   = useState<string | null>(null);
  const [annotations, setAnnotations]               = useState<AnnotationRow[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [reviewVoiceNote, setReviewVoiceNote]       = useState<ReviewVoiceNoteRow | null>(null);
  const [rvnPlayUrl, setRvnPlayUrl]                 = useState<string | null>(null);
  const rvnPlayer       = useAudioPlayer(rvnPlayUrl ?? '');
  const rvnPlayerStatus = useAudioPlayerStatus(rvnPlayer);

  // ── Load assignment + submission + attempts + page image ─────────────────
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [asgn, allSubs] = await Promise.all([
        getStudentAssignment(id),
        getStudentSubmissions(),
      ]);
      setAssignment(asgn);

      const sub = allSubs.find((s) => s.assignmentId === asgn.id) ?? null;
      setSubmission(sub);

      if (sub) {
        try {
          const atts = await getSubmissionAttempts(sub.id);
          setAttempts(atts);
        } catch { /* non-fatal */ }
      }

      if (asgn.pageNumber != null) {
        try {
          const page = await getQuranPage(asgn.pageNumber);
          setPageImageUrl(page.imageUrl);
        } catch { /* non-fatal */ }
      }

      // Decide initial mode
      const hasFeedback = sub && ['reviewed', 'completed', 'needs_resubmission'].includes(sub.status);
      if (hasFeedback && sub?.currentAttemptId) {
        setMode('feedback');
        setSelectedAttemptId(sub.currentAttemptId);
      } else {
        setMode('page');
        setSelectedAttemptId(sub?.currentAttemptId ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  // ── Load annotations + teacher voice note when entering feedback mode ─────
  useEffect(() => {
    if (mode !== 'feedback' || !submission || !selectedAttemptId) return;

    let cancelled = false;
    setAnnotations([]);
    setLoadingAnnotations(true);
    setReviewVoiceNote(null);
    setRvnPlayUrl(null);

    (async () => {
      try {
        const all: AnnotationRow[] = [];
        let cursor: string | undefined;
        let hasMore = true;
        while (hasMore) {
          const result = await getAnnotations(submission.id, selectedAttemptId, cursor);
          all.push(...result.data);
          hasMore = result.hasMore;
          cursor = result.nextCursor;
        }
        if (!cancelled) setAnnotations(all);
      } catch { /* non-fatal */ } finally {
        if (!cancelled) setLoadingAnnotations(false);
      }
      try {
        const rvn = await getReviewVoiceNote(submission.id, selectedAttemptId);
        if (!cancelled) setReviewVoiceNote(rvn);
      } catch { /* no voice note */ }
    })();

    return () => { cancelled = true; };
  }, [mode, submission, selectedAttemptId]);

  // ── Teacher voice note playback ───────────────────────────────────────────
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
        playsInSilentMode: true, allowsRecording: false,
        shouldRouteThroughEarpiece: false, interruptionMode: 'duckOthers',
      });
      rvnPlayer.play();
    } catch {
      Alert.alert('Playback Error', 'Could not load teacher voice note.');
    }
  };

  // ── Switch to a different attempt's feedback ──────────────────────────────
  const handleSelectAttempt = (attempt: AttemptRow) => {
    setHistoryOpen(false);
    setSelectedAttemptId(attempt.id);
    setMode('feedback');
  };

  // ── Navigate to recording room ────────────────────────────────────────────
  const handleRecord = () => {
    router.push({
      pathname: '/assignments/[id]/record',
      params: submission ? { id, submissionId: submission.id } : { id },
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen message="Loading…" />;
  if (error || !assignment)
    return <ErrorScreen message={error ?? 'Assignment not found'} onRetry={() => load()} />;

  const hasFeedback = submission !== null &&
    ['reviewed', 'completed', 'needs_resubmission'].includes(submission.status);

  const canRecord = !submission ||
    submission.status === 'draft' ||
    submission.status === 'needs_resubmission';

  const hasAttempts = attempts.length > 0;

  const title = assignment.title && assignment.title !== `Page ${assignment.pageNumber}`
    ? assignment.title
    : assignment.surahNameEnglish && assignment.pageNumber != null
      ? `${assignment.surahNameEnglish} — Page ${assignment.pageNumber}`
      : assignment.pageNumber != null ? `Page ${assignment.pageNumber}` : 'Assignment';

  const statusLabel = submission
    ? (STATUS_LABELS[submission.status] ?? submission.status)
    : null;
  const statusChip = submission
    ? (theme.chips[submission.status as keyof typeof theme.chips] ?? null)
    : null;

  const labelledAnnotations = annotations.filter(
    (a) => a.quickLabel || a.mistakeType || a.noteText || a.hasVoiceNote,
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: T.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top bar ── */}
      <View style={[s.topBar, { backgroundColor: T.surface, borderBottomColor: T.border }]}>
        <TouchableOpacity style={s.topBarBtn} onPress={() => router.back()}>
          <Text style={[s.topBarBack, { color: T.brandPrimary }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <Text style={[s.topBarTitle, { color: T.textPrimary }]} numberOfLines={1}>{title}</Text>
          {assignment.surahNameEnglish && (
            <Text style={[s.topBarSub, { color: T.textMuted }]}>
              {assignment.surahNameEnglish}
              {selectedAttemptId && attempts.length > 1
                ? ` · Attempt ${attempts.find((a) => a.id === selectedAttemptId)?.attemptNumber ?? ''}`
                : ''}
            </Text>
          )}
        </View>
        {statusLabel && statusChip && (
          <View style={[s.statusPill, { backgroundColor: statusChip.bg }]}>
            <Text style={[s.statusPillText, { color: statusChip.text }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        )}
      </View>

      {/* ── Canvas area ── */}
      <View
        style={[s.canvas, { backgroundColor: T.backgroundAlt }]}
        onLayout={(e) => setCanvasSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })}
      >
        {loadingAnnotations && mode === 'feedback' && (
          <View style={s.canvasSpinner}>
            <ActivityIndicator color={T.brandPrimary} />
          </View>
        )}

        {canvasSize && (
          <AnnotationCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            imageUrl={pageImageUrl ?? undefined}
            savedAnnotations={mode === 'feedback' ? annotations : []}
            localAnnotations={[]}
            drawEnabled={false}
            readOnly
            onAnnotationTap={mode === 'feedback' ? setSelectedAnnotation : undefined}
          />
        )}

        {/* Feedback mode overlays */}
        {mode === 'feedback' && !loadingAnnotations && annotations.length > 0 && (
          <View style={s.tapHint}>
            <Text style={[s.tapHintText, { color: T.textSecondary, backgroundColor: T.surfaceOverlay, borderColor: T.border }]}>
              Tap a mark to see feedback
            </Text>
          </View>
        )}

        {mode === 'feedback' && !loadingAnnotations && annotations.length === 0 && (
          <View style={s.tapHint}>
            <Text style={[s.tapHintText, { color: T.textMuted, backgroundColor: T.surfaceOverlay, borderColor: T.border }]}>
              No marks on this attempt
            </Text>
          </View>
        )}

        {/* Page mode — instructions */}
        {mode === 'page' && assignment.instructions && (
          <View style={s.instructionsOverlay}>
            <Text style={s.instructionsText} numberOfLines={3}>
              📝 {assignment.instructions}
            </Text>
          </View>
        )}
      </View>

      {/* ── Bottom bar ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8, backgroundColor: T.surface, borderTopColor: T.border }]}>

        {/* Mode tabs */}
        <View style={s.modeTabs}>
          <TouchableOpacity
            style={[s.modeTab, mode === 'page' && s.modeTabActive]}
            onPress={() => setMode('page')}
          >
            <BookOpen
              size={22}
              color={mode === 'page' ? GOLD : (T.textMuted as string)}
              weight={mode === 'page' ? 'fill' : 'regular'}
            />
            <Text style={[s.modeLabel, { color: mode === 'page' ? GOLD : T.textMuted }]}>Page</Text>
          </TouchableOpacity>

          {hasFeedback && (
            <TouchableOpacity
              style={[s.modeTab, mode === 'feedback' && s.modeTabActiveFeedback]}
              onPress={() => setMode('feedback')}
            >
              <Eye
                size={22}
                color={mode === 'feedback' ? T.info : (T.textMuted as string)}
                weight={mode === 'feedback' ? 'fill' : 'regular'}
              />
              <View style={s.modeTabLabelRow}>
                <Text style={[s.modeLabel, { color: mode === 'feedback' ? T.info : T.textMuted }]}>Feedback</Text>
                {annotations.length > 0 && mode === 'feedback' && (
                  <View style={[s.annotationBadge, { backgroundColor: T.info }]}>
                    <Text style={[s.annotationBadgeText, { color: '#fff' }]}>{annotations.length}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}

          {hasAttempts && (
            <TouchableOpacity
              style={s.modeTab}
              onPress={() => setHistoryOpen(true)}
            >
              <ListBullets size={22} color={T.textMuted as string} />
              <Text style={[s.modeLabel, { color: T.textMuted }]}>Past</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Audio player — shown in feedback mode, lives in the bar */}
        {mode === 'feedback' && submission && selectedAttemptId && (
          <View style={s.barAudio}>
            <AudioPlayerBar
              submissionId={submission.id}
              attemptId={selectedAttemptId}
              compact
            />
            {reviewVoiceNote && (
              <TouchableOpacity
                style={[s.rvnBtn, { backgroundColor: T.infoBg, borderColor: T.info }]}
                onPress={handlePlayRvn}
              >
                <Text style={[s.rvnBtnText, { color: T.info }]}>
                  {rvnPlayerStatus.playing ? '⏸' : '🎙'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Spacer pushes record button to the right */}
        <View style={{ flex: 1 }} />

        {/* Record button */}
        {canRecord && (
          <TouchableOpacity style={[s.recordBtn, { backgroundColor: GOLD }]} onPress={handleRecord}>
            <Microphone size={20} color="#000" weight="fill" />
          </TouchableOpacity>
        )}

        {/* Waiting spinner when submitted / in_review */}
        {!canRecord && !hasFeedback && submission && (
          <ActivityIndicator size="small" color={T.warning} style={s.waitingSpinner} />
        )}
      </View>

      {/* ── Past attempts sheet ── */}
      <Modal
        visible={historyOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryOpen(false)}
      >
        <TouchableOpacity
          style={s.sheetOverlay}
          activeOpacity={1}
          onPress={() => setHistoryOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[s.sheet, { paddingBottom: insets.bottom + 12, backgroundColor: T.surface }]}
          >
            <View style={[s.sheetHandle, { backgroundColor: T.border }]} />
            <Text style={[s.sheetTitle, { color: T.textPrimary }]}>Your Attempts</Text>
            <ScrollView style={s.sheetScroll} showsVerticalScrollIndicator={false}>
              {[...attempts].reverse().map((a) => {
                const isCurrent  = a.id === submission?.currentAttemptId;
                const isSelected = a.id === selectedAttemptId;
                const chip     = theme.chips[a.status as keyof typeof theme.chips];
                const chipBg   = chip?.bg   ?? T.backgroundAlt;
                const chipText = chip?.text ?? T.textMuted;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      s.attemptRow,
                      { borderTopColor: T.divider },
                      isSelected && { backgroundColor: T.brandPrimarySoft, marginHorizontal: -20, paddingHorizontal: 20 },
                    ]}
                    onPress={() => handleSelectAttempt(a)}
                    activeOpacity={0.6}
                  >
                    <View style={s.attemptInfo}>
                      <Text style={[
                        s.attemptNum,
                        { color: isCurrent ? T.brandPrimary : T.textSecondary },
                        isCurrent && { fontWeight: '700' },
                      ]}>
                        Attempt {a.attemptNumber}
                        {isCurrent ? ' · current' : ''}
                      </Text>
                      <Text style={[s.attemptDate, { color: T.textMuted }]}>{relativeDate(a.submittedAt)}</Text>
                    </View>
                    <View style={[s.attemptBadge, { backgroundColor: chipBg }]}>
                      <Text style={[s.attemptBadgeText, { color: chipText }]}>
                        {ATTEMPT_LABELS[a.status] ?? a.status}
                      </Text>
                    </View>
                    <Text style={[s.attemptChev, { color: T.textMuted }]}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Annotation detail ── */}
      {selectedAnnotation && (
        <AnnotationDetailSheet
          annotation={selectedAnnotation}
          onClose={() => setSelectedAnnotation(null)}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

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
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, marginRight: 8, maxWidth: 130,
  },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  canvas: { flex: 1, overflow: 'hidden' },
  canvasSpinner: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },

  tapHint: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  tapHintText: {
    fontSize: 12, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
  },

  barAudio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 6,
  },
  rvnBtn: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1,
  },
  rvnBtnText: { fontSize: 14, fontWeight: '600' },

  instructionsOverlay: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  instructionsText: { fontSize: 13, color: '#fff', lineHeight: 18 },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  modeTabs: { flexDirection: 'row', gap: 4 },
  modeTab: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modeTabActive: { borderBottomColor: GOLD },
  modeTabActiveFeedback: { borderBottomColor: '#0369A1' },
  modeTabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modeLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  annotationBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  annotationBadgeText: { fontSize: 9, fontWeight: '800' },

  recordBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  waitingSpinner: { marginRight: 8 },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, maxHeight: '70%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 8 },
  sheetScroll: { paddingHorizontal: 20 },

  attemptRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderTopWidth: 1, gap: 10,
  },
  attemptInfo: { flex: 1 },
  attemptNum:  { fontSize: 14, fontWeight: '500' },
  attemptDate: { fontSize: 12, marginTop: 2 },
  attemptBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  attemptBadgeText: { fontSize: 11, fontWeight: '700' },
  attemptChev: { fontSize: 20 },
});

// ── Annotation detail sheet styles ────────────────────────────────────────────

const ds = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  header:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10, borderBottomWidth: 1 },
  colorBar:    { width: 4, height: 20, borderRadius: 2 },
  title:       { fontSize: 16, fontWeight: '700', flex: 1 },
  closeBtn:    { padding: 4 },
  closeBtnText:{ fontSize: 18 },
  emptyBody:   { padding: 24, alignItems: 'center' },
  emptyText:   { fontSize: 14 },
  body:        { padding: 16, gap: 12 },
  chip:        { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chipText:    { fontSize: 14, fontWeight: '700' },
  noteText:    { fontSize: 15, lineHeight: 22 },
  voiceBtn:    { borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  voiceBtnText:{ fontSize: 14, fontWeight: '600' },
  doneBtn:     { paddingVertical: 13, alignItems: 'center', borderRadius: 12, marginTop: 4 },
  doneBtnText: { fontSize: 15, fontWeight: '700' },
});
