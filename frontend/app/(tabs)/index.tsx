import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Card, StatCard, LoadingScreen } from '../../src/components';
import { useAppStore } from '../../src/store/appStore';
import * as offlineApi from '../../src/services/offlineApi';
import { formatCurrency, getMesiItaliano, getTodayString } from '../../src/utils/helpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { Marcatura } from '../../src/types';

const CARD_ORDER_KEY = 'home_card_order';
const DEFAULT_ORDER = ['timbratura', 'riepilogo', 'stima', 'ferie', 'comporto', 'busta'];

interface ApiErrorResponse {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

interface SessionStartOverride {
  marcaturaId: string;
  startedAtMs: number;
}

interface DashboardStimaFields {
  periodo_competenza?: string;
  competenza?: string;
  mese_competenza?: number;
  anno_competenza?: number;
  competenza_mese?: number;
  competenza_anno?: number;
  data_pagamento_prevista?: string;
  pagamento_previsto?: string;
  pagamento_previsto_giorno?: number;
  pagamento_previsto_mese?: number;
  pagamento_previsto_anno?: number;
  giorno_pagamento_previsto?: number;
  mese_pagamento_previsto?: number;
  anno_pagamento_previsto?: number;
  pagamento_giorno?: number;
  pagamento_mese?: number;
  pagamento_anno?: number;
  fonte?: string;
  fonte_stima?: string;
  ha_dati_contrattuali?: boolean;
  ha_dati_operativi_mese?: boolean;
  metadati?: {
    ha_dati_contrattuali?: boolean;
    ha_dati_operativi_mese?: boolean;
    sorgente?: string;
    stato?: string;
  };
}

function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseOraToSeconds(ora: string): number {
  const parts = ora.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + (parts[2] ? parseInt(parts[2]) : 0);
}

function parseSessionStartMs(data: string, marcatura: Marcatura): number | null {
  if (marcatura.created_at) {
    const parsedCreatedAt = new Date(marcatura.created_at);
    if (!Number.isNaN(parsedCreatedAt.getTime())) {
      return parsedCreatedAt.getTime();
    }
  }

  const timeParts = marcatura.ora.split(':');
  if (timeParts.length < 2) {
    return null;
  }

  const fallback = new Date(`${data}T${marcatura.ora}`);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.getTime();
  }

  const today = new Date();
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    Number.parseInt(timeParts[0], 10),
    Number.parseInt(timeParts[1], 10),
    timeParts[2] ? Number.parseInt(timeParts[2], 10) : 0,
    0
  ).getTime();
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const response = (error as ApiErrorResponse | null)?.response;
  return response?.data?.detail || fallback;
}

function formatCompetenzaStima(mese: number, anno: number, stime?: DashboardStimaFields) {
  if (stime?.periodo_competenza) {
    return stime.periodo_competenza;
  }
  if (stime?.competenza) {
    return stime.competenza;
  }

  const meseCompetenza = stime?.mese_competenza ?? stime?.competenza_mese ?? mese;
  const annoCompetenza = stime?.anno_competenza ?? stime?.competenza_anno ?? anno;
  return `${getMesiItaliano(meseCompetenza)} ${annoCompetenza}`;
}

function formatStimaPagamentoPrevisto(mese: number, anno: number, stime?: DashboardStimaFields) {
  if (stime?.data_pagamento_prevista) {
    const pagamentoPrevistoData = new Date(stime.data_pagamento_prevista);
    if (!Number.isNaN(pagamentoPrevistoData.getTime())) {
      return `${pagamentoPrevistoData.getDate()} ${getMesiItaliano(pagamentoPrevistoData.getMonth() + 1)} ${pagamentoPrevistoData.getFullYear()}`;
    }
    return stime.data_pagamento_prevista;
  }
  if (stime?.pagamento_previsto) {
    return stime.pagamento_previsto;
  }

  const giornoPagamento = stime?.pagamento_previsto_giorno ?? stime?.giorno_pagamento_previsto ?? stime?.pagamento_giorno ?? 27;
  const mesePagamento = stime?.pagamento_previsto_mese ?? stime?.mese_pagamento_previsto ?? stime?.pagamento_mese ?? (mese === 12 ? 1 : mese + 1);
  const annoPagamento = stime?.pagamento_previsto_anno ?? stime?.anno_pagamento_previsto ?? stime?.pagamento_anno ?? (mese === 12 ? anno + 1 : anno);
  return `${giornoPagamento} ${getMesiItaliano(mesePagamento)} ${annoPagamento}`;
}

