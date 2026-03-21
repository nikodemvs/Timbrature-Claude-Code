import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { DESIGN_TOKENS } from '../utils/colors';

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
  onFocus,
  onBlur,
  ...props
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [isFocused, setIsFocused] = useState(false);

  const resolvedBorderColor = error
    ? colors.error
    : isFocused
      ? colors.primary
      : colors.border;

  const resolvedBackgroundColor = error
    ? colors.card
    : colors.surface;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, { backgroundColor: resolvedBackgroundColor, borderColor: resolvedBorderColor }]}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={isFocused ? colors.primary : colors.textSecondary}
            style={styles.icon}
          />
        )}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textLight}
          selectionColor={colors.primary}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
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
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
      letterSpacing: 0.2,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: DESIGN_TOKENS.radius.lg,
      borderWidth: 1.5,
      paddingHorizontal: 14,
      minHeight: DESIGN_TOKENS.component.inputMinHeight,
    },
    icon: {
      marginRight: 12,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 14,
      minHeight: DESIGN_TOKENS.component.inputMinHeight - 2,
    },
    rightElement: {
      marginLeft: 12,
    },
    errorText: {
      fontSize: 13,
      color: colors.error,
      marginTop: 6,
    },
  });
