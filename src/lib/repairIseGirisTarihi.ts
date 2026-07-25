import type { AylikYoklamaMap, Personel } from '../types/erp';
import { LEGACY_EXCEL_MONTHS } from '../data/legacyExcelYoklama';
import { getImportedPersonnel } from '../data/importedPersonnelTsv';
import {
  asYoklamaGunMap,
  normalizeTurkishName,
} from './yoklamaUtils';

/** Toplu bozulma ile sık görülen hatalı işe giriş işaretleri */
const CORRUPT_HIRE_MARKERS = new Set(['2024-07-14', '2026-07-14']);

const NAME_ALIASES: Record<string, string[]> = {
  'FIRAT SAYGIN': ['FIRAT PELEN SAYGIN', 'FIRAT PELEN', 'FIRAT SAYGIN'],
  'UĞUR DURUKHAN': ['UGUR DURUKHAN', 'UGUR DURUKAN', 'UĞUR DURUKAN'],
  'TAHSİN OTHAN': ['TAHSIN OTHAN', 'TAHSIN OTMAN', 'TAHSİN OTMAN'],
};

function isPlausibleHire(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2024-01-01' && date <= '2026-12-31';
}

function nameKey(ad: string, soyad: string): string {
  return normalizeTurkishName(`${ad || ''} ${soyad || ''}`.trim());
}

function stripParens(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

function collectKeys(ad: string, soyad: string): string[] {
  const full = `${ad || ''} ${soyad || ''}`.trim();
  const keys = new Set<string>();
  keys.add(nameKey(ad, soyad));
  keys.add(normalizeTurkishName(stripParens(full)));
  const aliasList = NAME_ALIASES[normalizeTurkishName(full)] || NAME_ALIASES[nameKey(ad, soyad)];
  if (aliasList) aliasList.forEach((a) => keys.add(normalizeTurkishName(a)));
  // "FIRAT PELEN(SAYGIN)" → also index as FIRAT SAYGIN
  const paren = full.match(/\(([^)]+)\)/);
  if (paren && ad) {
    keys.add(normalizeTurkishName(`${ad} ${paren[1]}`));
  }
  return Array.from(keys).filter(Boolean);
}

let cachedSeedMap: Map<string, string> | null = null;

/** Seed / TSV kaynaklarından isim → en erken geçerli işe giriş */
export function buildKnownIseGirisMap(): Map<string, string> {
  if (cachedSeedMap) return cachedSeedMap;
  const map = new Map<string, string>();

  const put = (ad: string, soyad: string, date?: string) => {
    if (!date || !isPlausibleHire(date)) return;
    for (const key of collectKeys(ad, soyad)) {
      const prev = map.get(key);
      if (!prev || date < prev) map.set(key, date);
    }
  };

  for (const month of LEGACY_EXCEL_MONTHS) {
    for (const rec of month.personeller) {
      put(rec.ad, rec.soyad, rec.iseGirisTarihi);
    }
  }

  try {
    for (const p of getImportedPersonnel()) {
      put(p.ad, p.soyad, p.iseGirisTarihi);
    }
  } catch {
    // TSV parse hatası onarımı engellemesin
  }

  cachedSeedMap = map;
  return map;
}

function lookupKnownHire(p: Personel, seedMap: Map<string, string>): string | undefined {
  for (const key of collectKeys(p.ad, p.soyad)) {
    const hit = seedMap.get(key);
    if (hit) return hit;
  }
  // soyad alias: SAYGIN ↔ PELEN
  const soy = normalizeTurkishName(p.soyad || '');
  if (soy.includes('SAYGIN') || soy.includes('PELEN')) {
    const ad = normalizeTurkishName(p.ad || '');
    for (const [k, v] of seedMap) {
      if (k.startsWith(ad + ' ') && (k.includes('SAYGIN') || k.includes('PELEN'))) return v;
    }
  }
  if (soy.includes('DURUKHAN') || soy.includes('DURUKAN')) {
    const ad = normalizeTurkishName(p.ad || '');
    for (const [k, v] of seedMap) {
      if (k.startsWith(ad + ' ') && (k.includes('DURUKHAN') || k.includes('DURUKAN'))) return v;
    }
  }
  return undefined;
}

/** Personelin kayıtlı yoklamasındaki en erken dolu gün (Girilmedi hariç) */
export function earliestRecordedYoklamaDate(
  personMap: AylikYoklamaMap[string] | undefined
): string | undefined {
  const map = asYoklamaGunMap(personMap as any);
  if (!map) return undefined;
  let earliest: string | undefined;
  for (const [key, val] of Object.entries(map)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (!val?.durum || val.durum === 'Girilmedi') continue;
    if (!earliest || key < earliest) earliest = key;
  }
  return earliest;
}

export type IseGirisRepairChange = {
  id: string;
  adSoyad: string;
  from: string;
  to: string;
  reason: string;
};

/**
 * İleri kaymış / toplu bozulmuş işe giriş tarihlerini geri çeker.
 * Yoklama verisi silinmez; sadece personel.iseGirisTarihi düzeltilir.
 */
export function repairCorruptedIseGirisTarihi(
  personeller: Personel[],
  yoklamalar: AylikYoklamaMap
): { next: Personel[]; changes: IseGirisRepairChange[] } {
  const seedMap = buildKnownIseGirisMap();
  const changes: IseGirisRepairChange[] = [];

  const next = personeller.map((p) => {
    const current = String(p.iseGirisTarihi || '').trim();
    const known = lookupKnownHire(p, seedMap);
    const earliestAtt = earliestRecordedYoklamaDate(yoklamalar[p.id]);

    const candidates = [known, earliestAtt].filter(
      (d): d is string => !!d && isPlausibleHire(d)
    );
    if (candidates.length === 0) return p;

    const best = candidates.reduce((a, b) => (a < b ? a : b));

    const markerCorrupt = CORRUPT_HIRE_MARKERS.has(current);
    const july2026Bulk =
      /^2026-07-\d{2}$/.test(current) && best < current && best < '2026-07-01';
    const afterAttendance = !!(earliestAtt && current && current > earliestAtt);
    const afterKnown = !!(known && current && current > known && (markerCorrupt || july2026Bulk || afterAttendance));

    const needsRepair =
      !current ||
      !isPlausibleHire(current) ||
      markerCorrupt ||
      july2026Bulk ||
      afterAttendance ||
      afterKnown;

    if (!needsRepair) return p;
    if (current && isPlausibleHire(current) && best >= current && !markerCorrupt) return p;

    changes.push({
      id: p.id,
      adSoyad: `${p.ad} ${p.soyad}`.trim(),
      from: current || '(boş)',
      to: best,
      reason: markerCorrupt
        ? 'toplu-bozulma-isareti'
        : afterAttendance
          ? 'yoklama-oncesi-giris'
          : 'seed-geri-yukle',
    });
    return { ...p, iseGirisTarihi: best };
  });

  return { next, changes };
}
