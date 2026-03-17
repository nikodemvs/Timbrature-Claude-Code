import React, { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../src/utils/colors';
import { useAppStore } from '../src/store/appStore';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const { setAuthenticated } = useAppStore();

  const checkAuth = useCallback(async () => {
    try {
      // On web, skip authentication and allow direct access
      if (Platform.OS === 'web') {
        setAuthenticated(true);
        setIsReady(true);
        return;
      }

      // Native platforms - dynamic import for expo modules
      const LocalAuthentication = await import('expo-local-authentication');
      const SecureStore = await import('expo-secure-store');

      // Check if biometric is available and enabled
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const storedPin = await SecureStore.getItemAsync('bustapaga_pin');

      // If no PIN is set, allow access
      if (!storedPin) {
        setAuthenticated(true);
        setIsReady(true);
        return;
      }

      // Try biometric first if available
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Accedi a BustaPaga',
          fallbackLabel: 'Usa PIN',
          cancelLabel: 'Annulla',
        });

        if (result.success) {
          setAuthenticated(true);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      // On error, allow access
      setAuthenticated(true);
    } finally {
      setIsReady(true);
    }
  }, [setAuthenticated]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
