import { Platform } from 'react-native';

// System fonts for now — Inter + Noto Naskh Arabic loaded in a later phase
export const fontFamily = {
  ui:         Platform.select({ ios: 'System',   android: 'sans-serif'        }) ?? 'System',
  uiMedium:   Platform.select({ ios: 'System',   android: 'sans-serif-medium' }) ?? 'System',
  arabic:     Platform.select({ ios: 'Geeza Pro',android: 'sans-serif'        }) ?? 'System',
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 42, fontWeight: '700' as const },
  h1:      { fontSize: 28, lineHeight: 36, fontWeight: '700' as const },
  h2:      { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  h3:      { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  h4:      { fontSize: 18, lineHeight: 26, fontWeight: '600' as const },
  bodyLg:  { fontSize: 17, lineHeight: 26, fontWeight: '400' as const },
  body:    { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyMd:  { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  button:  { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  chip:    { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
  tab:     { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },
} as const;
