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
import { Card, StatCard, LoadingScreen } from '../../src/components';
import { COLORS } from '../../src/utils/colors';
import { useAppStore, getThemeColors } from '../../src/store/appStore';
import * as api from '../../src/services/api';
import { formatCurrency, getMesiItaliano, getTodayString } from '../../src/utils/helpers';
import { useRouter } from 'expo-router';

export default function DashboardScreen() {
  const router = useRouter();
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
  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  
  const themeColors = getThemeColors(theme);

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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    // Permetti sempre nuova entrata se l'ultima marcatura è un'uscita o non ci sono marcature
    const marcature = todayTimbratura?.marcature || [];
    const ultimaMarcatura = marcature.length > 0 ? marcature[marcature.length - 1] : null;
    
    if (!ultimaMarcatura || ultimaMarcatura.tipo === 'uscita') {
      handleTimbra('entrata');
    }
  };

  const onPressUscita = () => {
    if (timbraturaLoading) return;
    // Permetti uscita solo se l'ultima marcatura è un'entrata
    const marcature = todayTimbratura?.marcature || [];
    const ultimaMarcatura = marcature.length > 0 ? marcature[marcature.length - 1] : null;
    
    if (ultimaMarcatura && ultimaMarcatura.tipo === 'entrata') {
      handleTimbra('uscita');
    }
  };

  if (loading) {
    return <LoadingScreen message="Caricamento dashboard..." />;
  }

  const data = dashboard;
  const today = new Date();
  const meseCorrente = getMesiItaliano(today.getMonth() + 1);

  // Determine button states based on marcature
  const marcature = todayTimbratura?.marcature || [];
  const ultimaMarcatura = marcature.length > 0 ? marcature[marcature.length - 1] : null;
  const entrataActive = !ultimaMarcatura || ultimaMarcatura.tipo === 'uscita';
  const uscitaActive = ultimaMarcatura && ultimaMarcatura.tipo === 'entrata';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[themeColors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Ciao, {data?.settings?.nome?.split(' ')[0] || 'Marco'}</Text>
            <Text style={styles.subtitle}>{meseCorrente} {today.getFullYear()}</Text>
          </View>
        </View>

        {/* Quick Clock In/Out */}
        <Card style={styles.clockCard}>
          <TouchableOpacity style={styles.clockHeader} onPress={() => toggle('timbratura')} activeOpacity={0.7}>
            <Ionicons name="finger-print" size={24} color={themeColors.primary} />
            <Text style={[styles.clockTitle, { flex: 1 }]}>Timbratura Rapida</Text>
            <Ionicons name={expanded.timbratura ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {expanded.timbratura && todayTimbratura ? (
            <View style={styles.clockInfo}>
              {/* Mostra lista marcature se presenti */}
              {marcature.length > 0 ? (
                <View style={styles.marcatureList}>
                  {marcature.map((m: any, idx: number) => (
                    <View key={m.id || idx} style={styles.marcaturaItem}>
                      <Ionicons 
                        name={m.tipo === 'entrata' ? 'log-in' : 'log-out'} 
                        size={14} 
                        color={m.tipo === 'entrata' ? COLORS.success : COLORS.error} 
                      />
                      <Text style={styles.marcaturaText}>
                        {m.tipo === 'entrata' ? 'E' : 'U'}: {m.ora}
                      </Text>
                      {m.is_reperibilita && (
                        <Ionicons name="call" size={12} color={COLORS.warning} style={{ marginLeft: 4 }} />
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
                <Text style={styles.oreTotaliValue}>{todayTimbratura.ore_arrotondate?.toFixed(1) || '0.0'}h</Text>
              </View>
            </View>
          ) : expanded.timbratura ? (
            <Text style={styles.clockEmpty}>Nessuna timbratura oggi</Text>
          ) : null}

          {expanded.timbratura && <View style={styles.clockButtons}>
            <TouchableOpacity
              style={[
                styles.clockButton,
                entrataActive ? styles.clockButtonEntrata : styles.clockButtonDisabled
              ]}
              onPress={onPressEntrata}
              activeOpacity={entrataActive ? 0.7 : 1}
            >
              {timbraturaLoading ? (
                <ActivityIndicator size="small" color={entrataActive ? COLORS.textWhite : COLORS.textSecondary} />
              ) : (
                <>
                  <Ionicons 
                    name="log-in-outline" 
                    size={20} 
                    color={entrataActive ? COLORS.textWhite : COLORS.textSecondary} 
                  />
                  <Text style={[
                    styles.clockButtonText,
                    entrataActive ? styles.clockButtonTextActive : styles.clockButtonTextDisabled
                  ]}>
                    Entrata
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.clockButton,
                uscitaActive ? styles.clockButtonUscita : styles.clockButtonDisabled
              ]}
              onPress={onPressUscita}
              activeOpacity={uscitaActive ? 0.7 : 1}
            >
              {timbraturaLoading ? (
                <ActivityIndicator size="small" color={uscitaActive ? COLORS.textWhite : COLORS.textSecondary} />
              ) : (
                <>
                  <Ionicons 
                    name="log-out-outline" 
                    size={20} 
                    color={uscitaActive ? COLORS.textWhite : COLORS.textSecondary} 
                  />
                  <Text style={[
                    styles.clockButtonText,
                    uscitaActive ? styles.clockButtonTextActive : styles.clockButtonTextDisabled
                  ]}>
                    Uscita
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>}
        </Card>

        {/* Monthly Stats */}
        <Card
          title="Riepilogo Mese"
          icon="bar-chart"
          iconColor={themeColors.primary}
          onPress={() => toggle('riepilogo')}
          rightElement={<Ionicons name={expanded.riepilogo ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />}
        >
          {expanded.riepilogo && <View style={styles.statsGrid}>
            <StatCard
              label="Ore Lavorate"
              value={data?.mese_corrente?.ore_lavorate?.toFixed(1) || '0'}
              unit="h"
              color={themeColors.primary}
            />
            <StatCard
              label="Straordinari"
              value={data?.mese_corrente?.ore_straordinarie?.toFixed(1) || '0'}
              unit="h"
              color={COLORS.overtime}
            />
            <StatCard
              label="Giorni"
              value={data?.mese_corrente?.giorni_lavorati || 0}
              color={COLORS.success}
            />
            <StatCard
              label="Ticket"
              value={data?.mese_corrente?.ticket_maturati || 0}
              color={COLORS.ticket}
            />
          </View>}
        </Card>

        {/* Estimated Pay */}
        <Card
          title="Stima Netto"
          icon="wallet"
          iconColor={COLORS.success}
          onPress={() => toggle('stima')}
          rightElement={<Ionicons name={expanded.stima ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />}
        >
          {expanded.stima && <>
            <View style={styles.estimateContainer}>
              <Text style={styles.estimateValue}>
                {formatCurrency(data?.stime?.netto_stimato || 0)}
              </Text>
              <Text style={styles.estimateLabel}>netto stimato per {meseCorrente}</Text>
            </View>
            <View style={styles.estimateDetails}>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateDetailLabel}>Lordo stimato</Text>
                <Text style={styles.estimateDetailValue}>
                  {formatCurrency(data?.stime?.lordo_stimato || 0)}
                </Text>
              </View>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateDetailLabel}>Straordinari</Text>
                <Text style={styles.estimateDetailValue}>
                  {formatCurrency(data?.stime?.straordinario_stimato || 0)}
                </Text>
              </View>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateDetailLabel}>Ticket ({data?.mese_corrente?.ticket_maturati || 0} gg)</Text>
                <Text style={styles.estimateDetailValue}>
                  {formatCurrency(data?.stime?.ticket_totale || 0)}
                </Text>
              </View>
            </View>
          </>}
        </Card>

        {/* Ferie Balance */}
        <Card
          title="Saldo Ferie"
          icon="airplane"
          iconColor={COLORS.ferie}
          onPress={() => toggle('ferie')}
          rightElement={<Ionicons name={expanded.ferie ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />}
        >
          {expanded.ferie && <View style={styles.balanceContainer}>
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
          </View>}
        </Card>

        {/* Comporto */}
        <Card
          title="Comporto Malattia"
          icon="medkit"
          iconColor={COLORS.malattia}
          onPress={() => toggle('comporto')}
          rightElement={<Ionicons name={expanded.comporto ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />}
        >
          {expanded.comporto && <View style={styles.comportoContainer}>
            <View style={styles.comportoMain}>
              <Text style={[
                styles.comportoValue,
                data?.comporto?.alert_critico && styles.comportoCritical,
                data?.comporto?.alert_attenzione && !data?.comporto?.alert_critico && styles.comportoWarning
              ]}>
                {data?.comporto?.giorni_malattia_3_anni || 0}
              </Text>
              <Text style={styles.comportoUnit}>/ {data?.comporto?.soglia_critica || 180} giorni</Text>
            </View>
            <Text style={styles.comportoInfo}>
              Negli ultimi 3 anni. Disponibili: {data?.comporto?.giorni_disponibili || 0} giorni
            </Text>
          </View>}
        </Card>

        {/* Last Payslip */}
        {data?.ultima_busta && (
          <Card
            title="Ultima Busta Paga"
            subtitle={`${getMesiItaliano(data.ultima_busta.mese)} ${data.ultima_busta.anno}`}
            icon="receipt"
            iconColor={themeColors.primary}
            onPress={() => toggle('busta')}
            rightElement={<Ionicons name={expanded.busta ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />}
          >
            {expanded.busta && <View style={styles.payslipContainer}>
              <View style={styles.payslipRow}>
                <Text style={styles.payslipLabel}>Netto</Text>
                <Text style={styles.payslipValue}>{formatCurrency(data.ultima_busta.netto)}</Text>
              </View>
            </View>}
          </Card>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  chatButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  clockCard: {
    backgroundColor: COLORS.card,
  },
  clockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  clockTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 12,
  },
  clockInfo: {
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
    marginBottom: 16,
  },
  clockButtons: {
    flexDirection: 'row',
    gap: 12,
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
  clockButtonEntrata: {
    backgroundColor: COLORS.success,
  },
  clockButtonUscita: {
    backgroundColor: COLORS.error,
  },
  clockButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  clockButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  clockButtonTextActive: {
    color: COLORS.textWhite,
  },
  clockButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
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
  estimateValue: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.success,
  },
  estimateLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  estimateDetails: {
    gap: 8,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estimateDetailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  estimateDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceMain: {
    flex: 1,
    alignItems: 'center',
  },
  balanceValue: {
    fontSize: 40,
    fontWeight: '700',
  },
  balanceUnit: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  balanceDetails: {
    flex: 1,
    gap: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  comportoContainer: {
    alignItems: 'center',
  },
  comportoMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  comportoValue: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.success,
  },
  comportoWarning: {
    color: COLORS.warning,
  },
  comportoCritical: {
    color: COLORS.error,
  },
  comportoUnit: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  comportoInfo: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  payslipContainer: {},
  payslipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payslipLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  payslipValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.success,
  },
  bottomPadding: {
    height: 20,
  },
  // Stili per marcature multiple
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
  marcaturaText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  oreTotaliRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  oreTotaliLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  oreTotaliValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
