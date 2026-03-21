import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { BottomSheet, Button, Card, InputField, LoadingScreen } from '../../src/components';
import * as api from '../../src/services/api';
import { BustaPaga, Documento } from '../../src/types';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { formatCurrency, formatDate, getCurrentMonthYear, getMesiItaliano } from '../../src/utils/helpers';

type TabType = 'cedolini' | 'cud';
type UploadTarget = 'cedolino' | 'cud';

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
  periodo?: string;
}

interface UploadAsset {
  name: string;
  uri?: string;
  mimeType?: string | null;
  file?: File;
  relativePath?: string;
}

interface FileSystemFileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileSystemFileHandleLike | FileSystemDirectoryHandleLike>;
}

interface PendingOverwrite {
  target: UploadTarget;
  asset: UploadAsset;
  title: string;
  message: string;
  periodLabel: string;
}

interface UploadAttemptResult {
  status: 'success' | 'duplicate' | 'error';
  title: string;
  message: string;
  periodLabel?: string;
}

interface BatchImportSummary {
  importati: number;
  duplicati: number;
  ignorati: number;
}

type BatchScope = 'mixed' | 'cud-only';

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
  message.includes('report timbrature') ||
  message.includes('busta paga') ||
  message.includes('CUD') ||
  message.includes('Certificazione Unica')
    ? 'File non compatibile'
    : 'Errore';

const getConflictDetail = (error: unknown): UploadConflictDetail | null => {
  const detail = getApiErrorDetail(error);
  if (!detail || typeof detail === 'string') {
    return null;
  }
  return detail;
};

const normalizzaTestoFile = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const riconosciTipoPdfDaFile = (asset: UploadAsset): UploadTarget | 'ignore' => {
  const testo = normalizzaTestoFile(`${asset.relativePath || ''} ${asset.name}`);
  if (/(cud|certificazione\s+unica)/.test(testo)) {
    return 'cud';
  }
  if (/(tredicesim|13ma|13a|mensilita\s+aggiuntiva|gratifica\s+natal)/.test(testo)) {
    return 'cedolino';
  }
  if (/(busta|cedolino|paga|stipend)/.test(testo)) {
    return 'cedolino';
  }
  return 'ignore';
};

const appendPdfToFormData = (formData: FormData, asset: UploadAsset) => {
  const browserFile = asset.file;
  if (typeof File !== 'undefined' && browserFile instanceof File) {
    formData.append('file', browserFile, browserFile.name);
    return;
  }
  if (!asset.uri) {
    throw new Error('File PDF non disponibile per l\'upload.');
  }
  formData.append('file', {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType || 'application/pdf',
  } as unknown as Blob);
};

const sortDocumenti = (documenti: Documento[]) =>
  [...documenti].sort((left, right) => {
    const first = `${left.data_riferimento ?? ''}|${left.created_at}`;
    const second = `${right.data_riferimento ?? ''}|${right.created_at}`;
    return second.localeCompare(first);
  });

const formatPeriodoDocumento = (documento: Documento) => {
  if (!documento.data_riferimento) {
    return 'Periodo non rilevato';
  }
  if (/^\d{4}-\d{2}$/.test(documento.data_riferimento)) {
    const [anno, mese] = documento.data_riferimento.split('-');
    return `${getMesiItaliano(Number(mese))} ${anno}`;
  }
  return documento.data_riferimento;
};

const getDocumentoBadge = (documento: Documento) => {
  if (documento.tipo === 'cud') {
    return { label: 'CUD', tone: 'info' as const };
  }
  if (documento.sottotipo === 'tredicesima') {
    return { label: 'Tredicesima', tone: 'warning' as const };
  }
  return { label: 'Ordinaria', tone: 'primary' as const };
};

