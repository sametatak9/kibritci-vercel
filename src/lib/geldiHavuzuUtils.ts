import { AylikYoklamaMap, KampFaaliyet, Personel, SahaFaaliyeti, YoklamaDurum } from '../types/erp';
import { normalizeDateKey } from './dateKeyUtils';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';
import {
  findPersonelByName,
  getYoklamaDay,
  isIdariPersonel,
  isKampciGorev,
  isTaseronPersonel,
  normalizeTurkishName,
} from './yoklamaUtils';
import { isKampFaaliyetOnayli, personMatchesFaaliyet } from './faaliyetPersonelUtils';

export interface GunlukProgramCetvelSatir {
  personelId: string;
  adSoyad: string;
  gorev: string;
  yoklamaDurum: YoklamaDurum | 'Girilmedi';
  mesaiSaati: number;
  faaliyetVar: boolean;
  faaliyetSayisi: number;
  fotoSayisi: number;
  faaliyetIds: string[];
  atandi: boolean;
}

export interface GunlukProgramOzeti {
  geldiSayisi: number;
  atananSayisi: number;
  atanmamisSayisi: number;
  gorevSayisi: number;
  programTamam: boolean;
}

function parseDateParts(dateKey: string): { y: number; m: number; d: number } | null {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return null;
  const [y, m, d] = dk.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** O gün yoklamada Geldi olan aktif saha personeli (taşeron / idari / işten çıkmış hariç) */
export function buildGeldiHavuzu(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  dateKey: string
): Personel[] {
  const parts = parseDateParts(dateKey);
  if (!parts) return [];
  const { y, m, d } = parts;
  return personeller
    .filter((p) => {
      if (isTaseronPersonel(p) || isIdariPersonel(p)) return false;
      const aktif = p.durum === true || String(p.durum).toLowerCase() === 'true';
      if (!aktif) return false;
      if (String(p.istenCikisTarihi || '').trim()) return false;
      const dayData = getYoklamaDay(yoklamalar[p.id], y, m, d);
      return dayData?.durum === 'Geldi';
    })
    .sort((a, b) =>
      `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')
    );
}

/** O güne ait saha (+ opsiyonel onaylı kamp) faaliyetlerinde bağlanan id'ler */
export function buildAssignedIdsForDate(
  sahaFaaliyetleri: SahaFaaliyeti[],
  dateKey: string,
  excludeFaaliyetId?: string,
  kampFaaliyetleri: KampFaaliyet[] = []
): Set<string> {
  const ids = new Set<string>();
  const target = normalizeDateKey(dateKey);
  const absorb = (list: string[] | undefined) => {
    for (const entry of list || []) {
      const raw = String(entry || '').trim();
      if (raw) ids.add(raw);
    }
  };
  for (const sf of sahaFaaliyetleri || []) {
    if (normalizeDateKey(sf.tarih) !== target) continue;
    if (excludeFaaliyetId && sf.id === excludeFaaliyetId) continue;
    absorb(sf.aktifPersonelListesi);
    if (sf.personelId) ids.add(String(sf.personelId));
  }
  for (const kf of kampFaaliyetleri || []) {
    if (normalizeDateKey(kf.tarih) !== target) continue;
    if (!isKampFaaliyetOnayli(kf)) continue;
    absorb(kf.aktifPersonelListesi);
    if (kf.personelId) ids.add(String(kf.personelId));
  }
  return ids;
}

/** Geldi havuzundan henüz hiçbir göreve (saha veya onaylı kamp) atanmamışlar */
export function buildAtanmamisGeldiHavuzu(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  sahaFaaliyetleri: SahaFaaliyeti[],
  dateKey: string,
  excludeFaaliyetId?: string,
  kampFaaliyetleri: KampFaaliyet[] = []
): Personel[] {
  const geldi = buildGeldiHavuzu(personeller, yoklamalar, dateKey);
  const assigned = buildAssignedIdsForDate(
    sahaFaaliyetleri,
    dateKey,
    excludeFaaliyetId,
    kampFaaliyetleri
  );
  const dayKampOnayli = (kampFaaliyetleri || []).filter(
    (kf) => normalizeDateKey(kf.tarih) === normalizeDateKey(dateKey) && isKampFaaliyetOnayli(kf)
  );
  const hasEmptyTaggedOnayliKamp = dayKampOnayli.some(
    (kf) => !(kf.aktifPersonelListesi || []).filter(Boolean).length
  );
  return geldi.filter((p) => {
    if (assigned.has(p.id)) return false;
    const fullName = normalizeTurkishName(`${p.ad} ${p.soyad}`);
    for (const id of assigned) {
      if (normalizeTurkishName(id) === fullName) return false;
    }
    // Kamp faaliyetinde kaydeden / eşleşme
    if (dayKampOnayli.some((kf) => personMatchesFaaliyet(p, kf))) return false;
    // Onaylı kamp kaydı personel listesi boşsa: Kampçı Geldi'ler düşer
    if (hasEmptyTaggedOnayliKamp && isKampciGorev(p.gorev)) {
      return false;
    }
    return true;
  });
}

export function filterSahaFaaliyetleriByDate(
  sahaFaaliyetleri: SahaFaaliyeti[],
  dateKey: string
): SahaFaaliyeti[] {
  const target = normalizeDateKey(dateKey);
  return (sahaFaaliyetleri || [])
    .filter((sf) => normalizeDateKey(sf.tarih) === target)
    .sort((a, b) =>
      String(a.isNiteligi || '').localeCompare(String(b.isNiteligi || ''), 'tr')
    );
}

function resolveListEntryToPersonelId(
  entry: string,
  personeller: Personel[]
): string | undefined {
  const raw = String(entry || '').trim();
  if (!raw) return undefined;
  if (personeller.some((p) => p.id === raw)) return raw;
  const byName = findPersonelByName(personeller, raw);
  return byName?.id;
}

export function isPersonelAssignedOnDate(
  person: Personel,
  sahaFaaliyetleri: SahaFaaliyeti[],
  dateKey: string
): boolean {
  return filterSahaFaaliyetleriByDate(sahaFaaliyetleri, dateKey).some((sf) =>
    personMatchesFaaliyet(person, sf)
  );
}

/** Günlük cetvel: her Geldi personel için yoklama / mesai / faaliyet özeti */
export function buildGunlukProgramCetveli(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  sahaFaaliyetleri: SahaFaaliyeti[],
  dateKey: string
): GunlukProgramCetvelSatir[] {
  const geldi = buildGeldiHavuzu(personeller, yoklamalar, dateKey);
  const dayFaaliyetler = filterSahaFaaliyetleriByDate(sahaFaaliyetleri, dateKey);
  const parts = parseDateParts(dateKey);

  return geldi.map((p) => {
    const cell =
      parts != null
        ? getYoklamaDay(yoklamalar[p.id], parts.y, parts.m, parts.d)
        : undefined;
    const matched = dayFaaliyetler.filter((sf) => personMatchesFaaliyet(p, sf));
    return {
      personelId: p.id,
      adSoyad: `${p.ad} ${p.soyad}`.trim(),
      gorev: p.gorev || '—',
      yoklamaDurum: (cell?.durum || 'Girilmedi') as YoklamaDurum | 'Girilmedi',
      mesaiSaati: Number(cell?.mesaiSaati || 0),
      faaliyetVar: matched.length > 0,
      faaliyetSayisi: matched.length,
      fotoSayisi: matched.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0),
      faaliyetIds: matched.map((f) => f.id),
      atandi: matched.length > 0,
    };
  });
}

export function buildGunlukProgramOzeti(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap,
  sahaFaaliyetleri: SahaFaaliyeti[],
  dateKey: string
): GunlukProgramOzeti {
  const geldi = buildGeldiHavuzu(personeller, yoklamalar, dateKey);
  const dayFaaliyetler = filterSahaFaaliyetleriByDate(sahaFaaliyetleri, dateKey);
  const atananSayisi = geldi.filter((p) =>
    dayFaaliyetler.some((sf) => personMatchesFaaliyet(p, sf))
  ).length;
  const atanmamisSayisi = Math.max(0, geldi.length - atananSayisi);
  return {
    geldiSayisi: geldi.length,
    atananSayisi,
    atanmamisSayisi,
    gorevSayisi: dayFaaliyetler.length,
    programTamam: geldi.length > 0 && atanmamisSayisi === 0,
  };
}

/** aktifPersonelListesi girdilerini personel id'lerine normalize eder */
export function normalizeAktifPersonelListesi(
  list: string[] | undefined,
  personeller: Personel[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of list || []) {
    const id = resolveListEntryToPersonelId(entry, personeller) || String(entry).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