function formatStimaFonte(mese: number, anno: number, stime?: DashboardStimaFields) {
  if (stime?.metadati?.stato) {
    return stime.metadati.stato;
  }
  if (stime?.fonte_stima) {
    return stime.fonte_stima;
  }
  if (stime?.fonte) {
    return stime.fonte;
  }
  return `Competenza ${formatCompetenzaStima(mese, anno, stime)} · pagamento previsto ${formatStimaPagamentoPrevisto(mese, anno, stime)}`;
}

export default function DashboardScreen() {
  const { dashboard, setDashboard, todayTimbratura, setTodayTimbratura, setUnreadAlerts } =
    useAppStore();
  const { colors, themeColors } = useAppTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timbraturaLoading, setTimbraturaLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    timbratura: true,
    riepilogo: false,
    stima: false,
    ferie: false,
    comporto: false,
    busta: false,
  });
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionStartOverride, setSessionStartOverride] = useState<SessionStartOverride | null>(null);

  const toggle = (key: string) => {
    if (editMode) return;
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    AsyncStorage.getItem(CARD_ORDER_KEY).then(saved => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setCardOrder(parsed);
        } catch {}
      }
    });
  }, []);

  const saveOrder = (newOrder: string[]) => {
    setCardOrder(newOrder);
    AsyncStorage.setItem(CARD_ORDER_KEY, JSON.stringify(newOrder));
  };

  const moveCard = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...cardOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    saveOrder(newOrder);
  };

  const loadData = useCallback(async () => {
    try {
      const [dashboardData, timbraturaData] = await Promise.all([
        offlineApi.getDashboard(),
        offlineApi.getActiveTimbratura().catch(() => null),
      ]);
      setDashboard(dashboardData);
      setTodayTimbratura(timbraturaData);
      setUnreadAlerts(dashboardData?.alerts_non_letti ?? 0);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setDashboard, setTodayTimbratura, setUnreadAlerts]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Ora dell'ultima entrata non ancora chiusa (null se cloccato fuori o nessuna timbratura)
  const activeEntrataOra = (() => {
    const m = todayTimbratura?.marcature || [];
    const last = m.length > 0 ? m[m.length - 1] : null;
    return last?.tipo === 'entrata' ? (last.ora as string) : null;
  })();

  const activeEntrataMarcatura = (() => {
    const marcature = todayTimbratura?.marcature || [];
    const ultimaMarcatura = marcature.length > 0 ? marcature[marcature.length - 1] : null;
    return ultimaMarcatura?.tipo === 'entrata' ? ultimaMarcatura : null;
  })();

  const activeSessionStartMs = (() => {
    if (!todayTimbratura || !activeEntrataMarcatura) {
      return null;
    }

    if (sessionStartOverride?.marcaturaId === activeEntrataMarcatura.id) {
      return sessionStartOverride.startedAtMs;
    }

    return parseSessionStartMs(todayTimbratura.data, activeEntrataMarcatura);
  })();

  useEffect(() => {
    if (!activeEntrataOra || !activeSessionStartMs) {
      setElapsedSeconds(0);
      return;
    }
    const compute = () => Math.max(0, Math.floor((Date.now() - activeSessionStartMs) / 1000));
    setElapsedSeconds(compute());
    const interval = setInterval(() => {
      // Se il giorno è cambiato e non c'è una sessione overnight aperta, ricarica
      const dataOggi = new Date().toISOString().split('T')[0];
      if (todayTimbratura?.data && todayTimbratura.data !== dataOggi) {
        const ultimaMarcaturaOggi = todayTimbratura.marcature;
        const hasOpenEntrata =
          ultimaMarcaturaOggi.length > 0 &&
          ultimaMarcaturaOggi[ultimaMarcaturaOggi.length - 1].tipo === 'entrata';
        if (!hasOpenEntrata) {
          loadData();
          return;
        }
      }
      setElapsedSeconds(compute());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEntrataOra, activeSessionStartMs, todayTimbratura, loadData]);

  useEffect(() => {
    if (!activeEntrataMarcatura) {
      setSessionStartOverride(null);
    }
  }, [activeEntrataMarcatura]);

  const handleTimbra = async (tipo: 'entrata' | 'uscita') => {
    setTimbraturaLoading(true);
    try {
      const timbraturaResult = await offlineApi.timbra(tipo);
      const sessionStartedAtMs = Date.now();
      setTodayTimbratura(timbraturaResult);
      const ultimaMarcatura = timbraturaResult.marcature[timbraturaResult.marcature.length - 1];
      if (tipo === 'entrata' && ultimaMarcatura?.tipo === 'entrata') {
        setSessionStartOverride({
          marcaturaId: ultimaMarcatura.id,
          startedAtMs: sessionStartedAtMs,
        });
      } else {
        setSessionStartOverride(null);
      }
      Alert.alert(
        'Timbratura registrata',
        `${tipo === 'entrata' ? 'Entrata' : 'Uscita'} registrata alle ${ultimaMarcatura?.ora ?? '--:--'}`,
      );
      loadData();
    } catch (error: unknown) {
      Alert.alert('Errore', getApiErrorMessage(error, 'Errore durante la timbratura'));
    } finally {
      setTimbraturaLoading(false);
    }
  };

  const onPressEntrata = () => {
    if (timbraturaLoading) return;
    const marcature = todayTimbratura?.marcature || [];
    const ultima = marcature.length > 0 ? marcature[marcature.length - 1] : null;
    if (!ultima || ultima.tipo === 'uscita') handleTimbra('entrata');
  };

  const onPressUscita = () => {
    if (timbraturaLoading) return;
    const marcature = todayTimbratura?.marcature || [];
    const ultima = marcature.length > 0 ? marcature[marcature.length - 1] : null;
    // Gestisce anche sessioni overnight: ultima marcatura potrebbe essere di ieri
    if (ultima && ultima.tipo === 'entrata') handleTimbra('uscita');
  };

  if (loading) return <LoadingScreen message="Caricamento dashboard..." />;

  const data = dashboard;
  const today = new Date();
  const meseCorrente = getMesiItaliano(today.getMonth() + 1);
  const stimaCompetenza = data?.mese_corrente
    ? formatCompetenzaStima(data.mese_corrente.mese, data.mese_corrente.anno, data.stime)
    : meseCorrente;
  const stimaPagamentoPrevisto = data?.mese_corrente
    ? formatStimaPagamentoPrevisto(data.mese_corrente.mese, data.mese_corrente.anno, data.stime)
    : formatStimaPagamentoPrevisto(today.getMonth() + 1, today.getFullYear(), data?.stime);
  const marcature = todayTimbratura?.marcature || [];
  const ultimaMarcatura = marcature.length > 0 ? marcature[marcature.length - 1] : null;
  const entrataActive = !ultimaMarcatura || ultimaMarcatura.tipo === 'uscita';
  const uscitaActive = ultimaMarcatura && ultimaMarcatura.tipo === 'entrata';

  // Secondi totali lavorati oggi: somma coppie E-U complete + sessione corrente se attiva
  const workedSecondsTotal = (() => {
    let total = 0;
    let lastEntrata: string | null = null;
    for (const m of marcature) {
      if (m.tipo === 'entrata') {
        lastEntrata = m.ora;
      } else if (m.tipo === 'uscita' && lastEntrata) {
        let diff = parseOraToSeconds(m.ora) - parseOraToSeconds(lastEntrata);
        if (diff < 0) diff += 24 * 3600; // timbratura a cavallo di mezzanotte
        total += diff;
        lastEntrata = null;
      }
    }
    // Aggiunge il tempo della sessione corrente se l'utente è ancora timbrato
    if (activeEntrataOra) total += elapsedSeconds;
    return total;
  })();
  const workedHoursDecimal = workedSecondsTotal / 3600;

  // Frecce di riordino mostrate in modalità modifica
  const OrderControls = ({ index }: { index: number }) => (
    <View style={styles.orderControls}>
      <TouchableOpacity
        style={[styles.arrowBtn, index === 0 && styles.arrowBtnDisabled]}
        onPress={() => moveCard(index, 'up')}
        disabled={index === 0}
      >
        <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.border : themeColors.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.arrowBtn, index === cardOrder.length - 1 && styles.arrowBtnDisabled]}
        onPress={() => moveCard(index, 'down')}
        disabled={index === cardOrder.length - 1}
      >
        <Ionicons name="chevron-down" size={20} color={index === cardOrder.length - 1 ? colors.border : themeColors.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderCardContent = (key: string, index: number) => {
    switch (key) {
      case 'timbratura':
        return (
          <Card style={[styles.clockCard, editMode && styles.cardEditMode]} testID="dashboard-quick-clock-card">
            <View style={styles.cardHeaderRow}>
              <TouchableOpacity
                style={styles.clockHeaderTouchable}
                onPress={() => toggle('timbratura')}
                activeOpacity={editMode ? 1 : 0.7}
                testID="dashboard-quick-clock-toggle"
              >
                <Ionicons name="finger-print" size={24} color={themeColors.primary} />
                <Text style={[styles.clockTitle, { flex: 1 }]}>Timbratura Rapida</Text>
                {!editMode && (
                  <Ionicons
                    name={expanded.timbratura ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
              {editMode && <OrderControls index={index} />}
            </View>

            {!editMode && expanded.timbratura && marcature.length > 0 && (
              <View style={styles.timerContainer}>
                <Text
                  style={[styles.timerDisplay, activeEntrataOra ? styles.timerActive : styles.timerStopped]}
                  testID="dashboard-timer-display"
                >
                  {formatHMS(workedSecondsTotal)}
                </Text>
                <Text style={styles.timerSubLabel} testID="dashboard-timer-status">
                  {activeEntrataOra ? `Oggi sei entrato alle ${activeEntrataOra}` : 'Per oggi hai finito'}
                </Text>
              </View>
            )}

            {!editMode && expanded.timbratura && todayTimbratura ? (
              <View style={styles.clockInfo}>
                {marcature.length > 0 ? (
                  <View style={styles.marcatureList}>
                    {marcature.map((m, idx: number) => (
                      <View key={m.id || idx} style={styles.marcaturaItem}>
                          <Ionicons
                            name={m.tipo === 'entrata' ? 'log-in' : 'log-out'}
                            size={14}
                            color={m.tipo === 'entrata' ? colors.success : colors.error}
                          />
                        <Text style={styles.marcaturaText}>
                          {m.tipo === 'entrata' ? 'E' : 'U'}: {m.ora}
                        </Text>
                        {m.is_reperibilita && (
                          <Ionicons name="call" size={12} color={colors.warning} style={{ marginLeft: 4 }} />
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.clockTimeRow}>
                    <View style={styles.clockTimeItem}>
                      <Text style={styles.clockLabel}>Entrata</Text>
                      <Text style={styles.clockTime}>{todayTimbratura.ora_entrata || '--:--'}</Text>
                    </View>
                    <View style={styles.clockDivider} />
                    <View style={styles.clockTimeItem}>
                      <Text style={styles.clockLabel}>Uscita</Text>
                      <Text style={styles.clockTime}>{todayTimbratura.ora_uscita || '--:--'}</Text>
                    </View>
                  </View>
                )}
                <View style={styles.oreTotaliRow}>
                  <Text style={styles.oreTotaliLabel}>Ore lavorate:</Text>
                  <Text style={styles.oreTotaliValue}>
                    {workedHoursDecimal.toFixed(2)}h
                  </Text>
                </View>
              </View>
            ) : !editMode && expanded.timbratura ? (
              <Text style={styles.clockEmpty}>Nessuna timbratura oggi</Text>
            ) : null}

            {!editMode && expanded.timbratura && (
              <View style={styles.clockButtons}>
                <TouchableOpacity
                  style={[styles.clockButton, entrataActive ? styles.clockButtonEntrata : styles.clockButtonDisabled]}
                  onPress={onPressEntrata}
                  activeOpacity={entrataActive ? 0.7 : 1}
                  testID="dashboard-clock-in-button"
                >
                  {timbraturaLoading ? (
                    <ActivityIndicator size="small" color={entrataActive ? colors.textWhite : colors.textSecondary} />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={20} color={entrataActive ? colors.textWhite : colors.textSecondary} />
                      <Text style={[styles.clockButtonText, entrataActive ? styles.clockButtonTextActive : styles.clockButtonTextDisabled]}>
                        Entrata
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.clockButton, uscitaActive ? styles.clockButtonUscita : styles.clockButtonDisabled]}
                  onPress={onPressUscita}
                  activeOpacity={uscitaActive ? 0.7 : 1}
                  testID="dashboard-clock-out-button"
                >
                  {timbraturaLoading ? (
                    <ActivityIndicator size="small" color={uscitaActive ? colors.textWhite : colors.textSecondary} />
                  ) : (
                    <>
                      <Ionicons name="log-out-outline" size={20} color={uscitaActive ? colors.textWhite : colors.textSecondary} />
                      <Text style={[styles.clockButtonText, uscitaActive ? styles.clockButtonTextActive : styles.clockButtonTextDisabled]}>
                        Uscita
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Card>
        );

      case 'riepilogo':
        return (
          <Card
            title="Riepilogo Mese"
            icon="bar-chart"
            iconColor={themeColors.primary}
            onPress={() => toggle('riepilogo')}
            style={editMode ? styles.cardEditMode : undefined}
            rightElement={
              editMode ? <OrderControls index={index} /> :
              <Ionicons name={expanded.riepilogo ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            }
          >
            {!editMode && expanded.riepilogo && (
              <View style={styles.statsGrid}>
                <StatCard label="Ore Lavorate" value={data?.mese_corrente?.ore_lavorate?.toFixed(1) || '0'} unit="h" color={themeColors.primary} />
                <StatCard label="Straordinari" value={data?.mese_corrente?.ore_straordinarie?.toFixed(1) || '0'} unit="h" color={colors.overtime} />
                <StatCard label="Giorni" value={data?.mese_corrente?.giorni_lavorati || 0} color={colors.success} />
                <StatCard label="Ticket" value={data?.mese_corrente?.ticket_maturati || 0} color={colors.ticket} />
              </View>
            )}
          </Card>
        );

      case 'stima':
        return (
          <Card
            title="Stima Netto"
            icon="wallet"
            iconColor={colors.success}
            onPress={() => toggle('stima')}
            style={editMode ? styles.cardEditMode : undefined}
            testID="dashboard-stima-card"
            rightElement={
              editMode ? <OrderControls index={index} /> :
              <Ionicons name={expanded.stima ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            }
          >
            {!editMode && expanded.stima && (
              <>
                <View style={styles.estimateContainer}>
                  <Text style={styles.estimateValue}>{formatCurrency(data?.stime?.netto_stimato || 0)}</Text>
                  <Text style={styles.estimateLabel}>netto stimato di {stimaCompetenza}</Text>
                </View>
                <View style={styles.estimateDetails}>
                  <View style={styles.estimateSourceBanner}>
                    <Text style={styles.estimateSourceLabel}>Fonte stima</Text>
                    <Text style={styles.estimateSourceValue} testID="dashboard-stima-fonte">
                      {formatStimaFonte(data?.mese_corrente?.mese || today.getMonth() + 1, data?.mese_corrente?.anno || today.getFullYear(), data?.stime)}
                    </Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateDetailLabel}>Periodo di competenza</Text>
                    <Text style={styles.estimateDetailValue} testID="dashboard-stima-competenza">
                      {stimaCompetenza}
                    </Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateDetailLabel}>Pagamento previsto</Text>
                    <Text style={styles.estimateDetailValue} testID="dashboard-stima-pagamento-previsto">
                      {stimaPagamentoPrevisto}
                    </Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateDetailLabel}>Lordo stimato</Text>
                    <Text style={styles.estimateDetailValue}>{formatCurrency(data?.stime?.lordo_stimato || 0)}</Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateDetailLabel}>Straordinari</Text>
                    <Text style={styles.estimateDetailValue}>{formatCurrency(data?.stime?.straordinario_stimato || 0)}</Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateDetailLabel}>Ticket ({data?.mese_corrente?.ticket_maturati || 0} gg)</Text>
                    <Text style={styles.estimateDetailValue}>{formatCurrency(data?.stime?.ticket_totale || 0)}</Text>
                  </View>
                </View>
              </>
            )}
          </Card>
        );

      case 'ferie':
        return (
          <Card
            title="Saldo Ferie"
            icon="airplane"
            iconColor={colors.ferie}
            onPress={() => toggle('ferie')}
            style={editMode ? styles.cardEditMode : undefined}
            rightElement={
              editMode ? <OrderControls index={index} /> :
              <Ionicons name={expanded.ferie ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            }
          >
            {!editMode && expanded.ferie && (
              <View style={styles.balanceContainer}>
              <View style={styles.balanceMain}>
                  <Text style={[styles.balanceValue, { color: colors.ferie }]}>{data?.ferie?.saldo_attuale?.toFixed(1) || '0'}</Text>
                  <Text style={styles.balanceUnit}>ore disponibili</Text>
              </View>
                <View style={styles.balanceDetails}>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Maturate</Text>
                    <Text style={styles.balanceAmount}>{data?.ferie?.ore_maturate?.toFixed(1) || '0'}h</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Godute</Text>
                    <Text style={styles.balanceAmount}>{data?.ferie?.ore_godute?.toFixed(1) || '0'}h</Text>
                  </View>
                </View>
              </View>
            )}
          </Card>
        );

      case 'comporto':
        return (
          <Card
            title="Comporto Malattia"
            icon="medkit"
            iconColor={colors.malattia}
            onPress={() => toggle('comporto')}
            style={editMode ? styles.cardEditMode : undefined}
            rightElement={
              editMode ? <OrderControls index={index} /> :
              <Ionicons name={expanded.comporto ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            }
          >
            {!editMode && expanded.comporto && (
              <View style={styles.comportoContainer}>
                <View style={styles.comportoMain}>
                  <Text style={[
                    styles.comportoValue,
                    data?.comporto?.alert_critico && styles.comportoCritical,
                    data?.comporto?.alert_attenzione && !data?.comporto?.alert_critico && styles.comportoWarning,
                  ]}>
                    {data?.comporto?.giorni_malattia_3_anni || 0}
                  </Text>
                  <Text style={styles.comportoUnit}>/ {data?.comporto?.soglia_critica || 180} giorni</Text>
                </View>
                <Text style={styles.comportoInfo}>
                  Negli ultimi 3 anni. Disponibili: {data?.comporto?.giorni_disponibili || 0} giorni
                </Text>
              </View>
            )}
          </Card>
        );

      case 'busta':
        if (!data?.ultima_busta) return null;
        return (
          <Card
            title="Ultima Busta Paga"
            subtitle={`${getMesiItaliano(data.ultima_busta.mese)} ${data.ultima_busta.anno}`}
            icon="receipt"
            iconColor={themeColors.primary}
            onPress={() => toggle('busta')}
            style={editMode ? styles.cardEditMode : undefined}
            rightElement={
              editMode ? <OrderControls index={index} /> :
              <Ionicons name={expanded.busta ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            }
          >
            {!editMode && expanded.busta && (
              <View style={styles.payslipRow}>
                <Text style={styles.payslipLabel}>Netto</Text>
                <Text style={styles.payslipValue}>{formatCurrency(data.ultima_busta.netto)}</Text>
              </View>
            )}
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="dashboard-screen">
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{data?.settings?.nome ? `Ciao, ${data.settings.nome.split(' ')[0]}` : 'Benvenuto'}</Text>
          <Text style={styles.subtitle}>{meseCorrente} {today.getFullYear()}</Text>
        </View>
        <TouchableOpacity
          style={[styles.editButton, editMode && styles.editButtonActive]}
          onPress={() => setEditMode(prev => !prev)}
        >
          <Ionicons
            name={editMode ? 'checkmark' : 'pencil'}
            size={18}
            color={editMode ? colors.textWhite : themeColors.primary}
          />
          <Text style={[styles.editButtonText, editMode && styles.editButtonTextActive]}>
            {editMode ? 'Fatto' : 'Ordina'}
          </Text>
        </TouchableOpacity>
      </View>

      {editMode && (
        <Text style={styles.editHint}>Usa ↑ ↓ per riordinare le sezioni</Text>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          !editMode
            ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[themeColors.primary]} />
            : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        {cardOrder.map((key, index) => (
          <View key={key}>
            {renderCardContent(key, index)}
          </View>
        ))}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 16 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      marginBottom: 12,
    },
    greeting: { fontSize: 28, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    editButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    editButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    editButtonTextActive: {
      color: colors.textWhite,
    },
    editHint: {
      textAlign: 'center',
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
      marginHorizontal: 16,
    },
    cardEditMode: {
      opacity: 0.92,
    },
    orderControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    arrowBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowBtnDisabled: {
      backgroundColor: 'transparent',
    },
    clockCard: { backgroundColor: colors.card },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
    clockHeaderTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    clockTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginLeft: 12 },
    clockInfo: { marginTop: 16, marginBottom: 16 },
    clockTimeRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    clockTimeItem: { alignItems: 'center' },
    clockLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    clockTime: { fontSize: 24, fontWeight: '700', color: colors.text },
    clockDivider: { width: 1, height: 40, backgroundColor: colors.border },
    clockEmpty: { textAlign: 'center', color: colors.textSecondary, marginTop: 16, marginBottom: 16 },
    clockButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    clockButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 8 },
    clockButtonEntrata: { backgroundColor: colors.success },
    clockButtonUscita: { backgroundColor: colors.error },
    clockButtonDisabled: { backgroundColor: colors.borderDark },
    clockButtonText: { fontSize: 16, fontWeight: '600' },
    clockButtonTextActive: { color: colors.textWhite },
    clockButtonTextDisabled: { color: colors.textSecondary },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    estimateContainer: { alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 },
    estimateValue: { fontSize: 36, fontWeight: '700', color: colors.success },
    estimateLabel: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    estimateDetails: { gap: 8 },
    estimateSourceBanner: { padding: 12, borderRadius: 12, backgroundColor: colors.cardDark, gap: 4 },
    estimateSourceLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
    estimateSourceValue: { fontSize: 14, lineHeight: 20, color: colors.text },
    estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    estimateDetailLabel: { fontSize: 14, color: colors.textSecondary },
    estimateDetailValue: { fontSize: 14, fontWeight: '600', color: colors.text },
    balanceContainer: { flexDirection: 'row', alignItems: 'center' },
    balanceMain: { flex: 1, alignItems: 'center' },
    balanceValue: { fontSize: 40, fontWeight: '700' },
    balanceUnit: { fontSize: 14, color: colors.textSecondary },
    balanceDetails: { flex: 1, gap: 8 },
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
    balanceLabel: { fontSize: 14, color: colors.textSecondary },
    balanceAmount: { fontSize: 14, fontWeight: '600', color: colors.text },
    comportoContainer: { alignItems: 'center' },
    comportoMain: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
    comportoValue: { fontSize: 40, fontWeight: '700', color: colors.success },
    comportoWarning: { color: colors.warning },
    comportoCritical: { color: colors.error },
    comportoUnit: { fontSize: 18, color: colors.textSecondary, marginLeft: 4 },
    comportoInfo: { fontSize: 14, color: colors.textSecondary },
    payslipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    payslipLabel: { fontSize: 16, color: colors.textSecondary },
    payslipValue: { fontSize: 24, fontWeight: '700', color: colors.success },
    bottomPadding: { height: 20 },
    marcatureList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    marcaturaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, gap: 4 },
    marcaturaText: { fontSize: 13, fontWeight: '500', color: colors.text },
    oreTotaliRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
    oreTotaliLabel: { fontSize: 14, color: colors.textSecondary },
    oreTotaliValue: { fontSize: 20, fontWeight: '700', color: colors.primary },
    timerContainer: { alignItems: 'center', paddingVertical: 16 },
    timerDisplay: { fontSize: 52, fontWeight: '700', letterSpacing: 3, fontVariant: ['tabular-nums'] },
    timerActive: { color: colors.success },
    timerStopped: { color: colors.text },
    timerSubLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  });
