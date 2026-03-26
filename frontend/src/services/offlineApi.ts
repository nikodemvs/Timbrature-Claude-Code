/**
 * offlineApi.ts — API cache-first offline-aware (Fase 3 offline-first)
 *
 * Pattern:
 *   - GET: se online → chiama backend → salva in localDb → ritorna
 *          se offline (o errore rete) → ritorna da localDb
 *   - TIMBRA (write critica): salva in localDb IMMEDIATAMENTE →
 *          se online: sync al backend → se offline: aggiunge a offline_queue
 *   - Altre write: tentano il backend; se offline aggiungono alla queue
 *
 * Le schermate importano da qui invece di api.ts per le funzioni offline-aware.
 */

import * as api from './api';
import * as db from '../db/localDb';
import { useAppStore } from '../store/appStore';
import { UserSettings, Timbratura, DashboardData, WeeklySummary, ChatMessage, Reperibilita } from '../types';
import {
  stimaNetto,
  calcolaSaldoFerie,
  calcolaComporto,
  calcolaOreLavorate,
  calcolaOreDaMarcature,
  calcolaOreReperibilita,
  Marcatura,
} from '../algorithms/calcoli';

type QueuedOperation = {
  id: number;
  operation: string;
  endpoint: string;
  method: string;
  payload: string | null;
  created_at: string;
  retry_count: number;
};

type TimbraturaSnapshot = {
  data?: string;
  ora_entrata?: string | null;
  ora_uscita?: string | null;
  is_reperibilita_attiva?: boolean;
  note?: string | null;
};

type TimbraturaAziendaleRecord = {
  id: string;
  data: string;
  ora_entrata: string | null;
  ora_uscita: string | null;
  ore_lavorate: number;
  descrizione: string | null;
};

type ConfrontoTimbratureItem = {
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
};

type ConfrontoTimbratureResponse = {
  mese: number;
  anno: number;
  confronti: ConfrontoTimbratureItem[];
  riepilogo: {
    giorni_totali: number;
    giorni_con_discrepanza: number;
    differenza_ore_totale: number;
    ore_personali_totali: number;
    ore_aziendali_totali: number;
  };
};

type StatisticheMensiliItem = {
  mese: number;
  anno: number;
  ore_lavorate: number;
  ore_straordinarie: number;
  netto: number;
  giorni_lavorati: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica se il backend cloud è raggiungibile e abilitato dall'utente. */
function canUseCloud(): boolean {
  const { isOnline, cloudEnabled } = useAppStore.getState();
  return isOnline && cloudEnabled;
}

let offlineQueueSyncPromise: Promise<void> | null = null;

function markSynced(): void {
  useAppStore.getState().setLastSyncAt(new Date().toISOString());
}

function parseQueuedPayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function extractTimbraturaSnapshot(payload: Record<string, unknown>): TimbraturaSnapshot | null {
  const source = payload.timbratura && typeof payload.timbratura === 'object'
    ? (payload.timbratura as Record<string, unknown>)
    : payload;

  const data = readString(source.data);
  if (!data) return null;

  return {
    data,
    ora_entrata: source.ora_entrata === null ? null : readString(source.ora_entrata) ?? null,
    ora_uscita: source.ora_uscita === null ? null : readString(source.ora_uscita) ?? null,
    is_reperibilita_attiva: readBoolean(source.is_reperibilita_attiva) ?? false,
    note: source.note === null ? null : readString(source.note) ?? null,
  };
}

function buildTimbraturaCreatePayload(snapshot: TimbraturaSnapshot): {
  data: string;
  ora_entrata?: string;
  ora_uscita?: string;
  is_reperibilita_attiva?: boolean;
  note?: string;
} {
  if (!snapshot.data) {
    throw new Error('Timbratura offline senza data');
  }

  const payload: {
    data: string;
    ora_entrata?: string;
    ora_uscita?: string;
    is_reperibilita_attiva?: boolean;
    note?: string;
  } = { data: snapshot.data };

  if (snapshot.ora_entrata) payload.ora_entrata = snapshot.ora_entrata;
  if (snapshot.ora_uscita) payload.ora_uscita = snapshot.ora_uscita;
  if (typeof snapshot.is_reperibilita_attiva === 'boolean') {
    payload.is_reperibilita_attiva = snapshot.is_reperibilita_attiva;
  }
  if (snapshot.note) payload.note = snapshot.note;

  return payload;
}

function buildTimbraturaUpdatePayload(snapshot: TimbraturaSnapshot): {
  ora_entrata?: string;
  ora_uscita?: string;
  is_reperibilita_attiva?: boolean;
  note?: string;
} {
  const payload: {
    ora_entrata?: string;
    ora_uscita?: string;
    is_reperibilita_attiva?: boolean;
    note?: string;
  } = {};

  if (snapshot.ora_entrata) payload.ora_entrata = snapshot.ora_entrata;
  if (snapshot.ora_uscita) payload.ora_uscita = snapshot.ora_uscita;
  if (typeof snapshot.is_reperibilita_attiva === 'boolean') {
    payload.is_reperibilita_attiva = snapshot.is_reperibilita_attiva;
  }
  if (snapshot.note) payload.note = snapshot.note;

  return payload;
}

function parseMarcature(value: unknown): Marcatura[] {
  if (Array.isArray(value)) return value as Marcatura[];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Marcatura[]) : [];
  } catch {
    return [];
  }
}

function readIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getWeekBounds(date: string): { start: string; end: string } {
  const parsed = readIsoDate(date);
  if (!parsed) {
    throw new Error('Formato data non valido. Usa YYYY-MM-DD');
  }
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  const monday = new Date(parsed);
  monday.setUTCDate(parsed.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: toIsoDate(monday),
    end: toIsoDate(sunday),
  };
}

