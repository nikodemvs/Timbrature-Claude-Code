import axios from 'axios';
import {
  UserSettings,
  Timbratura,
  Assenza,
  Reperibilita,
  BustaPaga,
  Documento,
  Alert,
  ChatMessage,
  DashboardData,
  WeeklySummary,
} from '../types';

export interface PdfUploadResponse {
  message: string;
  mese: number;
  anno: number;
  parse_success: boolean;
  parsed_data?: Record<string, unknown>;
  timbrature_importate?: number;
  filename?: string;
  documento_id?: string;
  totali?: Record<string, unknown>;
  busta?: BustaPaga;
  documento?: Documento;
  sottotipo?: string;
}

export interface CancellaDatiPersonaliResponse {
  message: string;
  cancellati: Record<string, number>;
}

export interface EliminaAccountResponse {
  message: string;
  settings_reset: boolean;
}

const BASE_URL = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:8001`
  : (process.env.EXPO_PUBLIC_BACKEND_URL || '');

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Settings
export const getSettings = () => api.get<UserSettings>('/settings');
export const updateSettings = (data: Partial<UserSettings>) => api.put<UserSettings>('/settings', data);
export const deletePersonalData = (conferma = true) =>
  api.post<CancellaDatiPersonaliResponse>('/dati-personali/cancella', { conferma });
export const deleteAccount = (conferma = true) =>
  api.post<EliminaAccountResponse>('/account/elimina', { conferma });

// Timbrature
export const getTimbrature = (params?: { mese?: number; anno?: number; data_inizio?: string; data_fine?: string }) =>
  api.get<Timbratura[]>('/timbrature', { params });
export const getTimbraturaByDate = (data: string) => api.get<Timbratura>(`/timbrature/${data}`);
export const createTimbratura = (data: { data: string; ora_entrata?: string; ora_uscita?: string; is_reperibilita_attiva?: boolean; note?: string }) =>
  api.post<Timbratura>('/timbrature', data);
export const updateTimbratura = (data: string, updates: { ora_entrata?: string; ora_uscita?: string; is_reperibilita_attiva?: boolean; note?: string }) =>
  api.put<Timbratura>(`/timbrature/${data}`, updates);
export const deleteTimbratura = (data: string) => api.delete(`/timbrature/${data}`);
export const timbra = (tipo: 'entrata' | 'uscita', isReperibilita: boolean = false) =>
  api.post<Timbratura>('/timbrature/timbra', null, { params: { tipo, is_reperibilita: isReperibilita } });
export const getWeeklySummary = (data: string) => api.get<WeeklySummary>(`/timbrature/settimana/${data}`);

// Assenze
export const getAssenze = (params?: { tipo?: string; anno?: number }) => api.get<Assenza[]>('/assenze', { params });
export const createAssenza = (data: { tipo: string; data_inizio: string; data_fine: string; ore_totali?: number; note?: string }) =>
  api.post<Assenza>('/assenze', data);
export const deleteAssenza = (id: string) => api.delete(`/assenze/${id}`);

// Ferie
export const getSaldoFerie = (anno?: number) => api.get('/ferie/saldo', { params: { anno } });

// Malattia
export const getComporto = () => api.get('/malattia/comporto');

// Reperibilità
export const getReperibilita = (params?: { mese?: number; anno?: number }) => api.get<Reperibilita[]>('/reperibilita', { params });
export const createReperibilita = (data: { data: string; ora_inizio: string; ora_fine: string; tipo?: string; interventi?: number; note?: string }) =>
  api.post<Reperibilita>('/reperibilita', data);
export const deleteReperibilita = (id: string) => api.delete(`/reperibilita/${id}`);

// Buste Paga
export const getBustePaga = (anno?: number) => api.get<BustaPaga[]>('/buste-paga', { params: { anno } });
export const getBustaPaga = (anno: number, mese: number) => api.get<BustaPaga>(`/buste-paga/${anno}/${mese}`);
export const createBustaPaga = (data: {
  mese: number;
  anno: number;
  lordo?: number;
  netto?: number;
  straordinari_ore?: number;
  straordinari_importo?: number;
  trattenute_totali?: number;
}) =>
  api.post<BustaPaga>('/buste-paga', data);
export const uploadBustaPagaAuto = (file: FormData) =>
  api.post<PdfUploadResponse>('/buste-paga/upload', file, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const updateBustaPaga = (anno: number, mese: number, data: Partial<BustaPaga>) =>
  api.put(`/buste-paga/${anno}/${mese}`, data);

// Documenti
export const getDocumenti = (tipo?: string, sottotipo?: string) =>
  api.get<Documento[]>('/documenti', { params: { tipo, sottotipo } });
export const deleteDocumento = (id: string) => api.delete(`/documenti/${id}`);
export const uploadCud = (file: FormData) =>
  api.post<{ documento: Documento; anno: number }>('/cud/upload', file, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// Dashboard
export const getDashboard = () => api.get<DashboardData>('/dashboard');
export const getStatisticheMensili = (anno?: number) => api.get('/statistiche/mensili', { params: { anno } });

// Alerts
export const getAlerts = (soloNonLetti?: boolean) => api.get<Alert[]>('/alerts', { params: { solo_non_letti: soloNonLetti } });
export const markAlertRead = (id: string) => api.put(`/alerts/${id}/letto`);

// Chat
export const sendChatMessage = (message: string, sessionId?: string) =>
  api.post<{ response: string; session_id: string }>('/chat', { message, session_id: sessionId });
export const getChatHistory = (limit?: number) => api.get<ChatMessage[]>('/chat/history', { params: { limit } });
export const clearChatHistory = () => api.delete('/chat/history');

// Timbrature Aziendali
export const getTimbratureAziendali = (params?: { mese?: number; anno?: number }) =>
  api.get('/timbrature-aziendali', { params });
export const uploadTimbratureAziendali = (file: FormData) =>
  api.post<PdfUploadResponse>('/timbrature-aziendali/upload', file, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// Confronto Timbrature
export const getConfrontoTimbrature = (mese: number, anno: number) =>
  api.get('/confronto-timbrature', { params: { mese, anno } });

export default api;

// Rimosso 2026-04-16 (F2.3 restauro): simboli senza chiamanti nel frontend.
// Se uno di questi serve di nuovo, ri-dichiaralo qui e aggiungi la chiamata nel consumer reale.
//   verifyPin, uploadCertificato, uploadBustaPaga (variante anno/mese esplicito),
//   getDocumento, uploadDocumento, createAlert, deleteAlert,
//   importTimbratureAziendali, deleteTimbraturaAziendale, deleteAllTimbratureAziendali,
//   TimbraturaAziendalePayload.
