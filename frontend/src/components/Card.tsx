import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { DESIGN_TOKENS } from '../utils/colors';
import { createElevation } from '../utils/shadows';

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
  rightElement?: React.ReactNode;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  icon,
  iconColor,
  onPress,
  children,
  style,
  loading,
  rightElement,
  testID,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const Wrapper = onPress ? TouchableOpacity : View;
  const resolvedIconColor = iconColor ?? colors.primary;

  return (
    <Wrapper style={[styles.card, style]} onPress={onPress} activeOpacity={0.86} testID={testID}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <>
          {(title || icon) && (
            <View style={[styles.header, !children && { marginBottom: 0 }]}>
              <View style={styles.headerLeft}>
                {icon && (
                  <View style={[styles.iconContainer, { backgroundColor: `${resolvedIconColor}15` }]}>
                    <Ionicons name={icon} size={20} color={resolvedIconColor} />
                  </View>
                )}
                <View style={styles.titleContainer}>
                  {title && <Text style={styles.title}>{title}</Text>}
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
              </View>
              {rightElement && <View>{rightElement}</View>}
            </View>
          )}
          {children}
        </>
      )}
    </Wrapper>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: DESIGN_TOKENS.radius.xl,
      padding: DESIGN_TOKENS.component.cardPadding,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      ...createElevation({
        color: colors.shadowLight,
        offsetY: 3,
        blur: 12,
        opacity: 0.16,
        elevation: 3,
      }),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: DESIGN_TOKENS.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    titleContainer: {
      flex: 1,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 3,
      lineHeight: 18,
    },
  });
