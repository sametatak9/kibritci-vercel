import { levenshteinDistance, normalizeCardName } from './duplicateNameUtils';

export type CatalogKind = 'gorev' | 'birim' | 'alan' | 'nitelik';

export const DEFAULT_GOREV_PRESETS = [
  'DÜZ İŞÇİ',
  'FORMEN',
  'USTA',
  'MİMAR',
  'MÜHENDİS',
  'ŞEF',
  'GÜVENLİK',
  'DEPOCU',
  'KAYNAKÇI',
  'BOYACI',
  'ELEKTRİKÇİ',
  'TESİSATÇI',
  'KALIPÇI',
  'DEMİRCİ',
  'SERAMİKÇİ',
  'ŞÖFÖR',
  'AŞÇI',
  'KAMP GÖREVLİSİ',
] as const;

export const DEFAULT_BIRIM_PRESETS = [
  'ADET',
  'KG',
  'TON',
  'M3',
  'M2',
  'METRE',
  'LT',
  'TORBA',
  'PAKET',
  'KOLİ',
  'ÇUVAL',
  'SET',
  'TAKIM',
] as const;

export const DEFAULT_NITELIK_PRESETS = [
  'ALÇI SIVA USTASI',
  'SIVA USTASI',
  'ALÇI USTASI',
  'BOYA USTASI',
  'KALIP USTASI',
  'DEMİR USTASI',
  'SERAMİK USTASI',
  'TESİSAT USTASI',
  'ELEKTRİK USTASI',
  'KAYNAK USTASI',
  'DUVARCI',
  'FAYANSÇI',
  'YARDIMCI USTA',
] as const;

export const DEFAULT_ALAN_PRESETS = [
  'Dursunköy Şantiyesi',
  'Kamp Alanı',
  'Parsel A',
  'Parsel B',
  'Parsel C',
  'Şantiye Deposu',
  'Atölye',
  'Ofis',
  'Saha Genel',
] as const;

export const SIPARIS_EDEN_SANTIER = 'Dursunköy Şantiyesi';

export function normalizeCatalogValue(value: string): string {
  return normalizeCardName(value).toLocaleUpperCase('tr-TR');
}

export function mergeCatalogOptions(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) continue;
      const key = normalizeCatalogValue(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'tr'));
}

export interface CatalogSimilarityMatch {
  input: string;
  canonical: string;
  distance: number;
  reason: 'exact' | 'similar';
}

export function findCatalogMatch(
  value: string,
  options: string[],
  maxDistance = 2
): CatalogSimilarityMatch | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const target = normalizeCatalogValue(trimmed);
  let best: CatalogSimilarityMatch | null = null;

  for (const option of options) {
    const opt = String(option || '').trim();
    if (!opt) continue;
    const normalized = normalizeCatalogValue(opt);
    if (normalized === target) {
      return { input: trimmed, canonical: opt, distance: 0, reason: 'exact' };
    }
    const dist = levenshteinDistance(target, normalized);
    if (dist > 0 && dist <= maxDistance) {
      if (!best || dist < best.distance) {
        best = { input: trimmed, canonical: opt, distance: dist, reason: 'similar' };
      }
    }
  }

  return best;
}

export function formatCatalogMergeHint(kind: CatalogKind, match: CatalogSimilarityMatch): string {
  const label =
    kind === 'gorev'
      ? 'görev'
      : kind === 'nitelik'
        ? 'nitelik'
        : kind === 'birim'
          ? 'birim'
          : 'kullanım alanı';
  if (match.reason === 'exact') return `"${match.canonical}" mevcut ${label} kaydıyla eşleşti.`;
  return `"${match.input}" ile "${match.canonical}" benzer görünüyor. Birleştirmek ister misiniz?`;
}
