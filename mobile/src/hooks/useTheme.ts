import { createTheme, ThemeMode } from '@/theme';

export function useTheme(forceMode?: ThemeMode) {
  return createTheme(forceMode ?? 'dark');
}
