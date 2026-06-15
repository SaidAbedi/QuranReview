import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getQuranPage } from '@/api/quran';
import { createSelfPacedSubmission } from '@/api/submissions';
import { C } from '@/constants/colors';
import { ApiError } from '@/api/client';
import type { QuranPageSummary } from '@/types/api';

const { width: SCREEN_W } = Dimensions.get('window');

export default function QuranPageScreen() {
  const { pageNumber: pageParam } = useLocalSearchParams<{ pageNumber: string }>();
  const pageNumber = parseInt(pageParam ?? '1', 10);
  const router = useRouter();

  const [page, setPage]             = useState<QuranPageSummary | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPage(true);
    getQuranPage(pageNumber)
      .then((p) => { if (!cancelled) { setPage(p); setLoadingPage(false); } })
      .catch(() => { if (!cancelled) setLoadingPage(false); });
    return () => { cancelled = true; };
  }, [pageNumber]);

  const handleRecite = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await createSelfPacedSubmission(pageNumber);
      router.push({
        pathname: '/assignments/[id]/record',
        params: { id: result.assignmentId },
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.';
      Alert.alert('Cannot Recite', msg);
    } finally {
      setSubmitting(false);
    }
  }, [pageNumber, router]);

  // Stub — wired in next step when we fetch submissions for this page
  const handleFeedback = useCallback(() => {
    Alert.alert(
      'Feedback',
      'No teacher feedback yet for this page. Record your recitation and your teacher will annotate it.',
      [{ text: 'OK' }],
    );
  }, []);

  const imgW = SCREEN_W;
  const imgH = page?.width && page?.height
    ? Math.round(SCREEN_W * (page.height / page.width))
    : Math.round(SCREEN_W * (2103 / 1300));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Page ${pageNumber}` }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {loadingPage ? (
          <View style={[styles.imagePlaceholder, { height: imgH }]}>
            <ActivityIndicator size="large" color={C.blue} />
          </View>
        ) : page?.imageUrl ? (
          <Image
            source={{ uri: page.imageUrl }}
            style={{ width: imgW, height: imgH }}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { height: imgH }]}>
            <Text style={styles.placeholderText}>Page image unavailable</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {/* Primary action */}
        <TouchableOpacity
          style={[styles.reciteBtn, submitting && styles.btnDisabled]}
          onPress={handleRecite}
          disabled={submitting}
          activeOpacity={0.82}
        >
          {submitting ? (
            <ActivityIndicator color={C.white} size="small" />
          ) : (
            <>
              <Text style={styles.reciteIcon}>🎙</Text>
              <Text style={styles.reciteLabel}>Recite</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Secondary action — wired in next step */}
        <TouchableOpacity
          style={styles.feedbackBtn}
          onPress={handleFeedback}
          activeOpacity={0.75}
        >
          <Text style={styles.feedbackIcon}>📋</Text>
          <Text style={styles.feedbackLabel}>Feedback</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1 },

  imagePlaceholder: {
    width: SCREEN_W,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.grayBg,
  },
  placeholderText: { color: C.textMuted, fontSize: 14 },

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: C.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },

  // Recite — takes 65% of the row
  reciteBtn: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnDisabled:  { opacity: 0.55 },
  reciteIcon:   { fontSize: 18 },
  reciteLabel:  { fontSize: 16, fontWeight: '700', color: C.white },

  // Feedback — takes 35% of the row
  feedbackBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.white,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  feedbackIcon:  { fontSize: 16 },
  feedbackLabel: { fontSize: 14, fontWeight: '600', color: C.textMuted },
});
