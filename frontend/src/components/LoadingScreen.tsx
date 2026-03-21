import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { DESIGN_TOKENS } from '../utils/colors';
import { createElevation } from '../utils/shadows';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Caricamento...' }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 24,
    },
    panel: {
      minWidth: 220,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: DESIGN_TOKENS.radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 24,
      paddingHorizontal: 20,
      ...createElevation({
        color: colors.shadowMedium,
        offsetY: 4,
        blur: 14,
        opacity: 0.18,
        elevation: 3,
      }),
    },
    text: {
      marginTop: 16,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
