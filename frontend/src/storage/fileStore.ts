/**
 * fileStore.ts — Storage locale file (Fase 1 offline-first)
 *
 * Salva PDF e documenti nella directory privata dell'app.
 * Sostituisce lo storage base64 nel database con path locali.
 */

import * as FileSystem from 'expo-file-system/legacy';

const BASE_DIR = `${FileSystem.documentDirectory}bustapaga/`;

const DIRS = {
  buste_paga: `${BASE_DIR}buste_paga/`,
  documenti: `${BASE_DIR}documenti/`,
  certificati: `${BASE_DIR}certificati/`,
  timbrature: `${BASE_DIR}timbrature/`,
} as const;

type FileCategory = keyof typeof DIRS;

// ─── Inizializzazione ─────────────────────────────────────────────────────────

export async function initFileStore(): Promise<void> {
  for (const dir of Object.values(DIRS)) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

// ─── Salvataggio ──────────────────────────────────────────────────────────────

/**
 * Copia un file (da URI picker o path temporaneo) nella directory locale.
 * Restituisce il path locale permanente.
 */
export async function saveFile(
  sourceUri: string,
  category: FileCategory,
  fileName: string
): Promise<string> {
  await initFileStore();
  const destPath = `${DIRS[category]}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  return destPath;
}

/**
 * Salva un file da base64 (es. dati ricevuti dal backend).
 * Restituisce il path locale permanente.
 */
export async function saveFileFromBase64(
  base64: string,
  category: FileCategory,
  fileName: string
): Promise<string> {
  await initFileStore();
  const destPath = `${DIRS[category]}${fileName}`;
  await FileSystem.writeAsStringAsync(destPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destPath;
}

// ─── Lettura ──────────────────────────────────────────────────────────────────

/**
 * Legge un file locale e restituisce il contenuto come base64.
 * Utile per inviare file al backend (es. parsing PDF).
 */
export async function readFileAsBase64(filePath: string): Promise<string> {
  return FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Verifica se un file esiste localmente.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(filePath);
  return info.exists;
}

/**
 * Ottieni informazioni su un file (size, modificationTime, ecc.).
 */
export async function getFileInfo(filePath: string): Promise<FileSystem.FileInfo> {
  return FileSystem.getInfoAsync(filePath);
}

// ─── Cancellazione ────────────────────────────────────────────────────────────

/**
 * Cancella un file locale.
 */
export async function deleteFile(filePath: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (info.exists) {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  }
}

/**
 * Cancella tutti i file di una categoria.
 */
export async function deleteCategory(category: FileCategory): Promise<void> {
  const dir = DIRS[category];
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Cancella tutti i file locali dell'app (usato su cancellazione account).
 */
export async function deleteAllFiles(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BASE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(BASE_DIR, { idempotent: true });
  }
}

// ─── Elenco file ──────────────────────────────────────────────────────────────

/**
 * Lista tutti i file in una categoria.
 */
export async function listFiles(category: FileCategory): Promise<string[]> {
  const dir = DIRS[category];
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) return [];
  const files = await FileSystem.readDirectoryAsync(dir);
  return files.map(name => `${dir}${name}`);
}

// ─── Condivisione ─────────────────────────────────────────────────────────────

/**
 * Restituisce l'URI condivisibile di un file locale (per Share API).
 */
export function getShareableUri(filePath: string): string {
  return filePath;
}

// ─── Utilità ──────────────────────────────────────────────────────────────────

/**
 * Genera un nome file univoco aggiungendo timestamp se necessario.
 */
export function makeFileName(baseName: string): string {
  const ts = Date.now();
  const ext = baseName.includes('.') ? '' : '';
  const nameParts = baseName.split('.');
  if (nameParts.length > 1) {
    const name = nameParts.slice(0, -1).join('.');
    const extension = nameParts[nameParts.length - 1];
    return `${name}_${ts}.${extension}`;
  }
  return `${baseName}_${ts}${ext}`;
}

/**
 * Stima la dimensione totale dello storage locale in bytes.
 */
export async function getStorageSize(): Promise<number> {
  let total = 0;
  for (const dir of Object.values(DIRS)) {
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists && 'size' in info) {
      total += info.size ?? 0;
    }
  }
  return total;
}

export { DIRS, FileCategory };
