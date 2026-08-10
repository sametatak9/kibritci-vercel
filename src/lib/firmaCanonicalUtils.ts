import { isAkvizyonFirmaAdi } from './guvenlikHelpers';
import { firmaAnahtar, firmaEslesir } from './taseronUtils';
import { CANONICAL_ANA_FIRMA_ADI, isKibritciCompany, isTaseronPersonel } from './yoklamaUtils';
import type { Personel } from '../types/erp';

export const CANONICAL_AKVIZYON_FIRMA_ADI = 'AKVİZYON';

/** Aynı firma sayılması için gruplama anahtarı */
export function firmaDedupKey(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw || isKibritciCompany(raw)) return 'ANA_FIRMA';
  const upper = raw.toLocaleUpperCase('tr-TR');
  if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') return 'ANA_FIRMA';
  if (isAkvizyonFirmaAdi(raw)) return 'akvizyon';
  return firmaAnahtar(raw) || upper.toLocaleLowerCase('tr-TR');
}

/** Görünen kanonik firma unvanı (personel kaydını değiştirmeden filtre/cari için) */
export function canonicalFirmaUnvan(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  if (isKibritciCompany(raw)) return CANONICAL_ANA_FIRMA_ADI;
  const upper = raw.toLocaleUpperCase('tr-TR');
  if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') return CANONICAL_ANA_FIRMA_ADI;
  if (isAkvizyonFirmaAdi(raw)) return CANONICAL_AKVIZYON_FIRMA_ADI;
  return upper;
}

/** Geçersiz / test cari unvanları (AAA, Y, — vb.) */
export function isJunkCariUnvan(unvan?: string | null): boolean {
  const u = String(unvan || '').trim();
  if (!u) return true;
  const norm = u.toLocaleLowerCase('tr-TR');
  if (/^[-–—.]+$/.test(norm)) return true;
  if (/^(belirtilmedi|belirsiz|yok|tanimsiz|tanimlanmadi|bilinmiyor|test|deneme)$/i.test(norm)) {
    return true;
  }
  const key = firmaAnahtar(u);
  if (key.length <= 2) return true;
  if (/^[a]+$/i.test(key.replace(/\s/g, ''))) return true;
  return false;
}

/** Personel / kamp firmaAdi için junk kontrolü */
export function isJunkFirmaAdi(name?: string | null): boolean {
  return isJunkCariUnvan(name);
}

export type FirmaOptionEntry = { key: string; label: string };

/** Personel / cari / kamp kaynaklarından mükerrersiz firma listesi */
export function buildDedupedFirmaOptions(names: Array<string | null | undefined>): FirmaOptionEntry[] {
  const byKey = new Map<string, string>();

  for (const raw of names) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;

    if (isKibritciCompany(trimmed)) {
      byKey.set('ANA_FIRMA', `${CANONICAL_ANA_FIRMA_ADI} (Ana Firma)`);
      continue;
    }

    const upper = trimmed.toLocaleUpperCase('tr-TR');
    if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') {
      byKey.set('ANA_FIRMA', `${CANONICAL_ANA_FIRMA_ADI} (Ana Firma)`);
      continue;
    }

    const key = firmaDedupKey(trimmed);
    const label = canonicalFirmaUnvan(trimmed);
    const prev = byKey.get(key);
    if (!prev || label.length > prev.length) {
      byKey.set(key, label);
    }
  }

  if (!byKey.has('ANA_FIRMA')) {
    byKey.set('ANA_FIRMA', `${CANONICAL_ANA_FIRMA_ADI} (Ana Firma)`);
  }

  return Array.from(byKey.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => {
      if (a.key === 'ANA_FIRMA') return -1;
      if (b.key === 'ANA_FIRMA') return 1;
      return a.label.localeCompare(b.label, 'tr', { sensitivity: 'base' });
    });
}

export function personelMatchesFirmaFilterKey(
  p: Personel,
  filterKey: string,
  filterLabel: string
): boolean {
  if (filterKey === 'ANA_FIRMA') {
    return !isTaseronPersonel(p) && !isAkvizyonFirmaAdi(p.firmaAdi);
  }
  return firmaEslesir(p.firmaAdi || '', filterLabel);
}