function normalizeTimbraturaRecord(row: Record<string, unknown>): Timbratura {
  return {
    ...row,
    id: String(row.id ?? `local_${String(row.data ?? '')}`),
    data: String(row.data ?? ''),
    marcature: parseMarcature(row.marcature),
    ore_lavorate: Number(row.ore_lavorate ?? 0),
    ore_arrotondate: Number(row.ore_arrotondate ?? 0),
    ore_reperibilita: Number(row.ore_reperibilita ?? 0),
    is_reperibilita_attiva: row.is_reperibilita_attiva === true || row.is_reperibilita_attiva === 1,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  } as unknown as Timbratura;
}

function normalizeTimbratureAziendali(
  rows: Record<string, unknown>[],
): TimbraturaAziendaleRecord[] {
  return rows.map((row) => ({
    id: String(row.id ?? row.data ?? ''),
    data: String(row.data ?? ''),
    ora_entrata: typeof row.ora_entrata === 'string' ? row.ora_entrata : null,
    ora_uscita: typeof row.ora_uscita === 'string' ? row.ora_uscita : null,
    ore_lavorate: Number(row.ore_lavorate ?? 0),
    descrizione: typeof row.descrizione === 'string'
      ? row.descrizione
      : (typeof row.note === 'string' ? row.note : null),
  }));
}

function normalizeChatMessageRecord(row: Record<string, unknown>): ChatMessage {
  const id = String(row.id ?? `${Date.now()}`);
  const roleValue = String(row.role ?? row.ruolo ?? 'assistant').toLowerCase();
  const role: ChatMessage['role'] = roleValue === 'user' ? 'user' : 'assistant';
  const content = String(row.content ?? row.contenuto ?? '');
  const timestamp = String(row.timestamp ?? row.created_at ?? new Date().toISOString());
  return { id, role, content, timestamp };
}

function calcolaOreReperibilitaDaOrari(oraInizio: string, oraFine: string): number {
  const [h1, m1] = oraInizio.split(':').map(Number);
  const [h2, m2] = oraFine.split(':').map(Number);
  let minuti = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minuti < 0) minuti += 24 * 60;
  return Number((minuti / 60).toFixed(2));
}

async function replayQueuedOperation(entry: QueuedOperation): Promise<void> {
  if (entry.operation === 'updateSettings') {
    const payload = parseQueuedPayload(entry.payload);
    const response = await api.updateSettings(payload as Partial<UserSettings>);
    await db.upsertSettings(response.data as unknown as Record<string, unknown>);
    return;
  }

  if (entry.operation === 'timbra') {
    const payload = parseQueuedPayload(entry.payload);
    const snapshot = extractTimbraturaSnapshot(payload);

    if (snapshot) {
      const createPayload = buildTimbraturaCreatePayload(snapshot);
      const updatePayload = buildTimbraturaUpdatePayload(snapshot);

      try {
        const response = await api.updateTimbratura(createPayload.data, updatePayload);
        await db.upsertTimbratura(response.data as unknown as Record<string, unknown>);
        return;
      } catch {
        try {
          const response = await api.createTimbratura(createPayload);
          await db.upsertTimbratura(response.data as unknown as Record<string, unknown>);
          return;
        } catch {
          const response = await api.updateTimbratura(createPayload.data, updatePayload);
          await db.upsertTimbratura(response.data as unknown as Record<string, unknown>);
          return;
        }
      }
    }

    const tipo = payload.tipo === 'uscita' ? 'uscita' : 'entrata';
    const isReperibilita = Boolean(payload.is_reperibilita);
    const response = await api.timbra(tipo, isReperibilita);
    await db.upsertTimbratura(response.data as unknown as Record<string, unknown>);
    return;
  }

  if (entry.operation === 'createAssenza') {
    const payload = parseQueuedPayload(entry.payload);
    await api.createAssenza(payload as Parameters<typeof api.createAssenza>[0]);
    return;
  }

  if (entry.operation === 'deleteAssenza') {
    const payload = parseQueuedPayload(entry.payload);
    if (payload.id) await api.deleteAssenza(String(payload.id));
    return;
  }

  if (entry.operation === 'createBustaPaga') {
    const payload = parseQueuedPayload(entry.payload);
    const mese = Number(payload.mese);
    const anno = Number(payload.anno);
    if (!Number.isInteger(mese) || mese < 1 || mese > 12 || !Number.isInteger(anno)) {
      throw new Error('Payload createBustaPaga non valido');
    }
    const requestPayload: Parameters<typeof api.createBustaPaga>[0] = {
      mese,
      anno,
    };
    const lordo = Number(payload.lordo);
    const netto = Number(payload.netto);
    const straordinariOre = Number(payload.straordinari_ore);
    const straordinariImporto = Number(payload.straordinari_importo);
    const trattenuteTotali = Number(payload.trattenute_totali);
    if (Number.isFinite(lordo)) requestPayload.lordo = lordo;
    if (Number.isFinite(netto)) requestPayload.netto = netto;
    if (Number.isFinite(straordinariOre)) requestPayload.straordinari_ore = straordinariOre;
    if (Number.isFinite(straordinariImporto)) requestPayload.straordinari_importo = straordinariImporto;
    if (Number.isFinite(trattenuteTotali)) requestPayload.trattenute_totali = trattenuteTotali;
    const response = await api.createBustaPaga(requestPayload);
    const record = toRecord(response.data);
    if (record) {
      await db.upsertBustaPaga(record).catch(() => {});
    }
    return;
  }

  if (entry.operation === 'updateBustaPaga') {
    const payload = parseQueuedPayload(entry.payload);
    const mese = Number(payload.mese);
    const anno = Number(payload.anno);
    if (!Number.isInteger(mese) || mese < 1 || mese > 12 || !Number.isInteger(anno)) {
      throw new Error('Payload updateBustaPaga non valido');
    }
    const updates = payload.data && typeof payload.data === 'object'
      ? (payload.data as Parameters<typeof api.updateBustaPaga>[2])
      : {};
    const response = await api.updateBustaPaga(anno, mese, updates);
    const record = toRecord(response.data);
    if (record) {
      await db.upsertBustaPaga(record).catch(() => {});
    }
    return;
  }

  if (entry.operation === 'createReperibilita') {
    const payload = parseQueuedPayload(entry.payload);
    const localId = Number(payload.local_id);
    const requestPayload: Parameters<typeof api.createReperibilita>[0] = {
      data: String(payload.data ?? ''),
      ora_inizio: String(payload.ora_inizio ?? ''),
      ora_fine: String(payload.ora_fine ?? ''),
      tipo: payload.tipo === 'attiva' ? 'attiva' : 'passiva',
      interventi: Number(payload.interventi ?? 0),
      note: typeof payload.note === 'string' ? payload.note : undefined,
    };
    const response = await api.createReperibilita(requestPayload);
    if (Number.isFinite(localId) && localId > 0) {
      await db.deleteReperibilita(localId);
    }
    await db.insertReperibilita(response.data as unknown as Record<string, unknown>);
    return;
  }

  if (entry.operation === 'createTimbratura') {
    const payload = parseQueuedPayload(entry.payload);
    const response = await api.createTimbratura(payload as Parameters<typeof api.createTimbratura>[0]);
    await db.upsertTimbratura(response.data as unknown as Record<string, unknown>);
    return;
  }

  if (entry.operation === 'updateTimbratura') {
    const payload = parseQueuedPayload(entry.payload);
    const data = readString(payload.data);
    const updates = payload.updates && typeof payload.updates === 'object'
      ? (payload.updates as Parameters<typeof api.updateTimbratura>[1])
      : {};
    if (!data) {
      throw new Error('Payload updateTimbratura non valido');
    }
    const response = await api.updateTimbratura(data, updates);
    await db.upsertTimbratura(response.data as unknown as Record<string, unknown>);
    return;
  }

  if (entry.operation === 'deleteTimbratura') {
    const payload = parseQueuedPayload(entry.payload);
    const data = readString(payload.data);
    if (!data) {
      throw new Error('Payload deleteTimbratura non valido');
    }
    await api.deleteTimbratura(data);
    return;
  }

  throw new Error(`Operazione offline non supportata: ${entry.operation}`);
}

