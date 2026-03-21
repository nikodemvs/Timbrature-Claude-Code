/**
 * calcoli.ts — Algoritmi di calcolo (Fase 2 offline-first)
 *
 * Port TypeScript FEDELE degli algoritmi protetti in backend/server.py.
 * Stessa logica, stessi risultati. Nessuna ottimizzazione.
 *
 * ZONA PROTETTA (mirror di backend/server.py):
 * - arrotondaQuartiOra       ← arrotonda_quarti_ora        (L1452)
 * - calcolaOreLavorate        ← calcola_ore_lavorate         (L1464)
 * - calcolaStraordinario      ← calcola_straordinario        (L1485)
 * - calcolaTicket             ← calcola_ticket               (L1505)
 * - calcolaReperibilitaPassiva← calcola_reperibilita_passiva (L1508)
 * - calcolaReperibilitaAttiva ← calcola_reperibilita_attiva  (L1511)
 * - calcolaOreDaMarcature     ← calcola_ore_da_marcature     (L1514)
 * - calcolaOreReperibilita    ← calcola_ore_reperibilita     (L1527)
 * - calcolaMetadatiStima      ← _calcola_metadati_stima      (L1336)
 * - stimaNetto                ← dashboard get_dashboard()    (L2513)
 * - calcolaSaldoFerie         ← get_saldo_ferie()            (L1920)
 * - calcolaComporto           ← get_comporto()               (L1947)
 *
 * Qualsiasi modifica futura agli algoritmi va applicata a ENTRAMBI i file.
 * Se un test unitario fallisce, il test è sbagliato — non la funzione.
 */

// ─── Tipi locali ──────────────────────────────────────────────────────────────

export interface Marcatura {
  id: string;
  tipo: 'entrata' | 'uscita';
  ora: string;
  is_reperibilita: boolean;
  created_at?: string;
}

export interface StraordinarioResult {
  percentuale: number;
  importo_ora: number;
  bonus_intervento: number;
}

export interface MetadatiStima {
  ha_dati_contrattuali: boolean;
  ha_dati_operativi_mese: boolean;
  sorgente: string;
  stato: string;
}

export interface StimaResult {
  lordo_stimato: number;
  netto_stimato: number;
  straordinario_stimato: number;
  ticket_totale: number;
  metadati: MetadatiStima;
}

export interface SaldoFerie {
  anno: number;
  monte_annuo: number;
  maturazione_mensile: number;
  residuo_anno_precedente: number;
  ore_maturate: number;
  ore_godute: number;
  saldo_attuale: number;
}

export interface ComportoResult {
  giorni_malattia_3_anni: number;
  soglia_attenzione: number;
  soglia_critica: number;
  alert_attenzione: boolean;
  alert_critico: boolean;
  giorni_disponibili: number;
}

// ─── arrotonda_quarti_ora (L1452) ─────────────────────────────────────────────

export function arrotondaQuartiOra(minuti: number): number {
  if (minuti === 0) return 0;
  else if (minuti <= 15) return 15;
  else if (minuti <= 30) return 30;
  else if (minuti <= 45) return 45;
  else return 60;
}

// ─── calcola_ore_lavorate (L1464) ─────────────────────────────────────────────

export function calcolaOreLavorate(
  oraEntrata: string | null | undefined,
  oraUscita: string | null | undefined
): [number, number] {
  if (!oraEntrata || !oraUscita) return [0.0, 0.0];
  try {
    const [h1, m1] = oraEntrata.split(':').map(Number);
    const [h2, m2] = oraUscita.split(':').map(Number);
    let minutiTotali = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (minutiTotali < 0) minutiTotali += 24 * 60;
    const oreEffettive = minutiTotali / 60;
    const oreIntere = Math.floor(minutiTotali / 60);
    const minutiResidui = minutiTotali % 60;
    const minutiArrotondati = arrotondaQuartiOra(minutiResidui);
    let oreArrotondate: number;
    if (minutiArrotondati === 60) {
      oreArrotondate = oreIntere + 1;
    } else {
      oreArrotondate = oreIntere + (minutiArrotondati / 60);
    }
    return [Math.round(oreEffettive * 100) / 100, Math.round(oreArrotondate * 100) / 100];
  } catch {
    return [0.0, 0.0];
  }
}

