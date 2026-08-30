import { SahaFaaliyeti } from '../types/erp';

const TURKISH_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function formatReportDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  const dayName = TURKISH_DAYS[dt.getDay()] ?? '';
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}${dayName ? ` (${dayName})` : ''}`;
}

/** Tablo hücresi için kısa tarih + gün (sütun taşmasını önler) */
export function formatReportDateParts(iso: string): { date: string; day: string } {
  if (!iso) return { date: '—', day: '' };
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return { date: iso, day: '' };
  const dt = new Date(y, m - 1, d);
  const dayName = TURKISH_DAYS[dt.getDay()] ?? '';
  return {
    date: `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`,
    day: dayName,
  };
}

export function formatPersonelSayisi(sf: SahaFaaliyeti): string {
  const parts: string[] = [];
  if (sf.ustaSayisi) parts.push(`${sf.ustaSayisi} usta`);
  if (sf.isciSayisi) parts.push(`${sf.isciSayisi} düz işçi`);
  return parts.length ? parts.join(', ') : '—';
}

export function faaliyetIsTanimi(sf: SahaFaaliyeti): string {
  return (sf.isNiteligi || sf.aciklama || '').replace(/\s+/g, ' ').trim() || '—';
}

export function faaliyetParsel(sf: SahaFaaliyeti): string {
  return (sf.parsel || '').replace(/^Parsel Bölge\s+/i, '').trim() || '—';
}

export function faaliyetBlok(sf: SahaFaaliyeti): string {
  if (!sf.blok || sf.blok === 'GENEL SAHA') return '—';
  return sf.blok;
}

export interface FaaliyetRaporSatiri extends SahaFaaliyeti {
  siraNo: number;
  tarihLabel: string;
  tarihDate: string;
  tarihDay: string;
  parselKisa: string;
  blokKisa: string;
}

/** Tarih sırası (eskiden yeniye) — her kayıt ayrı satır */
export function prepareSahaFaaliyetRaporu(items: SahaFaaliyeti[]): FaaliyetRaporSatiri[] {
  const sorted = [...items].sort((a, b) => {
    const cmp = (a.tarih || '').localeCompare(b.tarih || '');
    if (cmp !== 0) return cmp;
    return faaliyetIsTanimi(a).localeCompare(faaliyetIsTanimi(b), 'tr');
  });

  return sorted.map((sf, idx) => {
    const { date, day } = formatReportDateParts(sf.tarih || '');
    return {
      ...sf,
      siraNo: idx + 1,
      tarihLabel: formatReportDate(sf.tarih || ''),
      tarihDate: date,
      tarihDay: day,
      parselKisa: faaliyetParsel(sf),
      blokKisa: faaliyetBlok(sf),
    };
  });
}

export interface KampFaaliyetSatiri {
  id: string;
  tarih: string;
  tarihLabel: string;
  tarihDate: string;
  tarihDay: string;
  faaliyetTipi: string;
  aciklama: string;
  fotoUrl?: string;
  siraNo: number;
}

export function prepareKampFaaliyetRaporu(
  items: {
    id?: string;
    tarih?: string;
    faaliyetTipi?: string;
    kategori?: string;
    aciklama?: string;
    fotoUrl?: string | null;
    photo?: string | null;
  }[]
): KampFaaliyetSatiri[] {
  const sorted = [...items].sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));
  return sorted.map((kf, idx) => {
    const { date, day } = formatReportDateParts(kf.tarih || '');
    const foto = String(kf.fotoUrl || kf.photo || '').trim();
    return {
      id: kf.id || `kamp-${idx}`,
      tarih: kf.tarih || '',
      tarihLabel: formatReportDate(kf.tarih || ''),
      tarihDate: date,
      tarihDay: day,
      faaliyetTipi: kf.faaliyetTipi || kf.kategori || '—',
      aciklama: kf.aciklama || '—',
      fotoUrl: foto || undefined,
      siraNo: idx + 1,
    };
  });
}
