import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getAnnotations } from '@/api/annotations';
import { getQuranPage } from '@/api/quran';
import AnnotationCanvas from '@/components/AnnotationCanvas';
import AudioPlayerBar from '@/components/AudioPlayerBar';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import type { AnnotationRow } from '@/types/api';

const MISTAKE_LABEL_COLORS: Record<string, string> = {
  tajweed: '#7C3AED',
  harakat: '#D97706',
  wrong_word: '#DC2626',
  wrong_ayah: '#DC2626',
  makhraj: '#0369A1',
  madd: '#059669',
  ghunnah: '#059669',
  waqf: '#6B7280',
  pronunciation: '#D97706',
  memorization: '#DC2626',
  other: '#6B7280',
};

function AnnotationCard({ ann, index }: { ann: AnnotationRow; index: number }) {
  const hasLabel = ann.quickLabel || ann.mistakeType;
  const color = ann.mistakeType ? (MISTAKE_LABEL_COLORS[ann.mistakeType] ?? '#6B7280') : '#1B4F72';

  return (
    <View style={styles.annCard}>
      <View style={styles.annCardLeft}>
        <View style={[styles.annIndex, { backgroundColor: color }]}>
          <Text style={styles.annIndexText}>{index + 1}</Text>
        </View>
      </View>
      <View style={styles.annCardBody}>
        {hasLabel && (
          <Text style={[styles.annLabel, { color }]}>
            {ann.quickLabel ?? ann.mistakeType}
          </Text>
        )}
        {ann.noteText ? (
          <Text style={styles.annNote}>{ann.noteText}</Text>
        ) : !hasLabel ? (
          <Text style={styles.annNote}>Freehand mark</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function FeedbackViewerScreen() {
  const { id, attemptId, submissionId, pageNumber, attemptNumber } = useLocalSearchParams<{
    id: string;
    attemptId: string;
    submissionId: string;
    pageNumber: string;
    attemptNumber: string;
  }>();

  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [pageAspectRatio, setPageAspectRatio] = useState(0.618);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number } | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      // Non-fatal — show page without annotations
    } finally {
      setLoadingAnnotations(false);
    }
  }, [submissionId, attemptId]);

  useEffect(() => {
    loadAnnotations();
    if (pageNumber) {
      setLoadingPage(true);
      getQuranPage(parseInt(pageNumber, 10))
        .then((page) => {
          if (page.imageUrl) setPageImageUrl(page.imageUrl);
          if (page.width && page.height) setPageAspectRatio(page.width / page.height);
        })
        .catch(() => {})
        .finally(() => setLoadingPage(false));
    } else {
      setLoadingPage(false);
    }
  }, [loadAnnotations, pageNumber]);

  if (loadingPage) return <LoadingScreen message="Loading feedback…" />;
  if (error) return <ErrorScreen message={error} onRetry={() => { setError(null); loadAnnotations(); }} />;

  const title = `Page ${pageNumber ?? '?'}${attemptNumber ? ` · Attempt ${attemptNumber}` : ''}`;
  const labelledAnnotations = annotations.filter(
    (a) => a.quickLabel || a.mistakeType || a.noteText,
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Teacher Feedback' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        <Text style={styles.pageTitle}>{title}</Text>

        {/* Student recording playback */}
        <AudioPlayerBar submissionId={submissionId} attemptId={attemptId} />

        {/* Page image with annotation overlay */}
        <View
          style={[styles.canvasWrapper, { aspectRatio: pageAspectRatio }]}
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
              <Text style={styles.placeholderText}>Page image unavailable</Text>
            </View>
          )}

          {loadingAnnotations ? (
            <View style={styles.overlayCenter}>
              <ActivityIndicator color="#1B4F72" />
            </View>
          ) : (
            canvasLayout && annotations.length > 0 && (
              <AnnotationCanvas
                width={canvasLayout.width}
                height={canvasLayout.height}
                savedAnnotations={annotations}
                localAnnotations={[]}
                mode="navigate"
                readOnly
              />
            )
          )}
        </View>

        {/* Summary banner */}
        {!loadingAnnotations && (
          <View style={styles.summaryBanner}>
            <Text style={styles.summaryText}>
              {annotations.length === 0
                ? 'No annotations on this attempt.'
                : `${annotations.length} annotation${annotations.length !== 1 ? 's' : ''} from your teacher`}
            </Text>
          </View>
        )}

        {/* Annotation list — only items with labels or notes */}
        {labelledAnnotations.length > 0 && (
          <View style={styles.annSection}>
            <Text style={styles.annSectionTitle}>Feedback Notes</Text>
            {labelledAnnotations.map((ann, i) => (
              <AnnotationCard key={ann.id} ann={ann} index={i} />
            ))}
          </View>
        )}

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
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
  placeholderText: { fontSize: 13, color: '#9CA3AF' },
  overlayCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  summaryBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  summaryText: { fontSize: 14, color: '#1D4ED8', textAlign: 'center', fontWeight: '500' },
  annSection: { gap: 8 },
  annSectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151' },
  annCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'flex-start',
  },
  annCardLeft: { paddingTop: 1 },
  annIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  annIndexText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  annCardBody: { flex: 1, gap: 3 },
  annLabel: { fontSize: 14, fontWeight: '600' },
  annNote: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
});