// ─── calcola_straordinario (L1485) ────────────────────────────────────────────

export function calcolaStraordinario(
  oreSettimanali: number,
  fasciaOraria: string,
  giorno: string
): StraordinarioResult {
  const quotaOraria = 15.50;
  const fasciaStrao = oreSettimanali <= 48 ? '41-48' : '>48';
  const maggiorazioni: Record<string, Record<string, number>> = {
    'lun-ven_giorno':      { '41-48': 0.18, '>48': 0.25 },
    'lun-ven_notte':       { '41-48': 0.35, '>48': 0.75 },
    'sabato_mattina':      { '41-48': 0.18, '>48': 0.25 },
    'sabato_pomeriggio':   { '41-48': 0.50, '>48': 0.75 },
    'domenica':            { '41-48': 0.50, '>48': 0.75 },
  };
  const chiave = `${giorno}_${fasciaOraria}`;
  const percentuale = (maggiorazioni[chiave] ?? {})['41-48'] !== undefined
    ? (maggiorazioni[chiave]?.[fasciaStrao] ?? 0.18)
    : 0.18;
  const importoOra = quotaOraria * (1 + percentuale);
  const bonusIntervento = ['sabato_pomeriggio', 'domenica'].includes(giorno) ? 100 : 0;
  return {
    percentuale: percentuale * 100,
    importo_ora: Math.round(importoOra * 100) / 100,
    bonus_intervento: bonusIntervento,
  };
}

// ─── calcola_ticket (L1505) ───────────────────────────────────────────────────

export function calcolaTicket(oreLavorate: number, oreGiustificate = 0): boolean {
  return (oreLavorate + oreGiustificate) >= 5;
}

// ─── calcola_reperibilita_passiva (L1508) ─────────────────────────────────────

export function calcolaReperibilitaPassiva(ore: number): number {
  return Math.round(ore * 4.0 * 100) / 100;
}

// ─── calcola_reperibilita_attiva (L1511) ──────────────────────────────────────

export function calcolaReperibilitaAttiva(interventi: number): number {
  return interventi * 100.0;
}

// ─── calcola_ore_da_marcature (L1514) ─────────────────────────────────────────

export function calcolaOreDaMarcature(marcature: Marcatura[]): number {
  const sorted = [...marcature].sort((a, b) => a.ora.localeCompare(b.ora));
  let oreTotali = 0.0;
  let entrataCorrente: string | null = null;
  for (const m of sorted) {
    if (m.tipo === 'entrata') {
      entrataCorrente = m.ora;
    } else if (m.tipo === 'uscita' && entrataCorrente) {
      const [ore] = calcolaOreLavorate(entrataCorrente, m.ora);
      oreTotali += ore;
      entrataCorrente = null;
    }
  }
  return oreTotali;
}

// ─── calcola_ore_reperibilita (L1527) ─────────────────────────────────────────

export function calcolaOreReperibilita(marcature: Marcatura[]): number {
  const filtrate = marcature.filter(m => m.is_reperibilita);
  const sorted = [...filtrate].sort((a, b) => a.ora.localeCompare(b.ora));
  let oreTotali = 0.0;
  let entrataCorrente: string | null = null;
  for (const m of sorted) {
    if (m.tipo === 'entrata') {
      entrataCorrente = m.ora;
    } else if (m.tipo === 'uscita' && entrataCorrente) {
      const [ore] = calcolaOreLavorate(entrataCorrente, m.ora);
      oreTotali += ore;
      entrataCorrente = null;
    }
  }
  return oreTotali;
}

// ─── _calcola_metadati_stima (L1336) ──────────────────────────────────────────

export function calcolaMetadatiStima(
  settings: Record<string, unknown>,
  timbrature: unknown[]
): MetadatiStima {
  const ha_dati_contrattuali = [
    'paga_base', 'scatti_anzianita', 'superminimo', 'premio_incarico', 'ticket_valore',
  ].some(campo => ((settings[campo] as number) || 0) > 0);

  const ha_dati_operativi_mese = timbrature.length > 0;

  let sorgente: string;
  let stato: string;

  if (ha_dati_contrattuali && ha_dati_operativi_mese) {
    sorgente = 'dati_contrattuali_e_operativi_mese';
    stato = 'Stima basata su dati contrattuali e timbrature del mese.';
  } else if (ha_dati_contrattuali) {
    sorgente = 'solo_dati_contrattuali';
    stato = 'Stima basata solo sui dati contrattuali.';
  } else if (ha_dati_operativi_mese) {
    sorgente = 'solo_dati_operativi';
    stato = 'Dati operativi presenti, ma dati contrattuali insufficienti per una stima affidabile.';
  } else {
    sorgente = 'nessun_dato_utile';
    stato = 'Stima non disponibile: mancano dati contrattuali e operativi del mese.';
  }

  return { ha_dati_contrattuali, ha_dati_operativi_mese, sorgente, stato };
}

