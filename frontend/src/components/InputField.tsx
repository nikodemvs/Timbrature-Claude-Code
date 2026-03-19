import React from 'react';
import { View, Text, StyleSheet, TextInput, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

interface InputFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightElement?: React.ReactNode;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  error,
  icon,
  rightElement,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, error && styles.inputError]}>
        {icon && (
          <Ionicons name={icon} size={20} color={colors.textSecondary} style={styles.icon} />
        )}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textLight}
          {...props}
        />
        {rightElement}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardDark,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      minHeight: 48,
    },
    inputError: {
      borderColor: colors.error,
    },
    icon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 12,
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
      marginTop: 4,
    },
  });
