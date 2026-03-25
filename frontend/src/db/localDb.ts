/**
 * localDb.ts — Database SQLite locale (Fase 1 offline-first)
 *
 * Schema speculare alle 9 tabelle del backend + offline_queue.
 * Fonte di verità sul device. Il backend è opzionale.
 */

import { Platform } from 'react-native';

type SQLiteModule = typeof import('expo-sqlite');

type DatabaseLike = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<{ lastInsertRowId: number }>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
};

let _db: DatabaseLike | null = null;
let _dbPromise: Promise<DatabaseLike> | null = null;
let _sqliteModulePromise: Promise<SQLiteModule> | null = null;

function isWebRuntime(): boolean {
  return Platform.OS === 'web';
}

async function getSQLiteModule(): Promise<SQLiteModule> {
  if (!_sqliteModulePromise) {
    _sqliteModulePromise = import('expo-sqlite');
  }
  return _sqliteModulePromise;
}

type WebRecord = Record<string, unknown>;

type WebStore = {
  settings: WebRecord | null;
  timbrature: WebRecord[];
  timbratureAziendali: WebRecord[];
  assenze: WebRecord[];
  reperibilita: WebRecord[];
  bustePaga: WebRecord[];
  documenti: WebRecord[];
  chatHistory: WebRecord[];
  alerts: WebRecord[];
  offlineQueue: WebRecord[];
  seq: Record<string, number>;
};

const WEB_STORE: WebStore = {
  settings: null,
  timbrature: [],
  timbratureAziendali: [],
  assenze: [],
  reperibilita: [],
  bustePaga: [],
  documenti: [],
  chatHistory: [],
  alerts: [],
  offlineQueue: [],
  seq: {
    assenze: 1,
    reperibilita: 1,
    bustePaga: 1,
    documenti: 1,
    chatHistory: 1,
    alerts: 1,
    offlineQueue: 1,
  },
};

const WEB_STORE_KEY = 'bustapaga-webstore-v1';

function saveWebStore(): void {
  try {
    localStorage.setItem(WEB_STORE_KEY, JSON.stringify(WEB_STORE));
  } catch {
    // quota exceeded o storage non disponibile
  }
}