export async function syncOfflineQueue(): Promise<void> {
  if (!canUseCloud()) return;
  if (offlineQueueSyncPromise) return offlineQueueSyncPromise;

  offlineQueueSyncPromise = (async () => {
    const pending = (await db.getPendingOperations()) as QueuedOperation[];

    for (const entry of pending) {
      if (!canUseCloud()) {
        break;
      }

      try {
        await replayQueuedOperation(entry);
        await db.removeQueuedOperation(entry.id);
        markSynced();
      } catch {
        await db.incrementRetryCount(entry.id);
        break;
      }
    }
  })().finally(() => {
    offlineQueueSyncPromise = null;
  });

  return offlineQueueSyncPromise;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<UserSettings | null> {
  if (canUseCloud()) {
    try {
      const res = await api.getSettings();
      await db.upsertSettings(res.data as unknown as Record<string, unknown>);
      markSynced();
      return res.data;
    } catch {
      // fallback al locale
    }
  }
  const local = await db.getSettings();
  return local as unknown as UserSettings | null;
}

export async function updateSettings(data: Partial<UserSettings>): Promise<UserSettings | null> {
  // Salva in locale immediatamente
  await db.upsertSettings(data as Record<string, unknown>);
  if (canUseCloud()) {
    try {
      const res = await api.updateSettings(data);
      await db.upsertSettings(res.data as unknown as Record<string, unknown>);
      markSynced();
      void syncOfflineQueue();
      return res.data;
    } catch {
      await db.enqueueOperation('updateSettings', '/settings', 'PUT', data);
    }
  } else {
    await db.enqueueOperation('updateSettings', '/settings', 'PUT', data);
  }
  const local = await db.getSettings();
  return local as unknown as UserSettings | null;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(): Promise<DashboardData | null> {
  if (canUseCloud()) {
    try {
      const res = await api.getDashboard();
      // Salva settings embedded nella dashboard
      if (res.data.settings) {
        await db.upsertSettings(res.data.settings as unknown as Record<string, unknown>);
      }
      markSynced();
      return res.data;
    } catch {
      // fallback al calcolo locale
    }
  }
  return _buildDashboardLocale();
}

async function _buildDashboardLocale(): Promise<DashboardData | null> {
  const settings = await db.getSettings() as Record<string, unknown> | null;
  if (!settings) return null;

  const now = new Date();
  const mese = now.getMonth() + 1;
  const anno = now.getFullYear();
  const timbrature = await db.getTimbrature(mese, anno) as Array<Record<string, unknown>>;
  const assenze = await db.getAssenze() as Array<Record<string, unknown>>;
  const alerts = await db.getAlerts(true);

  const oreMese = timbrature.reduce((sum, t) => sum + ((t.ore_arrotondate as number) || 0), 0);
  const oreOrdinarie = Math.min(oreMese, 169);
  const oreStraordinarie = Math.max(0, oreMese - 169);
  const giorni = timbrature.length;

  const stima = stimaNetto(settings, oreMese, timbrature);
  const saldoFerie = calcolaSaldoFerie(
    assenze.filter(a => a.tipo === 'ferie') as Array<{ data_inizio: string; ore_totali: number }>,
    anno
  );
  const comporto = calcolaComporto(
    assenze.filter(a => a.tipo === 'malattia') as Array<{ data_inizio: string; data_fine: string }>
  );

  return {
    mese_corrente: {
      mese, anno,
      ore_lavorate: oreMese,
      ore_ordinarie: oreOrdinarie,
      ore_straordinarie: oreStraordinarie,
      giorni_lavorati: giorni,
      ticket_maturati: stima.ticket_totale > 0
        ? Math.round(stima.ticket_totale / ((settings.ticket_valore as number) || 1))
        : 0,
    },
    stime: {
      lordo_stimato: stima.lordo_stimato,
      netto_stimato: stima.netto_stimato,
      straordinario_stimato: stima.straordinario_stimato,
      ticket_totale: stima.ticket_totale,
      ha_dati_contrattuali: stima.metadati.ha_dati_contrattuali,
      ha_dati_operativi_mese: stima.metadati.ha_dati_operativi_mese,
      metadati: stima.metadati,
    },
    ferie: saldoFerie,
    comporto,
    ultima_busta: undefined,
    alerts_non_letti: alerts.length,
    settings: settings as unknown as UserSettings,
  };
}

export async function getStatisticheMensili(anno?: number): Promise<StatisticheMensiliItem[]> {
  if (canUseCloud()) {
    try {
      const res = await api.getStatisticheMensili(anno);
      markSynced();
      return res.data as StatisticheMensiliItem[];
    } catch {
      // fallback locale
    }
  }

  const year = anno ?? new Date().getFullYear();
  const timbratureRows = await db.getTimbrature();
  const busteRows = await db.getBustePaga(year);

  return Array.from({ length: 12 }, (_, index) => {
    const mese = index + 1;
    const prefix = `${year}-${String(mese).padStart(2, '0')}`;
    const timbratureMese = timbratureRows.filter((row) => String(row.data ?? '').startsWith(prefix));
    const oreTotali = timbratureMese.reduce((sum, row) => sum + Number(row.ore_arrotondate ?? 0), 0);
    const busta = busteRows.find((row) => Number(row.mese ?? 0) === mese);
    return {
      mese,
      anno: year,
      ore_lavorate: Number(oreTotali.toFixed(2)),
      ore_straordinarie: Number(Math.max(0, oreTotali - 169).toFixed(2)),
      netto: Number(busta?.netto ?? 0),
      giorni_lavorati: timbratureMese.filter((row) => Number(row.ore_arrotondate ?? 0) > 0).length,
    };
  });
}

// ─── Timbrature ───────────────────────────────────────────────────────────────

export async function getTimbrature(params?: { mese?: number; anno?: number }): Promise<Timbratura[]> {
  const parseLocal = (rows: Record<string, unknown>[]) => rows.map(t => ({
    ...t,
    marcature: typeof t.marcature === 'string' ? JSON.parse(t.marcature as string) : (t.marcature ?? []),
  })) as unknown as Timbratura[];

  if (canUseCloud()) {
    try {
      const res = await api.getTimbrature(params);
      for (const t of res.data) {
        await db.upsertTimbratura(t as unknown as Record<string, unknown>);
      }
      markSynced();
      // Merge: include local records not yet synced to backend (offline queue pending)
      const local = await db.getTimbrature(params?.mese, params?.anno);
      const cloudDates = new Set(res.data.map((t: Timbratura) => t.data as string));
      const unsyncedLocal = local.filter(t => !cloudDates.has(t.data as string));
      return [
        ...res.data as unknown as Timbratura[],
        ...parseLocal(unsyncedLocal),
      ];
    } catch {
      // fallback al locale
    }
  }
  const local = await db.getTimbrature(params?.mese, params?.anno);
  return parseLocal(local);
}

export async function getWeeklySummary(data: string): Promise<WeeklySummary> {
  if (canUseCloud()) {
    try {
      const res = await api.getWeeklySummary(data);
      for (const timbratura of res.data.timbrature ?? []) {
        await db.upsertTimbratura(timbratura as unknown as Record<string, unknown>);
      }
      markSynced();
      return res.data;
    } catch {
      // fallback locale
    }
  }

  const { start, end } = getWeekBounds(data);
  const localRows = await db.getTimbrature();
  const timbratureSettimana = localRows
    .filter((row) => {
      const value = typeof row.data === 'string' ? row.data : '';
      return value >= start && value <= end;
    })
    .sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
    .map((row) => normalizeTimbraturaRecord(row));

  const oreTotali = timbratureSettimana.reduce((sum, row) => sum + (row.ore_arrotondate || 0), 0);
  const oreOrdinarie = Math.min(oreTotali, 40);
  const oreStraordinarie = Math.max(0, oreTotali - 40);

  return {
    settimana_inizio: start,
    settimana_fine: end,
    timbrature: timbratureSettimana,
    ore_totali: Number(oreTotali.toFixed(2)),
    ore_ordinarie: Number(oreOrdinarie.toFixed(2)),
    ore_straordinarie: Number(oreStraordinarie.toFixed(2)),
    giorni_lavorati: timbratureSettimana.filter((row) => (row.ore_arrotondate || 0) > 0).length,
  };
}

export async function getTimbraturaByDate(data: string): Promise<Timbratura | null> {
  if (canUseCloud()) {
    try {
      const res = await api.getTimbraturaByDate(data);
      await db.upsertTimbratura(res.data as unknown as Record<string, unknown>);
      return res.data;
    } catch {
      // fallback
    }
  }
  const local = await db.getTimbraturaByData(data);
  if (!local) return null;
  return {
    ...local,
    marcature: typeof local.marcature === 'string'
      ? JSON.parse(local.marcature as string)
      : (local.marcature ?? []),
  } as unknown as Timbratura;
}

export async function createTimbratura(
  data: Parameters<typeof api.createTimbratura>[0],
): Promise<Timbratura> {
  const existing = await db.getTimbraturaByData(data.data);
  if (existing) {
    throw new Error('Timbratura già esistente per questa data');
  }

  const manualMarcature: Marcatura[] = [];
  if (data.ora_entrata) {
    manualMarcature.push({
      id: `local_entrata_${Date.now()}`,
      tipo: 'entrata',
      ora: data.ora_entrata,
      is_reperibilita: Boolean(data.is_reperibilita_attiva),
      created_at: new Date().toISOString(),
    });
  }
  if (data.ora_uscita) {
    manualMarcature.push({
      id: `local_uscita_${Date.now()}`,
      tipo: 'uscita',
      ora: data.ora_uscita,
      is_reperibilita: Boolean(data.is_reperibilita_attiva),
      created_at: new Date().toISOString(),
    });
  }

  const [oreLavorate, oreArrotondate] = calcolaOreLavorate(data.ora_entrata ?? null, data.ora_uscita ?? null);
  const localRecord: Record<string, unknown> = {
    data: data.data,
    ora_entrata: data.ora_entrata ?? null,
    ora_uscita: data.ora_uscita ?? null,
    marcature: JSON.stringify(manualMarcature),
    ore_lavorate: oreLavorate,
    ore_arrotondate: oreArrotondate,
    ore_reperibilita: calcolaOreReperibilita(manualMarcature),
    is_reperibilita_attiva: Boolean(data.is_reperibilita_attiva),
    note: data.note ?? null,
    created_at: new Date().toISOString(),
  };
  await db.upsertTimbratura(localRecord);

  if (canUseCloud()) {
    try {
      const res = await api.createTimbratura(data);
      await db.upsertTimbratura(res.data as unknown as Record<string, unknown>);
      markSynced();
      void syncOfflineQueue();
      return res.data;
    } catch {
      await db.enqueueOperation('createTimbratura', '/timbrature', 'POST', data);
    }
  } else {
    await db.enqueueOperation('createTimbratura', '/timbrature', 'POST', data);
  }

  return normalizeTimbraturaRecord(localRecord);
}

export async function updateTimbratura(
  data: string,
  updates: Parameters<typeof api.updateTimbratura>[1],
): Promise<Timbratura> {
  const localExisting = await db.getTimbraturaByData(data);

  if (!localExisting && canUseCloud()) {
    try {
      const res = await api.updateTimbratura(data, updates);
      await db.upsertTimbratura(res.data as unknown as Record<string, unknown>);
      markSynced();
      return res.data;
    } catch {
      throw new Error('Timbratura non trovata');
    }
  }

  if (!localExisting) {
    throw new Error('Timbratura non trovata');
  }

  const nextOraEntrata = updates.ora_entrata ?? (
    typeof localExisting.ora_entrata === 'string' ? localExisting.ora_entrata : undefined
  );
  const nextOraUscita = updates.ora_uscita ?? (
    typeof localExisting.ora_uscita === 'string' ? localExisting.ora_uscita : undefined
  );
  const nextReperibilita = updates.is_reperibilita_attiva ?? (
    localExisting.is_reperibilita_attiva === true || localExisting.is_reperibilita_attiva === 1
  );

  const manualMarcature: Marcatura[] = [];
  if (nextOraEntrata) {
    manualMarcature.push({
      id: `local_entrata_${Date.now()}`,
      tipo: 'entrata',
      ora: nextOraEntrata,
      is_reperibilita: Boolean(nextReperibilita),
      created_at: new Date().toISOString(),
    });
  }
  if (nextOraUscita) {
    manualMarcature.push({
      id: `local_uscita_${Date.now()}`,
      tipo: 'uscita',
      ora: nextOraUscita,
      is_reperibilita: Boolean(nextReperibilita),
      created_at: new Date().toISOString(),
    });
  }

  const [oreLavorate, oreArrotondate] = calcolaOreLavorate(nextOraEntrata ?? null, nextOraUscita ?? null);
  const localRecord: Record<string, unknown> = {
    ...localExisting,
    data,
    ora_entrata: nextOraEntrata ?? null,
    ora_uscita: nextOraUscita ?? null,
    marcature: JSON.stringify(manualMarcature),
    ore_lavorate: oreLavorate,
    ore_arrotondate: oreArrotondate,
    ore_reperibilita: calcolaOreReperibilita(manualMarcature),
    is_reperibilita_attiva: Boolean(nextReperibilita),
    note: updates.note ?? localExisting.note ?? null,
    created_at: localExisting.created_at ?? new Date().toISOString(),
  };
  await db.upsertTimbratura(localRecord);

  if (canUseCloud()) {
    try {
      const res = await api.updateTimbratura(data, updates);
      await db.upsertTimbratura(res.data as unknown as Record<string, unknown>);
      markSynced();
      void syncOfflineQueue();
      return res.data;
    } catch {
      await db.enqueueOperation('updateTimbratura', `/timbrature/${data}`, 'PUT', { data, updates });
    }
  } else {
    await db.enqueueOperation('updateTimbratura', `/timbrature/${data}`, 'PUT', { data, updates });
  }

  return normalizeTimbraturaRecord(localRecord);
}

export async function deleteTimbratura(data: string): Promise<void> {
  await db.deleteTimbratura(data);

  if (canUseCloud()) {
    try {
      await api.deleteTimbratura(data);
      markSynced();
      void syncOfflineQueue();
      return;
    } catch {
      await db.enqueueOperation('deleteTimbratura', `/timbrature/${data}`, 'DELETE', { data });
    }
  } else {
    await db.enqueueOperation('deleteTimbratura', `/timbrature/${data}`, 'DELETE', { data });
  }
}

/**
 * TIMBRA — funzione critica offline-first.
 * Salva in SQLite locale IMMEDIATAMENTE, poi tenta sync con backend.
 */
export async function timbra(
  tipo: 'entrata' | 'uscita',
  isReperibilita = false
): Promise<Timbratura> {
  const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const data = new Date().toISOString().split('T')[0];

  // Leggi timbratura locale esistente per oggi
  const existing = await db.getTimbraturaByData(data) as Record<string, unknown> | null;
  const marcatureEsistenti: Marcatura[] = existing?.marcature
    ? (typeof existing.marcature === 'string'
        ? JSON.parse(existing.marcature as string)
        : existing.marcature as Marcatura[])
    : [];

  // Aggiungi la nuova marcatura
  const nuovaMarcatura: Marcatura = {
    id: `local_${Date.now()}`,
    tipo,
    ora,
    is_reperibilita: isReperibilita,
    created_at: new Date().toISOString(),
  };
  const nuoveMarcature = [...marcatureEsistenti, nuovaMarcatura];

  // Calcola ore
  const [oreLavorate, oreArrotondate] = tipo === 'uscita' && marcatureEsistenti.length > 0
    ? calcolaOreLavorate(
        marcatureEsistenti.find(m => m.tipo === 'entrata')?.ora ?? null,
        ora
      )
    : [0, 0];

  const oreReperibilita = calcolaOreReperibilita(nuoveMarcature);
  const oraEntrata = nuoveMarcature.find(m => m.tipo === 'entrata')?.ora ?? existing?.ora_entrata ?? null;
  const oraUscita = tipo === 'uscita' ? ora : (existing?.ora_uscita ?? null);

  // Salva in locale IMMEDIATAMENTE
  const timbraturaLocale: Record<string, unknown> = {
    data,
    ora_entrata: oraEntrata,
    ora_uscita: oraUscita,
    marcature: JSON.stringify(nuoveMarcature),
    ore_lavorate: oreLavorate,
    ore_arrotondate: oreArrotondate,
    ore_reperibilita: oreReperibilita,
    is_reperibilita_attiva: isReperibilita,
  };
  await db.upsertTimbratura(timbraturaLocale);

  // Tenta sync con backend
  if (canUseCloud()) {
    try {
      const res = await api.timbra(tipo, isReperibilita);
      // Aggiorna locale con i dati ufficiali del backend
      await db.upsertTimbratura(res.data as unknown as Record<string, unknown>);
      markSynced();
      void syncOfflineQueue();
      return res.data;
    } catch {
      await db.enqueueOperation('timbra', '/timbrature/timbra', 'POST', {
        tipo,
        is_reperibilita: isReperibilita,
        timbratura: timbraturaLocale,
      });
    }
  } else {
    await db.enqueueOperation('timbra', '/timbrature/timbra', 'POST', {
      tipo,
      is_reperibilita: isReperibilita,
      timbratura: timbraturaLocale,
    });
  }

  // Ritorna la versione locale
  return {
    ...timbraturaLocale,
    id: `local_${data}`,
    marcature: nuoveMarcature,
    created_at: new Date().toISOString(),
  } as unknown as Timbratura;
}

export async function getTimbratureAziendali(
  params?: { mese?: number; anno?: number },
): Promise<TimbraturaAziendaleRecord[]> {
  if (canUseCloud()) {
    try {
      const res = await api.getTimbratureAziendali(params);
      const rows = (res.data as Record<string, unknown>[]) ?? [];
      for (const row of rows) {
        await db.upsertTimbraturaAziendale({
          data: row.data,
          ora_entrata: row.ora_entrata ?? null,
          ora_uscita: row.ora_uscita ?? null,
          ore_lavorate: row.ore_lavorate ?? 0,
          note: row.descrizione ?? row.note ?? null,
          fonte: row.fonte ?? 'api',
        });
      }
      markSynced();
      return normalizeTimbratureAziendali(rows);
    } catch {
      // fallback locale
    }
  }

  const localRows = await db.getTimbratureAziendali(params?.mese, params?.anno);
  return normalizeTimbratureAziendali(localRows);
}

export async function uploadTimbratureAziendali(
  file: FormData,
): Promise<api.PdfUploadResponse> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per caricare il report timbrature aziendali.');
  }

  const res = await api.uploadTimbratureAziendali(file);
  const mese = Number(res.data.mese);
  const anno = Number(res.data.anno);

  if (Number.isFinite(mese) && Number.isFinite(anno)) {
    try {
      const lista = await api.getTimbratureAziendali({ mese, anno });
      for (const row of (lista.data as Record<string, unknown>[]) ?? []) {
        await db.upsertTimbraturaAziendale({
          data: row.data,
          ora_entrata: row.ora_entrata ?? null,
          ora_uscita: row.ora_uscita ?? null,
          ore_lavorate: row.ore_lavorate ?? 0,
          note: row.descrizione ?? row.note ?? null,
          fonte: row.fonte ?? 'api',
        });
      }
    } catch {
      // Non bloccare il successo upload se il refresh cache locale fallisce
    }
  }

  markSynced();
  return res.data;
}

