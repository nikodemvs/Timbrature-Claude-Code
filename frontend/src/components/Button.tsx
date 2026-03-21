import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { DESIGN_TOKENS } from '../utils/colors';
import { createElevation } from '../utils/shadows';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success';
  size?: 'small' | 'medium' | 'large';
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  loading,
  disabled,
  style,
  textStyle,
  fullWidth,
  testID,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles();

  const getTextColor = () => {
    if (disabled) return colors.textSecondary;
    switch (variant) {
      case 'outline': return colors.primary;
      case 'secondary': return colors.text;
      default: return colors.textWhite;
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'small': return { minHeight: 40, paddingVertical: 8, paddingHorizontal: 14 };
      case 'large': return { minHeight: 54, paddingVertical: 16, paddingHorizontal: 22 };
      default: return { minHeight: DESIGN_TOKENS.component.buttonMinHeight, paddingVertical: 12, paddingHorizontal: 18 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return 13;
      case 'large': return 17;
      default: return 15;
    }
  };

  const iconSize = size === 'small' ? 15 : size === 'large' ? 20 : 17;
  const variantStyle =
    variant === 'outline'
      ? {
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.border,
        }
      : variant === 'secondary'
        ? {
            backgroundColor: colors.cardDark,
            borderWidth: 1,
            borderColor: colors.border,
          }
        : variant === 'danger'
          ? {
              backgroundColor: colors.error,
              borderWidth: 0,
            }
          : variant === 'success'
            ? {
                backgroundColor: colors.success,
                borderWidth: 0,
              }
            : {
                backgroundColor: colors.primary,
                borderWidth: 0,
                ...createElevation({
                  color: colors.shadowMedium,
                  offsetY: 3,
                  blur: 10,
                  opacity: 0.2,
                  elevation: 3,
                }),
              };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getPadding(),
        variantStyle,
        disabled && { backgroundColor: colors.borderDark, borderColor: colors.borderDark, shadowOpacity: 0, elevation: 0 },
        fullWidth && { width: '100%' },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={iconSize} color={getTextColor()} style={styles.iconLeft} />
          )}
          <Text style={[styles.text, { color: getTextColor(), fontSize: getFontSize() }, textStyle]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={iconSize} color={getTextColor()} style={styles.iconRight} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const createStyles = () =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: DESIGN_TOKENS.radius.lg,
    },
    text: {
      fontWeight: '700',
      letterSpacing: 0.15,
    },
    iconLeft: {
      marginRight: 10,
    },
    iconRight: {
      marginLeft: 10,
    },
  });
