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
import { UserSettings, Timbratura, DashboardData } from '../types';
import {
  stimaNetto,
  calcolaSaldoFerie,
  calcolaComporto,
  calcolaOreLavorate,
  calcolaOreDaMarcature,
  calcolaOreReperibilita,
  Marcatura,
} from '../algorithms/calcoli';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica se il backend cloud è raggiungibile e abilitato dall'utente. */
function canUseCloud(): boolean {
  const { isOnline, cloudEnabled } = useAppStore.getState();
  return isOnline && cloudEnabled;
}

function markSynced(): void {
  useAppStore.getState().setLastSyncAt(new Date().toISOString());
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

// ─── Timbrature ───────────────────────────────────────────────────────────────

export async function getTimbrature(params?: { mese?: number; anno?: number }): Promise<Timbratura[]> {
  if (canUseCloud()) {
    try {
      const res = await api.getTimbrature(params);
      for (const t of res.data) {
        await db.upsertTimbratura(t as unknown as Record<string, unknown>);
      }
      markSynced();
      return res.data;
    } catch {
      // fallback al locale
    }
  }
  const local = await db.getTimbrature(params?.mese, params?.anno);
  return local.map(t => ({
    ...t,
    marcature: typeof t.marcature === 'string' ? JSON.parse(t.marcature as string) : (t.marcature ?? []),
  })) as unknown as Timbratura[];
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
      return res.data;
    } catch {
      await db.enqueueOperation('timbra', '/timbrature/timbra', 'POST', { tipo, is_reperibilita: isReperibilita });
    }
  } else {
    await db.enqueueOperation('timbra', '/timbrature/timbra', 'POST', { tipo, is_reperibilita: isReperibilita });
  }

  // Ritorna la versione locale
  return {
    ...timbraturaLocale,
    id: `local_${data}`,
    marcature: nuoveMarcature,
    created_at: new Date().toISOString(),
  } as unknown as Timbratura;
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
