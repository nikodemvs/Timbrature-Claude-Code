import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Caricamento...' }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
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
    },
    text: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
    },
  });
