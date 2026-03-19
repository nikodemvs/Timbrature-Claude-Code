import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { useAppStore } from '../../src/store/appStore';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { createElevation } from '../../src/utils/shadows';

export default function TabLayout() {
  const { unreadAlerts } = useAppStore();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="timbrature"
        options={{
          title: 'Timbrature',
          tabBarButtonTestID: 'tab-timbrature',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assenze"
        options={{
          title: 'Assenze',
          tabBarButtonTestID: 'tab-assenze',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="buste-paga"
        options={{
          title: 'Buste Paga',
          tabBarButtonTestID: 'tab-buste-paga',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="altro"
        options={{
          title: 'Altro',
          tabBarButtonTestID: 'tab-altro',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="ellipsis-horizontal" size={size} color={color} />
              {unreadAlerts > 0 && <View style={styles.badge} />}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    tabBar: {
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 24 : 8,
      height: Platform.OS === 'ios' ? 88 : 64,
      ...createElevation({
        color: colors.shadowMedium,
        offsetY: -2,
        blur: 8,
        opacity: 0.24,
        elevation: 6,
      }),
    },
    tabBarLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    tabBarItem: {
      paddingVertical: 2,
    },
    badge: {
      position: 'absolute',
      right: -4,
      top: -2,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.error,
    },
  });
