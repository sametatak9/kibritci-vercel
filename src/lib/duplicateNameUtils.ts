import { CariKart, StokKart } from '../types/erp';

export function normalizeCardName(name: string): string {
  return name.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

export function normalizeStockCompareName(name: string): string {
  return normalizeCardName(name)
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function findNearDuplicateStokName(
  stokKartlar: StokKart[],
  name: string,
  maxDistance = 1
): StokKart | null {
  const target = normalizeStockCompareName(name);
  if (!target) return null;

  let best: StokKart | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const stok of stokKartlar) {
    const normalized = normalizeStockCompareName(stok.stokAdi);
    if (!normalized) continue;
    const dist = levenshteinDistance(target, normalized);
    if (dist <= maxDistance && dist < bestDistance) {
      best = stok;
      bestDistance = dist;
      if (dist === 0) break;
    }
  }

  return best;
}

export function findDuplicateCariNames(cariKartlar: CariKart[], name: string, excludeId?: string): CariKart[] {
  const n = normalizeCardName(name);
  if (!n) return [];
  return cariKartlar.filter(
    (c) => c.id !== excludeId && normalizeCardName(c.unvan) === n
  );
}

export function findDuplicateStokNames(stokKartlar: StokKart[], name: string, excludeId?: string): StokKart[] {
  const n = normalizeCardName(name);
  if (!n) return [];
  return stokKartlar.filter(
    (s) => s.id !== excludeId && normalizeCardName(s.stokAdi) === n
  );
}

export function formatDuplicateCariWarning(matches: CariKart[]): string {
  const list = matches.map((m) => `"${m.unvan}" (${m.kod})`).join(', ');
  return `Bu cari unvanı sistemde tekrar ediyor: ${list}. Lütfen ismi değiştirin veya mevcut kartı kullanın.`;
}

export function formatDuplicateStokWarning(matches: StokKart[]): string {
  const list = matches.map((m) => `"${m.stokAdi}" (${m.stokKodu})`).join(', ');
  return `Bu stok adı sistemde tekrar ediyor: ${list}. Lütfen ismi değiştirin veya mevcut kartı seçin.`;
}

export function findNearDuplicateCariNames(
  cariKartlar: CariKart[],
  name: string,
  maxDistance = 2
): CariKart[] {
  const target = normalizeStockCompareName(name);
  if (!target) return [];

  const scored: Array<{ cari: CariKart; dist: number }> = [];
  for (const cari of cariKartlar) {
    const normalized = normalizeStockCompareName(cari.unvan);
    if (!normalized) continue;
    const dist = levenshteinDistance(target, normalized);
    if (dist > 0 && dist <= maxDistance) {
      scored.push({ cari, dist });
    }
  }

  return scored
    .sort((a, b) => a.dist - b.dist || a.cari.unvan.localeCompare(b.cari.unvan, 'tr'))
    .map((row) => row.cari);
}

export function warnIfDuplicateCari(cariKartlar: CariKart[], name: string, excludeId?: string): boolean {
  const dup = findDuplicateCariNames(cariKartlar, name, excludeId);
  if (dup.length === 0) return false;
  alert(formatDuplicateCariWarning(dup));
  return true;
}

export function warnIfDuplicateStok(stokKartlar: StokKart[], name: string, excludeId?: string): boolean {
  const dup = findDuplicateStokNames(stokKartlar, name, excludeId);
  if (dup.length === 0) return false;
  alert(formatDuplicateStokWarning(dup));
  return true;
}
