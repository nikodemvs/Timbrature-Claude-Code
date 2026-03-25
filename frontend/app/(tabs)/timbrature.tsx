import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  FlatList,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Card, Button, BottomSheet, InputField, LoadingScreen, DatePickerField, TimePickerField } from '../../src/components';
import * as api from '../../src/services/api';
import * as offlineApi from '../../src/services/offlineApi';
import { formatDate, getGiornoSettimana, getTodayString } from '../../src/utils/helpers';
import { Timbratura, WeeklySummary } from '../../src/types';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { useAppStore } from '../../src/store/appStore';

type TabType = 'personali' | 'aziendali' | 'confronto';

interface ApiErrorResponse {
  response?: {
    data?: {
      detail?: string | UploadConflictDetail;
    };
  };
}

interface UploadConflictDetail {
  code?: string;
  message?: string;
  mese?: number;
  anno?: number;
}

interface ConfrontoItem {
  data: string;
  personale_entrata: string | null;
  personale_uscita: string | null;
  personale_ore: number;
  aziendale_entrata: string | null;
  aziendale_uscita: string | null;
  aziendale_ore: number;
  aziendale_descrizione: string | null;
  differenza_ore: number;
  has_discrepancy: boolean;
}

interface ConfrontoRiepilogo {
  ore_personali_totali: number;
  ore_aziendali_totali: number;
  differenza_ore_totale: number;
  giorni_con_discrepanza: number;
}

interface TimbraturaAziendale {
  id: string;
  data: string;
  ora_entrata: string | null;
  ora_uscita: string | null;
  ore_lavorate: number;
  descrizione: string | null;
}

interface PendingTimbratureOverwrite {
  file: DocumentPicker.DocumentPickerAsset;
  message: string;
  mese: number;
  anno: number;
}

const getApiErrorDetail = (error: unknown) =>
  (error as ApiErrorResponse | null)?.response?.data?.detail;

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const detail = getApiErrorDetail(error);
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail?.message) {
    return detail.message;
  }
  return fallback;
};

const getUploadAlertTitle = (message: string) =>
  message.includes('sembra una busta paga') || message.includes('sembra un report timbrature')
    ? 'File non compatibile'
    : 'Errore';

const getConflictDetail = (error: unknown): UploadConflictDetail | null => {
  const detail = getApiErrorDetail(error);
  if (typeof detail === 'string' || !detail) {
    return null;
  }
  return detail;
};

const appendPdfToFormData = (formData: FormData, asset: DocumentPicker.DocumentPickerAsset) => {
  const browserFile = asset.file;

  if (typeof File !== 'undefined' && browserFile instanceof File) {
    formData.append('file', browserFile, browserFile.name);
    return;
  }

  formData.append('file', {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType || 'application/pdf',
  } as unknown as Blob);
};

