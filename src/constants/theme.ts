export const colors = {
  background: '#FFFFFF',
  text: '#000000',
  textMuted: '#6B6B6B',
  placeholder: '#9E9E9E',
  border: '#E3E3E3',
  surface: '#F2F2F2',
  primary: '#000000',
  onPrimary: '#FFFFFF',
  success: '#34C759',
  brand: '#14A38B',
  brandDark: '#0F7B6C',
  danger: '#E53935',
  tabInactive: '#8E8E93',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14 },
  caption: { fontSize: 12 },
  amount: { fontSize: 26, fontWeight: '600' },
} as const;
