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
import { completeReview, getMistakeCategories } from '@/api/teacher';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import AnnotationCanvas from '@/components/AnnotationCanvas';
import type {
  AnnotationRow,
  AnnotationPoint,
  MistakeCategoryRow,
  MistakeOptionRow,
  CreateAnnotationInput,
} from '@/types/api';

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 480;

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
    getMistakeCategories()
      .then(setCategories)
      .catch(() => {});
  }, [loadAnnotations]);

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
          ? {
              mistakeOptionId: selectedOption.id,
              quickLabel: selectedOption.label,
            }
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

  const handleCompleteReview = (pageStatus: 'completed' | 'needs_resubmission') => {
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

  return (
    <>
      <Stack.Screen options={{ title: studentName || 'Review' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Meta row */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{pageTitle}</Text>
          <Text style={styles.metaText}>
            Attempt {attemptNumber || '1'}
          </Text>
        </View>

        {/* Audio player */}
        <AudioPlayerBar submissionId={submissionId} attemptId={attemptId} />

        {/* Page image + annotation canvas */}
        <View style={styles.canvasWrapper}>
          {pageImageUrl ? (
            <Image
              source={{ uri: pageImageUrl }}
              style={styles.pageImage}
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
            <AnnotationCanvas
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              savedAnnotations={savedAnnotations}
              onStrokeComplete={handleStrokeComplete}
              onUndoLast={handleUndoLast}
            />
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
            style={[styles.actionBtn, styles.completeBtn, submitting && styles.disabledBtn]}
            onPress={() => handleCompleteReview('completed')}
            disabled={submitting}
          >
            <Text style={styles.actionBtnText}>Mark as Complete</Text>
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  canvasWrapper: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pageImage: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  pagePlaceholder: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  placeholderText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  canvasLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
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
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  completeBtn: { backgroundColor: '#1B4F72' },
  resubmitBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1B4F72',
  },
  disabledBtn: { opacity: 0.5 },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  resubmitBtnText: { color: '#1B4F72' },
  // Mistake picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
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
  optionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
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
