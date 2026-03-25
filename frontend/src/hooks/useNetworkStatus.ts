/**
 * useNetworkStatus.ts — Rilevamento connettività (Fase 3 offline-first)
 *
 * Monitora lo stato della rete e aggiorna lo store globale.
 * Da usare una sola volta nel layout root.
 */

import { useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useAppStore } from '../store/appStore';
import { syncOfflineQueue } from '../services/offlineApi';

export function useNetworkStatus() {
  const { setIsOnline, isOnline, cloudEnabled } = useAppStore();

  useEffect(() => {
    // Stato iniziale
    NetInfo.fetch().then((state: NetInfoState) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    // Listener continuo
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
    });

    return () => unsubscribe();
  }, [setIsOnline]);

  useEffect(() => {
    if (isOnline && cloudEnabled) {
      void syncOfflineQueue();
    }
  }, [cloudEnabled, isOnline]);

  return { isOnline };
}
