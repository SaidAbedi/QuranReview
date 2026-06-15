import { useCallback, useState } from 'react';
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
import { useEffect } from 'react';
import type { QuranPageSummary } from '@/types/api';

const { width: SCREEN_W } = Dimensions.get('window');

export default function QuranPageScreen() {
  const { pageNumber: pageParam } = useLocalSearchParams<{ pageNumber: string }>();
  const pageNumber = parseInt(pageParam ?? '1', 10);
  const router = useRouter();

  const [page, setPage]           = useState<QuranPageSummary | null>(null);
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

  // Compute image display dimensions maintaining 1300:2103 aspect ratio
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
        bounces={true}
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

      {/* Pinned bottom action */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.reciteBtn, submitting && styles.reciteBtnDisabled]}
          onPress={handleRecite}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <>
              <Text style={styles.reciteBtnIcon}>🎙</Text>
              <Text style={styles.reciteBtnLabel}>Recite This Page</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          Your recitation will be sent to your teacher for review.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },

  imagePlaceholder: {
    width: SCREEN_W,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  placeholderText: { color: '#888', fontSize: 14 },

  footer: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    gap: 8,
  },

  reciteBtn: {
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  reciteBtnDisabled: { opacity: 0.6 },
  reciteBtnIcon:  { fontSize: 20 },
  reciteBtnLabel: { fontSize: 17, fontWeight: '700', color: C.white },

  footerNote: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
  },
});