// ─── stima netto dashboard (L2513) ────────────────────────────────────────────

export function stimaNetto(
  settings: Record<string, unknown>,
  oreMese: number,
  timbrature: unknown[]
): StimaResult {
  const oreStraordinarie = Math.max(0, oreMese - 169);
  const giorniConTicket = (timbrature as Array<Record<string, unknown>>)
    .filter(t => calcolaTicket((t.ore_arrotondate as number) || 0))
    .length;

  const baseMensile =
    ((settings.paga_base as number) || 0) +
    ((settings.scatti_anzianita as number) || 0) +
    ((settings.superminimo as number) || 0) +
    ((settings.premio_incarico as number) || 0);

  const divisoreOrario = (settings.divisore_orario as number) || 169;
  const ticketValore = (settings.ticket_valore as number) || 0;

  const quotaOraria = baseMensile / divisoreOrario;
  const straordinarioStimato = oreStraordinarie * quotaOraria * 1.18;
  const ticketTotale = giorniConTicket * ticketValore;
  const lordoStimato = baseMensile + straordinarioStimato + ticketTotale;
  const nettoStimato = lordoStimato * 0.72;

  const metadati = calcolaMetadatiStima(settings, timbrature);

  return {
    lordo_stimato: Math.round(lordoStimato * 100) / 100,
    netto_stimato: Math.round(nettoStimato * 100) / 100,
    straordinario_stimato: Math.round(straordinarioStimato * 100) / 100,
    ticket_totale: Math.round(ticketTotale * 100) / 100,
    metadati,
  };
}

// ─── get_saldo_ferie (L1920) ──────────────────────────────────────────────────

export function calcolaSaldoFerie(
  assenzeFerie: Array<{ data_inizio: string; ore_totali: number }>,
  anno?: number
): SaldoFerie {
  const annoTarget = anno ?? new Date().getFullYear();
  const monteAnnuo = 80;
  const maturazioneMensile = 6.667;
  const now = new Date();
  const meseCorrente = now.getFullYear() === annoTarget ? now.getMonth() + 1 : 12;
  const oreMaturate = Math.round(maturazioneMensile * meseCorrente * 100) / 100;
  const oreGodute = assenzeFerie
    .filter(a => a.data_inizio.startsWith(String(annoTarget)))
    .reduce((sum, a) => sum + (a.ore_totali || 0), 0);
  const saldo = oreMaturate - oreGodute;
  return {
    anno: annoTarget,
    monte_annuo: monteAnnuo,
    maturazione_mensile: maturazioneMensile,
    residuo_anno_precedente: 0,
    ore_maturate: oreMaturate,
    ore_godute: oreGodute,
    saldo_attuale: Math.round(saldo * 100) / 100,
  };
}

// ─── get_comporto (L1947) ─────────────────────────────────────────────────────

export function calcolaComporto(
  assenzeMalattia: Array<{ data_inizio: string; data_fine: string }>
): ComportoResult {
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const soglia = threeYearsAgo.toISOString().split('T')[0];

  let giorniTotali = 0;
  for (const m of assenzeMalattia) {
    if (m.data_inizio >= soglia) {
      const start = new Date(m.data_inizio);
      const end = new Date(m.data_fine);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      giorniTotali += diff + 1;
    }
  }

  const sogliaAttenzione = 150;
  const sogliaCritica = 180;

  return {
    giorni_malattia_3_anni: giorniTotali,
    soglia_attenzione: sogliaAttenzione,
    soglia_critica: sogliaCritica,
    alert_attenzione: giorniTotali >= sogliaAttenzione,
    alert_critico: giorniTotali >= sogliaCritica,
    giorni_disponibili: Math.max(0, sogliaCritica - giorniTotali),
  };
}
