import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Redirect to the unified assignment screen.
// The unified screen auto-opens Feedback mode when feedback exists.
export default function FeedbackRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/assignments/${id}` as '/');
  }, [id, router]);
  return null;
}
