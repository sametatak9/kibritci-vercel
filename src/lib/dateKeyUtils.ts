/** Tarih alanlarını YYYY-MM-DD anahtarına normalize eder (ISO, TR format, datetime). */
export function normalizeDateKey(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const trMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (trMatch) return `${trMatch[3]}-${trMatch[2]}-${trMatch[1]}`;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const offset = parsed.getTimezoneOffset();
    const local = new Date(parsed.getTime() - offset * 60 * 1000);
    return local.toISOString().split('T')[0];
  }
  return value;
}

export function formatDateLabelTr(raw: unknown): string {
  const key = normalizeDateKey(raw);
  return key ? key.split('-').reverse().join('.') : '-';
}

export function todayDateKey(): string {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - offset * 60 * 1000);
  return localToday.toISOString().split('T')[0];
}

/** YYYY-MM-DD anahtarına gün ekler / çıkarır (yerel takvim). */
export function addDaysToDateKey(raw: unknown, days: number): string {
  const key = normalizeDateKey(raw) || todayDateKey();
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function tomorrowDateKey(): string {
  return addDaysToDateKey(todayDateKey(), 1);
}
