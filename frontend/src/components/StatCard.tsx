import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

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
      alignItems: 'center',
    },
    label: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
      textAlign: 'center',
    },
    valueContainer: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    value: {
      fontWeight: '700',
    },
    unit: {
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 4,
    },
  });