export async function getConfrontoTimbrature(
  mese: number,
  anno: number,
): Promise<ConfrontoTimbratureResponse> {
  if (canUseCloud()) {
    try {
      const res = await api.getConfrontoTimbrature(mese, anno);
      markSynced();
      return res.data as ConfrontoTimbratureResponse;
    } catch {
      // fallback locale
    }
  }

  const personaliRows = await db.getTimbrature(mese, anno);
  const aziendaliRows = await db.getTimbratureAziendali(mese, anno);
  const personali = new Map(
    personaliRows.map((row) => [String(row.data ?? ''), normalizeTimbraturaRecord(row)]),
  );
  const aziendali = new Map(
    normalizeTimbratureAziendali(aziendaliRows).map((row) => [row.data, row]),
  );

  const allDates = new Set<string>([
    ...Array.from(personali.keys()),
    ...Array.from(aziendali.keys()),
  ]);

  const confronti = Array.from(allDates)
    .filter((data) => data)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const personale = personali.get(date);
      const aziendale = aziendali.get(date);
      const personaleOre = personale?.ore_arrotondate ?? 0;
      const aziendaleOre = aziendale?.ore_lavorate ?? 0;
      const differenza = Number((personaleOre - aziendaleOre).toFixed(2));
      return {
        data: date,
        personale_entrata: personale?.ora_entrata ?? null,
        personale_uscita: personale?.ora_uscita ?? null,
        personale_ore: personaleOre,
        aziendale_entrata: aziendale?.ora_entrata ?? null,
        aziendale_uscita: aziendale?.ora_uscita ?? null,
        aziendale_ore: aziendaleOre,
        aziendale_descrizione: aziendale?.descrizione ?? null,
        differenza_ore: differenza,
        has_discrepancy: Math.abs(differenza) > 0.25,
      };
    });

  return {
    mese,
    anno,
    confronti,
    riepilogo: {
      giorni_totali: confronti.length,
      giorni_con_discrepanza: confronti.filter((item) => item.has_discrepancy).length,
      differenza_ore_totale: Number(
        confronti.reduce((sum, item) => sum + item.differenza_ore, 0).toFixed(2),
      ),
      ore_personali_totali: Number(
        confronti.reduce((sum, item) => sum + item.personale_ore, 0).toFixed(2),
      ),
      ore_aziendali_totali: Number(
        confronti.reduce((sum, item) => sum + item.aziendale_ore, 0).toFixed(2),
      ),
    },
  };
}

