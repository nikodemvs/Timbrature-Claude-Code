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
import * as DocumentPicker from 'expo-document-picker';
import { Card, Button, BottomSheet, InputField, LoadingScreen } from '../../src/components';
import * as api from '../../src/services/api';
import { formatCurrency, getMesiItaliano, getCurrentMonthYear } from '../../src/utils/helpers';
import { BustaPaga } from '../../src/types';
import { useAppTheme } from '../../src/hooks/useAppTheme';

export default function BustePagaScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [bustePaga, setBustePaga] = useState<BustaPaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedBusta, setSelectedBusta] = useState<BustaPaga | null>(null);
  
  // Form state
  const { mese: currentMese, anno: currentAnno } = getCurrentMonthYear();
  const [mese, setMese] = useState(currentMese.toString());
  const [anno, setAnno] = useState(currentAnno.toString());
  const [lordo, setLordo] = useState('');
  const [netto, setNetto] = useState('');
  const [straordinariOre, setStraordinariOre] = useState('');
  const [straordinariImporto, setStraordinariImporto] = useState('');
  const [trattenuteTotali, setTrattenuteTotali] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const response = await api.getBustePaga();
      setBustePaga(response.data);
    } catch (error) {
      console.error('Error loading buste paga:', error);
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

  const handleSave = async () => {
    if (!mese || !anno) {
      Alert.alert('Errore', 'Inserisci mese e anno');
      return;
    }

    const parsedMese = parseInt(mese, 10);
    const parsedAnno = parseInt(anno, 10);
    if (!parsedMese || parsedMese < 1 || parsedMese > 12 || !parsedAnno) {
      Alert.alert('Errore', 'Inserisci un periodo valido');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        mese: parsedMese,
        anno: parsedAnno,
        lordo: lordo ? parseFloat(lordo) : undefined,
        netto: netto ? parseFloat(netto) : undefined,
        straordinari_ore: straordinariOre ? parseFloat(straordinariOre) : undefined,
        straordinari_importo: straordinariImporto ? parseFloat(straordinariImporto) : undefined,
        trattenute_totali: trattenuteTotali ? parseFloat(trattenuteTotali) : undefined,
      };
      const existing = bustePaga.find(b => b.mese === parsedMese && b.anno === parsedAnno);
      
      if (existing) {
        await api.updateBustaPaga(parsedAnno, parsedMese, payload);
      } else {
        await api.createBustaPaga(payload);
      }
      
      setShowAddSheet(false);
      resetForm();
      loadData();
      Alert.alert('Successo', 'Busta paga salvata');
    } catch (error: any) {
      Alert.alert('Errore', error.response?.data?.detail || 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      setUploading(true);

      // Create form data
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: 'application/pdf',
      } as any);

      await api.uploadBustaPaga(parseInt(anno), parseInt(mese), formData);
      
      Alert.alert('Successo', 'PDF caricato');
      loadData();
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Errore', 'Impossibile caricare il PDF');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setMese(currentMese.toString());
    setAnno(currentAnno.toString());
    setLordo('');
    setNetto('');
    setStraordinariOre('');
    setStraordinariImporto('');
    setTrattenuteTotali('');
  };

  const viewDetail = (busta: BustaPaga) => {
    setSelectedBusta(busta);
    setShowDetailSheet(true);
  };

  const editBusta = (busta: BustaPaga) => {
    setMese(busta.mese.toString());
    setAnno(busta.anno.toString());
    setLordo(busta.lordo?.toString() || '');
    setNetto(busta.netto?.toString() || '');
    setStraordinariOre(busta.straordinari_ore?.toString() || '');
    setStraordinariImporto(busta.straordinari_importo?.toString() || '');
    setTrattenuteTotali(busta.trattenute_totali?.toString() || '');
    setShowDetailSheet(false);
    setShowAddSheet(true);
  };

  if (loading) {
    return <LoadingScreen message="Caricamento buste paga..." />;
  }

  const renderBustaPaga = ({ item }: { item: BustaPaga }) => (
    <TouchableOpacity onPress={() => viewDetail(item)}>
      <Card style={styles.bustaCard}>
        <View style={styles.bustaHeader}>
          <View style={styles.bustaIconContainer}>
            <Ionicons name="document-text" size={24} color={colors.primary} />
          </View>
          <View style={styles.bustaInfo}>
            <Text style={styles.bustaPeriodo}>
              {getMesiItaliano(item.mese)} {item.anno}
            </Text>
            {item.pdf_nome && (
              <View style={styles.pdfBadge}>
                <Ionicons name="attach" size={12} color={colors.primary} />
                <Text style={styles.pdfText}>PDF allegato</Text>
              </View>
            )}
          </View>
          <View style={styles.bustaAmounts}>
            <Text style={styles.bustaNetto}>{formatCurrency(item.netto || 0)}</Text>
            <Text style={styles.bustaLordo}>Lordo: {formatCurrency(item.lordo || 0)}</Text>
          </View>
        </View>
        
        {item.has_discrepancy && (
          <View style={styles.discrepancyBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.discrepancyText}>
              Differenza: {formatCurrency(item.differenza)}
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Buste Paga</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowAddSheet(true);
          }}
        >
          <Ionicons name="add" size={24} color={colors.textWhite} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={bustePaga}
        keyExtractor={(item) => item.id}
        renderItem={renderBustaPaga}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={colors.border} />
            <Text style={styles.emptyText}>Nessuna busta paga</Text>
            <Text style={styles.emptySubtext}>Aggiungi la tua prima busta paga</Text>
          </View>
        }
      />

      {/* Add/Edit Sheet */}
      <BottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        title="Busta Paga"
        height="85%"
      >
        <View style={styles.periodRow}>
          <InputField
            label="Mese"
            value={mese}
            onChangeText={setMese}
            placeholder="1-12"
            keyboardType="numeric"
            style={styles.halfInput}
          />
          <InputField
            label="Anno"
            value={anno}
            onChangeText={setAnno}
            placeholder="2025"
            keyboardType="numeric"
            style={styles.halfInput}
          />
        </View>

        <Button
          title={uploading ? "Caricamento..." : "Carica PDF"}
          icon="cloud-upload"
          variant="outline"
          onPress={handleUploadPdf}
          loading={uploading}
          style={styles.uploadButton}
        />

        <InputField
          label="Importo Lordo"
          value={lordo}
          onChangeText={setLordo}
          placeholder="Es. 2800.50"
          icon="cash"
          keyboardType="decimal-pad"
        />
        <InputField
          label="Importo Netto"
          value={netto}
          onChangeText={setNetto}
          placeholder="Es. 2100.75"
          icon="wallet"
          keyboardType="decimal-pad"
        />
        <InputField
          label="Ore Straordinario"
          value={straordinariOre}
          onChangeText={setStraordinariOre}
          placeholder="Es. 15.5"
          icon="time"
          keyboardType="decimal-pad"
        />
        <InputField
          label="Importo Straordinario"
          value={straordinariImporto}
          onChangeText={setStraordinariImporto}
          placeholder="Es. 350.00"
          icon="trending-up"
          keyboardType="decimal-pad"
        />
        <InputField
          label="Trattenute Totali"
          value={trattenuteTotali}
          onChangeText={setTrattenuteTotali}
          placeholder="Es. 700.00"
          icon="remove-circle"
          keyboardType="decimal-pad"
        />

        <View style={styles.sheetButtons}>
          <Button
            title="Annulla"
            variant="outline"
            onPress={() => setShowAddSheet(false)}
            style={styles.sheetButton}
          />
          <Button
            title="Salva"
            onPress={handleSave}
            loading={saving}
            style={styles.sheetButton}
          />
        </View>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet
        visible={showDetailSheet}
        onClose={() => setShowDetailSheet(false)}
        title={selectedBusta ? `${getMesiItaliano(selectedBusta.mese)} ${selectedBusta.anno}` : ''}
        height="70%"
      >
        {selectedBusta && (
          <View>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Importo Netto</Text>
              <Text style={styles.detailValueLarge}>{formatCurrency(selectedBusta.netto || 0)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Lordo</Text>
              <Text style={styles.detailValue}>{formatCurrency(selectedBusta.lordo || 0)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Straordinari ({selectedBusta.straordinari_ore || 0}h)</Text>
              <Text style={styles.detailValue}>{formatCurrency(selectedBusta.straordinari_importo || 0)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Trattenute</Text>
              <Text style={[styles.detailValue, { color: colors.error }]}>
                -{formatCurrency(selectedBusta.trattenute_totali || 0)}
              </Text>
            </View>

            {selectedBusta.netto_calcolato > 0 && (
              <View style={styles.confrontoSection}>
                <Text style={styles.confrontoTitle}>Confronto</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Netto calcolato</Text>
                  <Text style={styles.detailValue}>{formatCurrency(selectedBusta.netto_calcolato)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Differenza</Text>
                  <Text style={[
                    styles.detailValue,
                    { color: selectedBusta.has_discrepancy ? colors.error : colors.success }
                  ]}>
                    {formatCurrency(selectedBusta.differenza)}
                  </Text>
                </View>
              </View>
            )}

            {selectedBusta.pdf_nome && (
              <View style={styles.pdfSection}>
                <Ionicons name="document" size={20} color={colors.primary} />
                <Text style={styles.pdfFileName}>{selectedBusta.pdf_nome}</Text>
              </View>
            )}

            <Button
              title="Modifica"
              icon="create"
              variant="outline"
              onPress={() => editBusta(selectedBusta)}
              style={styles.editButton}
            />
          </View>
        )}
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
    list: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },
    bustaCard: {
      marginBottom: 12,
    },
    bustaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    bustaIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: `${colors.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bustaInfo: {
      flex: 1,
      marginLeft: 12,
    },
    bustaPeriodo: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    pdfBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    pdfText: {
      fontSize: 12,
      color: colors.primary,
      marginLeft: 4,
    },
    bustaAmounts: {
      alignItems: 'flex-end',
    },
    bustaNetto: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.success,
    },
    bustaLordo: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    discrepancyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${colors.error}10`,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginTop: 12,
    },
    discrepancyText: {
      fontSize: 13,
      color: colors.error,
      fontWeight: '500',
      marginLeft: 8,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    periodRow: {
      flexDirection: 'row',
      gap: 12,
    },
    halfInput: {
      flex: 1,
    },
    uploadButton: {
      marginBottom: 16,
    },
    sheetButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    sheetButton: {
      flex: 1,
    },
    detailSection: {
      alignItems: 'center',
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 16,
    },
    detailLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    detailValueLarge: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.success,
      marginTop: 4,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    detailValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    confrontoSection: {
      marginTop: 20,
      paddingTop: 16,
      borderTopWidth: 2,
      borderTopColor: colors.primary,
    },
    confrontoTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
      marginBottom: 8,
    },
    pdfSection: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${colors.primary}10`,
      padding: 12,
      borderRadius: 8,
      marginTop: 16,
    },
    pdfFileName: {
      fontSize: 14,
      color: colors.primary,
      marginLeft: 8,
      flex: 1,
    },
    editButton: {
      marginTop: 24,
    },
  });
