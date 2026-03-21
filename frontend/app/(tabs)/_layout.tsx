import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useAppStore } from '../../src/store/appStore';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { DESIGN_TOKENS } from '../../src/utils/colors';
import { createElevation } from '../../src/utils/shadows';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';

export default function TabLayout() {
  const { unreadAlerts, isOnline, lastSyncAt } = useAppStore();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  // Inizializza il monitor di rete (una sola volta, nel layout root)
  useNetworkStatus();

  const offlineSince = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={{ flex: 1 }}>
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.offlineText}>
            Modalità offline{offlineSince ? ` · aggiornato alle ${offlineSince}` : ''}
          </Text>
        </View>
      )}
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: styles.tabBarIcon,
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
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    tabBar: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 20 : 10,
      height: Platform.OS === 'ios' ? DESIGN_TOKENS.component.tabBarHeightIOS : DESIGN_TOKENS.component.tabBarHeightAndroid,
      ...createElevation({
        color: colors.shadowMedium,
        offsetY: -3,
        blur: 12,
        opacity: 0.2,
        elevation: 8,
      }),
    },
    tabBarLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    tabBarItem: {
      minHeight: 44,
    },
    tabBarIcon: {
      marginTop: 2,
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
    offlineBanner: {
      backgroundColor: '#6B7280',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 5,
      paddingTop: Platform.OS === 'ios' ? 50 : 5,
    },
    offlineText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
  });
