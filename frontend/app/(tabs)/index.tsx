import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, StatCard, LoadingScreen } from '../../src/components';
import { COLORS } from '../../src/utils/colors';
import { useAppStore, getThemeColors } from '../../src/store/appStore';
import * as api from '../../src/services/api';
import { formatCurrency, getMesiItaliano, getTodayString } from '../../src/utils/helpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const CARD_ORDER_KEY = 'home_card_order';
const DEFAULT_ORDER = ['timbratura', 'riepilogo', 'stima', 'ferie', 'comporto', 'busta'];

export default function DashboardScreen() {
  const { dashboard, setDashboard, todayTimbratura, setTodayTimbratura, setUnreadAlerts, theme } = useAppStore();
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

  const themeColors = getThemeColors(theme);
  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

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

  const loadData = useCallback(async () => {
    try {
      const [dashboardRes, timbraturaRes] = await Promise.all([
        api.getDashboard(),
        api.getTimbraturaByDate(getTodayString()).catch(() => null),
      ]);
      setDashboard(dashboardRes.data);
      setTodayTimbratura(timbraturaRes?.data || null);
      setUnreadAlerts(dashboardRes.data.alerts_non_letti);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleTimbra = async (tipo: 'entrata' | 'uscita') => {
    setTimbraturaLoading(true);
    try {
      const response = await api.timbra(tipo);
      setTodayTimbratura(response.data);
      Alert.alert(
        'Timbratura registrata',
        `${tipo === 'entrata' ? 'Entrata' : 'Uscita'} registrata alle ${tipo === 'entrata' ? response.data.ora_entrata : response.data.ora_uscita}`
      );
      loadData();
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore durante la timbratura');
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
    if (ultima && ultima.tipo === 'entrata') handleTimbra('uscita');
  };

  if (loading) {
    return <LoadingScreen message="Caricamento dashboard..." />;
  }

  const data = dashboard;
  const today = new Date();
  const meseCorrente = getMesiItaliano(today.getMonth() + 1);
  const marcature = todayTimbratura?.marcature || [];
  const ultimaMarcatura = marcature.length > 0 ? marcature[marcature.length - 1] : null;
  const entrataActive = !ultimaMarcatura || ultimaMarcatura.tipo === 'uscita';
  const uscitaActive = ultimaMarcatura && ultimaMarcatura.tipo === 'entrata';

  const renderItem = ({ item, drag, isActive }: RenderItemParams<string>) => {
    switch (item) {
      case 'timbratura':
        return (
          <ScaleDecorator activeScale={1.05}>
            <View
              style={[styles.cardWrapper, isActive && styles.cardActive]}
              onTouchStart={e => e.stopPropagation()}
            >
              <Card style={styles.clockCard}>
                <View style={styles.cardHeaderRow}>
                  <TouchableOpacity
                    style={[styles.clockHeader, { flex: 1 }]}
                    onPress={() => toggle('timbratura')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="finger-print" size={24} color={themeColors.primary} />
                    <Text style={[styles.clockTitle, { flex: 1 }]}>Timbratura Rapida</Text>
                    <Ionicons name={expanded.timbratura ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="reorder-three" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                {expanded.timbratura && todayTimbratura ? (
                  <View style={styles.clockInfo}>
                    {marcature.length > 0 ? (
                      <View style={styles.marcatureList}>
                        {marcature.map((m: any, idx: number) => (
                          <View key={m.id || idx} style={styles.marcaturaItem}>
                            <Ionicons name={m.tipo === 'entrata' ? 'log-in' : 'log-out'} size={14} color={m.tipo === 'entrata' ? COLORS.success : COLORS.error} />
                            <Text style={styles.marcaturaText}>{m.tipo === 'entrata' ? 'E' : 'U'}: {m.ora}</Text>
                            {m.is_reperibilita && <Ionicons name="call" size={12} color={COLORS.warning} style={{ marginLeft: 4 }} />}
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
                      <Text style={styles.oreTotaliValue}>{todayTimbratura.ore_arrotondate?.toFixed(1) || '0.0'}h</Text>
                    </View>
                  </View>
                ) : expanded.timbratura ? (
                  <Text style={styles.clockEmpty}>Nessuna timbratura oggi</Text>
                ) : null}

                {expanded.timbratura && (
                  <View style={styles.clockButtons}>
                    <TouchableOpacity
                      style={[styles.clockButton, entrataActive ? styles.clockButtonEntrata : styles.clockButtonDisabled]}
                      onPress={onPressEntrata}
                      activeOpacity={entrataActive ? 0.7 : 1}
                    >
                      {timbraturaLoading
                        ? <ActivityIndicator size="small" color={entrataActive ? COLORS.textWhite : COLORS.textSecondary} />
                        : <>
                          <Ionicons name="log-in-outline" size={20} color={entrataActive ? COLORS.textWhite : COLORS.textSecondary} />
                          <Text style={[styles.clockButtonText, entrataActive ? styles.clockButtonTextActive : styles.clockButtonTextDisabled]}>Entrata</Text>
                        </>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.clockButton, uscitaActive ? styles.clockButtonUscita : styles.clockButtonDisabled]}
                      onPress={onPressUscita}
                      activeOpacity={uscitaActive ? 0.7 : 1}
                    >
                      {timbraturaLoading
                        ? <ActivityIndicator size="small" color={uscitaActive ? COLORS.textWhite : COLORS.textSecondary} />
                        : <>
                          <Ionicons name="log-out-outline" size={20} color={uscitaActive ? COLORS.textWhite : COLORS.textSecondary} />
                          <Text style={[styles.clockButtonText, uscitaActive ? styles.clockButtonTextActive : styles.clockButtonTextDisabled]}>Uscita</Text>
                        </>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            </View>
          </ScaleDecorator>
        );

      case 'riepilogo':
        return (
          <ScaleDecorator activeScale={1.05}>
            <View style={[styles.cardWrapper, isActive && styles.cardActive]}>
              <Card
                title="Riepilogo Mese"
                icon="bar-chart"
                iconColor={themeColors.primary}
                onPress={() => toggle('riepilogo')}
                rightElement={
                  <View style={styles.rightRow}>
                    <Ionicons name={expanded.riepilogo ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="reorder-three" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                }
              >
                {expanded.riepilogo && (
                  <View style={styles.statsGrid}>
                    <StatCard label="Ore Lavorate" value={data?.mese_corrente?.ore_lavorate?.toFixed(1) || '0'} unit="h" color={themeColors.primary} />
                    <StatCard label="Straordinari" value={data?.mese_corrente?.ore_straordinarie?.toFixed(1) || '0'} unit="h" color={COLORS.overtime} />
                    <StatCard label="Giorni" value={data?.mese_corrente?.giorni_lavorati || 0} color={COLORS.success} />
                    <StatCard label="Ticket" value={data?.mese_corrente?.ticket_maturati || 0} color={COLORS.ticket} />
                  </View>
                )}
              </Card>
            </View>
          </ScaleDecorator>
        );

      case 'stima':
        return (
          <ScaleDecorator activeScale={1.05}>
            <View style={[styles.cardWrapper, isActive && styles.cardActive]}>
              <Card
                title="Stima Netto"
                icon="wallet"
                iconColor={COLORS.success}
                onPress={() => toggle('stima')}
                rightElement={
                  <View style={styles.rightRow}>
                    <Ionicons name={expanded.stima ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="reorder-three" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                }
              >
                {expanded.stima && (
                  <>
                    <View style={styles.estimateContainer}>
                      <Text style={styles.estimateValue}>{formatCurrency(data?.stime?.netto_stimato || 0)}</Text>
                      <Text style={styles.estimateLabel}>netto stimato per {meseCorrente}</Text>
                    </View>
                    <View style={styles.estimateDetails}>
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
            </View>
          </ScaleDecorator>
        );

      case 'ferie':
        return (
          <ScaleDecorator activeScale={1.05}>
            <View style={[styles.cardWrapper, isActive && styles.cardActive]}>
              <Card
                title="Saldo Ferie"
                icon="airplane"
                iconColor={COLORS.ferie}
                onPress={() => toggle('ferie')}
                rightElement={
                  <View style={styles.rightRow}>
                    <Ionicons name={expanded.ferie ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="reorder-three" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                }
              >
                {expanded.ferie && (
                  <View style={styles.balanceContainer}>
                    <View style={styles.balanceMain}>
                      <Text style={[styles.balanceValue, { color: COLORS.ferie }]}>{data?.ferie?.saldo_attuale?.toFixed(1) || '0'}</Text>
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
            </View>
          </ScaleDecorator>
        );

      case 'comporto':
        return (
          <ScaleDecorator activeScale={1.05}>
            <View style={[styles.cardWrapper, isActive && styles.cardActive]}>
              <Card
                title="Comporto Malattia"
                icon="medkit"
                iconColor={COLORS.malattia}
                onPress={() => toggle('comporto')}
                rightElement={
                  <View style={styles.rightRow}>
                    <Ionicons name={expanded.comporto ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="reorder-three" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                }
              >
                {expanded.comporto && (
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
            </View>
          </ScaleDecorator>
        );

      case 'busta':
        if (!data?.ultima_busta) return null;
        return (
          <ScaleDecorator activeScale={1.05}>
            <View style={[styles.cardWrapper, isActive && styles.cardActive]}>
              <Card
                title="Ultima Busta Paga"
                subtitle={`${getMesiItaliano(data.ultima_busta.mese)} ${data.ultima_busta.anno}`}
                icon="receipt"
                iconColor={themeColors.primary}
                onPress={() => toggle('busta')}
                rightElement={
                  <View style={styles.rightRow}>
                    <Ionicons name={expanded.busta ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="reorder-three" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                }
              >
                {expanded.busta && (
                  <View style={styles.payslipRow}>
                    <Text style={styles.payslipLabel}>Netto</Text>
                    <Text style={styles.payslipValue}>{formatCurrency(data.ultima_busta.netto)}</Text>
                  </View>
                )}
              </Card>
            </View>
          </ScaleDecorator>
        );

      default:
        return null;
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Ciao, {data?.settings?.nome?.split(' ')[0] || 'Marco'}</Text>
          <Text style={styles.subtitle}>{meseCorrente} {today.getFullYear()}</Text>
        </View>

        <DraggableFlatList
          data={cardOrder}
          keyExtractor={item => item}
          renderItem={renderItem}
          onDragEnd={({ data: newOrder }) => {
            setCardOrder(newOrder);
            AsyncStorage.setItem(CARD_ORDER_KEY, JSON.stringify(newOrder));
          }}
          onPlaceholderIndexChange={index => {
            // placeholder moves to correct position automatically
          }}
          dragItemOverflow
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[themeColors.primary]} />
          }
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={styles.bottomPadding} />}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  cardWrapper: {
    marginBottom: 0,
  },
  cardActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 999,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dragHandle: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clockCard: {
    backgroundColor: COLORS.card,
  },
  clockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clockTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 12,
  },
  clockInfo: {
    marginTop: 16,
    marginBottom: 16,
  },
  clockTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  clockTimeItem: {
    alignItems: 'center',
  },
  clockLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  clockTime: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  clockDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  clockEmpty: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 16,
    marginBottom: 16,
  },
  clockButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  clockButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  clockButtonEntrata: { backgroundColor: COLORS.success },
  clockButtonUscita: { backgroundColor: COLORS.error },
  clockButtonDisabled: { backgroundColor: COLORS.border },
  clockButtonText: { fontSize: 16, fontWeight: '600' },
  clockButtonTextActive: { color: COLORS.textWhite },
  clockButtonTextDisabled: { color: COLORS.textSecondary },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  estimateContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 16,
  },
  estimateValue: { fontSize: 36, fontWeight: '700', color: COLORS.success },
  estimateLabel: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  estimateDetails: { gap: 8 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  estimateDetailLabel: { fontSize: 14, color: COLORS.textSecondary },
  estimateDetailValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  balanceContainer: { flexDirection: 'row', alignItems: 'center' },
  balanceMain: { flex: 1, alignItems: 'center' },
  balanceValue: { fontSize: 40, fontWeight: '700' },
  balanceUnit: { fontSize: 14, color: COLORS.textSecondary },
  balanceDetails: { flex: 1, gap: 8 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 14, color: COLORS.textSecondary },
  balanceAmount: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  comportoContainer: { alignItems: 'center' },
  comportoMain: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  comportoValue: { fontSize: 40, fontWeight: '700', color: COLORS.success },
  comportoWarning: { color: COLORS.warning },
  comportoCritical: { color: COLORS.error },
  comportoUnit: { fontSize: 18, color: COLORS.textSecondary, marginLeft: 4 },
  comportoInfo: { fontSize: 14, color: COLORS.textSecondary },
  payslipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payslipLabel: { fontSize: 16, color: COLORS.textSecondary },
  payslipValue: { fontSize: 24, fontWeight: '700', color: COLORS.success },
  bottomPadding: { height: 20 },
  marcatureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  marcaturaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  marcaturaText: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  oreTotaliRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  oreTotaliLabel: { fontSize: 14, color: COLORS.textSecondary },
  oreTotaliValue: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
});
