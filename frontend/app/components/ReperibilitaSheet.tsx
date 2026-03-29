/**
 * ReperibilitaSheet — bottom sheet per pianificazione reperibilità ricorrente.
 *
 * Logica ricorrenza:
 * - Mai (singola data)
 * - Ogni settimana (nei giorni selezionati)
 * - Ogni 2 settimane (con opzione inverti sab/dom)
 * - Ogni mese (stesso giorno del mese)
 *
 * Genera le date future e chiama offlineApi.createReperibilita per ognuna.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button, InputField, DatePickerField, TimePickerField } from '../../src/components';
import * as offlineApi from '../../src/services/offlineApi';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { getTodayString } from '../../src/utils/helpers';

type Ripetizione = 'mai' | 'settimanale' | 'bisettimanale' | 'mensile';
type TipoRep = 'passiva' | 'attiva';

const GIORNI = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'];
// indice 0=lunedì … 6=domenica (ISO weekday -1)

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isoWeekday(date: Date): number {
  // 0=lunedì, 6=domenica
  return (date.getDay() + 6) % 7;
}

/**
 * Genera le date di ripetizione dalla dataInizio fino a 1 anno nel futuro
 * (o max 52 occorrenze per evitare abusi).
 */
function generaDate(
  dataInizio: string,
  ripetizione: Ripetizione,
  giorniSelezionati: number[],
  invertiSabDom: boolean,
): string[] {
  if (ripetizione === 'mai') return [dataInizio];

  const dates: string[] = [];
  const start = new Date(dataInizio);
  const limit = new Date(dataInizio);
  limit.setFullYear(limit.getFullYear() + 1);
  const MAX = 52;

  // Mappa i giorni selezionati invertendo sab/dom se richiesto
  const effectiveDays = giorniSelezionati.map(d => {
    if (!invertiSabDom) return d;
    if (d === 5) return 6; // sab→dom
    if (d === 6) return 5; // dom→sab
    return d;
  });

  if (ripetizione === 'settimanale' || ripetizione === 'bisettimanale') {
    const step = ripetizione === 'bisettimanale' ? 14 : 7;
    // Itera sulle settimane
    let weekStart = new Date(start);
    // Porta weekStart al lunedì della settimana di start
    const dayOfWeek = isoWeekday(weekStart);
    weekStart = addDays(weekStart, -dayOfWeek);

    let firstWeek = true;
    while (dates.length < MAX) {
      for (const d of effectiveDays) {
        const candidate = addDays(weekStart, d);
        if (candidate < start && firstWeek) continue;
        if (candidate > limit) break;
        const str = toDateStr(candidate);
        if (!dates.includes(str)) dates.push(str);
      }
      firstWeek = false;
      weekStart = addDays(weekStart, step);
      if (weekStart > limit) break;
    }
  } else if (ripetizione === 'mensile') {
    const dayOfMonth = start.getDate();
    let cur = new Date(start);
    while (dates.length < MAX) {
      dates.push(toDateStr(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, dayOfMonth);
      if (cur > limit) break;
    }
  }

  return dates.sort();
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ReperibilitaSheet({ visible, onClose, onDone }: Props) {
  const { colors, themeColors } = useAppTheme();
  const styles = createStyles(colors);

  const [dataInizio, setDataInizio] = useState(getTodayString());
  const [oraInizio, setOraInizio] = useState('08:00');
  const [oraFine, setOraFine] = useState('20:00');
  const [tipo, setTipo] = useState<TipoRep>('passiva');
  const [ripetizione, setRipetizione] = useState<Ripetizione>('mai');
  const [giorniSelezionati, setGiorniSelezionati] = useState<number[]>([0, 1, 2, 3, 4]);
  const [invertiSabDom, setInvertiSabDom] = useState(false);
  const [interventi, setInterventi] = useState('0');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleGiorno = (idx: number) => {
    setGiorniSelezionati(prev =>
      prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort()
    );
  };

  const anteprima = generaDate(dataInizio, ripetizione, giorniSelezionati, invertiSabDom);

  const handleSave = async () => {
    if (!dataInizio || !oraInizio || !oraFine) {
      Alert.alert('Errore', 'Compila data e orari');
      return;
    }
    if (ripetizione !== 'mai' && giorniSelezionati.length === 0) {
      Alert.alert('Errore', 'Seleziona almeno un giorno');
      return;
    }
    setSaving(true);
    try {
      for (const data of anteprima) {
        await offlineApi.createReperibilita({
          data,
          ora_inizio: oraInizio,
          ora_fine: oraFine,
          tipo,
          interventi: parseInt(interventi) || 0,
          note: note || undefined,
        });
      }
      Alert.alert('Fatto', `${anteprima.length} reperibilità pianificate`);
      onDone();
      onClose();
    } catch {
      Alert.alert('Errore', 'Errore durante la pianificazione');
    } finally {
      setSaving(false);
    }
  };

  const RIPETIZIONI: { value: Ripetizione; label: string }[] = [
    { value: 'mai', label: 'Solo una volta' },
    { value: 'settimanale', label: 'Ogni settimana' },
    { value: 'bisettimanale', label: 'Ogni 2 settimane' },
    { value: 'mensile', label: 'Ogni mese' },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Pianifica Reperibilità" height="90%">
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Tipo */}
        <Text style={styles.sectionLabel}>Tipo</Text>
        <View style={styles.row}>
          {(['passiva', 'attiva'] as TipoRep[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, tipo === t && styles.chipActive]}
              onPress={() => setTipo(t)}
            >
              <Text style={[styles.chipText, tipo === t && styles.chipTextActive]}>
                {t === 'passiva' ? 'Passiva (disponibilità)' : 'Attiva (intervento)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Data inizio */}
        <DatePickerField label="Data inizio" value={dataInizio} onChange={setDataInizio} />

        {/* Orari */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TimePickerField label="Ora inizio" value={oraInizio} onChange={setOraInizio} />
          </View>
          <View style={{ flex: 1 }}>
            <TimePickerField label="Ora fine" value={oraFine} onChange={setOraFine} />
          </View>
        </View>

        {/* Interventi (solo attiva) */}
        {tipo === 'attiva' && (
          <InputField
            label="Numero interventi"
            value={interventi}
            onChangeText={setInterventi}
            keyboardType="numeric"
            icon="call"
          />
        )}

        {/* Ripetizione */}
        <Text style={styles.sectionLabel}>Ripetizione</Text>
        <View style={styles.ripRow}>
          {RIPETIZIONI.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[styles.ripChip, ripetizione === r.value && styles.chipActive]}
              onPress={() => setRipetizione(r.value)}
            >
              <Text style={[styles.ripChipText, ripetizione === r.value && styles.chipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Giorni (solo settimanale / bisettimanale) */}
        {(ripetizione === 'settimanale' || ripetizione === 'bisettimanale') && (
          <>
            <Text style={styles.sectionLabel}>Giorni</Text>
            <View style={styles.giorniRow}>
              {GIORNI.map((g, idx) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.giornoChip, giorniSelezionati.includes(idx) && styles.chipActive]}
                  onPress={() => toggleGiorno(idx)}
                >
                  <Text style={[styles.giornoText, giorniSelezionati.includes(idx) && styles.chipTextActive]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Inverti sab/dom */}
            <TouchableOpacity
              style={[styles.invertRow, invertiSabDom && styles.invertRowActive]}
              onPress={() => setInvertiSabDom(prev => !prev)}
            >
              <Ionicons name={invertiSabDom ? 'swap-horizontal' : 'swap-horizontal-outline'} size={18} color={invertiSabDom ? themeColors.primary : colors.textSecondary} />
              <Text style={[styles.invertText, invertiSabDom && { color: themeColors.primary }]}>
                Inverti sabato ↔ domenica
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Note */}
        <InputField label="Note (opzionale)" value={note} onChangeText={setNote} icon="document-text" />

        {/* Anteprima */}
        {anteprima.length > 0 && (
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>
              {anteprima.length} {anteprima.length === 1 ? 'data' : 'date'} pianificate
            </Text>
            {anteprima.slice(0, 5).map(d => (
              <Text key={d} style={styles.previewDate}>{d}</Text>
            ))}
            {anteprima.length > 5 && (
              <Text style={styles.previewDate}>…e altre {anteprima.length - 5}</Text>
            )}
          </View>
        )}

        <Button
          title={saving ? 'Salvataggio…' : `Pianifica (${anteprima.length})`}
          onPress={handleSave}
          loading={saving}
          style={styles.saveBtn}
        />
        <View style={{ height: 32 }} />
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    chip: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, color: colors.text, textAlign: 'center' },
    chipTextActive: { color: '#fff', fontWeight: '600' },
    ripRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    ripChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
    ripChipText: { fontSize: 13, color: colors.text },
    giorniRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    giornoChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    giornoText: { fontSize: 12, fontWeight: '600', color: colors.text },
    invertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, marginBottom: 8 },
    invertRowActive: { borderColor: colors.primary },
    invertText: { fontSize: 13, color: colors.textSecondary },
    previewBox: { backgroundColor: colors.cardDark, borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 4 },
    previewTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
    previewDate: { fontSize: 13, color: colors.textSecondary, lineHeight: 22 },
    saveBtn: { marginTop: 16 },
  });
