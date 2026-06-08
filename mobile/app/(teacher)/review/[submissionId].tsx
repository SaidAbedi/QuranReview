import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { createAnnotation, deleteAnnotation, getAnnotations, updateAnnotation } from '@/api/annotations';
import { getQuranPage } from '@/api/quran';
import { completeReview, getMistakeCategories, getAttemptHistory } from '@/api/teacher';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import AnnotationCanvas, { LocalAnnotation, TOOL_COLORS } from '@/components/AnnotationCanvas';
import AnnotationDetailsSheet from '@/components/AnnotationDetailsSheet';
import type {
  AnnotationPoint,
  AnnotationRow,
  AttemptRow,
  MistakeCategoryRow,
} from '@/types/api';

type Mode = 'navigate' | 'annotate';
type Tool = 'freehand' | 'circle' | 'underline' | 'highlight';

const TOOLS: { key: Tool; label: string }[] = [
  { key: 'freehand', label: 'Pen' },
  { key: 'circle', label: 'Circle' },
  { key: 'underline', label: 'Line' },
  { key: 'highlight', label: 'Mark' },
];

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
function nextLocalId() {
  return `local-${Date.now()}-${localIdCounter++}`;
}

export default function ReviewDetailScreen() {
  const router = useRouter();
  const {
    submissionId,
    attemptId,
    pageNumber,
    pageImageUrl,
    studentName,
    attemptNumber,
    assignmentTitle,
  } = useLocalSearchParams<{
    submissionId: string;
    attemptId: string;
    pageNumber: string;
    pageImageUrl: string;
    studentName: string;
    attemptNumber: string;
    assignmentTitle: string;
  }>();

  // ── Data state ─────────────────────────────────────────────────────────────
  const [savedAnnotations, setSavedAnnotations] = useState<AnnotationRow[]>([]);
  const [localAnnotations, setLocalAnnotations] = useState<LocalAnnotation[]>([]);
  const [categories, setCategories] = useState<MistakeCategoryRow[]>([]);
  const [attemptHistory, setAttemptHistory] = useState<AttemptRow[]>([]);
  const [resolvedPageImageUrl, setResolvedPageImageUrl] = useState<string | null>(
    pageImageUrl ?? null,
  );
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(0.7);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number } | null>(null);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── Annotation UX state ────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('navigate');
  const [activeTool, setActiveTool] = useState<Tool>('freehand');
  const [detailsAnnotation, setDetailsAnnotation] = useState<AnnotationRow | null>(null);

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
    } catch {
      // Non-fatal
    } finally {
      setLoadingAnnotations(false);
    }
  }, [submissionId, attemptId]);

  useEffect(() => {
    loadAnnotations();
    getMistakeCategories().then(setCategories).catch(() => {});
    getAttemptHistory(submissionId).then(setAttemptHistory).catch(() => {});
    if (pageNumber) {
      getQuranPage(parseInt(pageNumber, 10))
        .then((page) => {
          if (page.imageUrl) setResolvedPageImageUrl(page.imageUrl);
          if (page.width && page.height) setPageAspectRatio(page.width / page.height);
        })
        .catch(() => {});
    }
  }, [loadAnnotations, submissionId, pageNumber]);

  // ── Stroke complete → auto-save ────────────────────────────────────────────
  const handleStrokeComplete = useCallback(
    async (points: AnnotationPoint[]) => {
      const localId = nextLocalId();
      const strokeColor = TOOL_COLORS[activeTool] ?? TOOL_COLORS.freehand;

      // 1. Optimistically add the stroke as 'saving'
      const local: LocalAnnotation = { localId, points, status: 'saving', strokeColor };
      setLocalAnnotations((prev) => [...prev, local]);

      try {
        // 2. POST to backend
        const saved = await createAnnotation(submissionId, attemptId, {
          annotationType: 'freehand',
          anchorType: 'page_region',
          points,
          style: { strokeColor, strokeWidth: 3 },
        });

        // 3. Move from local to saved
        setLocalAnnotations((prev) => prev.filter((a) => a.localId !== localId));
        setSavedAnnotations((prev) => [...prev, saved]);

        // 4. Open details sheet so teacher can add label/note
        setDetailsAnnotation(saved);
      } catch {
        // 5. Mark as failed so teacher can retry or delete
        setLocalAnnotations((prev) =>
          prev.map((a) => (a.localId === localId ? { ...a, status: 'failed' } : a)),
        );
      }
    },
    [submissionId, attemptId, activeTool],
  );

  // ── Annotation tap → open details ─────────────────────────────────────────
  const handleAnnotationTap = useCallback((ann: AnnotationRow) => {
    setDetailsAnnotation(ann);
  }, []);

  // ── Retry failed local annotation ─────────────────────────────────────────
  const handleRetryFailed = useCallback(
    async (local: LocalAnnotation) => {
      const strokeColor = local.strokeColor ?? TOOL_COLORS.freehand;
      setLocalAnnotations((prev) =>
        prev.map((a) => (a.localId === local.localId ? { ...a, status: 'saving' } : a)),
      );
      try {
        const saved = await createAnnotation(submissionId, attemptId, {
          annotationType: 'freehand',
          anchorType: 'page_region',
          points: local.points,
          style: { strokeColor, strokeWidth: 3 },
        });
        setLocalAnnotations((prev) => prev.filter((a) => a.localId !== local.localId));
        setSavedAnnotations((prev) => [...prev, saved]);
        setDetailsAnnotation(saved);
      } catch {
        setLocalAnnotations((prev) =>
          prev.map((a) => (a.localId === local.localId ? { ...a, status: 'failed' } : a)),
        );
        Alert.alert('Save Failed', 'Could not save this annotation. Check your connection.');
      }
    },
    [submissionId, attemptId],
  );

  // ── Delete failed local annotation ────────────────────────────────────────
  const handleDiscardFailed = useCallback((localId: string) => {
    setLocalAnnotations((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  // ── Update annotation metadata ────────────────────────────────────────────
  const handleUpdateMetadata = useCallback(
    async (
      annotationId: string,
      input: { mistakeOptionId?: string; quickLabel?: string; noteText?: string },
    ) => {
      const updated = await updateAnnotation(annotationId, input);
      setSavedAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? updated : a)),
      );
    },
    [],
  );

  // ── Delete saved annotation ────────────────────────────────────────────────
  const handleDeleteSaved = useCallback(async (annotationId: string) => {
    // Optimistically remove
    setSavedAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    try {
      await deleteAnnotation(annotationId);
    } catch {
      // Restore on failure
      loadAnnotations();
      throw new Error('Delete failed');
    }
  }, [loadAnnotations]);

  // ── Complete review ────────────────────────────────────────────────────────
  const hasPendingSaves = localAnnotations.some((a) => a.status === 'saving');

  const handleCompleteReview = (pageStatus: 'completed' | 'needs_resubmission') => {
    if (hasPendingSaves) {
      Alert.alert('Saving…', 'Please wait for annotations to finish saving.');
      return;
    }
    const label = pageStatus === 'completed' ? 'Mark as Complete' : 'Request Another Attempt';
    const body =
      pageStatus === 'completed'
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

  const pageTitle = `Page ${pageNumber || '?'}${assignmentTitle ? ` — ${assignmentTitle}` : ''}`;
  const failedAnnotations = localAnnotations.filter((a) => a.status === 'failed');

  return (
    <>
      <Stack.Screen options={{ title: studentName || 'Review' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        scrollEnabled={mode === 'navigate'}
      >
        {/* Meta row */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{pageTitle}</Text>
          <Text style={styles.metaText}>Attempt {attemptNumber || '1'}</Text>
        </View>

        {/* Audio player */}
        <AudioPlayerBar submissionId={submissionId} attemptId={attemptId} />

        {/* Page image + annotation canvas */}
        <View
          style={[styles.canvasWrapper, { aspectRatio: pageAspectRatio }]}
          onLayout={(e) =>
            setCanvasLayout({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          {resolvedPageImageUrl ? (
            <Image
              source={{ uri: resolvedPageImageUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.pagePlaceholder}>
              <Text style={styles.placeholderText}>Quran page image unavailable</Text>
            </View>
          )}

          {loadingAnnotations ? (
            <View style={styles.canvasLoading}>
              <ActivityIndicator color="#1B4F72" />
            </View>
          ) : (
            canvasLayout && (
              <AnnotationCanvas
                width={canvasLayout.width}
                height={canvasLayout.height}
                savedAnnotations={savedAnnotations}
                localAnnotations={localAnnotations}
                mode={mode}
                strokeColor={TOOL_COLORS[activeTool]}
                onStrokeComplete={handleStrokeComplete}
                onAnnotationTap={handleAnnotationTap}
              />
            )
          )}
        </View>

        {/* Failed annotation banners */}
        {failedAnnotations.map((local) => (
          <View key={local.localId} style={styles.failedBanner}>
            <Text style={styles.failedText}>⚠ Annotation failed to save</Text>
            <View style={styles.failedActions}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => handleRetryFailed(local)}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.discardBtn}
                onPress={() => handleDiscardFailed(local.localId)}
              >
                <Text style={styles.discardBtnText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Mode + tool bar */}
        <View style={styles.modeBar}>
          {/* Navigate / Annotate toggle */}
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'navigate' && styles.modeBtnActive]}
            onPress={() => setMode('navigate')}
          >
            <Text style={[styles.modeBtnText, mode === 'navigate' && styles.modeBtnTextActive]}>
              Navigate
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'annotate' && styles.modeBtnActive]}
            onPress={() => setMode('annotate')}
          >
            <Text style={[styles.modeBtnText, mode === 'annotate' && styles.modeBtnTextActive]}>
              Annotate
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tool picker — only visible in annotate mode */}
        {mode === 'annotate' && (
          <View style={styles.toolBar}>
            {TOOLS.map((tool) => (
              <TouchableOpacity
                key={tool.key}
                style={[
                  styles.toolBtn,
                  activeTool === tool.key && { backgroundColor: TOOL_COLORS[tool.key] },
                ]}
                onPress={() => setActiveTool(tool.key)}
              >
                <View
                  style={[
                    styles.toolColorDot,
                    { backgroundColor: TOOL_COLORS[tool.key] },
                    activeTool === tool.key && styles.toolColorDotActive,
                  ]}
                />
                <Text
                  style={[
                    styles.toolBtnText,
                    activeTool === tool.key && styles.toolBtnTextActive,
                  ]}
                >
                  {tool.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Annotation count */}
        {!loadingAnnotations && (
          <Text style={styles.annotationCount}>
            {savedAnnotations.length === 0
              ? 'No annotations yet'
              : `${savedAnnotations.length} annotation${savedAnnotations.length !== 1 ? 's' : ''}`}
            {localAnnotations.filter((a) => a.status === 'saving').length > 0
              ? ' · saving…'
              : ''}
          </Text>
        )}

        {/* Review actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.completeBtn, submitting && styles.disabledBtn]}
            onPress={() => handleCompleteReview('completed')}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Mark as Complete</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.resubmitBtn, submitting && styles.disabledBtn]}
            onPress={() => handleCompleteReview('needs_resubmission')}
            disabled={submitting}
          >
            <Text style={[styles.actionBtnText, styles.resubmitBtnText]}>
              Request Another Attempt
            </Text>
          </TouchableOpacity>
        </View>

        {/* Attempt history */}
        {attemptHistory.length > 0 && (
          <View style={styles.historySection}>
            <TouchableOpacity
              style={styles.historyHeader}
              onPress={() => setShowHistory((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.historyHeaderText}>
                Attempt History ({attemptHistory.length})
              </Text>
              <Text style={styles.historyChevron}>{showHistory ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showHistory && (
              <View style={styles.historyList}>
                {attemptHistory.map((a) => {
                  const isCurrent = a.id === attemptId;
                  return (
                    <View
                      key={a.id}
                      style={[styles.historyRow, isCurrent && styles.historyRowCurrent]}
                    >
                      <Text style={[styles.historyAttemptNum, isCurrent && styles.historyCurrentText]}>
                        Attempt {a.attemptNumber}{isCurrent ? ' · current' : ''}
                      </Text>
                      <Text style={styles.historyStatus}>
                        {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                      </Text>
                      <Text style={styles.historyDate}>{relativeDate(a.submittedAt)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Annotation details bottom sheet */}
      <AnnotationDetailsSheet
        visible={detailsAnnotation !== null}
        annotation={detailsAnnotation}
        categories={categories}
        onUpdateMetadata={handleUpdateMetadata}
        onDelete={handleDeleteSaved}
        onClose={() => setDetailsAnnotation(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  canvasWrapper: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  placeholderText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  canvasLoading: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Failed banners
  failedBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    gap: 8,
  },
  failedText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  failedActions: { flexDirection: 'row', gap: 8 },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  retryBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  discardBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  discardBtnText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
  // Mode bar
  modeBar: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  modeBtnTextActive: { color: '#1B4F72' },
  // Tool bar
  toolBar: {
    flexDirection: 'row',
    gap: 6,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toolColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toolColorDotActive: {
    backgroundColor: '#fff',
  },
  toolBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  toolBtnTextActive: { color: '#fff' },
  annotationCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  // Review actions
  actions: { gap: 10 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  completeBtn: { backgroundColor: '#1B4F72' },
  resubmitBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1B4F72' },
  disabledBtn: { opacity: 0.5 },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  resubmitBtnText: { color: '#1B4F72' },
  // Attempt history
  historySection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  historyHeaderText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  historyChevron: { fontSize: 12, color: '#9CA3AF' },
  historyList: { borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  historyRowCurrent: { backgroundColor: '#EFF6FF' },
  historyAttemptNum: { fontSize: 13, color: '#374151', fontWeight: '500', flex: 1 },
  historyCurrentText: { color: '#1D4ED8', fontWeight: '700' },
  historyStatus: { fontSize: 12, color: '#6B7280' },
  historyDate: { fontSize: 12, color: '#9CA3AF', minWidth: 60, textAlign: 'right' },
});
