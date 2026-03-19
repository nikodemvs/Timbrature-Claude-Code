import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

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

  const getBackgroundColor = () => {
    if (disabled) return colors.borderDark;
    switch (variant) {
      case 'primary': return colors.primary;
      case 'secondary': return colors.secondary;
      case 'danger': return colors.error;
      case 'success': return colors.success;
      case 'outline': return 'transparent';
      default: return colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.textSecondary;
    switch (variant) {
      case 'outline': return colors.primary;
      default: return colors.textWhite;
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'small': return { paddingVertical: 8, paddingHorizontal: 16 };
      case 'large': return { paddingVertical: 16, paddingHorizontal: 32 };
      default: return { paddingVertical: 12, paddingHorizontal: 24 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return 14;
      case 'large': return 18;
      default: return 16;
    }
  };

  const iconSize = size === 'small' ? 16 : size === 'large' ? 22 : 18;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getPadding(),
        { backgroundColor: getBackgroundColor() },
        variant === 'outline' && { borderWidth: 2, borderColor: colors.primary },
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
      borderRadius: 12,
      minHeight: 44,
    },
    text: {
      fontWeight: '600',
    },
    iconLeft: {
      marginRight: 8,
    },
    iconRight: {
      marginLeft: 8,
    },
  });
