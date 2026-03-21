import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { DESIGN_TOKENS } from '../utils/colors';
import { createElevation } from '../utils/shadows';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  size?: 'small' | 'medium' | 'large';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  color,
  size = 'medium',
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const resolvedColor = color ?? colors.primary;

  const getFontSize = () => {
    switch (size) {
      case 'small': return 18;
      case 'large': return 32;
      default: return 24;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueContainer}>
        <Text style={[styles.value, { fontSize: getFontSize(), color: resolvedColor }]}>{value}</Text>
        {unit && <Text style={[styles.unit, { color: resolvedColor }]}>{unit}</Text>}
      </View>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: '47%',
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderRadius: DESIGN_TOKENS.radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
      ...createElevation({
        color: colors.shadowLight,
        offsetY: 2,
        blur: 8,
        opacity: 0.12,
        elevation: 2,
      }),
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 8,
      textAlign: 'left',
    },
    valueContainer: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'flex-start',
    },
    value: {
      fontWeight: '700',
      lineHeight: 28,
    },
    unit: {
      fontSize: 13,
      fontWeight: '600',
      marginLeft: 4,
    },
  });
