import { AylikYoklamaMap, SahaFaaliyeti, SahaFaaliyetTipi } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { getYoklamaDay, setYoklamaDay } from './yoklamaUtils';

/** Mesai saha faaliyetinde tek seferde girilebilecek üst sınır (saat) */
export const MAX_SAHA_MESAI_SAATI = 24;
export const MAX_SAHA_FOTO_COUNT = 5;

type FaaliyetFotoKaynak = {
  fotoUrl?: string | null;
  fotoUrls?: string[] | Record<string, string> | null;
  sahaFotoBase64?: string;
  fotoBase64?: string;
  fotograflar?: Array<string | { fotoUrl?: string; url?: string; dataUrl?: string }>;
  fotoAdedi?: number;
};

function coerceFotoUrl(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    const u = raw.trim();
    if (!u || u === 'null' || u === 'undefined') return '';
    if (u.startsWith('data:') || /^https?:\/\//i.test(u) || u.startsWith('blob:')) return u;
    // Ham base64 (prefix yok)
    if (u.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(u.slice(0, 120))) {
      return `data:image/jpeg;base64,${u.replace(/\s+/g, '')}`;
    }
    return u;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return coerceFotoUrl(o.fotoUrl || o.url || o.dataUrl || o.src || '');
  }
  return '';
}

function collectFotoList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(coerceFotoUrl).filter(Boolean);
  }
  if (typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>)
      .map(coerceFotoUrl)
      .filter(Boolean);
  }
  const single = coerceFotoUrl(raw);
  return single ? [single] : [];
}

/** Kayıttaki tüm saha fotoğrafları (geriye uyumlu: tek fotoUrl, object map, ham base64) */
export function getFaaliyetFotolar(sf: FaaliyetFotoKaynak | null | undefined): string[] {
  if (!sf) return [];
  const fromArray = collectFotoList(sf.fotoUrls);
  if (fromArray.length > 0) return fromArray.slice(0, MAX_SAHA_FOTO_COUNT);

  const fromFotograflar = collectFotoList(sf.fotograflar);
  if (fromFotograflar.length > 0) return fromFotograflar.slice(0, MAX_SAHA_FOTO_COUNT);

  const single = coerceFotoUrl(sf.fotoUrl || sf.sahaFotoBase64 || sf.fotoBase64 || '');
  return single ? [single] : [];
}

/** İlerleme kayıtlarındaki aşama fotoğrafları */
export function getFaaliyetIlerlemeFotolar(
  sf: { ilerlemeKayitlari?: Array<{ fotoUrls?: string[] | null }> } | null | undefined
): string[] {
  if (!sf?.ilerlemeKayitlari?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const kayit of sf.ilerlemeKayitlari) {
    for (const raw of kayit.fotoUrls || []) {
      const url = coerceFotoUrl(raw);
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  return out;
}

/** Ana kayıt + ilerleme fotoğrafları (gösterim / rapor) */
export function getFaaliyetTumFotolar(sf: FaaliyetFotoKaynak | null | undefined): string[] {
  const main = getFaaliyetFotolar(sf);
  const ilerleme = getFaaliyetIlerlemeFotolar(sf as { ilerlemeKayitlari?: Array<{ fotoUrls?: string[] }> });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...main, ...ilerleme]) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
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
      // Yönetim günlük programından atanan görevler — tüm formenler görür
      if (f.kaynakEkran === 'GUNLUK_PROGRAM' && f.programaGonderildi !== false) return true;
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
