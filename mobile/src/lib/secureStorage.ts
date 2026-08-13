import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'supabase_refresh_token';

export const secureStorage = {
  async saveRefreshToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    } catch (error) {
      console.warn('Failed to save refresh token:', error);
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.warn('Failed to retrieve refresh token:', error);
      return null;
    }
  },

  async clearRefreshToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.warn('Failed to clear refresh token:', error);
    }
  },
};