// ─── Assenze ──────────────────────────────────────────────────────────────────

export async function getAssenze(params?: { tipo?: string; anno?: number }) {
  if (canUseCloud()) {
    try {
      const res = await api.getAssenze(params);
      for (const a of res.data) {
        await db.insertAssenza(a as unknown as Record<string, unknown>).catch(() => {});
      }
      markSynced();
      return res.data;
    } catch { /* fallback */ }
  }
  return db.getAssenze();
}

export async function getSaldoFerie(anno?: number) {
  if (canUseCloud()) {
    try {
      const res = await api.getSaldoFerie(anno);
      return res.data;
    } catch { /* fallback */ }
  }
  const assenze = await db.getAssenze() as Array<Record<string, unknown>>;
  return calcolaSaldoFerie(
    assenze.filter(a => a.tipo === 'ferie') as Array<{ data_inizio: string; ore_totali: number }>,
    anno
  );
}

export async function getComporto() {
  if (canUseCloud()) {
    try {
      const res = await api.getComporto();
      return res.data;
    } catch { /* fallback */ }
  }
  const assenze = await db.getAssenze() as Array<Record<string, unknown>>;
  return calcolaComporto(
    assenze.filter(a => a.tipo === 'malattia') as Array<{ data_inizio: string; data_fine: string }>
  );
}

