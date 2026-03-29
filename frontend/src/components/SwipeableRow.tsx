import React, { useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';

interface SwipeableRowProps {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
}

export function SwipeableRow({ children, onEdit, onDelete, editLabel = 'Modifica', deleteLabel = 'Elimina' }: SwipeableRowProps) {
  const { colors } = useAppTheme();
  const swipeRef = useRef<Swipeable>(null);

  const close = () => swipeRef.current?.close();

  const renderRightActions = (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const actionCount = (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
    const totalWidth = actionCount * ACTION_WIDTH;

    const translateX = dragX.interpolate({
      inputRange: [-totalWidth, 0],
      outputRange: [0, totalWidth],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.actionsContainer, { width: totalWidth, transform: [{ translateX }] }]}>
        {onEdit && (
          <TouchableOpacity
            style={[styles.action, { backgroundColor: colors.primary }]}
            onPress={() => { close(); onEdit(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
            <Text style={styles.actionLabel}>{editLabel}</Text>
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity
            style={[styles.action, { backgroundColor: colors.error }]}
            onPress={() => { close(); onDelete(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={styles.actionLabel}>{deleteLabel}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={ACTION_WIDTH * 0.4}
      friction={2}
      overshootRight={false}
    >
      {children}
    </Swipeable>
  );
}

const ACTION_WIDTH = 80;

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
    borderRadius: 12,
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
