import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';

export const formatDate = (dateStr: string, formatStr: string = 'dd/MM/yyyy'): string => {
  try {
    return format(parseISO(dateStr), formatStr, { locale: it });
  } catch {
    return dateStr;
  }
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
};

export const formatHours = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

export const formatHoursHHMM = (hours: number, opts?: { signed?: boolean }): string => {
  if (!Number.isFinite(hours)) {
    return '00:00';
  }
  const sign = hours < 0 ? '-' : (opts?.signed && hours > 0 ? '+' : '');
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const getTodayString = (): string => {
  return format(new Date(), 'yyyy-MM-dd');
};

export const getCurrentMonthYear = (): { mese: number; anno: number } => {
  const now = new Date();
  return {
    mese: now.getMonth() + 1,
    anno: now.getFullYear(),
  };
};

export const getWeekDates = (date: Date): { start: string; end: string } => {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
};

export const getMesiItaliano = (mese: number): string => {
  const mesi = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return mesi[mese - 1] || '';
};

export const getGiornoSettimana = (dateStr: string): string => {
  try {
    return format(parseISO(dateStr), 'EEEE', { locale: it });
  } catch {
    return '';
  }
};

export const getTipoAssenzaLabel = (tipo: string): string => {
  const labels: Record<string, string> = {
    ferie: 'Ferie',
    malattia: 'Malattia',
    permesso_rol: 'Permesso ROL',
    permesso_non_retribuito: 'Permesso non retribuito',
    altro: 'Altro',
  };
  return labels[tipo] || tipo;
};

export const getTipoDocumentoLabel = (tipo: string): string => {
  const labels: Record<string, string> = {
    busta_paga: 'Busta Paga',
    certificato_medico: 'Certificato Medico',
    timbrature_report: 'Report Timbrature',
    comunicazione: 'Comunicazione Aziendale',
  };
  return labels[tipo] || tipo;
};

export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};