export default function TimbraturaScreen() {
  const { colors } = useAppTheme();
  const { setTodayTimbratura } = useAppStore();
  const styles = createStyles(colors);
  const [activeTab, setActiveTab] = useState<TabType>('personali');
  const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
  const [timbratureAziendali, setTimbratureAziendali] = useState<TimbraturaAziendale[]>([]);
  const [confronto, setConfronto] = useState<ConfrontoItem[]>([]);
  const [confrontoRiepilogo, setConfrontoRiepilogo] = useState<ConfrontoRiepilogo | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [timbraturaDaEliminare, setTimbraturaDaEliminare] = useState<Timbratura | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [oraEntrata, setOraEntrata] = useState('');
  const [oraUscita, setOraUscita] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isReperibilita, setIsReperibilita] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingTimbratureOverwrite | null>(null);
  
  // Selettore mese/anno
  const now = new Date();
  const [meseSelezionato, setMeseSelezionato] = useState(now.getMonth() + 1);
  const [annoSelezionato, setAnnoSelezionato] = useState(now.getFullYear());
  
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  const loadData = useCallback(async () => {
    try {
      const [timbRes, weekRes] = await Promise.allSettled([
        offlineApi.getTimbrature({ mese: meseSelezionato, anno: annoSelezionato }),
        api.getWeeklySummary(getTodayString()),
      ]);
      if (timbRes.status === 'fulfilled') setTimbrature(timbRes.value as Timbratura[]);
      if (weekRes.status === 'fulfilled') setWeeklySummary(weekRes.value.data);
      
      // Load company timbrature
      try {
        const azRes = await api.getTimbratureAziendali({ mese: meseSelezionato, anno: annoSelezionato });
        setTimbratureAziendali(azRes.data || []);
      } catch {
        console.log('No company timbrature');
      }
      
      // Load confronto
      try {
        const confRes = await api.getConfrontoTimbrature(meseSelezionato, annoSelezionato);
        setConfronto(confRes.data.confronti || []);
        setConfrontoRiepilogo(
          confRes.data.riepilogo
            ? {
                ore_personali_totali: confRes.data.riepilogo.ore_personali_totali ?? 0,
                ore_aziendali_totali: confRes.data.riepilogo.ore_aziendali_totali ?? 0,
                differenza_ore_totale: confRes.data.riepilogo.differenza_ore_totale ?? 0,
                giorni_con_discrepanza: confRes.data.riepilogo.giorni_con_discrepanza ?? 0,
              }
            : null
        );
      } catch {
        console.log('No confronto data');
      }
    } catch (error) {
      console.error('Error loading timbrature:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [meseSelezionato, annoSelezionato]);

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

  const uploadTimbraturePdf = async (file: DocumentPicker.DocumentPickerAsset, forceOverwrite = false) => {
    setUploading(true);
    try {
      const formData = new FormData();
      appendPdfToFormData(formData, file);
      if (forceOverwrite) {
        formData.append('force_overwrite', 'true');
      }

      const response = await api.uploadTimbratureAziendali(formData);
      const meseImportato = response.data.mese;
      const annoImportato = response.data.anno;
      const periodoCambiato = meseImportato !== meseSelezionato || annoImportato !== annoSelezionato;

      setPendingOverwrite(null);
      if (periodoCambiato) {
        setMeseSelezionato(meseImportato);
        setAnnoSelezionato(annoImportato);
      } else {
        await loadData();
      }

      Alert.alert(
        'PDF caricato',
        `File "${file.name}" importato nel periodo ${MESI[meseImportato - 1]} ${annoImportato}.\n\n${response.data.timbrature_importate || 0} timbrature importate automaticamente.`,
      );
    } catch (error: unknown) {
      console.error('Upload error:', error);
      const detail = getConflictDetail(error);
      if (detail?.code === 'duplicato_timbrature_report' && detail.mese && detail.anno) {
        setPendingOverwrite({
          file,
          message: detail.message || 'Esiste già un report timbrature per questo mese.',
          mese: detail.mese,
          anno: detail.anno,
        });
        return;
      }

      const message = getApiErrorMessage(error, 'Impossibile caricare il file PDF');
      Alert.alert(getUploadAlertTitle(message), message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPDF = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }
    
    await uploadTimbraturePdf(result.assets[0]);
  };

  const handleSave = async () => {
    if (!selectedDate || !oraEntrata) {
      Alert.alert('Errore', 'Inserisci almeno la data e l\'ora di entrata');
      return;
    }

    if (editingDate && editingDate !== selectedDate) {
      Alert.alert('Data non modificabile', 'Per cambiare giorno crea una nuova timbratura.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ora_entrata: oraEntrata || undefined,
        ora_uscita: oraUscita || undefined,
        is_reperibilita_attiva: isReperibilita,
        note: note || undefined,
      };
      
      if (editingDate) {
        await api.updateTimbratura(editingDate, payload);
      } else {
        await api.createTimbratura({
          data: selectedDate,
          ...payload,
        });
      }
      
      setShowAddSheet(false);
      resetForm();
      loadData();
      Alert.alert('Successo', 'Timbratura salvata');
    } catch (error: unknown) {
      Alert.alert('Errore', getApiErrorMessage(error, 'Errore nel salvataggio'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: Timbratura) => {
    setTimbraturaDaEliminare(item);
  };

  const closeDeleteSheet = () => {
    if (deleting) {
      return;
    }

    setTimbraturaDaEliminare(null);
  };

  const confirmDelete = async () => {
    if (!timbraturaDaEliminare) {
      return;
    }

    setDeleting(true);
    const dataDaEliminare = timbraturaDaEliminare.data;

    try {
      await api.deleteTimbratura(dataDaEliminare);
      setTimbrature((current) => current.filter((item) => item.data !== dataDaEliminare));
      if (dataDaEliminare === getTodayString()) {
        setTodayTimbratura(null);
      }
      setTimbraturaDaEliminare(null);
      await loadData();
    } catch (error: unknown) {
      Alert.alert('Errore', getApiErrorMessage(error, 'Impossibile eliminare la timbratura'));
    } finally {
      setDeleting(false);
    }
  };

  const closeAddSheet = () => {
    setShowAddSheet(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingDate(null);
    setSelectedDate(getTodayString());
    setOraEntrata('');
    setOraUscita('');
    setNote('');
    setIsReperibilita(false);
  };

  const editTimbratura = (item: Timbratura) => {
    setEditingDate(item.data);
    setSelectedDate(item.data);
    setOraEntrata(item.ora_entrata || '');
    setOraUscita(item.ora_uscita || '');
    setNote(item.note || '');
    setIsReperibilita(item.is_reperibilita_attiva || false);
    setShowAddSheet(true);
  };

  if (loading) {
    return <LoadingScreen message="Caricamento timbrature..." />;
  }

  const renderTimbratura = ({ item }: { item: Timbratura }) => (
    <Card style={styles.timbraturaCard}>
      <View style={styles.timbraturaHeader}>
        <View>
          <Text style={styles.timbraturaDate}>{formatDate(item.data, 'dd MMM yyyy')}</Text>
          <Text style={styles.timbraturaDay}>{getGiornoSettimana(item.data)}</Text>
        </View>
        <View style={styles.timbraturaHours}>
          <Text style={styles.timbraturaHoursValue}>{item.ore_arrotondate.toFixed(1)}h</Text>
          {item.is_reperibilita_attiva && (
            <View style={styles.reperibilitaBadge}>
              <Ionicons name="call" size={12} color={colors.reperibilita} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.timbraturaBody}>
        <View style={styles.timeSlot}>
          <Ionicons name="log-in" size={16} color={colors.success} />
          <Text style={styles.timeValue}>{item.ora_entrata || '--:--'}</Text>
        </View>
        <View style={styles.timeLine} />
        <View style={styles.timeSlot}>
          <Ionicons name="log-out" size={16} color={colors.error} />
          <Text style={styles.timeValue}>{item.ora_uscita || '--:--'}</Text>
        </View>
      </View>
      {item.note && <Text style={styles.timbraturaNote}>{item.note}</Text>}
      <View style={styles.inlineActions}>
        <TouchableOpacity
          style={styles.inlineActionButton}
          onPress={() => editTimbratura(item)}
          activeOpacity={0.8}
          testID="timbrature-edit-button"
        >
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={styles.inlineActionText}>Modifica</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.inlineActionButton, styles.inlineActionDanger]}
          onPress={() => handleDelete(item)}
          activeOpacity={0.8}
          testID="timbrature-delete-button"
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={[styles.inlineActionText, styles.inlineActionDangerText]}>Elimina</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  const renderTimbraturaAziendale = ({ item }: { item: TimbraturaAziendale }) => (
    <Card style={styles.timbraturaCard}>
      <View style={styles.timbraturaHeader}>
        <View>
          <Text style={styles.timbraturaDate}>{formatDate(item.data, 'dd MMM yyyy')}</Text>
          <Text style={styles.timbraturaDay}>{getGiornoSettimana(item.data)}</Text>
        </View>
        <View style={styles.timbraturaHours}>
          <Text style={[styles.timbraturaHoursValue, { color: colors.secondary }]}>{item.ore_lavorate.toFixed(1)}h</Text>
        </View>
      </View>
      <View style={styles.timbraturaBody}>
        <View style={styles.timeSlot}>
          <Ionicons name="log-in" size={16} color={colors.secondary} />
          <Text style={styles.timeValue}>{item.ora_entrata || '--:--'}</Text>
        </View>
        <View style={styles.timeLine} />
        <View style={styles.timeSlot}>
          <Ionicons name="log-out" size={16} color={colors.secondary} />
          <Text style={styles.timeValue}>{item.ora_uscita || '--:--'}</Text>
        </View>
      </View>
      {item.descrizione && <Text style={styles.timbraturaNote}>{item.descrizione}</Text>}
    </Card>
  );

  const renderConfronto = ({ item }: { item: ConfrontoItem }) => (
    <Card style={[styles.timbraturaCard, item.has_discrepancy && styles.discrepancyCard]}>
      <View style={styles.timbraturaHeader}>
        <View>
          <Text style={styles.timbraturaDate}>{formatDate(item.data, 'dd MMM yyyy')}</Text>
          <Text style={styles.timbraturaDay}>{getGiornoSettimana(item.data)}</Text>
        </View>
        {item.has_discrepancy && (
          <View style={styles.warningBadge}>
            <Ionicons name="warning" size={16} color={colors.warning} />
            <Text style={styles.warningText}>{item.differenza_ore > 0 ? '+' : ''}{item.differenza_ore.toFixed(1)}h</Text>
          </View>
        )}
      </View>
      
      {/* Personale */}
      <View style={styles.confrontoRow}>
        <Text style={styles.confrontoLabel}>Mie:</Text>
        <Text style={styles.confrontoValue}>
          {item.personale_entrata || '--:--'} - {item.personale_uscita || '--:--'}
        </Text>
        <Text style={[styles.confrontoOre, { color: colors.primary }]}>{item.personale_ore.toFixed(1)}h</Text>
      </View>
      
      {/* Aziendale */}
      <View style={styles.confrontoRow}>
        <Text style={styles.confrontoLabel}>Azienda:</Text>
        <Text style={styles.confrontoValue}>
          {item.aziendale_entrata || '--:--'} - {item.aziendale_uscita || '--:--'}
        </Text>
        <Text style={[styles.confrontoOre, { color: colors.secondary }]}>{item.aziendale_ore.toFixed(1)}h</Text>
      </View>
      
      {item.aziendale_descrizione && (
        <Text style={styles.timbraturaNote}>{item.aziendale_descrizione}</Text>
      )}
    </Card>
  );

  const renderEmptyAziendali = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cloud-upload-outline" size={64} color={colors.border} />
      <Text style={styles.emptyText}>Nessuna timbratura aziendale</Text>
      <Text style={styles.emptySubtext}>Carica il PDF timbrature mensile con il dettaglio giornaliero di entrate e uscite</Text>
      <Button
        title="Carica PDF Timbrature"
        onPress={handleUploadPDF}
        loading={uploading}
        icon="document-attach"
        style={{ marginTop: 16 }}
      />
    </View>
  );

  const sectionHintText =
    activeTab === 'personali'
      ? 'Modifica ed elimina le timbrature dalle azioni visibili su ogni scheda.'
      : activeTab === 'aziendali'
        ? 'Importa il PDF timbrature del mese attivo con il dettaglio giornaliero di entrate e uscite.'
        : 'Controlla subito le discrepanze e confronta le ore tra dati personali e aziendali.';
  const giorniConDiscrepanza = confrontoRiepilogo?.giorni_con_discrepanza ?? 0;
  const differenzaOreTotale = confrontoRiepilogo?.differenza_ore_totale ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="timbrature-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Timbrature</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleUploadPDF}
            disabled={uploading}
            testID="timbrature-upload-button"
          >
            <Ionicons name="cloud-upload" size={22} color={colors.textWhite} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              resetForm();
              setShowAddSheet(true);
            }}
            testID="timbrature-add-button"
          >
            <Ionicons name="add" size={24} color={colors.textWhite} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month/Year Selector */}
      <View style={styles.monthSelector}>
        <TouchableOpacity 
          style={styles.monthNavButton}
          testID="timbrature-month-prev"
          onPress={() => {
            if (meseSelezionato === 1) {
              setMeseSelezionato(12);
              setAnnoSelezionato(annoSelezionato - 1);
            } else {
              setMeseSelezionato(meseSelezionato - 1);
            }
          }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        
        <View style={styles.monthDisplay}>
          <Text style={styles.monthText}>{MESI[meseSelezionato - 1]} {annoSelezionato}</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.monthNavButton}
          testID="timbrature-month-next"
          onPress={() => {
            const now = new Date();
            const isCurrentMonth = meseSelezionato === (now.getMonth() + 1) && annoSelezionato === now.getFullYear();
            if (!isCurrentMonth) {
              if (meseSelezionato === 12) {
                setMeseSelezionato(1);
                setAnnoSelezionato(annoSelezionato + 1);
              } else {
                setMeseSelezionato(meseSelezionato + 1);
              }
            }
          }}
        >
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={meseSelezionato === (new Date().getMonth() + 1) && annoSelezionato === new Date().getFullYear() ? colors.border : colors.primary} 
          />
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'personali' && styles.tabActive]}
          onPress={() => setActiveTab('personali')}
          testID="timbrature-tab-personali"
        >
          <Text style={[styles.tabText, activeTab === 'personali' && styles.tabTextActive]}>Mie</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'aziendali' && styles.tabActive]}
          onPress={() => setActiveTab('aziendali')}
          testID="timbrature-tab-aziendali"
        >
          <Text style={[styles.tabText, activeTab === 'aziendali' && styles.tabTextActive]}>Azienda</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'confronto' && styles.tabActive]}
          onPress={() => setActiveTab('confronto')}
          testID="timbrature-tab-confronto"
        >
          <Text style={[styles.tabText, activeTab === 'confronto' && styles.tabTextActive]}>Confronto</Text>
          {giorniConDiscrepanza > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{giorniConDiscrepanza}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHint}>{sectionHintText}</Text>

      {/* Tab Content */}
      {activeTab === 'personali' && (
        <>
          {weeklySummary && (
            <Card style={styles.summaryCard} testID="timbrature-weekly-summary">
              <Text style={styles.summaryTitle}>Settimana Corrente</Text>
              <Text style={styles.summarySubtitle}>
                {formatDate(weeklySummary.settimana_inizio, 'dd MMM')} - {formatDate(weeklySummary.settimana_fine, 'dd MMM')}
              </Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{weeklySummary.ore_totali.toFixed(1)}</Text>
                  <Text style={styles.summaryLabel}>Ore Totali</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    {weeklySummary.ore_ordinarie.toFixed(1)}
                  </Text>
                  <Text style={styles.summaryLabel}>Ordinarie</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: colors.overtime }]}>
                    {weeklySummary.ore_straordinarie.toFixed(1)}
                  </Text>
                  <Text style={styles.summaryLabel}>Straordinari</Text>
                </View>
              </View>
            </Card>
          )}
          <FlatList
            data={timbrature}
            keyExtractor={(item) => item.id}
            renderItem={renderTimbratura}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="time-outline" size={64} color={colors.border} />
                <Text style={styles.emptyText}>Nessuna timbratura questo mese</Text>
              </View>
            }
          />
        </>
      )}

      {activeTab === 'aziendali' && (
        <FlatList
          data={timbratureAziendali}
          keyExtractor={(item) => item.id || item.data}
          renderItem={renderTimbraturaAziendale}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyAziendali}
        />
      )}

      {activeTab === 'confronto' && (
        <>
          {confrontoRiepilogo && (
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Riepilogo Confronto</Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{confrontoRiepilogo.ore_personali_totali?.toFixed(1) || '0.0'}</Text>
                  <Text style={styles.summaryLabel}>Mie Ore</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: colors.secondary }]}>
                    {confrontoRiepilogo.ore_aziendali_totali.toFixed(1)}
                  </Text>
                  <Text style={styles.summaryLabel}>Ore Azienda</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[
                    styles.summaryValue,
                    { color: differenzaOreTotale > 0 ? colors.success : differenzaOreTotale < 0 ? colors.error : colors.text }
                  ]}>
                    {differenzaOreTotale > 0 ? '+' : ''}{differenzaOreTotale.toFixed(1)}
                  </Text>
                  <Text style={styles.summaryLabel}>Differenza</Text>
                </View>
              </View>
              {giorniConDiscrepanza > 0 && (
                <View style={styles.alertBox}>
                  <Ionicons name="alert-circle" size={20} color={colors.warning} />
                  <Text style={styles.alertText}>
                    {giorniConDiscrepanza} giorni con discrepanze
                  </Text>
                </View>
              )}
            </Card>
          )}
          <FlatList
            data={confronto}
            keyExtractor={(item) => item.data}
            renderItem={renderConfronto}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="git-compare-outline" size={64} color={colors.border} />
                <Text style={styles.emptyText}>Nessun confronto disponibile</Text>
                <Text style={styles.emptySubtext}>Carica le timbrature aziendali per confrontarle</Text>
              </View>
            }
          />
        </>
      )}

      {/* Add/Edit Sheet */}
      <BottomSheet
        visible={Boolean(timbraturaDaEliminare)}
        onClose={closeDeleteSheet}
        title="Conferma eliminazione"
        height="40%"
        testID="timbrature-delete-sheet"
        closeButtonTestID="timbrature-delete-sheet-close"
      >
        <View style={styles.deleteSheetContent}>
          <View style={styles.deleteIconContainer}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </View>
          <Text style={styles.deleteSheetTitle}>Elimina la timbratura selezionata?</Text>
          <Text style={styles.deleteSheetText}>
            {timbraturaDaEliminare
              ? `Puoi annullare oppure confermare l'eliminazione della timbratura del ${formatDate(timbraturaDaEliminare.data, 'dd MMM yyyy')}.`
              : 'Puoi annullare oppure confermare l\'eliminazione della timbratura selezionata.'}
          </Text>
          <View style={styles.sheetButtons}>
            <Button
              title="Annulla"
              variant="outline"
              onPress={closeDeleteSheet}
              disabled={deleting}
              style={styles.sheetButton}
              testID="timbrature-delete-cancel-button"
            />
            <Button
              title="Conferma"
              variant="danger"
              onPress={confirmDelete}
              loading={deleting}
              style={styles.sheetButton}
              testID="timbrature-delete-confirm-button"
            />
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={Boolean(pendingOverwrite)}
        onClose={() => !uploading && setPendingOverwrite(null)}
        title="Report già presente"
        height="42%"
        testID="timbrature-upload-conflict-sheet"
        closeButtonTestID="timbrature-upload-conflict-close"
      >
        <View style={styles.deleteSheetContent}>
          <View style={styles.warningIconContainer}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
          </View>
          <Text style={styles.deleteSheetTitle}>Vuoi sovrascrivere il report esistente?</Text>
          <Text style={styles.deleteSheetText}>
            {pendingOverwrite
              ? `${pendingOverwrite.message} Periodo rilevato: ${MESI[pendingOverwrite.mese - 1]} ${pendingOverwrite.anno}.`
              : 'Esiste già un report timbrature per questo mese.'}
          </Text>
          <View style={styles.sheetButtons}>
            <Button
              title="Annulla"
              variant="outline"
              onPress={() => setPendingOverwrite(null)}
              disabled={uploading}
              style={styles.sheetButton}
              testID="timbrature-upload-conflict-cancel-button"
            />
            <Button
              title="Sovrascrivi"
              onPress={() => pendingOverwrite && uploadTimbraturePdf(pendingOverwrite.file, true)}
              loading={uploading}
              style={styles.sheetButton}
              testID="timbrature-upload-conflict-confirm-button"
            />
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showAddSheet}
        onClose={closeAddSheet}
        title={editingDate ? 'Modifica Timbratura' : 'Nuova Timbratura'}
        height="68%"
        testID="timbrature-add-sheet"
        closeButtonTestID="timbrature-add-sheet-close"
      >
        <Text style={styles.sheetHint}>
          {editingDate
            ? 'Aggiorna orari, note e reperibilità della giornata selezionata.'
            : 'Inserisci rapidamente una timbratura manuale per il giorno scelto.'}
        </Text>
        <DatePickerField
          label="Data"
          value={selectedDate}
          onChange={setSelectedDate}
          placeholder="Seleziona data"
          maximumDate={new Date()}
        />
        <TimePickerField
          label="Ora Entrata"
          value={oraEntrata}
          onChange={setOraEntrata}
          placeholder="Seleziona ora entrata"
        />
        <TimePickerField
          label="Ora Uscita"
          value={oraUscita}
          onChange={setOraUscita}
          placeholder="Seleziona ora uscita"
        />
        <InputField
          label="Note (opzionale)"
          value={note}
          onChangeText={setNote}
          placeholder="Eventuali note..."
          icon="document-text"
          multiline
        />
        
        {/* Reperibilità Toggle */}
        <View style={styles.reperibilitaToggle}>
          <View style={styles.reperibilitaLabel}>
            <Ionicons name="call" size={20} color={isReperibilita ? colors.warning : colors.textSecondary} />
            <Text style={styles.reperibilitaText}>Reperibilità</Text>
          </View>
          <Switch
            value={isReperibilita}
            onValueChange={setIsReperibilita}
            trackColor={{ false: colors.border, true: `${colors.warning}50` }}
            thumbColor={isReperibilita ? colors.warning : colors.surface}
          />
        </View>
        
        <View style={styles.sheetButtons}>
          <Button
            title="Annulla"
            variant="outline"
            onPress={closeAddSheet}
            style={styles.sheetButton}
            testID="timbrature-cancel-button"
          />
          <Button
            title="Salva"
            onPress={handleSave}
            loading={saving}
            style={styles.sheetButton}
            testID="timbrature-save-button"
          />
        </View>
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
    headerButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    uploadButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.secondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: colors.cardDark,
      borderRadius: 14,
      padding: 6,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: `${colors.primary}14`,
      borderWidth: 1,
      borderColor: `${colors.primary}30`,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.primary,
    },
    badge: {
      backgroundColor: colors.warning,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
      paddingHorizontal: 6,
    },
    badgeText: {
      color: colors.textWhite,
      fontSize: 11,
      fontWeight: '700',
    },
    summaryCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.surface,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    summarySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      marginBottom: 16,
    },
    summaryStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    summaryStat: {
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
    },
    summaryLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    alertBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${colors.warning}15`,
      padding: 12,
      borderRadius: 8,
      marginTop: 16,
    },
    alertText: {
      color: colors.warning,
      fontWeight: '600',
      marginLeft: 8,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },
    sectionHint: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    timbraturaCard: {
      marginBottom: 12,
    },
    discrepancyCard: {
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
    },
    timbraturaHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    timbraturaDate: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    timbraturaDay: {
      fontSize: 13,
      color: colors.textSecondary,
      textTransform: 'capitalize',
    },
    timbraturaHours: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timbraturaHoursValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
    },
    reperibilitaBadge: {
      marginLeft: 8,
      padding: 4,
      backgroundColor: `${colors.reperibilita}15`,
      borderRadius: 6,
    },
    warningBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${colors.warning}15`,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    warningText: {
      color: colors.warning,
      fontWeight: '600',
      fontSize: 13,
      marginLeft: 4,
    },
    timbraturaBody: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeSlot: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeValue: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginLeft: 8,
    },
    timeLine: {
      flex: 1,
      height: 2,
      backgroundColor: colors.border,
      marginHorizontal: 16,
      borderRadius: 1,
    },
    timbraturaNote: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 12,
      fontStyle: 'italic',
    },
    inlineActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    inlineActionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: `${colors.primary}10`,
    },
    inlineActionDanger: {
      backgroundColor: `${colors.error}10`,
    },
    inlineActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    inlineActionDangerText: {
      color: colors.error,
    },
    deleteSheetContent: {
      paddingBottom: 8,
    },
    deleteIconContainer: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: `${colors.error}12`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      alignSelf: 'center',
    },
    warningIconContainer: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: `${colors.warning}12`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      alignSelf: 'center',
    },
    deleteSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 10,
    },
    deleteSheetText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 8,
    },
    confrontoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    confrontoLabel: {
      width: 70,
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    confrontoValue: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
    },
    confrontoOre: {
      fontSize: 14,
      fontWeight: '600',
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
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 32,
    },
    sheetButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    sheetButton: {
      flex: 1,
    },
    monthSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 16,
      borderRadius: 14,
      marginBottom: 12,
    },
    monthNavButton: {
      padding: 8,
    },
    monthDisplay: {
      flex: 1,
      alignItems: 'center',
    },
    monthText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    reperibilitaToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.cardDark,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      borderRadius: 14,
      marginBottom: 16,
    },
    reperibilitaLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    reperibilitaText: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    sheetHint: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      marginBottom: 16,
    },
  });
