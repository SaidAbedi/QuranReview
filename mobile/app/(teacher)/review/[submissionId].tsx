import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getAnnotations, batchSaveAnnotations } from '@/api/annotations';
import { completeReview, getMistakeCategories, getAttemptHistory } from '@/api/teacher';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import AnnotationCanvas from '@/components/AnnotationCanvas';
import type {
  AnnotationRow,
  AnnotationPoint,
  AttemptRow,
  MistakeCategoryRow,
  MistakeOptionRow,
  CreateAnnotationInput,
} from '@/types/api';

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

  const [savedAnnotations, setSavedAnnotations] = useState<AnnotationRow[]>([]);
  const [pendingPoints, setPendingPoints] = useState<AnnotationPoint[][]>([]);
  const [categories, setCategories] = useState<MistakeCategoryRow[]>([]);
  const [selectedOption, setSelectedOption] = useState<MistakeOptionRow | null>(null);
  const [showMistakePicker, setShowMistakePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingAnnotations, setSavingAnnotations] = useState(false);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);
  const [attemptHistory, setAttemptHistory] = useState<AttemptRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number } | null>(null);
  const saveLock = useRef(false);

  const loadAnnotations = useCallback(async () => {
    setLoadingAnnotations(true);
    try {
      const result = await getAnnotations(submissionId, attemptId);
      setSavedAnnotations(result.data);
    } catch {
      // Non-fatal — annotations may just not exist yet.
    } finally {
      setLoadingAnnotations(false);
    }
  }, [submissionId, attemptId]);

  useEffect(() => {
    loadAnnotations();
    getMistakeCategories().then(setCategories).catch(() => {});
    getAttemptHistory(submissionId).then(setAttemptHistory).catch(() => {});
  }, [loadAnnotations, submissionId]);

  const handleStrokeComplete = (points: AnnotationPoint[]) => {
    setPendingPoints((prev) => [...prev, points]);
  };

  const handleUndoLast = () => {
    setPendingPoints((prev) => prev.slice(0, -1));
  };

  const handleSaveAnnotations = async () => {
    if (pendingPoints.length === 0 || saveLock.current) return;
    saveLock.current = true;
    setSavingAnnotations(true);
    try {
      const inputs: CreateAnnotationInput[] = pendingPoints.map((pts) => ({
        annotationType: 'freehand',
        anchorType: 'page_region',
        points: pts,
        style: { strokeColor: '#0E7490', strokeWidth: 3 },
        ...(selectedOption
          ? { mistakeOptionId: selectedOption.id, quickLabel: selectedOption.label }
          : {}),
      }));
      const saved = await batchSaveAnnotations(submissionId, attemptId, inputs);
      setSavedAnnotations((prev) => [...prev, ...saved]);
      setPendingPoints([]);
      setSelectedOption(null);
    } catch (e) {
      Alert.alert('Save Error', e instanceof Error ? e.message : 'Could not save annotations');
    } finally {
      setSavingAnnotations(false);
      saveLock.current = false;
    }
  };

  // Returns true if annotations were saved (or there was nothing to save).
  // Returns false and shows an error if save failed — caller must not proceed.
  const autoSavePendingAnnotations = async (): Promise<boolean> => {
    if (pendingPoints.length === 0) return true;
    if (saveLock.current) return false;
    saveLock.current = true;
    setSavingAnnotations(true);
    try {
      const inputs: CreateAnnotationInput[] = pendingPoints.map((pts) => ({
        annotationType: 'freehand',
        anchorType: 'page_region',
        points: pts,
        style: { strokeColor: '#0E7490', strokeWidth: 3 },
        ...(selectedOption
          ? { mistakeOptionId: selectedOption.id, quickLabel: selectedOption.label }
          : {}),
      }));
      const saved = await batchSaveAnnotations(submissionId, attemptId, inputs);
      setSavedAnnotations((prev) => [...prev, ...saved]);
      setPendingPoints([]);
      setSelectedOption(null);
      return true;
    } catch (e) {
      Alert.alert(
        'Annotations Not Saved',
        'Your annotations could not be saved. Please try again before completing the review.',
      );
      return false;
    } finally {
      setSavingAnnotations(false);
      saveLock.current = false;
    }
  };

  const handleCompleteReview = async (pageStatus: 'completed' | 'needs_resubmission') => {
    const didSave = await autoSavePendingAnnotations();
    if (!didSave) return;

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
  const busy = submitting || savingAnnotations;

  return (
    <>
      <Stack.Screen options={{ title: studentName || 'Review' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Meta row */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{pageTitle}</Text>
          <Text style={styles.metaText}>Attempt {attemptNumber || '1'}</Text>
        </View>

        {/* Audio player */}
        <AudioPlayerBar submissionId={submissionId} attemptId={attemptId} />

        {/* Page image + annotation canvas */}
        <View
          style={styles.canvasWrapper}
          onLayout={(e) =>
            setCanvasLayout({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          {pageImageUrl ? (
            <Image
              source={{ uri: pageImageUrl }}
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
                onStrokeComplete={handleStrokeComplete}
              />
            )
          )}
        </View>

        {/* Annotation toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={handleUndoLast}
            disabled={pendingPoints.length === 0}
          >
            <Text style={[styles.toolBtnText, pendingPoints.length === 0 && styles.disabled]}>
              Undo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setShowMistakePicker(true)}
          >
            <Text style={styles.toolBtnText}>
              {selectedOption ? selectedOption.label : 'Label mistake'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, styles.saveBtn]}
            onPress={handleSaveAnnotations}
            disabled={pendingPoints.length === 0 || savingAnnotations}
          >
            {savingAnnotations ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.toolBtnText, styles.saveBtnText]}>
                Save ({pendingPoints.length})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Review actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.completeBtn, busy && styles.disabledBtn]}
            onPress={() => handleCompleteReview('completed')}
            disabled={busy}
          >
            {busy && submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Mark as Complete</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.resubmitBtn, busy && styles.disabledBtn]}
            onPress={() => handleCompleteReview('needs_resubmission')}
            disabled={busy}
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

      {/* Mistake picker modal */}
      <Modal
        visible={showMistakePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMistakePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Mistake Type</Text>
            <ScrollView style={styles.modalScroll}>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setSelectedOption(null);
                  setShowMistakePicker(false);
                }}
              >
                <Text style={styles.optionLabel}>— No label —</Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <View key={cat.id}>
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                  {cat.options.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.optionRow,
                        selectedOption?.id === opt.id && styles.optionSelected,
                      ]}
                      onPress={() => {
                        setSelectedOption(opt);
                        setShowMistakePicker(false);
                      }}
                    >
                      <Text style={styles.optionLabel}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowMistakePicker(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  canvasWrapper: {
    alignSelf: 'stretch',
    aspectRatio: 0.7,
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
  toolbar: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  toolBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  toolBtnText: { fontSize: 13, color: '#374151', fontWeight: '600', textAlign: 'center' },
  saveBtn: { backgroundColor: '#1B4F72', borderColor: '#1B4F72' },
  saveBtnText: { color: '#fff' },
  disabled: { color: '#D1D5DB' },
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
  // Mistake picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  modalScroll: { maxHeight: 360 },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  optionRow: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  optionSelected: { backgroundColor: '#EFF6FF' },
  optionLabel: { fontSize: 15, color: '#111827' },
  modalClose: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalCloseText: { fontSize: 15, color: '#6B7280' },
});
