import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getQuranPage } from '@/api/quran';
import { createSelfPacedSubmission, getStudentSubmissions } from '@/api/submissions';
import { C } from '@/constants/colors';
import { ApiError } from '@/api/client';
import type { QuranPageSummary, SubmissionRow } from '@/types/api';

const { width: SCREEN_W } = Dimensions.get('window');

const SCROLL_THRESHOLD = 8; // px delta before we react

export default function QuranPageScreen() {
  const { pageNumber: pageParam } = useLocalSearchParams<{ pageNumber: string }>();
  const pageNumber = parseInt(pageParam ?? '1', 10);
  const router = useRouter();

  const [page, setPage]               = useState<QuranPageSummary | null>(null);
  const [loadingPage, setLoadingPage]   = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [pageSubmissions, setPageSubmissions] = useState<SubmissionRow[]>([]);
  const [footerH, setFooterH]           = useState(90); // real height from onLayout

  // Auto-hide animation
  const footerTranslate = useRef(new Animated.Value(0)).current;
  const lastScrollY     = useRef(0);
  const footerShown     = useRef(true);

  const showFooter = useCallback(() => {
    if (footerShown.current) return;
    footerShown.current = true;
    Animated.spring(footerTranslate, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [footerTranslate]);

  const hideFooter = useCallback((height: number) => {
    if (!footerShown.current) return;
    footerShown.current = false;
    Animated.spring(footerTranslate, {
      toValue: height,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [footerTranslate]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y     = e.nativeEvent.contentOffset.y;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;

      if (delta > SCROLL_THRESHOLD) {
        hideFooter(footerH);
      } else if (delta < -SCROLL_THRESHOLD) {
        showFooter();
      }
    },
    [hideFooter, showFooter, footerH],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingPage(true);
    getQuranPage(pageNumber)
      .then((p) => { if (!cancelled) { setPage(p); setLoadingPage(false); } })
      .catch(() => { if (!cancelled) setLoadingPage(false); });
    return () => { cancelled = true; };
  }, [pageNumber]);

  useEffect(() => {
    if (!page?.id) return;
    const pageId = page.id;
    getStudentSubmissions()
      .then((subs) => {
        setPageSubmissions(subs.filter((s) => s.quranPageId === pageId));
      })
      .catch(() => {});
  }, [page?.id]);

  const reviewedSubmission = useMemo<SubmissionRow | null>(() => {
    const withFeedback = pageSubmissions.filter(
      (s) =>
        ['reviewed', 'completed', 'needs_resubmission'].includes(s.status) &&
        s.currentAttemptId,
    );
    if (withFeedback.length === 0) return null;
    return withFeedback.sort((a, b) => {
      const ta = a.reviewedAt ?? a.updatedAt;
      const tb = b.reviewedAt ?? b.updatedAt;
      return new Date(tb).getTime() - new Date(ta).getTime();
    })[0];
  }, [pageSubmissions]);

  const hasFeedback = !!reviewedSubmission;

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

  const handleFeedback = useCallback(() => {
    if (!reviewedSubmission) {
      Alert.alert(
        'No Feedback Yet',
        'Submit your recitation and your teacher will annotate it.',
        [{ text: 'OK' }],
      );
      return;
    }
    router.push({
      pathname: '/assignments/[id]/feedback/[attemptId]',
      params: {
        id: reviewedSubmission.assignmentId,
        attemptId: reviewedSubmission.currentAttemptId!,
      },
    });
  }, [reviewedSubmission, router]);

  const imgW = SCREEN_W;
  const imgH = page?.width && page?.height
    ? Math.round(SCREEN_W * (page.height / page.width))
    : Math.round(SCREEN_W * (2103 / 1300));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Page ${pageNumber}` }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerH }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
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

      <Animated.View
        style={[styles.footer, { transform: [{ translateY: footerTranslate }] }]}
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
      >
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

        <TouchableOpacity
          style={[styles.feedbackBtn, hasFeedback && styles.feedbackBtnActive]}
          onPress={handleFeedback}
          activeOpacity={0.75}
        >
          <Text style={styles.feedbackIcon}>📋</Text>
          <Text style={[styles.feedbackLabel, hasFeedback && styles.feedbackLabelActive]}>
            Feedback
          </Text>
        </TouchableOpacity>
      </Animated.View>
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: C.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },

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
  feedbackBtnActive:   { borderColor: C.blue },
  feedbackIcon:        { fontSize: 16 },
  feedbackLabel:       { fontSize: 14, fontWeight: '600', color: C.textMuted },
  feedbackLabelActive: { color: C.blue },
});
