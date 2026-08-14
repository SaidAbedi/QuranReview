import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
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
import { getQuranPage, quranPageImageUrl, TOTAL_QURAN_PAGES } from '@/api/quran';
import { createSelfPacedSubmission, getStudentSubmissions } from '@/api/submissions';
import { pushRecentPage } from '@/lib/recentPages';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/api/client';
import type { SubmissionRow } from '@/types/api';

const { width: SCREEN_W } = Dimensions.get('window');

// All mushaf pages are 1260×2038; use that constant ratio for every page so
// the pager can lay out instantly without waiting on per-page metadata.
const PAGE_RATIO = 2038 / 1260;
const IMG_H = Math.round(SCREEN_W * PAGE_RATIO);
const PAGE_BG = '#FCF9F0';

const SCROLL_THRESHOLD = 8; // px delta before we react

// ── A single swipeable page: the tall page image in a vertical scroller ──────

const PagePane = memo(function PagePane({
  pageNumber,
  footerH,
  onVScroll,
}: {
  pageNumber: number;
  footerH: number;
  onVScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: footerH }}
      showsVerticalScrollIndicator={false}
      bounces={false}
      scrollEventThrottle={16}
      onScroll={onVScroll}
    >
      <Image
        source={{ uri: quranPageImageUrl(pageNumber) }}
        style={{ width: SCREEN_W, height: IMG_H, backgroundColor: PAGE_BG }}
        resizeMode="contain"
      />
    </ScrollView>
  );
});

export default function QuranPageScreen() {
  const { pageNumber: pageParam } = useLocalSearchParams<{ pageNumber: string }>();
  const initialPage = Math.min(Math.max(parseInt(pageParam ?? '1', 10) || 1, 1), TOTAL_QURAN_PAGES);
  const router = useRouter();
  const theme = useTheme('dark');
  const T = theme.colors;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [submitting, setSubmitting]   = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [footerH, setFooterH]         = useState(90); // real height from onLayout

  // RTL mushaf order: page 604 at index 0 … page 1 at the last index. This puts
  // the next page to the LEFT of the current one, so swiping RIGHT turns to the
  // next page — the natural direction for an Arabic book. index ↔ page is
  // TOTAL_QURAN_PAGES - index.
  const pages = useMemo(
    () => Array.from({ length: TOTAL_QURAN_PAGES }, (_, i) => TOTAL_QURAN_PAGES - i),
    [],
  );

  // Record the visible page for the browser's Recently Read strip.
  useEffect(() => { pushRecentPage(currentPage); }, [currentPage]);

  // Load this student's submissions once; re-filtered per page below.
  useEffect(() => {
    getStudentSubmissions().then(setSubmissions).catch(() => {});
  }, []);

  // Resolve the current page's DB id so we can match its submissions.
  useEffect(() => {
    let cancelled = false;
    getQuranPage(currentPage)
      .then((p) => { if (!cancelled) setCurrentPageId(p.id); })
      .catch(() => { if (!cancelled) setCurrentPageId(null); });
    return () => { cancelled = true; };
  }, [currentPage]);

  // ── Auto-hide footer on vertical scroll ──
  const footerTranslate = useRef(new Animated.Value(0)).current;
  const lastScrollY     = useRef(0);
  const footerShown     = useRef(true);

  const showFooter = useCallback(() => {
    if (footerShown.current) return;
    footerShown.current = true;
    Animated.spring(footerTranslate, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  }, [footerTranslate]);

  const hideFooter = useCallback((height: number) => {
    if (!footerShown.current) return;
    footerShown.current = false;
    Animated.spring(footerTranslate, { toValue: height, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  }, [footerTranslate]);

  const handleVScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;
      if (delta > SCROLL_THRESHOLD) hideFooter(footerH);
      else if (delta < -SCROLL_THRESHOLD) showFooter();
    },
    [hideFooter, showFooter, footerH],
  );

  // ── Page turn: settle onto the nearest page ──
  const handlePageSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      const next = Math.min(Math.max(TOTAL_QURAN_PAGES - idx, 1), TOTAL_QURAN_PAGES);
      if (next !== currentPage) {
        setCurrentPage(next);
        lastScrollY.current = 0;
        showFooter();
      }
    },
    [currentPage, showFooter],
  );

  // ── Submissions / feedback for the current page ──
  const reviewedSubmission = useMemo<SubmissionRow | null>(() => {
    if (!currentPageId) return null;
    const withFeedback = submissions.filter(
      (s) =>
        s.quranPageId === currentPageId &&
        ['reviewed', 'completed', 'needs_resubmission'].includes(s.status) &&
        s.currentAttemptId,
    );
    if (withFeedback.length === 0) return null;
    return withFeedback.sort((a, b) => {
      const ta = a.reviewedAt ?? a.updatedAt;
      const tb = b.reviewedAt ?? b.updatedAt;
      return new Date(tb).getTime() - new Date(ta).getTime();
    })[0];
  }, [submissions, currentPageId]);

  const hasFeedback = !!reviewedSubmission;

  const handleRecite = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await createSelfPacedSubmission(currentPage);
      router.push({ pathname: '/assignments/[id]/record', params: { id: result.assignmentId } });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Cannot Recite', msg);
    } finally {
      setSubmitting(false);
    }
  }, [currentPage, router]);

  const handleFeedback = useCallback(() => {
    if (!reviewedSubmission) {
      Alert.alert('No Feedback Yet', 'Submit your recitation and your teacher will annotate it.', [{ text: 'OK' }]);
      return;
    }
    router.push({
      pathname: '/assignments/[id]/feedback/[attemptId]',
      params: {
        id: reviewedSubmission.assignmentId,
        attemptId: reviewedSubmission.currentAttemptId!,
        submissionId: reviewedSubmission.id,
        pageNumber: currentPage.toString(),
      },
    });
  }, [reviewedSubmission, router, currentPage]);

  return (
    <View style={[styles.container, { backgroundColor: T.background }]}>
      <Stack.Screen options={{ title: `Page ${currentPage}` }} />

      <FlatList
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={TOTAL_QURAN_PAGES - initialPage}
        getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        keyExtractor={(p) => String(p)}
        onMomentumScrollEnd={handlePageSettle}
        // Keep only a few pages mounted for smooth, memory-safe paging.
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        renderItem={({ item }) => (
          <PagePane pageNumber={item} footerH={footerH} onVScroll={handleVScroll} />
        )}
      />

      <Animated.View
        style={[
          styles.footer,
          { transform: [{ translateY: footerTranslate }], backgroundColor: T.surface, borderTopColor: T.border },
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
