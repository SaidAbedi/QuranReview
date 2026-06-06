import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { fetchMe } from "@/api/me";

export default function RootLayout() {
  const { session, user, isLoading, setSession, setUser, setLoading } =
    useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        try {
          // 10-second timeout so a dead backend doesn't block auth routing forever.
          const me = await Promise.race([
            fetchMe(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("fetchMe timeout")), 10_000),
            ),
          ]);
          setUser(me);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/login");
    } else if (user) {
      const status = user.profile.onboardingStatus;
      if (status === "pending_assignment" || status === "new") {
        if (segments[0] !== "pending") router.replace("/pending");
      } else if (user.role === "admin" || user.role === "super_admin") {
        if (segments[0] !== "(admin)") {
          router.replace("/(admin)" as "/");
        }
      } else if (user.role === "teacher") {
        if (segments[0] !== "(teacher)") {
          router.replace("/(teacher)/queue" as "/");
        }
      } else {
        // student
        if (inAuthGroup || segments[0] === "pending") {
          router.replace("/(tabs)" as "/");
        }
      }
    }
  }, [isLoading, session, user, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(teacher)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="assignments" />
    </Stack>
  );
}
