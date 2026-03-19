export interface AppColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  background: string;
  surface: string;
  card: string;
  cardDark: string;
  text: string;
  textSecondary: string;
  textLight: string;
  textWhite: string;
  border: string;
  borderDark: string;
  overtime: string;
  ticket: string;
  ferie: string;
  malattia: string;
  reperibilita: string;
  overlay: string;
  shadowLight: string;
  shadowMedium: string;
}

export const LIGHT_COLORS: AppColors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#3B82F6',
  secondary: '#0F172A',
  secondaryLight: '#1E293B',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#06B6D4',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardDark: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#475569',
  textLight: '#94A3B8',
  textWhite: '#FFFFFF',
  border: '#E2E8F0',
  borderDark: '#CBD5E1',
  overtime: '#8B5CF6',
  ticket: '#EC4899',
  ferie: '#22D3EE',
  malattia: '#F97316',
  reperibilita: '#A855F7',
  overlay: 'rgba(15, 23, 42, 0.5)',
  shadowLight: 'rgba(15, 23, 42, 0.04)',
  shadowMedium: 'rgba(15, 23, 42, 0.08)',
};

export const DARK_COLORS: AppColors = {
  primary: '#60A5FA',
  primaryDark: '#3B82F6',
  primaryLight: '#93C5FD',
  secondary: '#CBD5E1',
  secondaryLight: '#E2E8F0',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#22D3EE',
  background: '#020617',
  surface: '#0F172A',
  card: '#111827',
  cardDark: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textLight: '#94A3B8',
  textWhite: '#FFFFFF',
  border: '#1E293B',
  borderDark: '#334155',
  overtime: '#A78BFA',
  ticket: '#F472B6',
  ferie: '#67E8F9',
  malattia: '#FB923C',
  reperibilita: '#C084FC',
  overlay: 'rgba(2, 6, 23, 0.78)',
  shadowLight: 'rgba(0, 0, 0, 0.18)',
  shadowMedium: 'rgba(0, 0, 0, 0.32)',
};

// Legacy export kept as a safe fallback for any untouched imports.
export const COLORS = LIGHT_COLORS;

export const GRADIENTS = {
  primary: ['#2563EB', '#3B82F6'],
  success: ['#059669', '#10B981'],
  warning: ['#D97706', '#F59E0B'],
  error: ['#DC2626', '#EF4444'],
};
