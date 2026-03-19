import { useColorScheme } from 'react-native';
import { useAppStore, getThemeColors } from '../store/appStore';
import { DARK_COLORS, LIGHT_COLORS } from '../utils/colors';

export const useAppTheme = () => {
  const systemScheme = useColorScheme();
  const { theme, colorSchemePreference, setColorSchemePreference } = useAppStore();

  const resolvedScheme =
    colorSchemePreference === 'system'
      ? systemScheme ?? 'light'
      : colorSchemePreference;

  const baseColors = resolvedScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const themeColors = getThemeColors(theme);
  const colors = {
    ...baseColors,
    ...themeColors,
  };

  return {
    colors,
    themeColors,
    theme,
    isDark: resolvedScheme === 'dark',
    resolvedScheme,
    colorSchemePreference,
    setColorSchemePreference,
  };
};
