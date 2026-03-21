/**
 * localDb.ts — Database SQLite locale (Fase 1 offline-first)
 *
 * Schema speculare alle 9 tabelle del backend + offline_queue.
 * Fonte di verità sul device. Il backend è opzionale.
 */

import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

// ─── Apertura e inizializzazione ─────────────────────────────────────────────

export async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('bustapaga.db');
  await _db.execAsync('PRAGMA journal_mode=WAL;');
  await _db.execAsync('PRAGMA foreign_keys=ON;');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      nome TEXT,
      cognome TEXT,
      matricola TEXT,
      numero_badge TEXT,
      qualifica TEXT,
      livello TEXT,
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
