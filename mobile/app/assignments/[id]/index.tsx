import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getStudentAssignment } from '@/api/assignments';
import { getQuranPage } from '@/api/quran';
import { getStudentSubmissions } from '@/api/submissions';
import type { AssignmentSummary, SubmissionRow } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'Teacher Reviewing',
  reviewed: 'Reviewed',
  needs_resubmission: 'Returned for Practice',
  completed: 'Completed',
  archived: 'Archived',
};

const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280',
  submitted: '#1B4F72',
  in_review: '#D97706',
  reviewed: '#7C3AED',
  needs_resubmission: '#DC2626',
  completed: '#059669',
  archived: '#9CA3AF',
};

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const [asgn, allSubmissions] = await Promise.all([
          getStudentAssignment(id),
          getStudentSubmissions(),
        ]);
        setAssignment(asgn);

        const existing = allSubmissions.find((s) => s.assignmentId === asgn.id) ?? null;
        setSubmission(existing);

        // Resolve page image: prefer assignment.imageUrl, fall back to quran proxy.
        if (asgn.imageUrl) {
          setPageImageUrl(asgn.imageUrl);
        } else if (asgn.pageNumber != null) {
          try {
            const page = await getQuranPage(asgn.pageNumber);
            setPageImageUrl(page.imageUrl);
          } catch {
            setPageImageUrl(null);
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load assignment');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const canRecord =
    !submission ||
    submission.status === 'needs_resubmission' ||
    submission.status === 'draft';

  const handleRecord = () => {
    router.push({
      pathname: '/assignments/[id]/record',
      params: submission ? { id, submissionId: submission.id } : { id },
    });
  };

  if (loading) return <LoadingScreen message="Loading assignment…" />;
  if (error || !assignment)
    return <ErrorScreen message={error ?? 'Assignment not found'} onRetry={() => load()} />;

  const title =
    assignment.title ?? (assignment.pageNumber ? `Page ${assignment.pageNumber}` : 'Assignment');

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
          />
        }
      >
        {/* Page image */}
        {pageImageUrl ? (
          <Image
            source={{ uri: pageImageUrl }}
            style={styles.pageImage}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={styles.pageImagePlaceholder}>
            <Text style={styles.placeholderText}>
              {assignment.pageNumber ? `Page ${assignment.pageNumber}` : 'No page image available'}
            </Text>
          </View>
        )}

        {/* Assignment details */}
        <View style={styles.section}>
          {assignment.pageNumber != null && (
            <Text style={styles.meta}>Quran Page {assignment.pageNumber}</Text>
          )}
          {assignment.dueAt && (
            <Text style={styles.meta}>
              Due {new Date(assignment.dueAt).toLocaleDateString()}
            </Text>
          )}
          {assignment.instructions && (
            <Text style={styles.instructions}>{assignment.instructions}</Text>
          )}
        </View>

        {/* Submission status */}
        {submission && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your Submission</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    SUBMISSION_STATUS_COLORS[submission.status] ?? '#6B7280',
                },
              ]}
            >
              <Text style={styles.statusText}>
                {SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}
              </Text>
            </View>
          </View>
        )}

        {/* Record button */}
        {canRecord && (
          <View style={styles.section}>
            <Button
              title={submission ? 'Record New Attempt' : 'Start Recording'}
              onPress={handleRecord}
            />
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, gap: 16 },
  pageImage: {
    width: '100%',
    aspectRatio: 0.7,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  pageImagePlaceholder: {
    width: '100%',
    aspectRatio: 0.7,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#9CA3AF', fontSize: 15 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  meta: { fontSize: 14, color: '#374151' },
  instructions: { fontSize: 14, color: '#374151', lineHeight: 20 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
