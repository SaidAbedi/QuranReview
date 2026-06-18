export * from './colors';
export * from './typography';
export * from './spacing';

import { lightColors, darkColors, annotationColors, statusChips } from './colors';
import { typography, fontFamily } from './typography';
import { spacing, radius, shadows, layout } from './spacing';

export type ThemeMode = 'light' | 'dark';

export function createTheme(mode: ThemeMode) {
  const colors = mode === 'dark' ? darkColors : lightColors;
  const chips  = mode === 'dark' ? statusChips.dark : statusChips.light;
  return {
    mode,
    colors,
    chips,
    annotationColors,
    typography,
    fontFamily,
    spacing,
    radius,
    shadows,
    layout,
  } as const;
}

export type AppTheme = ReturnType<typeof createTheme>;
