import React, { useEffect, useState, useCallback } from 'react';
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
import { COLORS } from '../../src/utils/colors';
import * as api from '../../src/services/api';
import { formatDate, getGiornoSettimana, getTodayString } from '../../src/utils/helpers';
import { Timbratura, WeeklySummary } from '../../src/types';

type TabType = 'personali' | 'aziendali' | 'confronto';

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

interface TimbraturaAziendale {
  id: string;
  data: string;
  ora_entrata: string | null;
  ora_uscita: string | null;
  ore_lavorate: number;
  descrizione: string | null;
}

export default function TimbraturaScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('personali');
  const [timbrature, setTimbrature] = useState<Timbratura[]>([]);
  const [timbratureAziendali, setTimbratureAziendali] = useState<TimbraturaAziendale[]>([]);
  const [confronto, setConfronto] = useState<ConfrontoItem[]>([]);
  const [confrontoRiepilogo, setConfrontoRiepilogo] = useState<any>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [oraEntrata, setOraEntrata] = useState('');
  const [oraUscita, setOraUscita] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [isReperibilita, setIsReperibilita] = useState(false);
  
  // Selettore mese/anno
  const now = new Date();
  const [meseSelezionato, setMeseSelezionato] = useState(now.getMonth() + 1);
  const [annoSelezionato, setAnnoSelezionato] = useState(now.getFullYear());
  
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  const loadData = useCallback(async () => {
    try {
      const [timbRes, weekRes] = await Promise.all([
        api.getTimbrature({ mese: meseSelezionato, anno: annoSelezionato }),
        api.getWeeklySummary(getTodayString()),
      ]);
      setTimbrature(timbRes.data);
      setWeeklySummary(weekRes.data);
      
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
        setConfrontoRiepilogo(confRes.data.riepilogo);
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleUploadPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      
      const file = result.assets[0];
      setUploading(true);
      
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: 'application/pdf',
      } as any);
      formData.append('mese', meseSelezionato.toString());
      formData.append('anno', annoSelezionato.toString());
      
      const response = await api.uploadTimbratureAziendali(meseSelezionato, annoSelezionato, formData);
      
      Alert.alert(
        'PDF Caricato',
        `File "${file.name}" caricato con successo.\n\n${response.data.timbrature_importate || 0} timbrature importate automaticamente.`,
        [{ text: 'OK', onPress: loadData }]
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Errore', 'Impossibile caricare il file PDF');
    } finally {
      setUploading(false);
    }
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
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (data: string) => {
    Alert.alert(
      'Conferma',
      'Vuoi eliminare questa timbratura?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteTimbratura(data);
              loadData();
            } catch {
              Alert.alert('Errore', 'Impossibile eliminare');
            }
          },
        },
      ]
    );
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
              <Ionicons name="call" size={12} color={COLORS.reperibilita} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.timbraturaBody}>
        <View style={styles.timeSlot}>
          <Ionicons name="log-in" size={16} color={COLORS.success} />
          <Text style={styles.timeValue}>{item.ora_entrata || '--:--'}</Text>
        </View>
        <View style={styles.timeLine} />
        <View style={styles.timeSlot}>
          <Ionicons name="log-out" size={16} color={COLORS.error} />
          <Text style={styles.timeValue}>{item.ora_uscita || '--:--'}</Text>
        </View>
      </View>
      {item.note && <Text style={styles.timbraturaNote}>{item.note}</Text>}
      <View style={styles.inlineActions}>
        <TouchableOpacity style={styles.inlineActionButton} onPress={() => editTimbratura(item)} activeOpacity={0.8}>
          <Ionicons name="create-outline" size={16} color={COLORS.primary} />
          <Text style={styles.inlineActionText}>Modifica</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.inlineActionButton, styles.inlineActionDanger]}
          onPress={() => handleDelete(item.data)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
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
          <Text style={[styles.timbraturaHoursValue, { color: COLORS.secondary }]}>{item.ore_lavorate.toFixed(1)}h</Text>
        </View>
      </View>
      <View style={styles.timbraturaBody}>
        <View style={styles.timeSlot}>
          <Ionicons name="log-in" size={16} color={COLORS.secondary} />
          <Text style={styles.timeValue}>{item.ora_entrata || '--:--'}</Text>
        </View>
        <View style={styles.timeLine} />
        <View style={styles.timeSlot}>
          <Ionicons name="log-out" size={16} color={COLORS.secondary} />
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
            <Ionicons name="warning" size={16} color={COLORS.warning} />
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
        <Text style={[styles.confrontoOre, { color: COLORS.primary }]}>{item.personale_ore.toFixed(1)}h</Text>
      </View>
      
      {/* Aziendale */}
      <View style={styles.confrontoRow}>
        <Text style={styles.confrontoLabel}>Azienda:</Text>
        <Text style={styles.confrontoValue}>
          {item.aziendale_entrata || '--:--'} - {item.aziendale_uscita || '--:--'}
        </Text>
        <Text style={[styles.confrontoOre, { color: COLORS.secondary }]}>{item.aziendale_ore.toFixed(1)}h</Text>
      </View>
      
      {item.aziendale_descrizione && (
        <Text style={styles.timbraturaNote}>{item.aziendale_descrizione}</Text>
      )}
    </Card>
  );

  const renderEmptyAziendali = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cloud-upload-outline" size={64} color={COLORS.border} />
      <Text style={styles.emptyText}>Nessuna timbratura aziendale</Text>
      <Text style={styles.emptySubtext}>Carica un PDF per importare i dati aziendali</Text>
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
        ? 'Importa il PDF del mese attivo per popolare le timbrature ufficiali.'
        : 'Controlla subito le discrepanze e confronta le ore tra dati personali e aziendali.';

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
            <Ionicons name="cloud-upload" size={22} color={COLORS.textWhite} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              resetForm();
              setShowAddSheet(true);
            }}
            testID="timbrature-add-button"
          >
            <Ionicons name="add" size={24} color={COLORS.textWhite} />
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
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
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
            color={meseSelezionato === (new Date().getMonth() + 1) && annoSelezionato === new Date().getFullYear() ? COLORS.border : COLORS.primary} 
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
          {confrontoRiepilogo?.giorni_con_discrepanza > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{confrontoRiepilogo.giorni_con_discrepanza}</Text>
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
                  <Text style={[styles.summaryValue, { color: COLORS.success }]}>
                    {weeklySummary.ore_ordinarie.toFixed(1)}
                  </Text>
                  <Text style={styles.summaryLabel}>Ordinarie</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryValue, { color: COLORS.overtime }]}>
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="time-outline" size={64} color={COLORS.border} />
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
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
                  <Text style={[styles.summaryValue, { color: COLORS.secondary }]}>
                    {confrontoRiepilogo.ore_aziendali_totali?.toFixed(1) || '0.0'}
                  </Text>
                  <Text style={styles.summaryLabel}>Ore Azienda</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[
                    styles.summaryValue,
                    { color: confrontoRiepilogo.differenza_ore_totale > 0 ? COLORS.success : confrontoRiepilogo.differenza_ore_totale < 0 ? COLORS.error : COLORS.text }
                  ]}>
                    {confrontoRiepilogo.differenza_ore_totale > 0 ? '+' : ''}{confrontoRiepilogo.differenza_ore_totale?.toFixed(1) || '0.0'}
                  </Text>
                  <Text style={styles.summaryLabel}>Differenza</Text>
                </View>
              </View>
              {confrontoRiepilogo.giorni_con_discrepanza > 0 && (
                <View style={styles.alertBox}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
                  <Text style={styles.alertText}>
                    {confrontoRiepilogo.giorni_con_discrepanza} giorni con discrepanze
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="git-compare-outline" size={64} color={COLORS.border} />
                <Text style={styles.emptyText}>Nessun confronto disponibile</Text>
                <Text style={styles.emptySubtext}>Carica le timbrature aziendali per confrontarle</Text>
              </View>
            }
          />
        </>
      )}

      {/* Add/Edit Sheet */}
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
            <Ionicons name="call" size={20} color={isReperibilita ? COLORS.warning : COLORS.textSecondary} />
            <Text style={styles.reperibilitaText}>Reperibilità</Text>
          </View>
          <Switch
            value={isReperibilita}
            onValueChange={setIsReperibilita}
            trackColor={{ false: COLORS.border, true: `${COLORS.warning}50` }}
            thumbColor={isReperibilita ? COLORS.warning : COLORS.surface}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.text,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: COLORS.cardDark,
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
    backgroundColor: `${COLORS.primary}14`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  badge: {
    backgroundColor: COLORS.warning,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.surface,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  summarySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
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
    color: COLORS.primary,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.warning}15`,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  alertText: {
    color: COLORS.warning,
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
    color: COLORS.textSecondary,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  timbraturaCard: {
    marginBottom: 12,
  },
  discrepancyCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
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
    color: COLORS.text,
  },
  timbraturaDay: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  timbraturaHours: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timbraturaHoursValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  reperibilitaBadge: {
    marginLeft: 8,
    padding: 4,
    backgroundColor: `${COLORS.reperibilita}15`,
    borderRadius: 6,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.warning}15`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  warningText: {
    color: COLORS.warning,
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
    color: COLORS.text,
    marginLeft: 8,
  },
  timeLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
    borderRadius: 1,
  },
  timbraturaNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
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
    backgroundColor: `${COLORS.primary}10`,
  },
  inlineActionDanger: {
    backgroundColor: `${COLORS.error}10`,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  inlineActionDangerText: {
    color: COLORS.error,
  },
  confrontoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  confrontoLabel: {
    width: 70,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  confrontoValue: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
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
    color: COLORS.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
  // Month Selector styles
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.text,
  },
  // Reperibilità toggle
  reperibilitaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardDark,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.text,
    fontWeight: '500',
  },
  sheetHint: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
});
