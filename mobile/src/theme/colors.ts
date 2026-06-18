// ── Raw palette ───────────────────────────────────────────────────────────────

export const palette = {
  gold: {
    50:  '#FFF8E6',
    100: '#F7E7BF',
    200: '#EFD18A',
    300: '#E7BF5E',
    400: '#D9A93A',
    500: '#C89B3C',
    600: '#A77C26',
    700: '#7E5B18',
    800: '#5A3F10',
    900: '#332307',
  },
  neutral: {
    0:   '#FFFFFF',
    50:  '#FCFAF6',
    100: '#F6F1E8',
    150: '#EFE7D8',
    200: '#E5DDD0',
    300: '#CDC4B8',
    400: '#9C958C',
    500: '#6D6A64',
    600: '#4A4742',
    700: '#2D2B28',
    800: '#1D1C1A',
    850: '#171717',
    900: '#0F0F0E',
    950: '#080808',
  },
  success: {
    50:  '#EAF7EE',
    400: '#4ADE80',
    500: '#2E7D32',
    700: '#1F5C25',
  },
  warning: {
    50:  '#FFF4D8',
    400: '#FBBF24',
    500: '#C58B00',
    700: '#8A6200',
  },
  error: {
    50:  '#FDECEA',
    400: '#FF6B6B',
    500: '#C0392B',
    700: '#8E251B',
  },
  info: {
    50:  '#EAF2FF',
    500: '#2F6FED',
    700: '#1F4DA8',
  },
} as const;

// ── Light theme ───────────────────────────────────────────────────────────────

export const lightColors = {
  // Backgrounds
  background:       palette.neutral[50],
  backgroundAlt:    palette.neutral[100],
  surface:          palette.neutral[0],
  surfaceRaised:    '#FFFDF8',
  surfaceSunken:    palette.neutral[100],
  surfaceOverlay:   'rgba(255,255,255,0.92)',

  // Text
  textPrimary:      '#111111',
  textSecondary:    palette.neutral[600],
  textMuted:        palette.neutral[500],
  textDisabled:     palette.neutral[400],
  textInverse:      palette.neutral[0],

  // Brand
  brandPrimary:        palette.gold[500],
  brandPrimaryPressed: palette.gold[600],
  brandPrimarySoft:    palette.gold[100],
  brandPrimarySubtle:  palette.gold[50],
  brandOnPrimary:      '#111111',

  // Borders
  border:       palette.neutral[200],
  borderStrong: palette.neutral[300],
  divider:      palette.neutral[150],

  // Inputs
  inputBackground:  palette.neutral[0],
  inputBorder:      palette.neutral[200],
  inputFocusBorder: palette.gold[500],
  inputPlaceholder: palette.neutral[400],

  // Navigation
  tabBackground:  palette.neutral[0],
  tabActive:      palette.gold[500],
  tabInactive:    palette.neutral[500],
  headerBg:       '#111111',
  headerText:     palette.neutral[0],

  // Semantic
  success:   palette.success[500],
  successBg: palette.success[50],
  warning:   palette.warning[500],
  warningBg: palette.warning[50],
  error:     palette.error[500],
  errorBg:   palette.error[50],
  info:      palette.info[500],
  infoBg:    palette.info[50],

  // Shadows
  shadow:       'rgba(17,17,17,0.10)',
  shadowStrong: 'rgba(17,17,17,0.18)',
} as const;

// ── Dark theme ────────────────────────────────────────────────────────────────

export const darkColors = {
  // Backgrounds
  background:       palette.neutral[950],
  backgroundAlt:    palette.neutral[900],
  surface:          palette.neutral[850],
  surfaceRaised:    palette.neutral[800],
  surfaceSunken:    palette.neutral[900],
  surfaceOverlay:   'rgba(23,23,23,0.92)',

  // Text
  textPrimary:      palette.neutral[0],
  textSecondary:    palette.neutral[150],
  textMuted:        palette.neutral[300],
  textDisabled:     palette.neutral[500],
  textInverse:      '#111111',

  // Brand
  brandPrimary:        palette.gold[400],
  brandPrimaryPressed: palette.gold[500],
  brandPrimarySoft:    palette.gold[800],
  brandPrimarySubtle:  palette.gold[900],
  brandOnPrimary:      '#111111',

  // Borders
  border:       '#2A2A2A',
  borderStrong: '#3A3834',
  divider:      '#252421',

  // Inputs
  inputBackground:  '#111111',
  inputBorder:      '#2A2A2A',
  inputFocusBorder: palette.gold[400],
  inputPlaceholder: palette.neutral[500],

  // Navigation
  tabBackground:  '#111111',
  tabActive:      palette.gold[400],
  tabInactive:    palette.neutral[300],
  headerBg:       '#0F0F0E',
  headerText:     palette.neutral[0],

  // Semantic
  success:   palette.success[400],
  successBg: '#11391E',
  warning:   palette.warning[400],
  warningBg: palette.gold[900],
  error:     palette.error[400],
  errorBg:   '#3A1512',
  info:      '#70A4FF',
  infoBg:    '#102546',

  // Shadows
  shadow:       'rgba(0,0,0,0.32)',
  shadowStrong: 'rgba(0,0,0,0.50)',
} as const;

// ── Annotation colors (always used on dark Mus'haf pages) ────────────────────
// These do not vary by theme — the Mus'haf image is always dark background.

export const annotationColors = {
  pending:   '#FF6B6B',               // bright red   — unsaved stroke
  saved:     '#4ADE80',               // bright green — committed annotation
  selected:  '#FBBF24',               // bright gold  — active/tapped
  highlight: 'rgba(251,191,36,0.28)', // translucent gold overlay
  notePin:   '#FBBF24',               // gold pin for text notes
} as const;

// ── Status chip tokens ────────────────────────────────────────────────────────

export const statusChips = {
  light: {
    submitted:         { bg: '#EAF7EE', text: '#2E7D32', label: 'Submitted' },
    in_review:         { bg: '#FFF4D8', text: '#C58B00', label: 'In Review' },
    needs_resubmission:{ bg: '#FDECEA', text: '#C0392B', label: 'Needs Practice' },
    completed:         { bg: '#EAF7EE', text: '#2E7D32', label: 'Completed' },
    draft:             { bg: '#F3F4F6', text: '#6D6A64', label: 'Draft' },
    reviewed:          { bg: '#EAF2FF', text: '#2F6FED', label: 'Reviewed' },
    assigned:          { bg: '#F3F4F6', text: '#6D6A64', label: 'Assigned' },
  },
  dark: {
    submitted:         { bg: '#11391E', text: '#4ADE80', label: 'Submitted' },
    in_review:         { bg: '#332307', text: '#FBBF24', label: 'In Review' },
    needs_resubmission:{ bg: '#3A1512', text: '#FF6B6B', label: 'Needs Practice' },
    completed:         { bg: '#11391E', text: '#4ADE80', label: 'Completed' },
    draft:             { bg: '#252421', text: '#9C958C', label: 'Draft' },
    reviewed:          { bg: '#102546', text: '#70A4FF', label: 'Reviewed' },
    assigned:          { bg: '#252421', text: '#9C958C', label: 'Assigned' },
  },
} as const;

export type ThemeColors = typeof lightColors;