function loadWebStore(): void {
  try {
    const raw = localStorage.getItem(WEB_STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<WebStore>;
    if (saved.settings !== undefined) WEB_STORE.settings = saved.settings;
    if (Array.isArray(saved.timbrature)) WEB_STORE.timbrature = saved.timbrature;
    if (Array.isArray(saved.timbratureAziendali)) WEB_STORE.timbratureAziendali = saved.timbratureAziendali;
    if (Array.isArray(saved.assenze)) WEB_STORE.assenze = saved.assenze;
    if (Array.isArray(saved.reperibilita)) WEB_STORE.reperibilita = saved.reperibilita;
    if (Array.isArray(saved.bustePaga)) WEB_STORE.bustePaga = saved.bustePaga;
    if (Array.isArray(saved.documenti)) WEB_STORE.documenti = saved.documenti;
    if (Array.isArray(saved.chatHistory)) WEB_STORE.chatHistory = saved.chatHistory;
    if (Array.isArray(saved.alerts)) WEB_STORE.alerts = saved.alerts;
    if (Array.isArray(saved.offlineQueue)) WEB_STORE.offlineQueue = saved.offlineQueue;
    if (saved.seq) WEB_STORE.seq = { ...WEB_STORE.seq, ...saved.seq };
  } catch {
    // JSON malformato — ricomincia da vuoto
  }
}

function cloneRecord<T extends WebRecord>(record: T): T {
  return { ...record };
}

function cloneRecords<T extends WebRecord>(records: T[]): T[] {
  return records.map(cloneRecord);
}

function nextWebId(key: keyof WebStore['seq']): number {
  const current = WEB_STORE.seq[key] ?? 1;
  WEB_STORE.seq[key] = current + 1;
  return current;
}

function setWebSingle(table: 'settings', data: WebRecord | null): void {
  WEB_STORE[table] = data ? cloneRecord(data) : null;
}

function clearWebData(includeSettings = false): void {
  WEB_STORE.timbrature = [];
  WEB_STORE.timbratureAziendali = [];
  WEB_STORE.assenze = [];
  WEB_STORE.reperibilita = [];
  WEB_STORE.bustePaga = [];
  WEB_STORE.documenti = [];
  WEB_STORE.chatHistory = [];
  WEB_STORE.alerts = [];
  WEB_STORE.offlineQueue = [];
  if (includeSettings) {
    WEB_STORE.settings = null;
  }
}

function parseMarcature(value: unknown): WebRecord[] {
  if (Array.isArray(value)) {
    return value as WebRecord[];
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as WebRecord[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function compareCreatedAtDesc(a: WebRecord, b: WebRecord): number {
  const left = typeof a.created_at === 'string' ? a.created_at : '';
  const right = typeof b.created_at === 'string' ? b.created_at : '';
  return right.localeCompare(left);
}

function compareCreatedAtAsc(a: WebRecord, b: WebRecord): number {
  const left = typeof a.created_at === 'string' ? a.created_at : '';
  const right = typeof b.created_at === 'string' ? b.created_at : '';
  return left.localeCompare(right);
}

function compareDataDesc(a: WebRecord, b: WebRecord): number {
  const left = typeof a.data === 'string' ? a.data : '';
  const right = typeof b.data === 'string' ? b.data : '';
  return right.localeCompare(left);
}

function compareDataAsc(a: WebRecord, b: WebRecord): number {
  const left = typeof a.data === 'string' ? a.data : '';
  const right = typeof b.data === 'string' ? b.data : '';
  return left.localeCompare(right);
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function normalizeParams(params: unknown[]): unknown[] {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] as unknown[] : params;
}

function monthPrefix(anno: number, mese: number): string {
  return `${anno}-${String(mese).padStart(2, '0')}`;
}

function getTableRows(table: keyof Pick<WebStore, 'timbrature' | 'timbratureAziendali' | 'assenze' | 'reperibilita' | 'bustePaga' | 'documenti' | 'chatHistory' | 'alerts' | 'offlineQueue'>): WebRecord[] {
  return WEB_STORE[table];
}

function upsertByKey(
  table: keyof Pick<WebStore, 'timbrature' | 'timbratureAziendali' | 'bustePaga'>,
  key: string,
  data: WebRecord,
): void {
  const rows = getTableRows(table);
  const index = rows.findIndex(row => row[key] === data[key]);
  if (index >= 0) {
    rows[index] = { ...rows[index], ...cloneRecord(data) };
  } else {
    rows.push(cloneRecord(data));
  }
}

function deleteByKey(
  table: keyof Pick<WebStore, 'timbrature' | 'timbratureAziendali' | 'assenze' | 'reperibilita' | 'bustePaga' | 'documenti' | 'alerts' | 'offlineQueue'>,
  key: string,
  value: unknown,
): void {
  const rows = getTableRows(table);
  const filtered = rows.filter(row => row[key] !== value);
  WEB_STORE[table] = filtered;
}

function createMemoryDbImpl(): DatabaseLike {
  return {
    async execAsync(sql: string): Promise<void> {
      const normalized = normalizeSql(sql);
      if (normalized === 'DELETE FROM timbrature; DELETE FROM timbrature_aziendali; DELETE FROM assenze; DELETE FROM reperibilita; DELETE FROM buste_paga; DELETE FROM documenti; DELETE FROM chat_history; DELETE FROM alerts; DELETE FROM offline_queue;') {
        clearWebData(false);
        return;
      }
      if (normalized === 'DELETE FROM settings;') {
        setWebSingle('settings', null);
        return;
      }
      if (normalized.startsWith('CREATE TABLE IF NOT EXISTS') || normalized.startsWith('PRAGMA ')) {
        return;
      }
      if (normalized === 'DELETE FROM timbrature;' || normalized === 'DELETE FROM timbrature_aziendali;' || normalized === 'DELETE FROM assenze;' || normalized === 'DELETE FROM reperibilita;' || normalized === 'DELETE FROM buste_paga;' || normalized === 'DELETE FROM documenti;' || normalized === 'DELETE FROM chat_history;' || normalized === 'DELETE FROM alerts;' || normalized === 'DELETE FROM offline_queue;') {
        clearWebData(false);
        return;
      }
      throw new Error(`Unsupported web execAsync SQL: ${normalized}`);
    },
    async runAsync(sql: string, ...rawParams: unknown[]): Promise<{ lastInsertRowId: number }> {
      const params = normalizeParams(rawParams);
      const normalized = normalizeSql(sql);

      if (normalized.startsWith('UPDATE settings SET ')) {
        const data: WebRecord = WEB_STORE.settings ? { ...WEB_STORE.settings } : { id: 1 };
        const updatedKeys = normalized
          .slice('UPDATE settings SET '.length, normalized.indexOf(', updated_at = ? WHERE id = ?'))
          .split(', ')
          .map(part => part.split(' = ?')[0]);
        updatedKeys.forEach((key, index) => {
          data[key] = params[index];
        });
        data.updated_at = params[updatedKeys.length];
        data.id = params[updatedKeys.length + 1] ?? 1;
        setWebSingle('settings', data);
        return { lastInsertRowId: 1 };
      }

      if (normalized.startsWith('INSERT INTO settings ')) {
        const data: WebRecord = { id: 1 };
        const keys = ['id', 'nome', 'cognome', 'matricola', 'numero_badge', 'qualifica', 'livello', 'azienda', 'sede', 'ccnl', 'data_assunzione', 'orario_tipo', 'ore_giornaliere', 'paga_base', 'scatti_anzianita', 'superminimo', 'premio_incarico', 'divisore_orario', 'divisore_giornaliero', 'ticket_valore', 'pin_hash', 'use_biometric', 'created_at', 'updated_at'];
        keys.forEach((key, index) => {
          data[key] = params[index];
        });
        setWebSingle('settings', data);
        return { lastInsertRowId: 1 };
      }

      if (normalized.startsWith('INSERT INTO timbrature ')) {
        const data: WebRecord = {
          data: params[0],
          ora_entrata: params[1] ?? null,
          ora_uscita: params[2] ?? null,
          marcature: params[3] ?? '[]',
          ore_lavorate: params[4] ?? 0,
          ore_arrotondate: params[5] ?? 0,
          ore_reperibilita: params[6] ?? 0,
          is_reperibilita_attiva: params[7] ? 1 : 0,
          note: params[8] ?? null,
          created_at: params[9],
          synced: 0,
        };
        upsertByKey('timbrature', 'data', data);
        return { lastInsertRowId: 1 };
      }

      if (normalized === 'DELETE FROM timbrature WHERE data = ?') {
        deleteByKey('timbrature', 'data', params[0]);
        return { lastInsertRowId: 0 };
      }

      if (normalized.startsWith('INSERT INTO timbrature_aziendali ')) {
        const data: WebRecord = {
          data: params[0],
          ora_entrata: params[1] ?? null,
          ora_uscita: params[2] ?? null,
          ore_lavorate: params[3] ?? 0,
          fonte: params[4] ?? null,
          note: params[5] ?? null,
          created_at: params[6],
        };
        upsertByKey('timbratureAziendali', 'data', data);
        return { lastInsertRowId: 1 };
      }

      if (normalized === 'DELETE FROM timbrature_aziendali WHERE data LIKE ?') {
        const prefix = String(params[0]).replace(/%$/, '');
        WEB_STORE.timbratureAziendali = WEB_STORE.timbratureAziendali.filter(row => typeof row.data !== 'string' || !row.data.startsWith(prefix));
        return { lastInsertRowId: 0 };
      }

      if (normalized.startsWith('INSERT INTO assenze ')) {
        const id = nextWebId('assenze');
        WEB_STORE.assenze.push({
          id,
          tipo: params[0],
          data_inizio: params[1],
          data_fine: params[2],
          ore_totali: params[3] ?? 0,
          note: params[4] ?? null,
          certificato_path: params[5] ?? null,
          certificato_nome: params[6] ?? null,
          created_at: params[7],
          synced: 0,
        });
        return { lastInsertRowId: id };
      }

      if (normalized === 'DELETE FROM assenze WHERE id = ?') {
        deleteByKey('assenze', 'id', params[0]);
        return { lastInsertRowId: 0 };
      }

      if (normalized.startsWith('INSERT INTO reperibilita ')) {
        const id = nextWebId('reperibilita');
        WEB_STORE.reperibilita.push({
          id,
          data: params[0],
          ora_inizio: params[1] ?? null,
          ora_fine: params[2] ?? null,
          ore_totali: params[3] ?? 0,
          interventi: params[4] ?? 0,
          compenso_calcolato: params[5] ?? 0,
          tipo: params[6] ?? 'passiva',
          note: params[7] ?? null,
          created_at: params[8],
          synced: 0,
        });
        return { lastInsertRowId: id };
      }

      if (normalized === 'DELETE FROM reperibilita WHERE id = ?') {
        deleteByKey('reperibilita', 'id', params[0]);
        return { lastInsertRowId: 0 };
      }

      if (normalized.startsWith('INSERT INTO buste_paga ')) {
        const data: WebRecord = {
          id: nextWebId('bustePaga'),
          mese: params[0],
          anno: params[1],
          pdf_path: params[2] ?? null,
          pdf_nome: params[3] ?? null,
          lordo: params[4] ?? 0,
          netto: params[5] ?? 0,
          straordinari_ore: params[6] ?? 0,
          straordinari_importo: params[7] ?? 0,
          trattenute_totali: params[8] ?? 0,
          netto_calcolato: params[9] ?? 0,
          differenza: params[10] ?? 0,
          has_discrepancy: params[11] ? 1 : 0,
          note_confronto: params[12] ?? null,
          created_at: params[13],
          synced: 0,
        };
        const existingIndex = WEB_STORE.bustePaga.findIndex(row => row.mese === data.mese && row.anno === data.anno);
        if (existingIndex >= 0) {
          WEB_STORE.bustePaga[existingIndex] = data;
        } else {
          WEB_STORE.bustePaga.push(data);
        }
        return { lastInsertRowId: Number(data.id) };
      }

      if (normalized === 'INSERT INTO documenti (tipo, titolo, descrizione, sottotipo, file_path, file_nome, file_tipo, data_riferimento, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)') {
        const id = nextWebId('documenti');
        WEB_STORE.documenti.push({
          id,
          tipo: params[0],
          titolo: params[1],
          descrizione: params[2] ?? null,
          sottotipo: params[3] ?? null,
          file_path: params[4],
          file_nome: params[5],
          file_tipo: params[6],
          data_riferimento: params[7] ?? null,
          created_at: params[8],
          synced: 0,
        });
        return { lastInsertRowId: id };
      }

      if (normalized === 'DELETE FROM documenti WHERE id = ?') {
        deleteByKey('documenti', 'id', params[0]);
        return { lastInsertRowId: 0 };
      }

      if (normalized === 'INSERT INTO chat_history (session_id, ruolo, contenuto, created_at) VALUES (?, ?, ?, ?)') {
        const id = nextWebId('chatHistory');
        WEB_STORE.chatHistory.push({
          id,
          session_id: params[0] ?? null,
          ruolo: params[1],
          contenuto: params[2],
          created_at: params[3],
        });
        return { lastInsertRowId: id };
      }

      if (normalized === 'DELETE FROM chat_history') {
        WEB_STORE.chatHistory = [];
        return { lastInsertRowId: 0 };
      }

      if (normalized === 'UPDATE alerts SET letto = 1 WHERE id = ?') {
        const row = WEB_STORE.alerts.find(item => item.id === params[0]);
        if (row) {
          row.letto = 1;
        }
        return { lastInsertRowId: 0 };
      }

      if (normalized === 'INSERT INTO alerts (tipo, titolo, messaggio, data_scadenza, created_at) VALUES (?, ?, ?, ?, ?)') {
        const id = nextWebId('alerts');
        WEB_STORE.alerts.push({
          id,
          tipo: params[0],
          titolo: params[1],
          messaggio: params[2],
          data_scadenza: params[3] ?? null,
          letto: 0,
          created_at: params[4],
        });
        return { lastInsertRowId: id };
      }

      if (normalized === 'INSERT INTO offline_queue (operation, endpoint, method, payload, created_at) VALUES (?, ?, ?, ?, ?)') {
        const id = nextWebId('offlineQueue');
        WEB_STORE.offlineQueue.push({
          id,
          operation: params[0],
          endpoint: params[1],
          method: params[2],
          payload: params[3] ?? null,
          created_at: params[4],
          retry_count: 0,
        });
        return { lastInsertRowId: id };
      }

      if (normalized === 'DELETE FROM offline_queue WHERE id = ?') {
        deleteByKey('offlineQueue', 'id', params[0]);
        return { lastInsertRowId: 0 };
      }

      if (normalized === 'UPDATE offline_queue SET retry_count = retry_count + 1 WHERE id = ?') {
        const row = WEB_STORE.offlineQueue.find(item => item.id === params[0]);
        if (row) {
          row.retry_count = Number(row.retry_count ?? 0) + 1;
        }
        return { lastInsertRowId: 0 };
      }

      throw new Error(`Unsupported web runAsync SQL: ${normalized}`);
    },
    async getAllAsync<T>(sql: string, ...rawParams: unknown[]): Promise<T[]> {
      const params = normalizeParams(rawParams);
      const normalized = normalizeSql(sql);

      if (normalized === 'SELECT * FROM settings WHERE id = 1') {
        return WEB_STORE.settings ? [cloneRecord(WEB_STORE.settings) as T] : [];
      }
      if (normalized === 'SELECT * FROM timbrature ORDER BY data DESC') {
        return cloneRecords(WEB_STORE.timbrature.sort(compareDataDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM timbrature WHERE data = ?') {
        return cloneRecords(WEB_STORE.timbrature.filter(row => row.data === params[0])) as T[];
      }
      if (normalized === 'SELECT * FROM timbrature WHERE data LIKE ? ORDER BY data DESC') {
        const prefix = String(params[0]).replace(/%$/, '');
        return cloneRecords(WEB_STORE.timbrature.filter(row => typeof row.data === 'string' && row.data.startsWith(prefix)).sort(compareDataDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM timbrature_aziendali ORDER BY data') {
        return cloneRecords(WEB_STORE.timbratureAziendali.sort(compareDataAsc)) as T[];
      }
      if (normalized === 'SELECT * FROM timbrature_aziendali WHERE data LIKE ? ORDER BY data') {
        const prefix = String(params[0]).replace(/%$/, '');
        return cloneRecords(WEB_STORE.timbratureAziendali.filter(row => typeof row.data === 'string' && row.data.startsWith(prefix)).sort(compareDataAsc)) as T[];
      }
      if (normalized === 'SELECT * FROM assenze ORDER BY data_inizio DESC') {
        return cloneRecords(WEB_STORE.assenze.sort((a, b) => String(b.data_inizio ?? '').localeCompare(String(a.data_inizio ?? '')))) as T[];
      }
      if (normalized === 'SELECT * FROM reperibilita ORDER BY data DESC') {
        return cloneRecords(WEB_STORE.reperibilita.sort(compareDataDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM reperibilita WHERE data LIKE ? ORDER BY data') {
        const prefix = String(params[0]).replace(/%$/, '');
        return cloneRecords(WEB_STORE.reperibilita.filter(row => typeof row.data === 'string' && row.data.startsWith(prefix)).sort(compareDataAsc)) as T[];
      }
      if (normalized === 'SELECT * FROM buste_paga WHERE anno = ? ORDER BY mese DESC') {
        return cloneRecords(WEB_STORE.bustePaga.filter(row => row.anno === params[0]).sort((a, b) => Number(b.mese ?? 0) - Number(a.mese ?? 0))) as T[];
      }
      if (normalized === 'SELECT * FROM buste_paga WHERE anno = ? AND mese = ?') {
        return cloneRecords(WEB_STORE.bustePaga.filter(bp => bp.anno === params[0] && bp.mese === params[1])) as T[];
      }
      if (normalized === 'SELECT * FROM buste_paga ORDER BY anno DESC, mese DESC') {
        return cloneRecords(WEB_STORE.bustePaga.sort((a, b) => Number(b.anno ?? 0) - Number(a.anno ?? 0) || Number(b.mese ?? 0) - Number(a.mese ?? 0))) as T[];
      }
      if (normalized === 'SELECT * FROM documenti ORDER BY created_at DESC') {
        return cloneRecords(WEB_STORE.documenti.sort(compareCreatedAtDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM documenti WHERE tipo = ? ORDER BY created_at DESC') {
        return cloneRecords(WEB_STORE.documenti.filter(row => row.tipo === params[0]).sort(compareCreatedAtDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?') {
        return cloneRecords(WEB_STORE.chatHistory.sort(compareCreatedAtDesc).slice(0, Number(params[0] ?? 50))) as T[];
      }
      if (normalized === 'SELECT * FROM alerts ORDER BY created_at DESC') {
        return cloneRecords(WEB_STORE.alerts.sort(compareCreatedAtDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM alerts WHERE letto = 0 ORDER BY created_at DESC') {
        return cloneRecords(WEB_STORE.alerts.filter(row => Number(row.letto ?? 0) === 0).sort(compareCreatedAtDesc)) as T[];
      }
      if (normalized === 'SELECT * FROM offline_queue ORDER BY created_at ASC') {
        return cloneRecords(WEB_STORE.offlineQueue.sort(compareCreatedAtAsc)) as T[];
      }

      throw new Error(`Unsupported web getAllAsync SQL: ${normalized}`);
    },
    async getFirstAsync<T>(sql: string, ...rawParams: unknown[]): Promise<T | null> {
      const params = normalizeParams(rawParams);
      const rows = await this.getAllAsync<T>(sql, params);
      return rows[0] ?? null;
    },
  };
}

function createMemoryDb(): DatabaseLike {
  const impl = createMemoryDbImpl();
  return {
    async execAsync(sql: string): Promise<void> {
      await impl.execAsync(sql);
      saveWebStore();
    },
    async runAsync(sql: string, ...params: unknown[]): Promise<{ lastInsertRowId: number }> {
      const result = await impl.runAsync(sql, ...params);
      saveWebStore();
      return result;
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      return impl.getAllAsync<T>(sql, ...params);
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
      return impl.getFirstAsync<T>(sql, ...params);
    },
  };
}

// ─── Apertura e inizializzazione ─────────────────────────────────────────────

export async function openDb(): Promise<DatabaseLike> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    if (isWebRuntime()) {
      loadWebStore();
      const memoryDb = createMemoryDb();
      _db = memoryDb;
      return memoryDb;
    }

    const SQLite = await getSQLiteModule();
    const db = await SQLite.openDatabaseAsync('bustapaga.db');
    await db.execAsync('PRAGMA journal_mode=WAL;');
    await db.execAsync('PRAGMA foreign_keys=ON;');
    await initSchema(db);
    _db = db;
    return db;
  })();

  try {
    return await _dbPromise;
  } finally {
    _dbPromise = null;
  }
}

async function initSchema(db: DatabaseLike): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      nome TEXT,
      cognome TEXT,
      matricola TEXT,
      numero_badge TEXT,
      qualifica TEXT,
      livello INTEGER DEFAULT 0,
      azienda TEXT,
      sede TEXT,
      ccnl TEXT,
      data_assunzione TEXT,
      orario_tipo TEXT,
      ore_giornaliere REAL DEFAULT 8.0,
      paga_base REAL DEFAULT 0,
      scatti_anzianita REAL DEFAULT 0,
      superminimo REAL DEFAULT 0,
      premio_incarico REAL DEFAULT 0,
      divisore_orario REAL DEFAULT 169,
      divisore_giornaliero REAL DEFAULT 26,
      ticket_valore REAL DEFAULT 5.29,
      pin_hash TEXT,
      use_biometric INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS timbrature (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT UNIQUE NOT NULL,
      ora_entrata TEXT,
      ora_uscita TEXT,
      marcature TEXT DEFAULT '[]',
      ore_lavorate REAL DEFAULT 0,
      ore_arrotondate REAL DEFAULT 0,
      ore_reperibilita REAL DEFAULT 0,
      is_reperibilita_attiva INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS timbrature_aziendali (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT UNIQUE NOT NULL,
      ora_entrata TEXT,
      ora_uscita TEXT,
      ore_lavorate REAL DEFAULT 0,
      fonte TEXT,
      note TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assenze (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      data_inizio TEXT NOT NULL,
      data_fine TEXT NOT NULL,
      ore_totali REAL DEFAULT 0,
      note TEXT,
      certificato_path TEXT,
      certificato_nome TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reperibilita (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      ora_inizio TEXT,
      ora_fine TEXT,
      ore_totali REAL DEFAULT 0,
      interventi INTEGER DEFAULT 0,
      compenso_calcolato REAL DEFAULT 0,
      tipo TEXT DEFAULT 'passiva',
      note TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS buste_paga (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mese INTEGER NOT NULL,
      anno INTEGER NOT NULL,
      pdf_path TEXT,
      pdf_nome TEXT,
      lordo REAL DEFAULT 0,
      netto REAL DEFAULT 0,
      straordinari_ore REAL DEFAULT 0,
      straordinari_importo REAL DEFAULT 0,
      trattenute_totali REAL DEFAULT 0,
      netto_calcolato REAL DEFAULT 0,
      differenza REAL DEFAULT 0,
      has_discrepancy INTEGER DEFAULT 0,
      note_confronto TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS documenti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titolo TEXT NOT NULL,
      descrizione TEXT,
      sottotipo TEXT,
      file_path TEXT NOT NULL,
      file_nome TEXT NOT NULL,
      file_tipo TEXT NOT NULL,
      data_riferimento TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      ruolo TEXT NOT NULL,
      contenuto TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titolo TEXT NOT NULL,
      messaggio TEXT NOT NULL,
      data_scadenza TEXT,
      letto INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0
    );
  `);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Record<string, unknown> | null> {
  const db = await openDb();
  return db.getFirstAsync<Record<string, unknown>>('SELECT * FROM settings WHERE id = 1');
}

export async function upsertSettings(data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  const existing = await getSettings();
  if (existing) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), now, 1];
    await db.runAsync(`UPDATE settings SET ${fields}, updated_at = ? WHERE id = ?`, values);
  } else {
    const keys = ['id', ...Object.keys(data), 'created_at', 'updated_at'].join(', ');
    const placeholders = Array(Object.keys(data).length + 3).fill('?').join(', ');
    await db.runAsync(
      `INSERT INTO settings (${keys}) VALUES (${placeholders})`,
      [1, ...Object.values(data), now, now]
    );
  }
}

// ─── Timbrature ───────────────────────────────────────────────────────────────

export async function getTimbrature(mese?: number, anno?: number): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  if (mese !== undefined && anno !== undefined) {
    const prefix = `${anno}-${String(mese).padStart(2, '0')}`;
    return db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM timbrature WHERE data LIKE ? ORDER BY data DESC",
      [`${prefix}%`]
    );
  }
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM timbrature ORDER BY data DESC');
}

export async function getTimbraturaByData(data: string): Promise<Record<string, unknown> | null> {
  const db = await openDb();
  return db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM timbrature WHERE data = ?', [data]
  );
}

export async function upsertTimbratura(data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO timbrature (data, ora_entrata, ora_uscita, marcature, ore_lavorate, ore_arrotondate,
      ore_reperibilita, is_reperibilita_attiva, note, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(data) DO UPDATE SET
       ora_entrata = excluded.ora_entrata,
       ora_uscita = excluded.ora_uscita,
       marcature = excluded.marcature,
       ore_lavorate = excluded.ore_lavorate,
       ore_arrotondate = excluded.ore_arrotondate,
       ore_reperibilita = excluded.ore_reperibilita,
       is_reperibilita_attiva = excluded.is_reperibilita_attiva,
       note = excluded.note,
       synced = 0`,
    [
      data.data, data.ora_entrata ?? null, data.ora_uscita ?? null,
      typeof data.marcature === 'string' ? data.marcature : JSON.stringify(data.marcature ?? []),
      data.ore_lavorate ?? 0, data.ore_arrotondate ?? 0,
      data.ore_reperibilita ?? 0, data.is_reperibilita_attiva ? 1 : 0,
      data.note ?? null, now,
    ]
  );
}

export async function deleteTimbratura(data: string): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM timbrature WHERE data = ?', [data]);
}

// ─── Timbrature Aziendali ─────────────────────────────────────────────────────

export async function getTimbratureAziendali(mese?: number, anno?: number): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  if (mese !== undefined && anno !== undefined) {
    const prefix = `${anno}-${String(mese).padStart(2, '0')}`;
    return db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM timbrature_aziendali WHERE data LIKE ? ORDER BY data",
      [`${prefix}%`]
    );
  }
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM timbrature_aziendali ORDER BY data');
}

export async function upsertTimbraturaAziendale(data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO timbrature_aziendali (data, ora_entrata, ora_uscita, ore_lavorate, fonte, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(data) DO UPDATE SET
       ora_entrata = excluded.ora_entrata,
       ora_uscita = excluded.ora_uscita,
       ore_lavorate = excluded.ore_lavorate,
       fonte = excluded.fonte,
       note = excluded.note`,
    [data.data, data.ora_entrata ?? null, data.ora_uscita ?? null,
     data.ore_lavorate ?? 0, data.fonte ?? null, data.note ?? null, now]
  );
}

export async function deleteTimbratureAziendali(mese: number, anno: number): Promise<void> {
  const db = await openDb();
  const prefix = `${anno}-${String(mese).padStart(2, '0')}`;
  await db.runAsync("DELETE FROM timbrature_aziendali WHERE data LIKE ?", [`${prefix}%`]);
}

// ─── Assenze ──────────────────────────────────────────────────────────────────

export async function getAssenze(): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM assenze ORDER BY data_inizio DESC');
}

export async function insertAssenza(data: Record<string, unknown>): Promise<number> {
  const db = await openDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO assenze (tipo, data_inizio, data_fine, ore_totali, note, certificato_path, certificato_nome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.tipo, data.data_inizio, data.data_fine, data.ore_totali ?? 0,
     data.note ?? null, data.certificato_path ?? null, data.certificato_nome ?? null, now]
  );
  return result.lastInsertRowId;
}

export async function deleteAssenza(id: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM assenze WHERE id = ?', [id]);
}

// ─── Reperibilità ─────────────────────────────────────────────────────────────

export async function getReperibilita(mese?: number, anno?: number): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  if (mese !== undefined && anno !== undefined) {
    const prefix = `${anno}-${String(mese).padStart(2, '0')}`;
    return db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM reperibilita WHERE data LIKE ? ORDER BY data",
      [`${prefix}%`]
    );
  }
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM reperibilita ORDER BY data DESC');
}

export async function insertReperibilita(data: Record<string, unknown>): Promise<number> {
  const db = await openDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO reperibilita (data, ora_inizio, ora_fine, ore_totali, interventi,
      compenso_calcolato, tipo, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.data, data.ora_inizio ?? null, data.ora_fine ?? null,
     data.ore_totali ?? 0, data.interventi ?? 0, data.compenso_calcolato ?? 0,
     data.tipo ?? 'passiva', data.note ?? null, now]
  );
  return result.lastInsertRowId;
}

export async function deleteReperibilita(id: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM reperibilita WHERE id = ?', [id]);
}

// ─── Buste Paga ───────────────────────────────────────────────────────────────

export async function getBustePaga(anno?: number): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  if (anno !== undefined) {
    return db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM buste_paga WHERE anno = ? ORDER BY mese DESC', [anno]
    );
  }
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM buste_paga ORDER BY anno DESC, mese DESC');
}

export async function getBustaPaga(anno: number, mese: number): Promise<Record<string, unknown> | null> {
  const db = await openDb();
  return db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM buste_paga WHERE anno = ? AND mese = ?', [anno, mese]
  );
}

export async function upsertBustaPaga(data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO buste_paga (mese, anno, pdf_path, pdf_nome, lordo, netto, straordinari_ore,
      straordinari_importo, trattenute_totali, netto_calcolato, differenza, has_discrepancy,
      note_confronto, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(rowid) DO UPDATE SET
       pdf_path = excluded.pdf_path,
       pdf_nome = excluded.pdf_nome,
       lordo = excluded.lordo,
       netto = excluded.netto,
       straordinari_ore = excluded.straordinari_ore,
       straordinari_importo = excluded.straordinari_importo,
       trattenute_totali = excluded.trattenute_totali,
       netto_calcolato = excluded.netto_calcolato,
       differenza = excluded.differenza,
       has_discrepancy = excluded.has_discrepancy,
       note_confronto = excluded.note_confronto,
       synced = 0`,
    [data.mese, data.anno, data.pdf_path ?? null, data.pdf_nome ?? null,
     data.lordo ?? 0, data.netto ?? 0, data.straordinari_ore ?? 0,
     data.straordinari_importo ?? 0, data.trattenute_totali ?? 0,
     data.netto_calcolato ?? 0, data.differenza ?? 0,
     data.has_discrepancy ? 1 : 0, data.note_confronto ?? null, now]
  );
}

// ─── Documenti ────────────────────────────────────────────────────────────────

export async function getDocumenti(tipo?: string): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  if (tipo) {
    return db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM documenti WHERE tipo = ? ORDER BY created_at DESC', [tipo]
    );
  }
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM documenti ORDER BY created_at DESC');
}

export async function insertDocumento(data: Record<string, unknown>): Promise<number> {
  const db = await openDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO documenti (tipo, titolo, descrizione, sottotipo, file_path, file_nome, file_tipo,
      data_riferimento, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.tipo, data.titolo, data.descrizione ?? null, data.sottotipo ?? null,
     data.file_path, data.file_nome, data.file_tipo,
     data.data_riferimento ?? null, now]
  );
  return result.lastInsertRowId;
}

export async function deleteDocumento(id: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM documenti WHERE id = ?', [id]);
}

// ─── Chat History ─────────────────────────────────────────────────────────────

export async function getChatHistory(limit = 50): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  return db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?', [limit]
  );
}

export async function insertChatMessage(data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO chat_history (session_id, ruolo, contenuto, created_at) VALUES (?, ?, ?, ?)',
    [data.session_id ?? null, data.ruolo, data.contenuto, now]
  );
}

export async function deleteChatHistory(): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM chat_history');
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlerts(soloNonLetti = false): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  if (soloNonLetti) {
    return db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM alerts WHERE letto = 0 ORDER BY created_at DESC'
    );
  }
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM alerts ORDER BY created_at DESC');
}

export async function markAlertRead(id: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('UPDATE alerts SET letto = 1 WHERE id = ?', [id]);
}

export async function insertAlert(data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO alerts (tipo, titolo, messaggio, data_scadenza, created_at) VALUES (?, ?, ?, ?, ?)',
    [data.tipo, data.titolo, data.messaggio, data.data_scadenza ?? null, now]
  );
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

export async function enqueueOperation(
  operation: string,
  endpoint: string,
  method: string,
  payload?: unknown
): Promise<void> {
  const db = await openDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO offline_queue (operation, endpoint, method, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    [operation, endpoint, method, payload ? JSON.stringify(payload) : null, now]
  );
}

export async function getPendingOperations(): Promise<Record<string, unknown>[]> {
  const db = await openDb();
  return db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM offline_queue ORDER BY created_at ASC'
  );
}

export async function removeQueuedOperation(id: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM offline_queue WHERE id = ?', [id]);
}

export async function incrementRetryCount(id: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('UPDATE offline_queue SET retry_count = retry_count + 1 WHERE id = ?', [id]);
}

// ─── Utilità ──────────────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const db = await openDb();
  await db.execAsync(`
    DELETE FROM timbrature;
    DELETE FROM timbrature_aziendali;
    DELETE FROM assenze;
    DELETE FROM reperibilita;
    DELETE FROM buste_paga;
    DELETE FROM documenti;
    DELETE FROM chat_history;
    DELETE FROM alerts;
    DELETE FROM offline_queue;
  `);
}

export async function clearAccount(): Promise<void> {
  const db = await openDb();
  await db.execAsync(`
    DELETE FROM settings;
  `);
}
