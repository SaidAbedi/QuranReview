import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { addVoiceNote, getVoiceNoteReadUrl, getVoiceNoteUploadUrl } from '@/api/annotations';
import type { AnnotationRow, MistakeCategoryRow, MistakeOptionRow } from '@/types/api';

let UploadModule: {
  uploadAsync: typeof import('expo-file-system/legacy').uploadAsync;
  FileSystemUploadType: typeof import('expo-file-system/legacy').FileSystemUploadType;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  UploadModule = require('expo-file-system/legacy');
} catch {
  // Not available in this runtime.
}

interface Props {
  visible: boolean;
  annotation: AnnotationRow | null;
  categories: MistakeCategoryRow[];
  onUpdateMetadata: (
    annotationId: string,
    input: { mistakeOptionId?: string; quickLabel?: string; noteText?: string },
  ) => Promise<void>;
  onDelete: (annotationId: string) => Promise<void>;
  onClose: () => void;
}

type VoiceNoteState = 'idle' | 'recording' | 'uploading' | 'done' | 'playing';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function AnnotationDetailsSheet({
  visible,
  annotation,
  categories,
  onUpdateMetadata,
  onDelete,
  onClose,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<MistakeCategoryRow | null>(null);
  const [selectedOption, setSelectedOption] = useState<MistakeOptionRow | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [optionOpen, setOptionOpen] = useState(false);

  // Voice note state
  const [voiceState, setVoiceState] = useState<VoiceNoteState>('idle');
  const [recordDurationMs, setRecordDurationMs] = useState(0);
  const [voiceNoteUri, setVoiceNoteUri] = useState<string | null>(null);
  const [hasVoiceNote, setHasVoiceNote] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(playbackUrl ?? '');
  const playerStatus = useAudioPlayerStatus(player);

  // Populate fields when annotation changes
  useEffect(() => {
    if (!annotation) return;
    setNoteText(annotation.noteText ?? '');
    setHasVoiceNote(annotation.hasVoiceNote ?? false);
    setVoiceNoteUri(null);
    setPlaybackUrl(null);
    setVoiceState('idle');
    setRecordDurationMs(0);

    if (annotation.mistakeOptionId) {
      for (const cat of categories) {
        const opt = cat.options.find((o) => o.id === annotation.mistakeOptionId);
        if (opt) {
          setSelectedCategory(cat);
          setSelectedOption(opt);
          return;
        }
      }
    }
    setSelectedCategory(null);
    setSelectedOption(null);
  }, [annotation, categories]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isRecordingRef.current) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  const filteredOptions = selectedCategory?.options ?? [];

  const handleSave = async () => {
    if (!annotation) return;
    setSaving(true);
    try {
      await onUpdateMetadata(annotation.id, {
        mistakeOptionId: selectedOption?.id,
        quickLabel: selectedOption?.label,
        noteText: noteText.trim() || undefined,
      });
      onClose();
    } catch {
      Alert.alert('Error', 'Could not save annotation details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!annotation) return;
    Alert.alert(
      'Delete Annotation',
      'Delete this annotation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete(annotation.id);
              onClose();
            } catch {
              Alert.alert('Error', 'Could not delete this annotation.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // ── Voice note recording ───────────────────────────────────────────────────

  const handleStartRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone Required', 'Allow microphone access in Settings to record voice notes.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      setRecordDurationMs(0);
      setVoiceState('recording');
      timerRef.current = setInterval(() => setRecordDurationMs((p) => p + 1000), 1000);
    } catch (e) {
      Alert.alert('Recording Error', e instanceof Error ? e.message : 'Could not start recording');
    }
  };

  const handleStopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      await recorder.stop();
      isRecordingRef.current = false;
      const uri = recorder.uri;
      setVoiceNoteUri(uri);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });
      // Auto-upload
      if (uri && annotation) {
        await uploadVoiceNote(uri, annotation.id, annotation.submissionId, annotation.submissionAttemptId, recordDurationMs);
      }
    } catch (e) {
      setVoiceState('idle');
      Alert.alert('Recording Error', e instanceof Error ? e.message : 'Could not stop recording');
    }
  };

  const uploadVoiceNote = async (
    uri: string,
    annotationId: string,
    submissionId: string,
    attemptId: string,
    durationMs: number,
  ) => {
    if (!UploadModule) {
      Alert.alert('Upload Error', 'File upload is not available in this environment.');
      setVoiceState('idle');
      return;
    }
    setVoiceState('uploading');
    try {
      const contentType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
      const { uploadUrl, storageKey } = await getVoiceNoteUploadUrl(submissionId, attemptId, annotationId, contentType);

      const uploadResult = await UploadModule.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        uploadType: UploadModule.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': contentType },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed: ${uploadResult.status}`);
      }

      // Get file size from uri info
      let sizeBytes = 0;
      try {
        const FileSystem = require('expo-file-system/legacy');
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && 'size' in info) sizeBytes = (info as { size: number }).size;
      } catch { /* best effort */ }

      await addVoiceNote(annotationId, {
        audioStorageKey: storageKey,
        durationMs,
        contentType,
        sizeBytes,
      });

      setHasVoiceNote(true);
      setVoiceState('done');
    } catch (e) {
      setVoiceState('idle');
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Could not save voice note.');
    }
  };

  const handlePlayVoiceNote = async () => {
    if (!annotation) return;
    try {
      if (!playbackUrl) {
        // Build storage key from known path convention
        const storageKey = `teacher-voice-notes/${annotation.teacherId}/${annotation.submissionId}/${annotation.submissionAttemptId}/${annotation.id}.m4a`;
        const { url } = await getVoiceNoteReadUrl(storageKey);
        setPlaybackUrl(url);
      }
      setVoiceState('playing');
      player.play();
    } catch {
      Alert.alert('Playback Error', 'Could not load voice note for playback.');
    }
  };

  const handleDeleteVoiceNote = () => {
    Alert.alert(
      'Delete Voice Note',
      'Remove this voice note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setHasVoiceNote(false);
            setVoiceNoteUri(null);
            setPlaybackUrl(null);
            setVoiceState('idle');
          },
        },
      ],
    );
  };

  if (!annotation) return null;

  const isRecording = voiceState === 'recording';
  const isUploading = voiceState === 'uploading';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Annotation Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Category picker */}
            <Text style={styles.label}>Mistake Category</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setCategoryOpen(true)}
            >
              <Text style={[styles.pickerText, !selectedCategory && styles.pickerPlaceholder]}>
                {selectedCategory ? selectedCategory.label : 'Select category…'}
              </Text>
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>

            {/* Option picker */}
            <Text style={[styles.label, styles.labelSpaced]}>Mistake Option</Text>
            <TouchableOpacity
              style={[styles.picker, !selectedCategory && styles.pickerDisabled]}
              onPress={() => selectedCategory && setOptionOpen(true)}
              disabled={!selectedCategory}
            >
              <Text style={[
                styles.pickerText,
                (!selectedOption || !selectedCategory) && styles.pickerPlaceholder,
              ]}>
                {selectedOption && selectedCategory
                  ? selectedOption.label
                  : selectedCategory
                  ? 'Select option…'
                  : 'Select a category first'}
              </Text>
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>

            {/* Note */}
            <Text style={[styles.label, styles.labelSpaced]}>Note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Add a note for the student…"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Voice note */}
            <Text style={[styles.label, styles.labelSpaced]}>Voice Note</Text>
            <View style={styles.voiceRow}>
              {hasVoiceNote || voiceState === 'done' ? (
                <>
                  <TouchableOpacity
                    style={styles.voicePlayBtn}
                    onPress={handlePlayVoiceNote}
                    disabled={isUploading}
                  >
                    <Text style={styles.voicePlayBtnText}>
                      {voiceState === 'playing' && playerStatus.playing ? '⏸ Playing…' : '▶ Play'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.voiceDeleteBtn} onPress={handleDeleteVoiceNote}>
                    <Text style={styles.voiceDeleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                </>
              ) : isRecording ? (
                <>
                  <View style={styles.voiceRecordingIndicator}>
                    <View style={styles.voiceRecDot} />
                    <Text style={styles.voiceRecTimer}>{formatDuration(recordDurationMs)}</Text>
                  </View>
                  <TouchableOpacity style={styles.voiceStopBtn} onPress={handleStopRecording}>
                    <Text style={styles.voiceStopBtnText}>Stop</Text>
                  </TouchableOpacity>
                </>
              ) : isUploading ? (
                <View style={styles.voiceUploadingRow}>
                  <ActivityIndicator size="small" color="#1B4F72" />
                  <Text style={styles.voiceUploadingText}>Saving voice note…</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.voiceRecordBtn} onPress={handleStartRecording}>
                  <Text style={styles.voiceRecordBtnText}>🎙 Record Voice Note</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? (
                <ActivityIndicator color="#DC2626" size="small" />
              ) : (
                <Text style={styles.deleteBtnText}>Delete</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || deleting) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || deleting}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Done</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Category picker modal */}
      <Modal
        visible={categoryOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerSheetTitle}>Select Category</Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setSelectedCategory(null);
                  setSelectedOption(null);
                  setCategoryOpen(false);
                }}
              >
                <Text style={styles.pickerRowText}>— None —</Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.pickerRow,
                    selectedCategory?.id === cat.id && styles.pickerRowSelected,
                  ]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    if (selectedOption && !cat.options.find((o) => o.id === selectedOption.id)) {
                      setSelectedOption(null);
                    }
                    setCategoryOpen(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>{cat.label}</Text>
                  {cat.description && (
                    <Text style={styles.pickerRowSub}>{cat.description}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setCategoryOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Option picker modal */}
      <Modal
        visible={optionOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOptionOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerSheetTitle}>
              {selectedCategory?.label ?? 'Select Option'}
            </Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setSelectedOption(null);
                  setOptionOpen(false);
                }}
              >
                <Text style={styles.pickerRowText}>— None —</Text>
              </TouchableOpacity>
              {filteredOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.pickerRow,
                    selectedOption?.id === opt.id && styles.pickerRowSelected,
                  ]}
                  onPress={() => {
                    setSelectedOption(opt);
                    setOptionOpen(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setOptionOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: '#6B7280' },
  body: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  labelSpaced: { marginTop: 16 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerDisabled: { opacity: 0.5 },
  pickerText: { flex: 1, fontSize: 15, color: '#111827' },
  pickerPlaceholder: { color: '#9CA3AF' },
  pickerChevron: { fontSize: 18, color: '#9CA3AF', marginLeft: 8 },
  noteInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 80,
  },
  // Voice note
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  voiceRecordBtn: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingVertical: 11,
    alignItems: 'center',
  },
  voiceRecordBtnText: { fontSize: 14, fontWeight: '600', color: '#15803D' },
  voiceRecordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  voiceRecDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
  },
  voiceRecTimer: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  voiceStopBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#DC2626',
  },
  voiceStopBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  voiceUploadingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  voiceUploadingText: { fontSize: 14, color: '#1B4F72' },
  voicePlayBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 11,
    alignItems: 'center',
  },
  voicePlayBtnText: { fontSize: 14, fontWeight: '600', color: '#1D4ED8' },
  voiceDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  voiceDeleteBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#1B4F72',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Nested picker modals
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '60%',
    paddingBottom: 34,
  },
  pickerSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  pickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pickerRowSelected: { backgroundColor: '#EFF6FF' },
  pickerRowText: { fontSize: 15, color: '#111827' },
  pickerRowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pickerCancel: {
    marginTop: 8,
    paddingVertical: 13,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  pickerCancelText: { fontSize: 15, color: '#6B7280' },
});