// ─── Buste Paga ───────────────────────────────────────────────────────────────

export async function getBustePaga(anno?: number) {
  if (canUseCloud()) {
    try {
      const res = await api.getBustePaga(anno);
      for (const b of res.data) {
        await db.upsertBustaPaga(b as unknown as Record<string, unknown>);
      }
      markSynced();
      return res.data;
    } catch { /* fallback */ }
  }
  return db.getBustePaga(anno);
}

export async function createBustaPaga(
  data: Parameters<typeof api.createBustaPaga>[0],
): Promise<Record<string, unknown>> {
  const localRecord: Record<string, unknown> = {
    mese: data.mese,
    anno: data.anno,
    lordo: data.lordo ?? 0,
    netto: data.netto ?? 0,
    straordinari_ore: data.straordinari_ore ?? 0,
    straordinari_importo: data.straordinari_importo ?? 0,
    trattenute_totali: data.trattenute_totali ?? 0,
    created_at: new Date().toISOString(),
    synced: 0,
  };
  await db.upsertBustaPaga(localRecord);

  if (canUseCloud()) {
    try {
      const res = await api.createBustaPaga(data);
      const remoteRecord = toRecord(res.data);
      if (remoteRecord) {
        await db.upsertBustaPaga(remoteRecord).catch(() => {});
      }
      markSynced();
      void syncOfflineQueue();
      const local = await db.getBustaPaga(data.anno, data.mese);
      return (remoteRecord ?? local ?? localRecord) as Record<string, unknown>;
    } catch {
      await db.enqueueOperation('createBustaPaga', '/buste-paga', 'POST', data);
    }
  } else {
    await db.enqueueOperation('createBustaPaga', '/buste-paga', 'POST', data);
  }

  const local = await db.getBustaPaga(data.anno, data.mese);
  return (local ?? localRecord) as Record<string, unknown>;
}

