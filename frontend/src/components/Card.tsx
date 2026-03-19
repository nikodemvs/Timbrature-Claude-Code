import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
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
    <Wrapper style={[styles.card, style]} onPress={onPress} activeOpacity={0.7} testID={testID}>
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
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      ...createElevation({
        color: colors.shadowMedium,
        offsetY: 2,
        blur: 8,
        opacity: 0.2,
        elevation: 2,
      }),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    titleContainer: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
