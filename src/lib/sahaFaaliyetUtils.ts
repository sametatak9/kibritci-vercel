import { AylikYoklamaMap, SahaFaaliyeti, SahaFaaliyetTipi } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { getYoklamaDay, setYoklamaDay } from './yoklamaUtils';

/** Mesai saha faaliyetinde tek seferde girilebilecek üst sınır (saat) */
export const MAX_SAHA_MESAI_SAATI = 24;
export const MAX_SAHA_FOTO_COUNT = 5;

type FaaliyetFotoKaynak = {
  fotoUrl?: string | null;
  fotoUrls?: string[];
  sahaFotoBase64?: string;
  fotoBase64?: string;
};

/** Kayıttaki tüm saha fotoğrafları (geriye uyumlu: tek fotoUrl dahil) */
export function getFaaliyetFotolar(sf: FaaliyetFotoKaynak | null | undefined): string[] {
  if (!sf) return [];
  const fromArray = Array.isArray(sf.fotoUrls)
    ? sf.fotoUrls.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return fromArray.slice(0, MAX_SAHA_FOTO_COUNT);
  const single = String(sf.fotoUrl || sf.sahaFotoBase64 || sf.fotoBase64 || '').trim();
  return single ? [single] : [];
}

export function getFaaliyetFoto(sf: FaaliyetFotoKaynak | null | undefined): string {
  return getFaaliyetFotolar(sf)[0] || '';
}

export function isFaaliyetOnDate(f: SahaFaaliyeti, dateKey: string): boolean {
  return normalizeDateKey(f.tarih) === normalizeDateKey(dateKey);
}

export function formenOwnsSahaRecord(
  f: SahaFaaliyeti,
  formenEmail: string,
  formenUid?: string
): boolean {
  const email = formenEmail.trim().toLowerCase();
  const rec = f as SahaFaaliyeti & { kaydedenFormen?: string };
  if (email && rec.kaydedenFormen?.trim().toLowerCase() === email) return true;
  if (formenUid && f.kaydedenUid === formenUid) return true;
  if (email && String(f.kaydeden || '').trim().toLowerCase() === email) return true;
  if (f.kaynakEkran === 'FORMEN_MOBIL' && !rec.kaydedenFormen && !f.kaydedenUid) return true;
  if (!rec.kaydedenFormen && !f.kaydedenUid && !f.kaynakEkran) return true;
  return false;
}

export function filterFormenDayFaaliyetleri(
  records: SahaFaaliyeti[],
  dateKey: string,
  formenEmail: string,
  formenUid?: string,
  isLegacy?: (id: string) => boolean
): SahaFaaliyeti[] {
  const targetDate = normalizeDateKey(dateKey);
  return records
    .filter((f) => {
      if (isLegacy?.(f.id)) return false;
      if (!isFaaliyetOnDate(f, targetDate)) return false;
      if (f.kaynakEkran === 'IDARI_SAHA') return false;
      if (f.kaynakEkran === 'FORMEN_MOBIL') return true;
      return formenOwnsSahaRecord(f, formenEmail, formenUid);
    })
    .sort((a, b) => String(b.id).localeCompare(String(a.id), 'tr'));
}

export function normalizeMesaiHours(raw: number): number {
  const safe = Number.isFinite(raw) ? raw : 0;
  const clamped = Math.max(0, Math.min(MAX_SAHA_MESAI_SAATI, safe));
  return Math.round(clamped * 2) / 2;
}

export function isMesaiSahaFaaliyet(f?: Pick<SahaFaaliyeti, 'faaliyetTipi'> | null): boolean {
  return f?.faaliyetTipi === 'MESAI_SAHA';
}

export function applySahaMesaiToYoklama(
  yoklamalar: AylikYoklamaMap,
  tarih: string,
  personelMesaiSaatleri: Record<string, number> | undefined,
  gonderen: string,
  mode: 'add' | 'subtract' = 'add'
): AylikYoklamaMap {
  const dk = normalizeDateKey(tarih);
  if (!dk || !personelMesaiSaatleri) return yoklamalar;
  const [y, m, d] = dk.split('-').map(Number);
  let next: AylikYoklamaMap = { ...yoklamalar };

  for (const [personelId, hours] of Object.entries(personelMesaiSaatleri)) {
    const delta = normalizeMesaiHours(Number(hours));
    if (delta <= 0) continue;
    const dayData = getYoklamaDay(next[personelId], y, m, d) || { durum: 'Girilmedi', mesaiSaati: 0 };
    const current = normalizeMesaiHours(Number(dayData.mesaiSaati) || 0);
    const newMesai =
      mode === 'subtract'
        ? normalizeMesaiHours(Math.max(0, current - delta))
        : normalizeMesaiHours(Math.min(MAX_SAHA_MESAI_SAATI, current + delta));

    next = {
      ...next,
      [personelId]: setYoklamaDay(next[personelId], y, m, d, {
        ...dayData,
        durum: dayData.durum === 'Girilmedi' ? 'Geldi' : dayData.durum,
        mesaiSaati: newMesai,
        gonderen,
      }),
    };
  }

  return next;
}

export function formatMesaiFaaliyetLabel(f: SahaFaaliyeti, personeller: { id: string; ad: string; soyad: string }[]): string {
  if (!isMesaiSahaFaaliyet(f) || !f.personelMesaiSaatleri) return '';
  const parts = Object.entries(f.personelMesaiSaatleri)
    .filter(([, h]) => Number(h) > 0)
    .map(([pid, h]) => {
      const p = personeller.find((x) => x.id === pid);
      const name = p ? `${p.ad} ${p.soyad}` : 'Personel';
      return `${name}: ${h} sa`;
    });
  return parts.join(' · ');
}