export async function updateBustaPaga(
  anno: number,
  mese: number,
  data: Parameters<typeof api.updateBustaPaga>[2],
): Promise<Record<string, unknown>> {
  const existing = await db.getBustaPaga(anno, mese);
  const localRecord: Record<string, unknown> = {
    ...(existing ?? {}),
    ...(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
    anno,
    mese,
    created_at: typeof existing?.created_at === 'string'
      ? existing.created_at
      : new Date().toISOString(),
    synced: 0,
  };
  await db.upsertBustaPaga(localRecord);

  if (canUseCloud()) {
    try {
      const res = await api.updateBustaPaga(anno, mese, data);
      const remoteRecord = toRecord(res.data);
      if (remoteRecord) {
        await db.upsertBustaPaga(remoteRecord).catch(() => {});
      }
      markSynced();
      void syncOfflineQueue();
      const local = await db.getBustaPaga(anno, mese);
      return (remoteRecord ?? local ?? localRecord) as Record<string, unknown>;
    } catch {
      await db.enqueueOperation('updateBustaPaga', `/buste-paga/${anno}/${mese}`, 'PUT', {
        anno,
        mese,
        data,
      });
    }
  } else {
    await db.enqueueOperation('updateBustaPaga', `/buste-paga/${anno}/${mese}`, 'PUT', {
      anno,
      mese,
      data,
    });
  }

  const local = await db.getBustaPaga(anno, mese);
  return (local ?? localRecord) as Record<string, unknown>;
}

export async function uploadCud(
  file: FormData,
): Promise<{ documento: Record<string, unknown>; anno: number }> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per caricare il CUD.');
  }

  const res = await api.uploadCud(file);
  const documento = toRecord(res.data.documento);
  if (documento) {
    await db.insertDocumento(documento).catch(() => {});
  }
  markSynced();
  return res.data as unknown as { documento: Record<string, unknown>; anno: number };
}

export async function uploadBustaPagaAuto(file: FormData): Promise<api.PdfUploadResponse> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per caricare la busta paga.');
  }

  const res = await api.uploadBustaPagaAuto(file);
  if (res.data.busta) {
    await db.upsertBustaPaga(res.data.busta as unknown as Record<string, unknown>);
  }
  if (res.data.documento) {
    await db.insertDocumento(res.data.documento as unknown as Record<string, unknown>).catch(() => {});
  }
  markSynced();
  return res.data;
}

// ─── Reperibilità ─────────────────────────────────────────────────────────────

export async function getReperibilita(params?: { mese?: number; anno?: number }) {
  if (canUseCloud()) {
    try {
      const res = await api.getReperibilita(params);
      markSynced();
      return res.data;
    } catch { /* fallback */ }
  }
  return db.getReperibilita(params?.mese, params?.anno);
}

