import { isAkvizyonFirmaAdi } from './guvenlikHelpers';
import { firmaAnahtar, firmaEslesir } from './taseronUtils';
import { CANONICAL_ANA_FIRMA_ADI, isAnaFirmaFirmaAdi, isKibritciCompany, isTaseronPersonel } from './yoklamaUtils';
import type { CariKart, Personel } from '../types/erp';

export const CANONICAL_AKVIZYON_FIRMA_ADI = 'AKVİZYON';
export const CANONICAL_VIRADOOR_FIRMA_ADI = 'VİRADOOR MOBİLYA';
export const CANONICAL_EMA_FIRMA_ADI = 'EMA MERMERİ';

/** Bilinen alias → tek kanonik unvan (REHA → VİRADOOR, EMA → EMA MERMERİ vb.) */
const FIRMA_ALIAS_CANONICAL: Record<string, string> = {
  reha: CANONICAL_VIRADOOR_FIRMA_ADI,
  'reha mobilya': CANONICAL_VIRADOOR_FIRMA_ADI,
  'reha mobilya insaat': CANONICAL_VIRADOOR_FIRMA_ADI,
  'reha insaat': CANONICAL_VIRADOOR_FIRMA_ADI,
  ema: CANONICAL_EMA_FIRMA_ADI,
  'ema mermer': CANONICAL_EMA_FIRMA_ADI,
  'ema mermeri': CANONICAL_EMA_FIRMA_ADI,
};

/** Silinecek geçersiz / mükerrer cari unvanları (firmaAnahtar) */
const JUNK_CARI_NAME_KEYS = new Set([
  'demirkan',
  'firat pen',
  'pttme yemekhane',
  'sutek',
  'zer yapi',
  'zer',
]);

export function resolveFirmaAliasCanonical(name?: string | null): string | null {
  const key = firmaAnahtar(String(name || '').trim());
  if (!key) return null;
  if (FIRMA_ALIAS_CANONICAL[key]) return FIRMA_ALIAS_CANONICAL[key];
  if (key.startsWith('reha')) return CANONICAL_VIRADOOR_FIRMA_ADI;
  return null;
}

/** Aynı firma sayılması için gruplama anahtarı */
export function firmaDedupKey(name?: string | null): string {
  const raw = String(name || '').trim();
  if (!raw || isKibritciCompany(raw)) return 'ANA_FIRMA';
  const upper = raw.toLocaleUpperCase('tr-TR');
  if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') return 'ANA_FIRMA';
  if (isAkvizyonFirmaAdi(raw)) return 'akvizyon';
  const alias = resolveFirmaAliasCanonical(raw);
  if (alias) return firmaAnahtar(alias) || alias.toLocaleLowerCase('tr-TR');
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
  const alias = resolveFirmaAliasCanonical(raw);
  if (alias) return alias;
  return upper;
}

/** Kampçı placeholder: AAA, Y, BELİRTİLMEDİ, tire vb. */
export function isPlaceholderTaseronUnvan(unvan?: string | null): boolean {
  const u = String(unvan || '').trim();
  if (!u) return true;
  const norm = u.toLocaleLowerCase('tr-TR');
  if (/^[-–—.]+$/.test(norm)) return true;
  if (/^(belirtilmedi|belirsiz|yok|tanimsiz|tanimlanmadi|bilinmiyor|test|deneme)$/i.test(norm)) {
    return true;
  }
  const key = firmaAnahtar(u);
  if (!key || key.length <= 2) return true;
  if (/^[a]+$/i.test(key.replace(/\s/g, ''))) return true;
  return false;
}

/** Geçersiz / test cari unvanları (AAA, Y, — ve tarihî junk anahtarlar) */
export function isJunkCariUnvan(unvan?: string | null): boolean {
  if (isPlaceholderTaseronUnvan(unvan)) return true;
  const key = firmaAnahtar(String(unvan || '').trim());
  return JUNK_CARI_NAME_KEYS.has(key);
}

/** Personel / kamp firmaAdi için junk kontrolü */
export function isJunkFirmaAdi(name?: string | null): boolean {
  return isJunkCariUnvan(name);
}

/** Boş olmayan ANA FİRMA / Kibritçi adı — taşeron envanterinde yer almamalı */
export function isExplicitAnaFirmaUnvan(name?: string | null): boolean {
  const raw = String(name || '').trim();
  if (!raw) return false;
  return isAnaFirmaFirmaAdi(raw);
}

export function isTaseronCariKart(
  c: Pick<CariKart, 'kartTipi'> & { tur?: string }
): boolean {
  return (
    c.kartTipi === 'TASERON' || String(c.tur || '').toUpperCase() === 'TASERON'
  );
}

/**
 * Silinecek cari: AAA/Y/BELİRTİLMEDİ vb. junk, veya taşeron kartında ana firma adı.
 * Kibritçi tedarikçi/cari kartına dokunulmaz.
 */
export function isCariKartSilinmeli(
  c: Pick<CariKart, 'kartTipi' | 'unvan'> & { tur?: string }
): boolean {
  if (isJunkCariUnvan(c.unvan)) return true;
  return isTaseronCariKart(c) && isExplicitAnaFirmaUnvan(c.unvan);
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
