import { useColorScheme } from 'react-native';
import { createTheme, ThemeMode } from '@/theme';

export function useTheme(forceMode?: ThemeMode) {
  const system = useColorScheme() ?? 'light';
  return createTheme(forceMode ?? (system as ThemeMode));
}
