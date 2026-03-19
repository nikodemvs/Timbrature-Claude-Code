import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import { DashboardData, UserSettings, Timbratura } from '../types';

// Custom storage that works on both web and native
const createCustomStorage = (): StateStorage => {
  if (Platform.OS === 'web') {
    // Use localStorage on web
    return {
      getItem: (name: string): string | null => {
        return localStorage.getItem(name);
      },
      setItem: (name: string, value: string): void => {
        localStorage.setItem(name, value);
      },
      removeItem: (name: string): void => {
        localStorage.removeItem(name);
      },
    };
  }
  
  // Use AsyncStorage on native (imported dynamically)
  return {
    getItem: async (name: string): Promise<string | null> => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      return AsyncStorage.default.getItem(name);
    },
    setItem: async (name: string, value: string): Promise<void> => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.default.setItem(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.default.removeItem(name);
    },
  };
};

// Theme colors
export const THEMES = {
  blue: {
    name: 'Blu',
    primary: '#2563EB',
    primaryDark: '#1D4ED8',
    primaryLight: '#3B82F6',
  },
  green: {
    name: 'Verde',
    primary: '#10B981',
    primaryDark: '#059669',
    primaryLight: '#34D399',
  },
  purple: {
    name: 'Viola',
    primary: '#8B5CF6',
    primaryDark: '#7C3AED',
    primaryLight: '#A78BFA',
  },
  orange: {
    name: 'Arancione',
    primary: '#F59E0B',
    primaryDark: '#D97706',
    primaryLight: '#FBBF24',
  },
  red: {
    name: 'Rosso',
    primary: '#EF4444',
    primaryDark: '#DC2626',
    primaryLight: '#F87171',
  },
  teal: {
    name: 'Turchese',
    primary: '#14B8A6',
    primaryDark: '#0D9488',
    primaryLight: '#2DD4BF',
  },
  pink: {
    name: 'Rosa',
    primary: '#EC4899',
    primaryDark: '#DB2777',
    primaryLight: '#F472B6',
  },
  indigo: {
    name: 'Indaco',
    primary: '#6366F1',
    primaryDark: '#4F46E5',
    primaryLight: '#818CF8',
  },
};

export type ThemeKey = keyof typeof THEMES;
export type ColorSchemePreference = 'system' | 'light' | 'dark';

interface AppState {
  // Auth
  isAuthenticated: boolean;
  setAuthenticated: (value: boolean) => void;
  
  // Dashboard
  dashboard: DashboardData | null;
  setDashboard: (data: DashboardData | null) => void;
  
  // Settings
  settings: UserSettings | null;
  setSettings: (data: UserSettings | null) => void;
  
  // Current day timbratura
  todayTimbratura: Timbratura | null;
  setTodayTimbratura: (data: Timbratura | null) => void;
  
  // Loading states
  isLoading: boolean;
  setLoading: (value: boolean) => void;
  
  // Chat session
  chatSessionId: string | null;
  setChatSessionId: (id: string | null) => void;
  
  // Alerts count
  unreadAlerts: number;
  setUnreadAlerts: (count: number) => void;
  
  // Theme
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => void;
  colorSchemePreference: ColorSchemePreference;
  setColorSchemePreference: (preference: ColorSchemePreference) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      isAuthenticated: false,
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      
      // Dashboard
      dashboard: null,
      setDashboard: (data) => set({ dashboard: data }),
      
      // Settings
      settings: null,
      setSettings: (data) => set({ settings: data }),
      
      // Today timbratura
      todayTimbratura: null,
      setTodayTimbratura: (data) => set({ todayTimbratura: data }),
      
      // Loading
      isLoading: false,
      setLoading: (value) => set({ isLoading: value }),
      
      // Chat
      chatSessionId: null,
      setChatSessionId: (id) => set({ chatSessionId: id }),
      
      // Alerts
      unreadAlerts: 0,
      setUnreadAlerts: (count) => set({ unreadAlerts: count }),
      
      // Theme
      theme: 'blue',
      setTheme: (theme) => set({ theme }),
      colorSchemePreference: 'system',
      setColorSchemePreference: (preference) => set({ colorSchemePreference: preference }),
    }),
    {
      name: 'bustapaga-storage',
      storage: createJSONStorage(() => createCustomStorage()),
      partialize: (state) => ({
        theme: state.theme,
        colorSchemePreference: state.colorSchemePreference,
      }),
    }
  )
);

// Helper to get current theme colors
export const getThemeColors = (theme: ThemeKey) => THEMES[theme];
