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
import { useTheme } from '@/hooks/useTheme';
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
  const theme = useTheme('dark');
  const T = theme.colors;

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
        <View style={[styles.sheet, { backgroundColor: T.surface }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: T.divider }]}>
            <Text style={[styles.title, { color: T.textPrimary }]}>Annotation Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: T.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Category picker */}
            <Text style={[styles.label, { color: T.textMuted }]}>Mistake Category</Text>
            <TouchableOpacity
              style={[styles.picker, { backgroundColor: T.inputBackground, borderColor: T.border }]}
              onPress={() => setCategoryOpen(true)}
            >
              <Text style={[styles.pickerText, { color: !selectedCategory ? T.textDisabled : T.textPrimary }]}>
                {selectedCategory ? selectedCategory.label : 'Select category…'}
              </Text>
              <Text style={[styles.pickerChevron, { color: T.textDisabled }]}>›</Text>
            </TouchableOpacity>

            {/* Option picker */}
            <Text style={[styles.label, styles.labelSpaced, { color: T.textMuted }]}>Mistake Option</Text>
            <TouchableOpacity
              style={[styles.picker, { backgroundColor: T.inputBackground, borderColor: T.border }, !selectedCategory && styles.pickerDisabled]}
              onPress={() => selectedCategory && setOptionOpen(true)}
              disabled={!selectedCategory}
            >
              <Text style={[
                styles.pickerText,
                { color: (!selectedOption || !selectedCategory) ? T.textDisabled : T.textPrimary },
              ]}>
                {selectedOption && selectedCategory
                  ? selectedOption.label
                  : selectedCategory
                  ? 'Select option…'
                  : 'Select a category first'}
              </Text>
              <Text style={[styles.pickerChevron, { color: T.textDisabled }]}>›</Text>
            </TouchableOpacity>

            {/* Note */}
            <Text style={[styles.label, styles.labelSpaced, { color: T.textMuted }]}>Note (optional)</Text>
            <TextInput
              style={[styles.noteInput, { backgroundColor: T.inputBackground, borderColor: T.border, color: T.textPrimary }]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Add a note for the student…"
              placeholderTextColor={T.inputPlaceholder}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Voice note */}
            <Text style={[styles.label, styles.labelSpaced, { color: T.textMuted }]}>Voice Note</Text>
            <View style={styles.voiceRow}>
              {hasVoiceNote || voiceState === 'done' ? (
                <>
                  <TouchableOpacity
                    style={[styles.voicePlayBtn, { backgroundColor: T.infoBg, borderColor: T.info }]}
                    onPress={handlePlayVoiceNote}
                    disabled={isUploading}
                  >
                    <Text style={[styles.voicePlayBtnText, { color: T.info }]}>
                      {voiceState === 'playing' && playerStatus.playing ? '⏸ Playing…' : '▶ Play'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.voiceDeleteBtn, { borderColor: T.error }]} onPress={handleDeleteVoiceNote}>
                    <Text style={[styles.voiceDeleteBtnText, { color: T.error }]}>Remove</Text>
                  </TouchableOpacity>
                </>
              ) : isRecording ? (
                <>
                  <View style={[styles.voiceRecordingIndicator, { backgroundColor: T.errorBg, borderColor: T.error }]}>
                    <View style={[styles.voiceRecDot, { backgroundColor: T.error }]} />
                    <Text style={[styles.voiceRecTimer, { color: T.error }]}>{formatDuration(recordDurationMs)}</Text>
                  </View>
                  <TouchableOpacity style={[styles.voiceStopBtn, { backgroundColor: T.error }]} onPress={handleStopRecording}>
                    <Text style={[styles.voiceStopBtnText, { color: '#fff' }]}>Stop</Text>
                  </TouchableOpacity>
                </>
              ) : isUploading ? (
                <View style={styles.voiceUploadingRow}>
                  <ActivityIndicator size="small" color={T.brandPrimary} />
                  <Text style={[styles.voiceUploadingText, { color: T.brandPrimary }]}>Saving voice note…</Text>
                </View>
              ) : (
                <TouchableOpacity style={[styles.voiceRecordBtn, { backgroundColor: T.successBg, borderColor: T.success }]} onPress={handleStartRecording}>
                  <Text style={[styles.voiceRecordBtnText, { color: T.success }]}>🎙 Record Voice Note</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={[styles.footer, { borderTopColor: T.divider }]}>
            <TouchableOpacity
              style={[styles.deleteBtn, { borderColor: T.error }]}
              onPress={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? (
                <ActivityIndicator color={T.error} size="small" />
              ) : (
                <Text style={[styles.deleteBtnText, { color: T.error }]}>Delete</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: T.brandPrimary }, (saving || deleting) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || deleting}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.saveBtnText, { color: T.brandOnPrimary }]}>Done</Text>
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
          <View style={[styles.pickerSheet, { backgroundColor: T.surface }]}>
            <Text style={[styles.pickerSheetTitle, { color: T.textPrimary }]}>Select Category</Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setSelectedCategory(null);
                  setSelectedOption(null);
                  setCategoryOpen(false);
                }}
              >
                <Text style={[styles.pickerRowText, { color: T.textPrimary }]}>— None —</Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.pickerRow,
                    selectedCategory?.id === cat.id && { backgroundColor: T.infoBg },
                  ]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    if (selectedOption && !cat.options.find((o) => o.id === selectedOption.id)) {
                      setSelectedOption(null);
                    }
                    setCategoryOpen(false);
                  }}
                >
                  <Text style={[styles.pickerRowText, { color: T.textPrimary }]}>{cat.label}</Text>
                  {cat.description && (
                    <Text style={[styles.pickerRowSub, { color: T.textMuted }]}>{cat.description}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.pickerCancel, { borderTopColor: T.border }]} onPress={() => setCategoryOpen(false)}>
              <Text style={[styles.pickerCancelText, { color: T.textMuted }]}>Cancel</Text>
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
          <View style={[styles.pickerSheet, { backgroundColor: T.surface }]}>
            <Text style={[styles.pickerSheetTitle, { color: T.textPrimary }]}>
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
                <Text style={[styles.pickerRowText, { color: T.textPrimary }]}>— None —</Text>
              </TouchableOpacity>
              {filteredOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.pickerRow,
                    selectedOption?.id === opt.id && { backgroundColor: T.infoBg },
                  ]}
                  onPress={() => {
                    setSelectedOption(opt);
                    setOptionOpen(false);
                  }}
                >
                  <Text style={[styles.pickerRowText, { color: T.textPrimary }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.pickerCancel, { borderTopColor: T.border }]} onPress={() => setOptionOpen(false)}>
              <Text style={[styles.pickerCancelText, { color: T.textMuted }]}>Cancel</Text>
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
  },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18 },
  body: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  labelSpaced: { marginTop: 16 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerDisabled: { opacity: 0.5 },
  pickerText: { flex: 1, fontSize: 15 },
  pickerPlaceholder: {},
  pickerChevron: { fontSize: 18, marginLeft: 8 },
  noteInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
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
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  voiceRecordBtnText: { fontSize: 14, fontWeight: '600' },
  voiceRecordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  voiceRecDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  voiceRecTimer: { fontSize: 14, fontWeight: '700' },
  voiceStopBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  voiceStopBtnText: { fontSize: 14, fontWeight: '700' },
  voiceUploadingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  voiceUploadingText: { fontSize: 14 },
  voicePlayBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  voicePlayBtnText: { fontSize: 14, fontWeight: '600' },
  voiceDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  voiceDeleteBtnText: { fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 15, fontWeight: '700' },
  // Nested picker modals
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '60%',
    paddingBottom: 34,
  },
  pickerSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  pickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pickerRowSelected: {},
  pickerRowText: { fontSize: 15 },
  pickerRowSub: { fontSize: 12, marginTop: 2 },
  pickerCancel: {
    marginTop: 8,
    paddingVertical: 13,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  pickerCancelText: { fontSize: 15 },
});
