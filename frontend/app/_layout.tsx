import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from '../src/store/appStore';
import { useAppTheme } from '../src/hooks/useAppTheme';
import { createElevation } from '../src/utils/shadows';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [canUseBiometric, setCanUseBiometric] = useState(false);
  const [isPinSyncing, setIsPinSyncing] = useState(false);
  const { isAuthenticated, setAuthenticated } = useAppStore();
  const { colors, isDark } = useAppTheme();
  const styles = createStyles(colors);
  const skipNextPinSyncRef = useRef(true);

  const readStoredPin = useCallback(async () => {
    if (Platform.OS === 'web') {
      return null;
    }

    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync('bustapaga_pin');
  }, []);

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

      // Check if biometric is available and enabled
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const savedPin = await readStoredPin();
      setCanUseBiometric(hasHardware && isEnrolled);
      setStoredPin(savedPin);

      // If no PIN is set, allow access
      if (!savedPin) {
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
        } else {
          setAuthenticated(false);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      // On error, allow access
      setAuthenticated(true);
    } finally {
      setIsReady(true);
    }
  }, [readStoredPin, setAuthenticated]);

  const unlockWithBiometrics = useCallback(async () => {
    if (Platform.OS === 'web') {
      return;
    }

    try {
      const LocalAuthentication = await import('expo-local-authentication');
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Accedi a BustaPaga',
        fallbackLabel: 'Usa PIN',
        cancelLabel: 'Annulla',
      });

      if (result.success) {
        setPinError('');
        setAuthenticated(true);
      }
    } catch (error) {
      console.error('Biometric unlock error:', error);
    }
  }, [setAuthenticated]);

  const unlockWithPin = useCallback(() => {
    if (!storedPin) {
      setAuthenticated(true);
      return;
    }

    if (pinInput.trim() === storedPin) {
      setPinError('');
      setPinInput('');
      setAuthenticated(true);
      return;
    }

    setPinError('PIN non valido');
  }, [pinInput, setAuthenticated, storedPin]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isReady) {
      return;
    }

    if (skipNextPinSyncRef.current) {
      skipNextPinSyncRef.current = false;
      return;
    }

    if (isPinSyncing) {
      return;
    }

    let isCancelled = false;
    setIsPinSyncing(true);

    const refreshStoredPin = async () => {
      try {
        const savedPin = await readStoredPin();

        if (isCancelled) {
          return;
        }

        setStoredPin(savedPin);
        setPinInput('');
        setPinError('');

        if (!savedPin) {
          setAuthenticated(true);
        }
      } catch (error) {
        console.error('PIN refresh error:', error);
        if (!isCancelled) {
          setStoredPin(null);
          setPinInput('');
          setPinError('');
          setAuthenticated(true);
        }
      } finally {
        if (!isCancelled) {
          setIsPinSyncing(false);
        }
      }
    };

    refreshStoredPin();

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, isReady, readStoredPin, setAuthenticated]);

  const showPinUnlock = isReady && !isPinSyncing && Platform.OS !== 'web' && !!storedPin && !isAuthenticated;

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {!isReady ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : showPinUnlock ? (
        <KeyboardAvoidingView
          style={styles.unlockScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.unlockCard}>
            <Text style={styles.unlockEyebrow}>Protezione attiva</Text>
            <Text style={styles.unlockTitle}>Sblocca BustaPaga</Text>
            <Text style={styles.unlockBody}>
              Inserisci il PIN per accedere ai dati personali oppure usa la biometria.
            </Text>

            <TextInput
              style={[styles.pinInput, pinError && styles.pinInputError]}
              value={pinInput}
              onChangeText={(value) => {
                setPinInput(value.replace(/\D/g, ''));
                if (pinError) setPinError('');
              }}
              placeholder="PIN"
              placeholderTextColor={colors.textLight}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />

            {!!pinError && <Text style={styles.pinErrorText}>{pinError}</Text>}

            <TouchableOpacity style={styles.primaryButton} onPress={unlockWithPin} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Sblocca con PIN</Text>
            </TouchableOpacity>

            {canUseBiometric && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={unlockWithBiometrics}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Usa biometria</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}
    </SafeAreaProvider>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    unlockScreen: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: colors.background,
    },
    unlockCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      ...createElevation({
        color: colors.shadowMedium,
        offsetY: 8,
        blur: 16,
        opacity: 0.24,
        elevation: 4,
      }),
    },
    unlockEyebrow: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.primary,
      marginBottom: 8,
    },
    unlockTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    unlockBody: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      marginTop: 10,
      marginBottom: 20,
    },
    pinInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.cardDark,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 22,
      fontWeight: '600',
      letterSpacing: 6,
      color: colors.text,
      textAlign: 'center',
    },
    pinInputError: {
      borderColor: colors.error,
    },
    pinErrorText: {
      fontSize: 13,
      color: colors.error,
      marginTop: 10,
    },
    primaryButton: {
      marginTop: 18,
      borderRadius: 14,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textWhite,
    },
    secondaryButton: {
      marginTop: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
  });
