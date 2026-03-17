import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, BottomSheet, InputField, DatePickerField, TimePickerField } from '../../src/components';
import { COLORS } from '../../src/utils/colors';
import { useAppStore, THEMES, ThemeKey, getThemeColors } from '../../src/store/appStore';
import * as api from '../../src/services/api';
import { formatCurrency, formatDate, getMesiItaliano, getTodayString } from '../../src/utils/helpers';
import { Alert as AlertType, ChatMessage, Reperibilita, Timbratura } from '../../src/types';

type TabType = 'menu' | 'chat' | 'alerts' | 'stats' | 'reperibilita' | 'settings';
type StatsZoom = 'giorno' | 'settimana' | 'mese' | 'anno' | 'tutti';

export default function AltroScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('menu');
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const { chatSessionId, setChatSessionId, theme, setTheme } = useAppStore();
  const chatScrollRef = useRef<FlatList>(null);
  
  // Alerts state
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  
  // Reperibilità state
  const [reperibilita, setReperibilita] = useState<Reperibilita[]>([]);
  const [showRepSheet, setShowRepSheet] = useState(false);
  const [repData, setRepData] = useState(getTodayString());
  const [repOraInizio, setRepOraInizio] = useState('');
  const [repOraFine, setRepOraFine] = useState('');
  const [repTipo, setRepTipo] = useState<'passiva' | 'attiva'>('passiva');
  const [repInterventi, setRepInterventi] = useState('0');
  const [savingRep, setSavingRep] = useState(false);
  
  // Stats state
  const [statsData, setStatsData] = useState<any[]>([]);
  const [statsZoom, setStatsZoom] = useState<StatsZoom>('mese');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [dailyStats, setDailyStats] = useState<Timbratura[]>([]);
  const [allYearsStats, setAllYearsStats] = useState<any[]>([]);
  
  // Settings state
  const { dashboard } = useAppStore();
  const [showPinSheet, setShowPinSheet] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [newPin, setNewPin] = useState('');
  
  // Edit settings state
  const [editNome, setEditNome] = useState('');
  const [editQualifica, setEditQualifica] = useState('');
  const [editLivello, setEditLivello] = useState('');
  const [editAzienda, setEditAzienda] = useState('');
  const [editPagaBase, setEditPagaBase] = useState('');
  const [editSuperminimo, setEditSuperminimo] = useState('');
  const [editScatti, setEditScatti] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const themeColors = getThemeColors(theme);

  const loadChatHistory = useCallback(async () => {
    try {
      const response = await api.getChatHistory(50);
      setMessages(response.data);
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await api.getAlerts();
      setAlerts(response.data);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  }, []);

  const loadReperibilita = useCallback(async () => {
    try {
      const response = await api.getReperibilita();
      setReperibilita(response.data);
    } catch (error) {
      console.error('Error loading reperibilita:', error);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await api.getStatisticheMensili(selectedYear);
      setStatsData(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [selectedYear]);

  const loadDailyStats = useCallback(async () => {
    try {
      const response = await api.getTimbrature({ mese: selectedMonth, anno: selectedYear });
      setDailyStats(response.data);
    } catch (error) {
      console.error('Error loading daily stats:', error);
    }
  }, [selectedMonth, selectedYear]);

  const loadAllYearsStats = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const yearsData = [];
      for (let year = currentYear; year >= currentYear - 4; year--) {
        try {
          const response = await api.getStatisticheMensili(year);
          const yearTotal = response.data.reduce((sum: number, m: any) => sum + m.ore_lavorate, 0);
          const yearOvertime = response.data.reduce((sum: number, m: any) => sum + m.ore_straordinarie, 0);
          const yearNetto = response.data.reduce((sum: number, m: any) => sum + (m.netto || 0), 0);
          yearsData.push({
            anno: year,
            ore_totali: yearTotal,
            ore_straordinarie: yearOvertime,
            netto_totale: yearNetto,
          });
        } catch {}
      }
      setAllYearsStats(yearsData);
    } catch (error) {
      console.error('Error loading all years stats:', error);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'chat') loadChatHistory();
    else if (activeTab === 'alerts') loadAlerts();
    else if (activeTab === 'reperibilita') loadReperibilita();
    else if (activeTab === 'stats') loadStats();
  }, [activeTab, loadAlerts, loadChatHistory, loadReperibilita, loadStats]);

  useEffect(() => {
    if (activeTab === 'stats') {
      if (statsZoom === 'giorno') loadDailyStats();
      else if (statsZoom === 'tutti') loadAllYearsStats();
      else loadStats();
    }
  }, [activeTab, loadAllYearsStats, loadDailyStats, loadStats, selectedMonth, selectedYear, statsZoom]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setChatLoading(true);
    
    try {
      const response = await api.sendChatMessage(inputText, chatSessionId || undefined);
      if (response.data.session_id) setChatSessionId(response.data.session_id);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore nella chat');
    } finally {
      setChatLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const clearChat = () => {
    Alert.alert('Conferma', 'Vuoi cancellare la cronologia chat?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Cancella',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.clearChatHistory();
            setMessages([]);
            setChatSessionId(null);
          } catch {
            Alert.alert('Errore', 'Impossibile cancellare');
          }
        },
      },
    ]);
  };

  const saveReperibilita = async () => {
    if (!repData || !repOraInizio || !repOraFine) {
      Alert.alert('Errore', 'Compila tutti i campi');
      return;
    }
    
    setSavingRep(true);
    try {
      await api.createReperibilita({
        data: repData,
        ora_inizio: repOraInizio,
        ora_fine: repOraFine,
        tipo: repTipo,
        interventi: parseInt(repInterventi) || 0,
      });
      
      setShowRepSheet(false);
      setRepData(getTodayString());
      setRepOraInizio('');
      setRepOraFine('');
      setRepTipo('passiva');
      setRepInterventi('0');
      loadReperibilita();
      Alert.alert('Successo', 'Reperibilità salvata');
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore nel salvataggio');
    } finally {
      setSavingRep(false);
    }
  };

  const openEditSettings = () => {
    setEditNome(dashboard?.settings?.nome || '');
    setEditQualifica(dashboard?.settings?.qualifica || '');
    setEditLivello(dashboard?.settings?.livello?.toString() || '');
    setEditAzienda(dashboard?.settings?.azienda || '');
    setEditPagaBase(dashboard?.settings?.paga_base?.toString() || '');
    setEditSuperminimo(dashboard?.settings?.superminimo?.toString() || '');
    setEditScatti(dashboard?.settings?.scatti_anzianita?.toString() || '');
    setShowEditSheet(true);
  };

  const saveSettings = () => {
    Alert.alert(
      'Conferma Modifica',
      'Sei sicuro di voler salvare le modifiche ai dati contrattuali?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          onPress: async () => {
            setSavingSettings(true);
            try {
              await api.updateSettings({
                nome: editNome,
                qualifica: editQualifica,
                livello: parseInt(editLivello) || undefined,
                azienda: editAzienda,
                paga_base: parseFloat(editPagaBase) || undefined,
                superminimo: parseFloat(editSuperminimo) || undefined,
                scatti_anzianita: parseFloat(editScatti) || undefined,
              });
              setShowEditSheet(false);
              Alert.alert('Successo', 'Dati aggiornati correttamente');
            } catch {
              Alert.alert('Errore', 'Impossibile salvare le modifiche');
            } finally {
              setSavingSettings(false);
            }
          },
        },
      ]
    );
  };

  const handleBack = () => setActiveTab('menu');

  const renderMenu = () => (
    <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.menuGrid}>
        <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab('chat')}>
          <View style={[styles.menuIcon, { backgroundColor: `${themeColors.primary}15` }]}>
            <Ionicons name="chatbubble-ellipses" size={28} color={themeColors.primary} />
          </View>
          <Text style={styles.menuLabel}>Assistente AI</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab('alerts')}>
          <View style={[styles.menuIcon, { backgroundColor: `${COLORS.warning}15` }]}>
            <Ionicons name="notifications" size={28} color={COLORS.warning} />
          </View>
          <Text style={styles.menuLabel}>Avvisi</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab('stats')}>
          <View style={[styles.menuIcon, { backgroundColor: `${COLORS.success}15` }]}>
            <Ionicons name="stats-chart" size={28} color={COLORS.success} />
          </View>
          <Text style={styles.menuLabel}>Statistiche</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab('reperibilita')}>
          <View style={[styles.menuIcon, { backgroundColor: `${COLORS.reperibilita}15` }]}>
            <Ionicons name="call" size={28} color={COLORS.reperibilita} />
          </View>
          <Text style={styles.menuLabel}>Reperibilità</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab('settings')}>
          <View style={[styles.menuIcon, { backgroundColor: `${COLORS.textSecondary}15` }]}>
            <Ionicons name="settings" size={28} color={COLORS.textSecondary} />
          </View>
          <Text style={styles.menuLabel}>Impostazioni</Text>
        </TouchableOpacity>
      </View>

      <Card style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: themeColors.primary }]}>
            <Text style={styles.profileInitials}>
              {dashboard?.settings?.nome?.split(' ').map(n => n[0]).join('') || 'ZM'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{dashboard?.settings?.nome || 'Zambara Marco'}</Text>
            <Text style={styles.profileRole}>
              {dashboard?.settings?.qualifica || 'Operaio'} - Livello {dashboard?.settings?.livello || 5}
            </Text>
            <Text style={styles.profileCompany}>{dashboard?.settings?.azienda || 'Plastiape SpA'}</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );

  const renderChat = () => (
    <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100}>
      <FlatList
        ref={chatScrollRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatMessages}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.chatEmpty}>
            <Ionicons name="chatbubbles-outline" size={64} color={COLORS.border} />
            <Text style={styles.chatEmptyText}>Ciao! Come posso aiutarti?</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.chatBubble, item.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
            <Text style={[styles.chatBubbleText, item.role === 'user' ? styles.chatBubbleTextUser : styles.chatBubbleTextAssistant]}>
              {item.content}
            </Text>
          </View>
        )}
      />
      
      {chatLoading && <View style={styles.chatTyping}><Text style={styles.chatTypingText}>{"L'assistente sta scrivendo..."}</Text></View>}
      
      <View style={styles.chatInputContainer}>
        <TextInput
          style={styles.chatInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Scrivi un messaggio..."
          placeholderTextColor={COLORS.textLight}
          multiline
        />
        <TouchableOpacity style={[styles.chatSendButton, { backgroundColor: themeColors.primary }]} onPress={sendMessage}>
          <Ionicons name="send" size={20} color={COLORS.textWhite} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  const renderStats = () => (
    <ScrollView style={styles.statsContainer} showsVerticalScrollIndicator={false}>
      <Card style={styles.zoomCard}>
        <Text style={styles.zoomTitle}>Livello di dettaglio</Text>
        <View style={styles.zoomButtons}>
          {(['giorno', 'settimana', 'mese', 'anno', 'tutti'] as StatsZoom[]).map((zoom) => (
            <TouchableOpacity
              key={zoom}
              style={[styles.zoomButton, statsZoom === zoom && { backgroundColor: themeColors.primary }]}
              onPress={() => setStatsZoom(zoom)}
            >
              <Text style={[styles.zoomButtonText, statsZoom === zoom && styles.zoomButtonTextActive]}>
                {zoom === 'giorno' ? 'Giorno' : zoom === 'settimana' ? 'Sett.' : zoom === 'mese' ? 'Mese' : zoom === 'anno' ? 'Anno' : 'Tutti'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {(statsZoom === 'giorno' || statsZoom === 'mese' || statsZoom === 'anno') && (
          <View style={styles.periodSelector}>
            <TouchableOpacity onPress={() => setSelectedYear(prev => prev - 1)}>
              <Ionicons name="chevron-back" size={24} color={themeColors.primary} />
            </TouchableOpacity>
            <Text style={styles.periodText}>{selectedYear}</Text>
            <TouchableOpacity onPress={() => setSelectedYear(prev => Math.min(prev + 1, new Date().getFullYear()))}>
              <Ionicons name="chevron-forward" size={24} color={themeColors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {statsZoom === 'giorno' && (
          <View style={styles.periodSelector}>
            <TouchableOpacity onPress={() => setSelectedMonth(prev => prev === 1 ? 12 : prev - 1)}>
              <Ionicons name="chevron-back" size={24} color={themeColors.primary} />
            </TouchableOpacity>
            <Text style={styles.periodText}>{getMesiItaliano(selectedMonth)}</Text>
            <TouchableOpacity onPress={() => setSelectedMonth(prev => prev === 12 ? 1 : prev + 1)}>
              <Ionicons name="chevron-forward" size={24} color={themeColors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </Card>

      {statsZoom === 'giorno' && (
        <Card title={`${getMesiItaliano(selectedMonth)} ${selectedYear}`}>
          <View style={styles.dailyStatsGrid}>
            {dailyStats.map((day, i) => (
              <View key={i} style={styles.dailyStatItem}>
                <Text style={styles.dailyStatDate}>{formatDate(day.data, 'dd')}</Text>
                <Text style={[styles.dailyStatHours, { color: themeColors.primary }]}>{day.ore_arrotondate.toFixed(1)}h</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {(statsZoom === 'mese' || statsZoom === 'settimana') && (
        <Card title={`Riepilogo ${selectedYear}`}>
          <View style={styles.statsGrid}>
            {statsData.map((stat, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={styles.statMonth}>{getMesiItaliano(stat.mese).substring(0, 3)}</Text>
                <Text style={[styles.statHours, { color: themeColors.primary }]}>{stat.ore_lavorate}h</Text>
                <Text style={styles.statOvertime}>+{stat.ore_straordinarie}h</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {statsZoom === 'anno' && (
        <Card title={`Totali ${selectedYear}`}>
          <View style={styles.totalsGrid}>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>Ore Totali</Text>
              <Text style={[styles.totalValue, { color: themeColors.primary }]}>{statsData.reduce((s, m) => s + m.ore_lavorate, 0).toFixed(1)}h</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>Straordinari</Text>
              <Text style={[styles.totalValue, { color: COLORS.overtime }]}>{statsData.reduce((s, m) => s + m.ore_straordinarie, 0).toFixed(1)}h</Text>
            </View>
          </View>
        </Card>
      )}

      {statsZoom === 'tutti' && (
        <Card title="Storico Annuale">
          {allYearsStats.map((year, i) => (
            <TouchableOpacity key={i} style={styles.yearCard} onPress={() => { setSelectedYear(year.anno); setStatsZoom('anno'); }}>
              <Text style={[styles.yearTitle, { color: themeColors.primary }]}>{year.anno}</Text>
              <Text style={styles.yearHours}>{year.ore_totali.toFixed(0)}h totali</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </ScrollView>
  );

  const renderReperibilita = () => (
    <View style={styles.repContainer}>
      <FlatList
        data={reperibilita}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.repList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="call-outline" size={64} color={COLORS.border} />
            <Text style={styles.emptyText}>Nessuna reperibilità</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.repCard}>
            <View style={styles.repHeader}>
              <View style={[styles.repTypeBadge, { backgroundColor: item.tipo === 'attiva' ? `${COLORS.error}15` : `${COLORS.reperibilita}15` }]}>
                <Text style={[styles.repTypeText, { color: item.tipo === 'attiva' ? COLORS.error : COLORS.reperibilita }]}>
                  {item.tipo === 'attiva' ? 'ATTIVA' : 'PASSIVA'}
                </Text>
              </View>
              <Text style={styles.repCompenso}>{formatCurrency(item.compenso_calcolato)}</Text>
            </View>
            <Text style={styles.repDate}>{formatDate(item.data)}</Text>
            <Text style={styles.repTime}>{item.ora_inizio} - {item.ora_fine}</Text>
          </Card>
        )}
      />
      
      <TouchableOpacity style={[styles.fabButton, { backgroundColor: themeColors.primary }]} onPress={() => setShowRepSheet(true)}>
        <Ionicons name="add" size={28} color={COLORS.textWhite} />
      </TouchableOpacity>

      <BottomSheet visible={showRepSheet} onClose={() => setShowRepSheet(false)} title="Nuova Reperibilità" height="70%">
        <DatePickerField label="Data" value={repData} onChange={setRepData} />
        <TimePickerField label="Ora Inizio" value={repOraInizio} onChange={setRepOraInizio} />
        <TimePickerField label="Ora Fine" value={repOraFine} onChange={setRepOraFine} />
        
        <View style={styles.tipoToggle}>
          <TouchableOpacity style={[styles.tipoOption, repTipo === 'passiva' && { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}10` }]} onPress={() => setRepTipo('passiva')}>
            <Text style={[styles.tipoOptionText, repTipo === 'passiva' && { color: themeColors.primary }]}>Passiva (€4/h)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tipoOption, repTipo === 'attiva' && { borderColor: themeColors.primary, backgroundColor: `${themeColors.primary}10` }]} onPress={() => setRepTipo('attiva')}>
            <Text style={[styles.tipoOptionText, repTipo === 'attiva' && { color: themeColors.primary }]}>Attiva (€100/int)</Text>
          </TouchableOpacity>
        </View>
        
        {repTipo === 'attiva' && <InputField label="Interventi" value={repInterventi} onChangeText={setRepInterventi} keyboardType="numeric" />}

        <View style={styles.sheetButtons}>
          <Button title="Annulla" variant="outline" onPress={() => setShowRepSheet(false)} style={styles.sheetButton} />
          <Button title="Salva" onPress={saveReperibilita} loading={savingRep} style={styles.sheetButton} />
        </View>
      </BottomSheet>
    </View>
  );

  const renderSettings = () => (
    <ScrollView style={styles.settingsContainer} showsVerticalScrollIndicator={false}>
      <Card>
        <TouchableOpacity style={styles.settingItem} onPress={() => setShowThemeSheet(true)}>
          <Ionicons name="color-palette" size={22} color={themeColors.primary} />
          <Text style={styles.settingText}>Tema Colore</Text>
          <View style={[styles.themePreview, { backgroundColor: themeColors.primary }]} />
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.settingItem} onPress={() => setShowPinSheet(true)}>
          <Ionicons name="lock-closed" size={22} color={themeColors.primary} />
          <Text style={styles.settingText}>Cambia PIN</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Dati Contrattuali</Text>
          <TouchableOpacity style={styles.editButton} onPress={openEditSettings}>
            <Ionicons name="pencil" size={20} color={themeColors.primary} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Nome</Text><Text style={styles.infoValue}>{dashboard?.settings?.nome || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Qualifica</Text><Text style={styles.infoValue}>{dashboard?.settings?.qualifica || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Livello</Text><Text style={styles.infoValue}>{dashboard?.settings?.livello || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Azienda</Text><Text style={styles.infoValue}>{dashboard?.settings?.azienda || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>CCNL</Text><Text style={styles.infoValue}>{dashboard?.settings?.ccnl || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Data Assunzione</Text><Text style={styles.infoValue}>{formatDate(dashboard?.settings?.data_assunzione || '')}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Paga Base</Text><Text style={styles.infoValue}>{formatCurrency(dashboard?.settings?.paga_base || 0)}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Superminimo</Text><Text style={styles.infoValue}>{formatCurrency(dashboard?.settings?.superminimo || 0)}</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Scatti Anzianità</Text><Text style={styles.infoValue}>{formatCurrency(dashboard?.settings?.scatti_anzianita || 0)}</Text></View>
      </Card>

      {/* Theme Sheet */}
      <BottomSheet visible={showThemeSheet} onClose={() => setShowThemeSheet(false)} title="Scegli Tema" height="50%">
        <View style={styles.themeGrid}>
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.themeItem, theme === key && styles.themeItemSelected]}
              onPress={() => { setTheme(key); setShowThemeSheet(false); }}
            >
              <View style={[styles.themeCircle, { backgroundColor: THEMES[key].primary }]} />
              <Text style={styles.themeName}>{THEMES[key].name}</Text>
              {theme === key && <Ionicons name="checkmark-circle" size={20} color={THEMES[key].primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* PIN Sheet */}
      <BottomSheet visible={showPinSheet} onClose={() => setShowPinSheet(false)} title="Nuovo PIN" height="40%">
        <InputField label="Nuovo PIN" value={newPin} onChangeText={setNewPin} keyboardType="numeric" secureTextEntry />
        <View style={styles.sheetButtons}>
          <Button title="Annulla" variant="outline" onPress={() => setShowPinSheet(false)} style={styles.sheetButton} />
          <Button title="Salva" onPress={async () => {
            if (newPin.length >= 4) {
              await api.updateSettings({ pin_hash: newPin });
              setShowPinSheet(false);
              setNewPin('');
              Alert.alert('Successo', 'PIN aggiornato');
            }
          }} style={styles.sheetButton} />
        </View>
      </BottomSheet>

      {/* Edit Settings Sheet */}
      <BottomSheet visible={showEditSheet} onClose={() => setShowEditSheet(false)} title="Modifica Dati" height="85%">
        <InputField label="Nome" value={editNome} onChangeText={setEditNome} />
        <InputField label="Qualifica" value={editQualifica} onChangeText={setEditQualifica} />
        <InputField label="Livello" value={editLivello} onChangeText={setEditLivello} keyboardType="numeric" />
        <InputField label="Azienda" value={editAzienda} onChangeText={setEditAzienda} />
        <InputField label="Paga Base (€)" value={editPagaBase} onChangeText={setEditPagaBase} keyboardType="decimal-pad" />
        <InputField label="Superminimo (€)" value={editSuperminimo} onChangeText={setEditSuperminimo} keyboardType="decimal-pad" />
        <InputField label="Scatti Anzianità (€)" value={editScatti} onChangeText={setEditScatti} keyboardType="decimal-pad" />
        <View style={styles.sheetButtons}>
          <Button title="Annulla" variant="outline" onPress={() => setShowEditSheet(false)} style={styles.sheetButton} />
          <Button title="Salva" onPress={saveSettings} loading={savingSettings} style={styles.sheetButton} />
        </View>
      </BottomSheet>
    </ScrollView>
  );

  const renderAlerts = () => (
    <FlatList
      data={alerts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.alertsList}
      ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="notifications-off-outline" size={64} color={COLORS.border} /><Text style={styles.emptyText}>Nessun avviso</Text></View>}
      renderItem={({ item }) => (
        <Card style={[styles.alertCard, !item.letto && styles.alertCardUnread]}>
          <View style={styles.alertHeader}>
            <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
            <Text style={styles.alertTitle}>{item.titolo}</Text>
          </View>
          <Text style={styles.alertMessage}>{item.messaggio}</Text>
        </Card>
      )}
    />
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'chat': return renderChat();
      case 'alerts': return renderAlerts();
      case 'stats': return renderStats();
      case 'reperibilita': return renderReperibilita();
      case 'settings': return renderSettings();
      default: return renderMenu();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {activeTab !== 'menu' && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>
          {activeTab === 'menu' ? 'Altro' : activeTab === 'chat' ? 'Assistente AI' : activeTab === 'alerts' ? 'Avvisi' : activeTab === 'stats' ? 'Statistiche' : activeTab === 'reperibilita' ? 'Reperibilità' : 'Impostazioni'}
        </Text>
        {activeTab === 'chat' && messages.length > 0 && (
          <TouchableOpacity onPress={clearChat}><Ionicons name="trash-outline" size={22} color={COLORS.error} /></TouchableOpacity>
        )}
      </View>
      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  title: { flex: 1, fontSize: 28, fontWeight: '700', color: COLORS.text },
  menuContainer: { flex: 1, paddingHorizontal: 16 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  menuItem: { width: '28%', alignItems: 'center' },
  menuIcon: { width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuLabel: { fontSize: 12, color: COLORS.text, textAlign: 'center' },
  profileCard: { marginBottom: 20 },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  profileInitials: { fontSize: 20, fontWeight: '700', color: COLORS.textWhite },
  profileInfo: { flex: 1, marginLeft: 16 },
  profileName: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  profileRole: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  profileCompany: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  chatContainer: { flex: 1 },
  chatMessages: { paddingHorizontal: 16, paddingBottom: 16 },
  chatEmpty: { alignItems: 'center', paddingVertical: 60 },
  chatEmptyText: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginTop: 16 },
  chatBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginVertical: 4 },
  chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  chatBubbleAssistant: { alignSelf: 'flex-start', backgroundColor: COLORS.card, borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: 15, lineHeight: 22 },
  chatBubbleTextUser: { color: COLORS.textWhite },
  chatBubbleTextAssistant: { color: COLORS.text },
  chatTyping: { paddingHorizontal: 16, paddingVertical: 8 },
  chatTypingText: { fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' },
  chatInputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border },
  chatInput: { flex: 1, backgroundColor: COLORS.cardDark, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: COLORS.text, maxHeight: 100 },
  chatSendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  statsContainer: { flex: 1, paddingHorizontal: 16 },
  zoomCard: { marginBottom: 16 },
  zoomTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  zoomButtons: { flexDirection: 'row', gap: 8 },
  zoomButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.cardDark, alignItems: 'center' },
  zoomButtonText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  zoomButtonTextActive: { color: COLORS.textWhite },
  periodSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  periodText: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginHorizontal: 20 },
  dailyStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dailyStatItem: { width: '18%', alignItems: 'center', padding: 8, backgroundColor: COLORS.cardDark, borderRadius: 8 },
  dailyStatDate: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  dailyStatHours: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statItem: { width: '25%', alignItems: 'center', paddingVertical: 8 },
  statMonth: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  statHours: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  statOvertime: { fontSize: 11, color: COLORS.overtime },
  totalsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  totalItem: { alignItems: 'center' },
  totalLabel: { fontSize: 12, color: COLORS.textSecondary },
  totalValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  yearCard: { backgroundColor: COLORS.cardDark, padding: 16, borderRadius: 12, marginBottom: 12 },
  yearTitle: { fontSize: 20, fontWeight: '700' },
  yearHours: { fontSize: 16, color: COLORS.text, marginTop: 4 },
  repContainer: { flex: 1 },
  repList: { paddingHorizontal: 16, paddingBottom: 100 },
  repCard: { marginBottom: 12 },
  repHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  repTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  repTypeText: { fontSize: 11, fontWeight: '700' },
  repCompenso: { fontSize: 18, fontWeight: '700', color: COLORS.success },
  repDate: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  repTime: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  fabButton: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  tipoToggle: { flexDirection: 'row', marginBottom: 16, gap: 12 },
  tipoOption: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center' },
  tipoOptionText: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  settingsContainer: { flex: 1, paddingHorizontal: 16 },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingText: { flex: 1, fontSize: 16, color: COLORS.text, marginLeft: 12 },
  themePreview: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  editButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.cardDark, justifyContent: 'center', alignItems: 'center' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { fontSize: 14, color: COLORS.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '500', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeItem: { width: '30%', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border },
  themeItemSelected: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}10` },
  themeCircle: { width: 40, height: 40, borderRadius: 20, marginBottom: 8 },
  themeName: { fontSize: 12, color: COLORS.text },
  alertsList: { paddingHorizontal: 16, paddingBottom: 100 },
  alertCard: { marginBottom: 12 },
  alertCardUnread: { borderLeftWidth: 3, borderLeftColor: COLORS.warning },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  alertTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.text, marginLeft: 10 },
  alertMessage: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 16 },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  sheetButton: { flex: 1 },
});