export async function createReperibilita(
  data: Parameters<typeof api.createReperibilita>[0],
): Promise<Reperibilita> {
  const oreTotali = calcolaOreReperibilitaDaOrari(data.ora_inizio, data.ora_fine);
  const interventi = Number(data.interventi ?? 0);
  const tipo = data.tipo === 'attiva' ? 'attiva' : 'passiva';
  const compenso = tipo === 'attiva'
    ? Number((interventi * 100).toFixed(2))
    : Number((oreTotali * 4).toFixed(2));

  if (canUseCloud()) {
    try {
      const res = await api.createReperibilita(data);
      await db.insertReperibilita(res.data as unknown as Record<string, unknown>);
      markSynced();
      void syncOfflineQueue();
      return res.data;
    } catch {
      // fallback su coda locale
    }
  }

  const localRecord: Record<string, unknown> = {
    data: data.data,
    ora_inizio: data.ora_inizio,
    ora_fine: data.ora_fine,
    ore_totali: oreTotali,
    interventi,
    compenso_calcolato: compenso,
    tipo,
    note: data.note ?? null,
    created_at: new Date().toISOString(),
  };
  const localId = await db.insertReperibilita(localRecord);
  await db.enqueueOperation('createReperibilita', '/reperibilita', 'POST', {
    ...data,
    local_id: localId,
  });

  return {
    id: String(localId),
    data: data.data,
    ora_inizio: data.ora_inizio,
    ora_fine: data.ora_fine,
    tipo,
    ore_totali: oreTotali,
    interventi,
    compenso_calcolato: compenso,
    note: data.note,
    created_at: new Date().toISOString(),
  };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlerts(soloNonLetti?: boolean) {
  if (canUseCloud()) {
    try {
      const res = await api.getAlerts(soloNonLetti);
      return res.data;
    } catch { /* fallback */ }
  }
  return db.getAlerts(soloNonLetti);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function getChatHistory(limit = 50): Promise<ChatMessage[]> {
  if (canUseCloud()) {
    try {
      const res = await api.getChatHistory(limit);
      await db.deleteChatHistory();
      for (const message of res.data as unknown as Record<string, unknown>[]) {
        const normalized = normalizeChatMessageRecord(message);
        await db.insertChatMessage({
          session_id: null,
          ruolo: normalized.role,
          contenuto: normalized.content,
          created_at: normalized.timestamp,
        });
      }
      markSynced();
      return res.data as ChatMessage[];
    } catch {
      // fallback locale
    }
  }

  const localRows = await db.getChatHistory(limit);
  return [...localRows]
    .reverse()
    .map((row) => normalizeChatMessageRecord(row));
}

export async function sendChatMessage(
  message: string,
  sessionId?: string,
): Promise<{ response: string; session_id: string }> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per utilizzare la chat AI.');
  }

  const res = await api.sendChatMessage(message, sessionId);
  await db.insertChatMessage({
    session_id: res.data.session_id,
    ruolo: 'user',
    contenuto: message,
    created_at: new Date().toISOString(),
  });
  await db.insertChatMessage({
    session_id: res.data.session_id,
    ruolo: 'assistant',
    contenuto: res.data.response,
    created_at: new Date().toISOString(),
  });
  markSynced();
  return res.data;
}

export async function clearChatHistory(): Promise<{ message: string }> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per cancellare la cronologia chat.');
  }

  const res = await api.clearChatHistory();
  await db.deleteChatHistory();
  markSynced();
  return res.data as { message: string };
}

// ─── Assenze (write) ───────────────────────────────────────────────────────────

export async function createAssenza(data: {
  tipo: string;
  data_inizio: string;
  data_fine: string;
  ore_totali?: number;
  note?: string;
}): Promise<Record<string, unknown>> {
  // Salva in locale IMMEDIATAMENTE
  const localRecord = {
    ...data,
    created_at: new Date().toISOString(),
    synced: 0,
  };
  const lastInsertRowId = await db.insertAssenza(localRecord);
  if (canUseCloud()) {
    try {
      const res = await api.createAssenza(data);
      markSynced();
      void syncOfflineQueue();
      return res.data as unknown as Record<string, unknown>;
    } catch {
      await db.enqueueOperation('createAssenza', '/assenze', 'POST', data);
    }
  } else {
    await db.enqueueOperation('createAssenza', '/assenze', 'POST', data);
  }
  return { ...localRecord, id: lastInsertRowId };
}

export async function deleteAssenza(id: string): Promise<void> {
  // Elimina in locale IMMEDIATAMENTE
  await db.deleteAssenza(Number(id));
  if (canUseCloud()) {
    try {
      await api.deleteAssenza(id);
      markSynced();
      void syncOfflineQueue();
      return;
    } catch {
      await db.enqueueOperation('deleteAssenza', `/assenze/${id}`, 'DELETE', { id });
    }
  } else {
    await db.enqueueOperation('deleteAssenza', `/assenze/${id}`, 'DELETE', { id });
  }
}

// ─── Documenti ─────────────────────────────────────────────────────────────────

export async function getDocumenti(tipo?: string): Promise<Record<string, unknown>[]> {
  if (canUseCloud()) {
    try {
      const res = await api.getDocumenti(tipo);
      for (const d of res.data) {
        await db.insertDocumento(d as unknown as Record<string, unknown>).catch(() => {});
      }
      markSynced();
      return res.data as unknown as Record<string, unknown>[];
    } catch { /* fallback */ }
  }
  return db.getDocumenti(tipo);
}

export async function deletePersonalData(
  conferma = true,
): Promise<api.CancellaDatiPersonaliResponse> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per cancellare i dati operativi.');
  }
  const res = await api.deletePersonalData(conferma);
  markSynced();
  return res.data;
}

export async function deleteAccount(
  conferma = true,
): Promise<api.EliminaAccountResponse> {
  if (!canUseCloud()) {
    throw new Error('Connessione necessaria per eliminare l’account.');
  }
  const res = await api.deleteAccount(conferma);
  await db.clearAccount();
  markSynced();
  return res.data;
}
