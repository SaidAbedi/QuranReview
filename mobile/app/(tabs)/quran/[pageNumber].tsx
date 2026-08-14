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
import { pushRecentPage } from '@/lib/recentPages';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/api/client';
import type { QuranPageSummary, SubmissionRow } from '@/types/api';

const { width: SCREEN_W } = Dimensions.get('window');

const SCROLL_THRESHOLD = 8; // px delta before we react

export default function QuranPageScreen() {
  const { pageNumber: pageParam } = useLocalSearchParams<{ pageNumber: string }>();
  const pageNumber = parseInt(pageParam ?? '1', 10);
  const router = useRouter();
  const theme = useTheme('dark');
  const T = theme.colors;

  const [page, setPage]               = useState<QuranPageSummary | null>(null);
  const [loadingPage, setLoadingPage]   = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [pageSubmissions, setPageSubmissions] = useState<SubmissionRow[]>([]);
  const [footerH, setFooterH]           = useState(90); // real height from onLayout

  // Record this page as recently read for the browser's Recently Read strip.
  useEffect(() => {
    if (!Number.isNaN(pageNumber)) pushRecentPage(pageNumber);
  }, [pageNumber]);

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
        submissionId: reviewedSubmission.id,
        pageNumber: pageNumber.toString(),
      },
    });
  }, [reviewedSubmission, router]);

  const imgW = SCREEN_W;
  const imgH = page?.width && page?.height
    ? Math.round(SCREEN_W * (page.height / page.width))
    : Math.round(SCREEN_W * (2103 / 1300));

  return (
    <View style={[styles.container, { backgroundColor: T.background }]}>
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
          <View style={[styles.imagePlaceholder, { height: imgH, backgroundColor: T.backgroundAlt }]}>
            <ActivityIndicator size="large" color={T.brandPrimary} />
          </View>
        ) : page?.imageUrl ? (
          <Image
            source={{ uri: page.imageUrl }}
            style={{ width: imgW, height: imgH }}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { height: imgH, backgroundColor: T.backgroundAlt }]}>
            <Text style={[styles.placeholderText, { color: T.textMuted }]}>Page image unavailable</Text>
          </View>
        )}
      </ScrollView>

      <Animated.View
        style={[
          styles.footer,
          {
            transform: [{ translateY: footerTranslate }],
            backgroundColor: T.surface,
            borderTopColor: T.border,
          },
        ]}
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={[
            styles.reciteBtn,
            { backgroundColor: T.brandPrimary },
            submitting && styles.btnDisabled,
            !hasFeedback && styles.reciteBtnFull,
          ]}
          onPress={handleRecite}
          disabled={submitting}
          activeOpacity={0.82}
        >
          {submitting ? (
            <ActivityIndicator color={T.brandOnPrimary} size="small" />
          ) : (
            <>
              <Text style={styles.reciteIcon}>🎙</Text>
              <Text style={[styles.reciteLabel, { color: T.brandOnPrimary }]}>Recite</Text>
            </>
          )}
        </TouchableOpacity>

        {hasFeedback && (
          <TouchableOpacity
            style={[styles.feedbackBtnActive, { backgroundColor: T.surface, borderColor: T.brandPrimary }]}
            onPress={handleFeedback}
            activeOpacity={0.75}
          >
            <Text style={styles.feedbackIcon}>📋</Text>
            <Text style={[styles.feedbackLabelActive, { color: T.brandPrimary }]}>Feedback</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1 },

  imagePlaceholder: {
    width: SCREEN_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontSize: 14 },

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
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  reciteBtn: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  reciteBtnFull: { flex: 1 },
  btnDisabled:   { opacity: 0.55 },
  reciteIcon:    { fontSize: 18 },
  reciteLabel:   { fontSize: 16, fontWeight: '700' },

  feedbackBtnActive: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  feedbackIcon:        { fontSize: 16 },
  feedbackLabelActive: { fontSize: 14, fontWeight: '600' },
});