export default function BustePagaScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [activeTab, setActiveTab] = useState<TabType>('cedolini');
  const [bustePaga, setBustePaga] = useState<BustaPaga[]>([]);
  const [archivioCedolini, setArchivioCedolini] = useState<Documento[]>([]);
  const [cudDocuments, setCudDocuments] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedBusta, setSelectedBusta] = useState<BustaPaga | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);

  const { mese: currentMese, anno: currentAnno } = getCurrentMonthYear();
  const [mese, setMese] = useState(currentMese.toString());
  const [anno, setAnno] = useState(currentAnno.toString());
  const [lordo, setLordo] = useState('');
  const [netto, setNetto] = useState('');
  const [straordinariOre, setStraordinariOre] = useState('');
  const [straordinariImporto, setStraordinariImporto] = useState('');
  const [trattenuteTotali, setTrattenuteTotali] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [busteRes, archivioRes, cudRes] = await Promise.allSettled([
        api.getBustePaga(),
        api.getDocumenti('busta_paga'),
        api.getDocumenti('cud'),
      ]);

      if (busteRes.status === 'fulfilled') {
        setBustePaga(busteRes.value.data);
      }
      if (archivioRes.status === 'fulfilled') {
        setArchivioCedolini(sortDocumenti(archivioRes.value.data));
      }
      if (cudRes.status === 'fulfilled') {
        setCudDocuments(sortDocumenti(cudRes.value.data));
      }

      const failureCount = [busteRes, archivioRes, cudRes].filter((result) => result.status === 'rejected').length;
      if (failureCount === 3) {
        setLoadError('Impossibile caricare l’archivio documenti.');
      }
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

  const resetForm = () => {
    setMese(currentMese.toString());
    setAnno(currentAnno.toString());
    setLordo('');
    setNetto('');
    setStraordinariOre('');
    setStraordinariImporto('');
    setTrattenuteTotali('');
  };

  const pickSinglePdfAsset = async (): Promise<UploadAsset | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    const asset = result.assets[0];
    return {
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType,
      file: asset.file,
    };
  };

  const pickWebPdfAssets = async (directory: boolean): Promise<UploadAsset[]> => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert('Disponibile solo sul web', 'La selezione multipla o da cartella è disponibile solo nella versione web.');
      return [];
    }

    const raccogliDaHandle = async (
      handle: FileSystemDirectoryHandleLike,
      basePath = '',
    ): Promise<UploadAsset[]> => {
      const assets: UploadAsset[] = [];
      const currentPath = basePath ? `${basePath}/${handle.name}` : handle.name;

      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          if (file.name.toLowerCase().endsWith('.pdf')) {
            assets.push({
              name: file.name,
              mimeType: file.type || 'application/pdf',
              file,
              relativePath: `${currentPath}/${file.name}`,
            });
          }
          continue;
        }

        assets.push(...(await raccogliDaHandle(entry, currentPath)));
      }

      return assets;
    };

    const directoryPickerWindow = window as Window & {
      showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandleLike>;
    };

    if (directory && directoryPickerWindow.showDirectoryPicker) {
      try {
        const directoryHandle = await directoryPickerWindow.showDirectoryPicker({ mode: 'read' });
        return await raccogliDaHandle(directoryHandle);
      } catch {
        return [];
      }
    }

    return new Promise<UploadAsset[]>((resolve) => {
      const input = document.createElement('input');
      const directoryInput = input as HTMLInputElement & { webkitdirectory?: boolean };
      directoryInput.type = 'file';
      directoryInput.accept = 'application/pdf,.pdf';
      directoryInput.multiple = true;
      if (directory) {
        directoryInput.webkitdirectory = true;
      }

      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        resolve(
          files
            .filter((file) => file.name.toLowerCase().endsWith('.pdf'))
            .map((file) => ({
              name: file.name,
              mimeType: file.type || 'application/pdf',
              file,
              relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || '',
            })),
        );
        input.remove();
      };

      input.click();
    });
  };

  const performCedolinoUpload = async (asset: UploadAsset, forceOverwrite = false): Promise<UploadAttemptResult> => {
    try {
      const formData = new FormData();
      appendPdfToFormData(formData, asset);
      if (forceOverwrite) {
        formData.append('force_overwrite', 'true');
      }

      const response = await api.uploadBustaPagaAuto(formData);
      const meseImportato = response.data.mese;
      const annoImportato = response.data.anno;
      setMese(meseImportato.toString());
      setAnno(annoImportato.toString());

      if (response.data.sottotipo === 'tredicesima') {
        return {
          status: 'success',
          title: 'Tredicesima archiviata',
          message: `Il file "${asset.name}" è stato archiviato come tredicesima di ${getMesiItaliano(meseImportato)} ${annoImportato}.`,
        };
      }

      return {
        status: 'success',
        title: 'Cedolino importato',
        message: `Il file "${asset.name}" è stato associato a ${getMesiItaliano(meseImportato)} ${annoImportato}.`,
      };
    } catch (error: unknown) {
      const detail = getConflictDetail(error);
      if (detail?.code === 'duplicato_busta_paga' || detail?.code === 'duplicato_tredicesima') {
        return {
          status: 'duplicate',
          title: detail.code === 'duplicato_tredicesima' ? 'Tredicesima già presente' : 'Cedolino già presente',
          message: detail.message || 'Esiste già un file archiviato per questo periodo.',
          periodLabel: detail.mese && detail.anno ? `${getMesiItaliano(detail.mese)} ${detail.anno}` : 'periodo già presente',
        };
      }

      const message = getApiErrorMessage(error, 'Impossibile caricare il cedolino PDF.');
      return {
        status: 'error',
        title: getUploadAlertTitle(message),
        message,
      };
    }
  };

  const performCudUpload = async (asset: UploadAsset, forceOverwrite = false): Promise<UploadAttemptResult> => {
    try {
      const formData = new FormData();
      appendPdfToFormData(formData, asset);
      if (forceOverwrite) {
        formData.append('force_overwrite', 'true');
      }

      const response = await api.uploadCud(formData);
      return {
        status: 'success',
        title: 'CUD archiviato',
        message: `Il file "${asset.name}" è stato archiviato come CUD ${response.data.anno}.`,
      };
    } catch (error: unknown) {
      const detail = getConflictDetail(error);
      if (detail?.code === 'duplicato_cud') {
        return {
          status: 'duplicate',
          title: 'CUD già presente',
          message: detail.message || 'Esiste già un CUD archiviato per questo anno.',
          periodLabel: detail.periodo || 'anno già presente',
        };
      }

      const message = getApiErrorMessage(error, 'Impossibile caricare il CUD.');
      return {
        status: 'error',
        title: getUploadAlertTitle(message),
        message,
      };
    }
  };

  const showBatchSummary = (target: BatchScope, summary: BatchImportSummary) => {
    const title = target === 'mixed' ? 'Import storico documenti' : 'Import storico CUD';
    const lines = [
      `Importati: ${summary.importati}`,
      `Duplicati saltati: ${summary.duplicati}`,
    ];
    if (summary.ignorati > 0) {
      lines.push(`Ignorati: ${summary.ignorati}`);
    }
    Alert.alert(title, lines.join('\n\n'));
  };

  const importAssetsInBatch = async (scope: BatchScope, assets: UploadAsset[]) => {
    if (assets.length === 0) {
      return;
    }

    setUploading(true);
    const summary: BatchImportSummary = { importati: 0, duplicati: 0, ignorati: 0 };

    try {
      for (const asset of assets) {
        const pdfType = riconosciTipoPdfDaFile(asset);
        if (pdfType === 'ignore') {
          summary.ignorati += 1;
          continue;
        }

        const shouldTryCud =
          scope === 'cud-only' ? true : pdfType === 'cud';
        const shouldTryCedolino =
          scope === 'mixed' ? pdfType !== 'cud' : false;

        let result: UploadAttemptResult | null = null;
        if (shouldTryCud) {
          result = await performCudUpload(asset);
        } else if (shouldTryCedolino) {
          result = await performCedolinoUpload(asset);
          if (
            result.status === 'error' &&
            /(sembra un cud|certificazione unica)/i.test(result.message)
          ) {
            result = await performCudUpload(asset);
          }
        }

        if (!result) {
          summary.ignorati += 1;
          continue;
        }

        if (result.status === 'success') {
          summary.importati += 1;
        } else if (result.status === 'duplicate') {
          summary.duplicati += 1;
        } else {
          summary.ignorati += 1;
        }
      }

      try {
        await loadData();
      } catch {
        // Il refresh non deve interrompere il batch se un archivio non risponde.
      }
      showBatchSummary(scope, summary);
    } finally {
      setUploading(false);
    }
  };

  const requestSingleUpload = async (target: UploadTarget) => {
    const asset = await pickSinglePdfAsset();
    if (!asset) {
      return;
    }

    setUploading(true);
    try {
      const result = target === 'cedolino' ? await performCedolinoUpload(asset) : await performCudUpload(asset);
      if (result.status === 'success') {
        await loadData();
        Alert.alert(result.title, result.message);
        return;
      }
      if (result.status === 'duplicate') {
        setPendingOverwrite({
          target,
          asset,
          title: result.title,
          message: result.message,
          periodLabel: result.periodLabel || 'periodo già presente',
        });
        return;
      }
      Alert.alert(result.title, result.message);
    } finally {
      setUploading(false);
    }
  };

  const requestBatchUpload = async (scope: BatchScope, directory: boolean) => {
    const assets = await pickWebPdfAssets(directory);
    await importAssetsInBatch(scope, assets);
  };

  const confirmOverwrite = async () => {
    if (!pendingOverwrite) {
      return;
    }

    setUploading(true);
    try {
      const result = pendingOverwrite.target === 'cedolino'
        ? await performCedolinoUpload(pendingOverwrite.asset, true)
        : await performCudUpload(pendingOverwrite.asset, true);
      setPendingOverwrite(null);
      if (result.status === 'success') {
        await loadData();
      }
      Alert.alert(result.title, result.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!mese || !anno) {
      Alert.alert('Errore', 'Inserisci mese e anno della mensilità manuale.');
      return;
    }

    const parsedMese = Number.parseInt(mese, 10);
    const parsedAnno = Number.parseInt(anno, 10);
    if (!parsedMese || parsedMese < 1 || parsedMese > 12 || !parsedAnno) {
      Alert.alert('Errore', 'Inserisci un periodo valido.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        mese: parsedMese,
        anno: parsedAnno,
        lordo: lordo ? Number.parseFloat(lordo) : undefined,
        netto: netto ? Number.parseFloat(netto) : undefined,
        straordinari_ore: straordinariOre ? Number.parseFloat(straordinariOre) : undefined,
        straordinari_importo: straordinariImporto ? Number.parseFloat(straordinariImporto) : undefined,
        trattenute_totali: trattenuteTotali ? Number.parseFloat(trattenuteTotali) : undefined,
      };

      const existing = bustePaga.find((item) => item.mese === parsedMese && item.anno === parsedAnno);
      if (existing) {
        await api.updateBustaPaga(parsedAnno, parsedMese, payload);
      } else {
        await api.createBustaPaga(payload);
      }
      setShowAddSheet(false);
      resetForm();
      await loadData();
      Alert.alert('Cedolino salvato', `Mensilità aggiornata per ${getMesiItaliano(parsedMese)} ${parsedAnno}.`);
    } catch (error: unknown) {
      Alert.alert('Errore', getApiErrorMessage(error, 'Impossibile salvare il cedolino manuale.'));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (busta: BustaPaga) => {
    setSelectedBusta(busta);
    setShowDetailSheet(true);
  };

  const editSelectedBusta = () => {
    if (!selectedBusta) {
      return;
    }
    setMese(selectedBusta.mese.toString());
    setAnno(selectedBusta.anno.toString());
    setLordo(selectedBusta.lordo?.toString() || '');
    setNetto(selectedBusta.netto?.toString() || '');
    setStraordinariOre(selectedBusta.straordinari_ore?.toString() || '');
    setStraordinariImporto(selectedBusta.straordinari_importo?.toString() || '');
    setTrattenuteTotali(selectedBusta.trattenute_totali?.toString() || '');
    setShowDetailSheet(false);
    setShowAddSheet(true);
  };

  if (loading) {
    return <LoadingScreen message="Caricamento archivio paghe..." />;
  }

  const renderErrorBanner = () =>
    loadError ? (
      <Card style={styles.errorCard}>
        <View style={styles.errorRow}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.error} />
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
        <Button title="Riprova" size="small" variant="outline" onPress={loadData} />
      </Card>
    ) : null;

  const renderBustaItem = ({ item }: { item: BustaPaga }) => (
    <Card style={styles.card} onPress={() => openDetail(item)}>
      <View style={styles.cardRow}>
        <View style={styles.iconBox}>
          <Ionicons name="document-text" size={20} color={colors.primary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{getMesiItaliano(item.mese)} {item.anno}</Text>
          <Text style={styles.cardMeta}>{item.pdf_nome || 'Mensilità inserita manualmente'}</Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.nettoValue}>{formatCurrency(item.netto || 0)}</Text>
          <Text style={styles.lordoValue}>Lordo {formatCurrency(item.lordo || 0)}</Text>
        </View>
      </View>
      {item.has_discrepancy && (
        <View style={styles.banner}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.bannerText}>Differenza sul netto: {formatCurrency(item.differenza)}</Text>
        </View>
      )}
    </Card>
  );

  const renderDocumentoCard = (documento: Documento) => {
    const badge = getDocumentoBadge(documento);
    const badgeColor =
      badge.tone === 'warning' ? colors.warning :
      badge.tone === 'info' ? colors.info :
      colors.primary;

    return (
      <Card key={documento.id} style={styles.card}>
        <View style={styles.docHeader}>
          <View style={[styles.docBadge, { backgroundColor: `${badgeColor}18` }]}>
            <Text style={[styles.docBadgeText, { color: badgeColor }]}>{badge.label}</Text>
          </View>
          <Text style={styles.docPeriod}>{formatPeriodoDocumento(documento)}</Text>
        </View>
        <Text style={styles.docTitle}>{documento.titolo}</Text>
        <Text style={styles.cardMeta}>{documento.file_nome}</Text>
        <Text style={styles.cardMeta}>Caricato il {formatDate(documento.created_at, 'dd MMM yyyy')}</Text>
      </Card>
    );
  };

  const renderCedoliniHeader = () => (
    <View>
      {renderErrorBanner()}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Importa cedolini</Text>
        <Text style={styles.sectionHint}>
          Il parser riconosce in autonomia mese e anno. La tredicesima viene archiviata come documento separato dal cedolino ordinario.
        </Text>
        <View style={styles.stack}>
          <Button title="Carica PDF" icon="cloud-upload" onPress={() => requestSingleUpload('cedolino')} loading={uploading} testID="buste-upload-single-button" />
          <Button title="Importa storico" icon="documents" variant="outline" onPress={() => requestBatchUpload('mixed', false)} disabled={uploading || Platform.OS !== 'web'} testID="buste-upload-history-button" />
          <Button title="Importa cartella" icon="folder-open" variant="outline" onPress={() => requestBatchUpload('mixed', true)} disabled={uploading || Platform.OS !== 'web'} testID="buste-upload-folder-button" />
        </View>
        {Platform.OS !== 'web' && <Text style={styles.helperText}>Selezione multipla e cartelle disponibili nella versione web.</Text>}
      </Card>
      <Card style={styles.cardMuted}>
        <Text style={styles.sectionTitle}>Gestione tredicesima</Text>
        <Text style={styles.sectionHint}>
          La tredicesima viene distinta dall’ordinaria di dicembre. Resta in archivio storico e non sovrascrive le statistiche mensili standard.
        </Text>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Inserimento manuale</Text>
        <Text style={styles.sectionHint}>Usalo solo quando vuoi aggiungere o correggere una mensilità senza PDF.</Text>
        <Button title="Nuovo inserimento manuale" icon="add" variant="outline" onPress={() => { resetForm(); setShowAddSheet(true); }} testID="buste-add-manual-button" />
      </Card>
      <Text style={styles.listTitle}>Mensilità elaborate</Text>
    </View>
  );

  const renderCedoliniFooter = () => (
    <View>
      <Text style={styles.listTitle}>Archivio PDF</Text>
      {archivioCedolini.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nessun file storico archiviato</Text>
          <Text style={styles.emptySubtext}>Carica cedolini ordinari o tredicesime per distinguere lo storico.</Text>
        </Card>
      ) : (
        archivioCedolini.map(renderDocumentoCard)
      )}
    </View>
  );

  const renderCudHeader = () => (
    <View>
      {renderErrorBanner()}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Archivio CUD</Text>
        <Text style={styles.sectionHint}>
          Per ora vengono salvate solo informazioni base: anno, nome file e data di caricamento.
        </Text>
        <View style={styles.stack}>
          <Button title="Carica CUD" icon="cloud-upload" onPress={() => requestSingleUpload('cud')} loading={uploading} testID="cud-upload-single-button" />
          <Button title="Importa storico" icon="documents" variant="outline" onPress={() => requestBatchUpload('cud-only', false)} disabled={uploading || Platform.OS !== 'web'} testID="cud-upload-history-button" />
          <Button title="Importa cartella" icon="folder-open" variant="outline" onPress={() => requestBatchUpload('cud-only', true)} disabled={uploading || Platform.OS !== 'web'} testID="cud-upload-folder-button" />
        </View>
        {Platform.OS !== 'web' && <Text style={styles.helperText}>Selezione multipla e cartelle disponibili nella versione web.</Text>}
      </Card>
      <Text style={styles.listTitle}>Storico CUD</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} testID="buste-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Buste Paga</Text>
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, activeTab === 'cedolini' && styles.tabActive]} onPress={() => setActiveTab('cedolini')} testID="buste-tab-cedolini">
          <Text style={[styles.tabText, activeTab === 'cedolini' && styles.tabTextActive]}>Cedolini</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'cud' && styles.tabActive]} onPress={() => setActiveTab('cud')} testID="buste-tab-cud">
          <Text style={[styles.tabText, activeTab === 'cud' && styles.tabTextActive]}>CUD</Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'cedolini' ? (
        <FlatList
          data={bustePaga}
          keyExtractor={(item) => item.id}
          renderItem={renderBustaItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListHeaderComponent={renderCedoliniHeader}
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nessuna mensilità elaborata</Text>
              <Text style={styles.emptySubtext}>Carica un cedolino PDF o inserisci i valori manualmente.</Text>
            </Card>
          }
          ListFooterComponent={renderCedoliniFooter}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={cudDocuments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderDocumentoCard(item)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListHeaderComponent={renderCudHeader}
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nessun CUD archiviato</Text>
              <Text style={styles.emptySubtext}>Carica una Certificazione Unica per costruire lo storico base.</Text>
            </Card>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      <BottomSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} title="Cedolino manuale" height="82%" testID="buste-add-sheet">
        <Text style={styles.sectionHint}>Qui il periodo resta manuale perché non c’è un parser PDF in gioco.</Text>
        <View style={styles.periodRow}>
          <View style={styles.halfField}>
            <InputField label="Mese" value={mese} onChangeText={setMese} placeholder="1-12" keyboardType="numeric" />
          </View>
          <View style={styles.halfField}>
            <InputField label="Anno" value={anno} onChangeText={setAnno} placeholder="2026" keyboardType="numeric" />
          </View>
        </View>
        <InputField label="Importo Lordo" value={lordo} onChangeText={setLordo} placeholder="Es. 2800.50" icon="cash" keyboardType="decimal-pad" />
        <InputField label="Importo Netto" value={netto} onChangeText={setNetto} placeholder="Es. 2100.75" icon="wallet" keyboardType="decimal-pad" />
        <InputField label="Ore Straordinario" value={straordinariOre} onChangeText={setStraordinariOre} placeholder="Es. 15.5" icon="time" keyboardType="decimal-pad" />
        <InputField label="Importo Straordinario" value={straordinariImporto} onChangeText={setStraordinariImporto} placeholder="Es. 350.00" icon="trending-up" keyboardType="decimal-pad" />
        <InputField label="Trattenute Totali" value={trattenuteTotali} onChangeText={setTrattenuteTotali} placeholder="Es. 700.00" icon="remove-circle" keyboardType="decimal-pad" />
        <View style={styles.sheetButtons}>
          <Button title="Annulla" variant="outline" onPress={() => setShowAddSheet(false)} style={styles.sheetButton} />
          <Button title="Salva" onPress={handleSave} loading={saving} style={styles.sheetButton} />
        </View>
      </BottomSheet>
      <BottomSheet visible={Boolean(pendingOverwrite)} onClose={() => !uploading && setPendingOverwrite(null)} title={pendingOverwrite?.title || 'Documento già presente'} height="42%" testID="buste-overwrite-sheet">
        <View style={styles.confirmationContent}>
          <View style={styles.confirmationIcon}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
          </View>
          <Text style={styles.confirmationTitle}>Vuoi sovrascrivere il file esistente?</Text>
          <Text style={styles.confirmationText}>
            {pendingOverwrite ? `${pendingOverwrite.message} Periodo rilevato: ${pendingOverwrite.periodLabel}.` : 'Esiste già un documento archiviato per questo periodo.'}
          </Text>
          <View style={styles.sheetButtons}>
            <Button title="Annulla" variant="outline" onPress={() => setPendingOverwrite(null)} disabled={uploading} style={styles.sheetButton} />
            <Button title="Sovrascrivi" onPress={confirmOverwrite} loading={uploading} style={styles.sheetButton} />
          </View>
        </View>
      </BottomSheet>
      <BottomSheet visible={showDetailSheet} onClose={() => setShowDetailSheet(false)} title={selectedBusta ? `${getMesiItaliano(selectedBusta.mese)} ${selectedBusta.anno}` : 'Dettaglio cedolino'} height="68%">
        {selectedBusta && (
          <View>
            <View style={styles.detailHero}>
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
              <Text style={[styles.detailValue, { color: colors.error }]}>-{formatCurrency(selectedBusta.trattenute_totali || 0)}</Text>
            </View>
            {selectedBusta.pdf_nome && (
              <View style={styles.fileInfo}>
                <Ionicons name="attach" size={18} color={colors.primary} />
                <Text style={styles.fileInfoText}>{selectedBusta.pdf_nome}</Text>
              </View>
            )}
            <Button title="Modifica" icon="create" variant="outline" onPress={editSelectedBusta} style={styles.detailButton} />
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
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.cardDark,
      borderRadius: 14,
      padding: 6,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: `${colors.primary}16`,
      borderWidth: 1,
      borderColor: `${colors.primary}30`,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.primary,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 120,
    },
    card: {
      marginBottom: 12,
    },
    cardMuted: {
      marginBottom: 12,
      backgroundColor: colors.cardDark,
    },
    errorCard: {
      marginBottom: 12,
      borderWidth: 1,
      borderColor: `${colors.error}30`,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    errorText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    sectionHint: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    helperText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 12,
    },
    stack: {
      gap: 10,
    },
    listTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBox: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: `${colors.primary}14`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardContent: {
      flex: 1,
      marginLeft: 12,
      marginRight: 12,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    cardMeta: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
      marginTop: 4,
    },
    amountBox: {
      alignItems: 'flex-end',
      maxWidth: 132,
    },
    nettoValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.success,
    },
    lordoValue: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: `${colors.error}12`,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 14,
    },
    bannerText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.error,
    },
    docHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    docBadge: {
      minHeight: 28,
      borderRadius: 999,
      paddingHorizontal: 12,
      justifyContent: 'center',
    },
    docBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    docPeriod: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    docTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    emptyCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
    },
    periodRow: {
      flexDirection: 'row',
      gap: 12,
    },
    halfField: {
      flex: 1,
    },
    sheetButtons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    sheetButton: {
      flex: 1,
    },
    confirmationContent: {
      paddingBottom: 8,
    },
    confirmationIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: `${colors.warning}12`,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
      marginBottom: 16,
    },
    confirmationTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 10,
    },
    confirmationText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    detailHero: {
      alignItems: 'center',
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 12,
    },
    detailLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    detailValueLarge: {
      fontSize: 34,
      fontWeight: '700',
      color: colors.success,
      marginTop: 6,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    detailValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    fileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: `${colors.primary}10`,
      borderRadius: 10,
      padding: 12,
      marginTop: 18,
    },
    fileInfoText: {
      flex: 1,
      fontSize: 14,
      color: colors.primary,
    },
    detailButton: {
      marginTop: 20,
    },
  });
