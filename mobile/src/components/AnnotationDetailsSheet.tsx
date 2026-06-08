import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AnnotationRow, MistakeCategoryRow, MistakeOptionRow } from '@/types/api';

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

  // Populate fields when annotation changes
  useEffect(() => {
    if (!annotation) return;
    setNoteText(annotation.noteText ?? '');

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

  if (!annotation) return null;

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
                    // Clear option if it doesn't belong to new category
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
    maxHeight: '75%',
    paddingBottom: 34, // safe area
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
