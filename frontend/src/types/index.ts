// Types for BustaPaga app

export interface UserSettings {
  id: string;
  nome: string;
  qualifica: string;
  livello: number;
  azienda: string;
  sede: string;
  ccnl: string;
  data_assunzione: string;
  orario_tipo: string;
  ore_giornaliere: number;
  paga_base: number;
  scatti_anzianita: number;
  superminimo: number;
  premio_incarico: number;
  divisore_orario: number;
  divisore_giornaliero: number;
  ticket_valore: number;
  pin_hash?: string;
  use_biometric: boolean;
  created_at: string;
  updated_at: string;
}

export interface Marcatura {
  id: string;
  tipo: 'entrata' | 'uscita';
  ora: string;
  is_reperibilita: boolean;
  note?: string;
  created_at: string;
}

export interface Timbratura {
  id: string;
  data: string;
  ora_entrata?: string;
  ora_uscita?: string;
  marcature: Marcatura[];
  ore_lavorate: number;
  ore_arrotondate: number;
  ore_reperibilita: number;
  is_reperibilita_attiva: boolean;
  note?: string;
  created_at: string;
}

export interface Assenza {
  id: string;
  tipo: 'ferie' | 'malattia' | 'permesso_rol' | 'permesso_non_retribuito' | 'altro';
  data_inizio: string;
  data_fine: string;
  ore_totali: number;
  note?: string;
  certificato_base64?: string;
  certificato_nome?: string;
  created_at: string;
}

export interface Reperibilita {
  id: string;
  data: string;
  ora_inizio: string;
  ora_fine: string;
  tipo: 'passiva' | 'attiva';
  ore_totali: number;
  interventi: number;
  compenso_calcolato: number;
  note?: string;
  created_at: string;
}

export interface BustaPaga {
  id: string;
  mese: number;
  anno: number;
  pdf_base64?: string;
  pdf_nome?: string;
  lordo: number;
  netto: number;
  straordinari_ore: number;
  straordinari_importo: number;
  trattenute_totali: number;
  netto_calcolato: number;
  differenza: number;
  has_discrepancy: boolean;
  note_confronto?: string;
  created_at: string;
}

export interface Documento {
  id: string;
  tipo: 'busta_paga' | 'certificato_medico' | 'timbrature_report' | 'comunicazione' | 'cud';
  titolo: string;
  descrizione?: string;
  sottotipo?: string;
  file_base64: string;
  file_nome: string;
  file_tipo: string;
  data_riferimento?: string;
  created_at: string;
}

export interface Alert {
  id: string;
  tipo: 'scadenza' | 'comporto' | 'ferie' | 'discrepanza' | 'promemoria';
  titolo: string;
  messaggio: string;
  data_scadenza?: string;
  letto: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface DashboardData {
  mese_corrente: {
    mese: number;
    anno: number;
    ore_lavorate: number;
    ore_ordinarie: number;
    ore_straordinarie: number;
    giorni_lavorati: number;
    ticket_maturati: number;
  };
  stime: {
    lordo_stimato: number;
    netto_stimato: number;
    straordinario_stimato: number;
    ticket_totale: number;
    periodo_competenza?: string;
    competenza?: string;
    mese_competenza?: number;
    anno_competenza?: number;
    competenza_mese?: number;
    competenza_anno?: number;
    data_pagamento_prevista?: string;
    pagamento_previsto?: string;
    pagamento_previsto_giorno?: number;
    pagamento_previsto_mese?: number;
    pagamento_previsto_anno?: number;
    giorno_pagamento_previsto?: number;
    mese_pagamento_previsto?: number;
    anno_pagamento_previsto?: number;
    pagamento_giorno?: number;
    pagamento_mese?: number;
    pagamento_anno?: number;
    fonte?: string;
    fonte_stima?: string;
    ha_dati_contrattuali?: boolean;
    ha_dati_operativi_mese?: boolean;
    metadati?: {
      ha_dati_contrattuali?: boolean;
      ha_dati_operativi_mese?: boolean;
      sorgente?: string;
      stato?: string;
    };
  };
  ferie: {
    anno: number;
    monte_annuo: number;
    maturazione_mensile: number;
    residuo_anno_precedente: number;
    ore_maturate: number;
    ore_godute: number;
    saldo_attuale: number;
  };
  comporto: {
    giorni_malattia_3_anni: number;
    soglia_attenzione: number;
    soglia_critica: number;
    alert_attenzione: boolean;
    alert_critico: boolean;
    giorni_disponibili: number;
  };
  ultima_busta?: BustaPaga;
  alerts_non_letti: number;
  settings: UserSettings;
}

export interface WeeklySummary {
  settimana_inizio: string;
  settimana_fine: string;
  timbrature: Timbratura[];
  ore_totali: number;
  ore_ordinarie: number;
  ore_straordinarie: number;
  giorni_lavorati: number;
}
