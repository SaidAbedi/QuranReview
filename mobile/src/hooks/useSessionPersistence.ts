import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { secureStorage } from '@/lib/secureStorage';

export function useSessionPersistence() {
  useEffect(() => {
    // On app start, try to restore session from secure storage
    const restoreSession = async () => {
      const refreshToken = await secureStorage.getRefreshToken();
      if (refreshToken) {
        try {
          // Use the refresh token to get a new access token and restore the session
          const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
          if (error || !data.session) {
            // Refresh token expired or invalid, clear it
            await secureStorage.clearRefreshToken();
          }
          // If successful, the onAuthStateChange listener will handle updating the store
        } catch {
          await secureStorage.clearRefreshToken();
        }
      }
    };

    restoreSession();
  }, []);

  // Subscribe to auth state changes to persist tokens
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.refresh_token) {
        // Save refresh token whenever we get a new session
        await secureStorage.saveRefreshToken(session.refresh_token);
      } else if (!session) {
        // Clear token when user logs out
        await secureStorage.clearRefreshToken();
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
