export const colors = {
  ring: { from: '#38BDF8', to: '#E0F2FE' },
  ringGlow: 'rgba(56,189,248,0.3)',
  ringAmber: '#FBBF24',
  ringSurplus: '#F87171',

  protein: '#38BDF8',
  carbs: '#818CF8',
  fat: '#F472B6',
  fiber: '#34D399',

  bg: '#070B14',
  card: 'rgba(56,189,248,0.025)',
  cardBorder: 'rgba(56,189,248,0.08)',
  sheet: '#09111F',
  sheetBorder: 'rgba(56,189,248,0.08)',

  text: '#E0F2FE',
  textMuted: '#1E3A5F',
  textDim: '#0D2D4A',

  primary: '#38BDF8',
  primaryEnd: '#BAE6FD',
  primaryGlow: 'rgba(56,189,248,0.25)',
  danger: '#F87171',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 24,
  full: 9999,
} as const

export const fonts = {
  display: 'Syne_800ExtraBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  label: 'Inter_500Medium',
  labelSemiBold: 'Inter_600SemiBold',
} as const

export const macroColors = {
  protein: colors.protein,
  carbs: colors.carbs,
  fats: colors.fat,
  fiber: colors.fiber,
} as const

export function ringColor(pct: number): string {
  if (pct >= 1.0) return colors.ringSurplus
  if (pct >= 0.9) return colors.ringAmber
  return colors.ring.from
}
