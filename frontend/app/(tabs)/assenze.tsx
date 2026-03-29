import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, BottomSheet, InputField, LoadingScreen, DatePickerField, SwipeableRow } from '../../src/components';
import * as offlineApi from '../../src/services/offlineApi';
import { formatDate, getTipoAssenzaLabel, getTodayString } from '../../src/utils/helpers';
import { Assenza } from '../../src/types';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { useAppStore } from '../../src/store/appStore';
import { useFocusEffect } from 'expo-router';

type TipoOption = {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const getTipoOptions = (colors: ReturnType<typeof useAppTheme>['colors']): TipoOption[] => [
  { value: 'ferie', label: 'Ferie', icon: 'airplane', color: colors.ferie },
  { value: 'malattia', label: 'Malattia', icon: 'medkit', color: colors.malattia },
  { value: 'permesso_rol', label: 'Permesso ROL', icon: 'time', color: colors.primary },
  { value: 'permesso_non_retribuito', label: 'Permesso non retribuito', icon: 'cash', color: colors.warning },
  { value: 'altro', label: 'Altro', icon: 'ellipsis-horizontal', color: colors.textSecondary },
];

export default function AssenzeScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const tipoOptions = getTipoOptions(colors);
  const { settings } = useAppStore();
  const oreGiornaliere = settings?.ore_giornaliere ?? 8;
  const oreToGiorni = (ore: number) => (ore / oreGiornaliere).toFixed(1);
  const [assenze, setAssenze] = useState<Assenza[]>([]);
  const [ferieData, setFerieData] = useState<any>(null);
  const [comporto, setComporto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showTipoSheet, setShowTipoSheet] = useState(false);
  
  // Form state
  const [selectedTipo, setSelectedTipo] = useState('ferie');
  const [dataInizio, setDataInizio] = useState(getTodayString());
  const [dataFine, setDataFine] = useState(getTodayString());
  const [oreTotali, setOreTotali] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [assenzeRes, ferieRes, comportoRes] = await Promise.all([
        offlineApi.getAssenze(),
        offlineApi.getSaldoFerie(),
        offlineApi.getComporto(),
      ]);
      setAssenze(assenzeRes as unknown as Assenza[]);
      setFerieData(ferieRes);
      setComporto(comportoRes);
    } catch (error) {
      console.error('Error loading assenze:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!dataInizio || !dataFine) {
      Alert.alert('Errore', 'Inserisci le date');
      return;
    }

    setSaving(true);
    try {
      await offlineApi.createAssenza({
        tipo: selectedTipo,
        data_inizio: dataInizio,
        data_fine: dataFine,
        ore_totali: oreTotali ? parseFloat(oreTotali) : undefined,
        note: note || undefined,
      });

      setShowAddSheet(false);
      resetForm();
      loadData();
      Alert.alert('Successo', 'Assenza registrata');
    } catch {
      Alert.alert('Errore', 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Conferma',
      'Vuoi eliminare questa assenza?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await offlineApi.deleteAssenza(id);
              loadData();
            } catch {
              Alert.alert('Errore', 'Impossibile eliminare');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setSelectedTipo('ferie');
    setDataInizio(getTodayString());
    setDataFine(getTodayString());
    setOreTotali('');
    setNote('');
  };

  const getIconForTipo = (tipo: string) => {
    return tipoOptions.find((option) => option.value === tipo)?.icon || 'ellipsis-horizontal';
  };

  const getColorForTipo = (tipo: string) => {
    return tipoOptions.find((option) => option.value === tipo)?.color || colors.textSecondary;
  };

  if (loading) {
    return <LoadingScreen message="Caricamento assenze..." />;
  }

  const renderAssenza = ({ item }: { item: Assenza }) => (
    <SwipeableRow onDelete={() => handleDelete(item.id)}>
      <Card style={styles.assenzaCard}>
        <View style={styles.assenzaHeader}>
          <View style={[styles.assenzaIcon, { backgroundColor: `${getColorForTipo(item.tipo)}15` }]}>
            <Ionicons name={getIconForTipo(item.tipo) as any} size={20} color={getColorForTipo(item.tipo)} />
          </View>
          <View style={styles.assenzaInfo}>
            <Text style={styles.assenzaTipo}>{getTipoAssenzaLabel(item.tipo)}</Text>
            <Text style={styles.assenzaDate}>
              {formatDate(item.data_inizio)} - {formatDate(item.data_fine)}
            </Text>
          </View>
          <View style={styles.assenzaHours}>
            <Text style={styles.assenzaHoursValue}>{item.ore_totali}h</Text>
          </View>
        </View>
        {item.note && <Text style={styles.assenzaNote}>{item.note}</Text>}
        {item.certificato_nome && (
          <View style={styles.certificatoBadge}>
            <Ionicons name="attach" size={14} color={colors.primary} />
            <Text style={styles.certificatoText}>{item.certificato_nome}</Text>
          </View>
        )}
      </Card>
    </SwipeableRow>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="assenze-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Assenze</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowAddSheet(true);
          }}
          testID="assenze-add-button"
        >
          <Ionicons name="add" size={24} color={colors.textWhite} />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        {/* Card Ferie — ore primario, giorni secondario */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryIconContainer}>
            <Ionicons name="airplane" size={20} color={colors.ferie} />
          </View>
          <Text style={styles.summaryLabel}>Ferie</Text>
          <Text style={[styles.summaryValue, { color: colors.ferie }]} testID="assenze-ferie-value">
            {ferieData?.saldo_attuale?.toFixed(1) || '0'}h
          </Text>
          <Text style={styles.summarySubtextSecondary}>
            {oreToGiorni(ferieData?.saldo_attuale || 0)} gg
          </Text>
          <Text style={styles.summarySubtext}>disponibili</Text>
          {(ferieData?.ore_maturate || ferieData?.ore_godute) ? (
            <View style={styles.ferieDetails}>
              <Text style={styles.ferieDetailRow}>
                <Text style={styles.ferieDetailLabel}>Maturate </Text>
                <Text style={styles.ferieDetailValue}>{ferieData?.ore_maturate?.toFixed(1) || '0'}h · {oreToGiorni(ferieData?.ore_maturate || 0)} gg</Text>
              </Text>
              <Text style={styles.ferieDetailRow}>
                <Text style={styles.ferieDetailLabel}>Godute </Text>
                <Text style={styles.ferieDetailValue}>{ferieData?.ore_godute?.toFixed(1) || '0'}h · {oreToGiorni(ferieData?.ore_godute || 0)} gg</Text>
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Card Comporto — giorni primario, ore secondario, barra progresso */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryIconContainer}>
            <Ionicons name="medkit" size={20} color={colors.malattia} />
          </View>
          <Text style={styles.summaryLabel}>Comporto</Text>
          <Text style={[
            styles.summaryValue,
            comporto?.alert_critico && { color: colors.error },
            comporto?.alert_attenzione && !comporto?.alert_critico && { color: colors.warning },
            !comporto?.alert_attenzione && { color: colors.success },
          ]}>
            {comporto?.giorni_malattia_3_anni || 0}
          </Text>
          <Text style={styles.summarySubtextSecondary}>
            {((comporto?.giorni_malattia_3_anni || 0) * oreGiornaliere).toFixed(0)}h equiv.
          </Text>
          <Text style={styles.summarySubtext}>/ {comporto?.soglia_critica || 180} giorni</Text>
          {/* Barra progresso */}
          <View style={styles.comportoBarContainer}>
            <View style={[
              styles.comportoBarFill,
              {
                width: `${Math.min(100, ((comporto?.giorni_malattia_3_anni || 0) / (comporto?.soglia_critica || 180)) * 100)}%`,
                backgroundColor: comporto?.alert_critico ? colors.error : comporto?.alert_attenzione ? colors.warning : colors.success,
              }
            ]} />
          </View>
        </Card>
      </View>

      <FlatList
        data={assenze}
        keyExtractor={(item) => item.id}
        renderItem={renderAssenza}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={colors.border} />
            <Text style={styles.emptyText}>Nessuna assenza registrata</Text>
          </View>
        }
      />

      {/* Add Sheet */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title="Nuova Assenza"
        height="75%"
        testID="assenze-add-sheet"
        closeButtonTestID="assenze-add-sheet-close"
      >
        <TouchableOpacity style={styles.tipoSelector} onPress={() => setShowTipoSheet(true)}>
          <View style={[styles.tipoIcon, { backgroundColor: `${getColorForTipo(selectedTipo)}15` }]}>
            <Ionicons name={getIconForTipo(selectedTipo)} size={20} color={getColorForTipo(selectedTipo)} />
          </View>
          <Text style={styles.tipoText}>{getTipoAssenzaLabel(selectedTipo)}</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <DatePickerField
          label="Data Inizio"
          value={dataInizio}
          onChange={setDataInizio}
          placeholder="Seleziona data inizio"
        />
        <DatePickerField
          label="Data Fine"
          value={dataFine}
          onChange={setDataFine}
          placeholder="Seleziona data fine"
          minimumDate={dataInizio ? new Date(dataInizio) : undefined}
        />
        <InputField
          label="Ore Totali (opzionale)"
          value={oreTotali}
          onChangeText={setOreTotali}
          placeholder="Es. 8 (calcolato automaticamente se vuoto)"
          icon="time"
          keyboardType="numeric"
        />
        <InputField
          label="Note (opzionale)"
          value={note}
          onChangeText={setNote}
          placeholder="Eventuali note..."
          icon="document-text"
          multiline
        />

        <View style={styles.sheetButtons}>
          <Button
            title="Annulla"
            variant="outline"
            onPress={() => setShowAddSheet(false)}
            style={styles.sheetButton}
            testID="assenze-cancel-button"
          />
          <Button
            title="Salva"
            onPress={handleSave}
            loading={saving}
            style={styles.sheetButton}
            testID="assenze-save-button"
          />
        </View>
      </BottomSheet>

      {/* Tipo Selection Sheet */}
      <BottomSheet
        visible={showTipoSheet}
        onClose={() => setShowTipoSheet(false)}
        title="Seleziona Tipo"
        height="50%"
      >
        {tipoOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.tipoOption,
              selectedTipo === option.value && { ...styles.tipoOptionSelected, backgroundColor: `${colors.primary}10` },
            ]}
            onPress={() => {
              setSelectedTipo(option.value);
              setShowTipoSheet(false);
            }}
          >
            <View style={[styles.tipoOptionIcon, { backgroundColor: `${option.color}15` }]}>
              <Ionicons name={option.icon} size={20} color={option.color} />
            </View>
            <Text style={styles.tipoOptionText}>{option.label}</Text>
            {selectedTipo === option.value && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    summaryContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 16,
    },
    summaryCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 16,
    },
    summaryIconContainer: {
      marginBottom: 8,
    },
    summaryLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    summaryValue: {
      fontSize: 28,
      fontWeight: '700',
      marginTop: 4,
    },
    summarySubtext: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    summarySubtextSecondary: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 1,
    },
    ferieDetails: {
      marginTop: 8,
      width: '100%',
      gap: 2,
    },
    ferieDetailRow: {
      fontSize: 11,
      textAlign: 'center',
    },
    ferieDetailLabel: {
      color: colors.textSecondary,
    },
    ferieDetailValue: {
      color: colors.text,
      fontWeight: '500',
    },
    comportoBarContainer: {
      marginTop: 8,
      width: '100%',
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    comportoBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },
    assenzaCard: {
      marginBottom: 12,
    },
    assenzaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    assenzaIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    assenzaInfo: {
      flex: 1,
      marginLeft: 12,
    },
    assenzaTipo: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    assenzaDate: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    assenzaHours: {
      alignItems: 'flex-end',
    },
    assenzaHoursValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primary,
    },
    assenzaNote: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 12,
      fontStyle: 'italic',
    },
    certificatoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: `${colors.primary}10`,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    certificatoText: {
      fontSize: 12,
      color: colors.primary,
      marginLeft: 6,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 16,
    },
    tipoSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardDark,
      padding: 12,
      borderRadius: 12,
      marginBottom: 16,
    },
    tipoIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tipoText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginLeft: 12,
    },
    tipoOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tipoOptionSelected: {
      marginHorizontal: -20,
      paddingHorizontal: 20,
    },
    tipoOptionIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tipoOptionText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      marginLeft: 12,
    },
    sheetButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    sheetButton: {
      flex: 1,
    },
  });
