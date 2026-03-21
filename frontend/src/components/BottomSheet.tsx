import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, ScrollView, DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { DESIGN_TOKENS } from '../utils/colors';
import { createElevation } from '../utils/shadows';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  height?: DimensionValue;
  testID?: string;
  closeButtonTestID?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  height = '50%',
  testID,
  closeButtonTestID,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" />

        <View
          style={[styles.container, { height, paddingBottom: insets.bottom + 16 }]}
          testID={testID}
        >
          <View style={styles.handle} />

          {title && (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} testID={closeButtonTestID}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    container: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: DESIGN_TOKENS.radius.xxl,
      borderTopRightRadius: DESIGN_TOKENS.radius.xxl,
      paddingHorizontal: DESIGN_TOKENS.component.sheetPaddingX,
      paddingTop: 6,
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderColor: colors.border,
      ...createElevation({
        color: colors.shadowMedium,
        offsetY: -2,
        blur: 12,
        opacity: 0.18,
        elevation: 8,
      }),
    },
    handle: {
      width: DESIGN_TOKENS.component.sheetHandleWidth,
      height: DESIGN_TOKENS.component.sheetHandleHeight,
      backgroundColor: colors.borderDark,
      borderRadius: DESIGN_TOKENS.radius.pill,
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    title: {
      fontSize: 21,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: DESIGN_TOKENS.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardDark,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      paddingBottom: 8,
    },
  });
