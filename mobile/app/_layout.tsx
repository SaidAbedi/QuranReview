import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { fetchMe } from '@/api/me';

export default function RootLayout() {
  const { session, user, isLoading, setSession, setUser, setLoading } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession) {
          try {
            const me = await fetchMe();
            setUser(me);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (user) {
      const status = user.profile.onboardingStatus;
      if (status === 'pending_assignment' || status === 'new') {
        if (segments[0] !== 'pending') router.replace('/pending');
      } else {
        if (inAuthGroup || segments[0] === 'pending') {
          router.replace('/(tabs)/');
        }
      }
    }
  }, [isLoading, session, user, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="assignments" />
    </Stack>
  );
}
