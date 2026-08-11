import type { KasaHareketi } from '../types/erp';

function normalizeKasaAciklama(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

/** Defter / icmal için içerik anahtarı */
export function kasaLedgerFingerprint(
  kh: Pick<KasaHareketi, 'tarih' | 'aciklama' | 'tutar' | 'hareketTipi'>
): string {
  const tutar = (Number(kh.tutar) || 0).toFixed(2);
  return `${String(kh.tarih).slice(0, 10)}|${normalizeKasaAciklama(kh.aciklama)}|${tutar}|${kh.hareketTipi}`;
}

function kasaRecordPriority(kh: KasaHareketi): number {
  if (String(kh.id || '').startsWith('kh_yol_')) return 100;
  if (kh.fisEvrakUrl) return 70;
  if (kh.kaynak !== 'LEGACY_XLS') return 60;
  return 10;
}

/**
 * Excel içe aktarım + program kaydı çiftlerini birleştir.
 * Aynı gün/açıklama/tutar/tip için program kaydı varsa LEGACY_XLS atlanır.
 * Aynı kaynak türündeki satırlar korunur (aynı gün iki ayrı alışveriş vb.).
 */
export function dedupeKasaHareketleriForLedger(hareketler: KasaHareketi[]): KasaHareketi[] {
  const groups = new Map<string, KasaHareketi[]>();
  for (const kh of hareketler || []) {
    const fp = kasaLedgerFingerprint(kh);
    const list = groups.get(fp);
    if (list) list.push(kh);
    else groups.set(fp, [kh]);
  }

  const out: KasaHareketi[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }

    const legacy = list.filter((k) => k.kaynak === 'LEGACY_XLS');
    const nonLegacy = list.filter((k) => k.kaynak !== 'LEGACY_XLS');

    if (legacy.length > 0 && nonLegacy.length > 0) {
      const kept = [...nonLegacy].sort((a, b) => kasaRecordPriority(b) - kasaRecordPriority(a));
      out.push(...kept);
      continue;
    }

    out.push(...list);
  }

  return out.sort((a, b) => {
    const dc = String(a.tarih).localeCompare(String(b.tarih));
    if (dc !== 0) return dc;
    if (a.hareketTipi !== b.hareketTipi) return a.hareketTipi === 'GİRİŞ' ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function computeKasaNetBalance(hareketler: KasaHareketi[]): number {
  let bal = 0;
  for (const kh of hareketler) {
    const t = Number(kh.tutar) || 0;
    if (kh.hareketTipi === 'GİRİŞ') bal += t;
    else bal -= t;
  }
  return bal;
}

/** Seçili dönem öncesi devreden bakiye — mükerrer kayıtlar ayıklanmış */
export function computeKasaOpeningBalance(
  allHareketler: KasaHareketi[],
  startDate: string
): number {
  const deduped = dedupeKasaHareketleriForLedger(allHareketler);
  const before = deduped.filter((k) => String(k.tarih) < startDate);
  return computeKasaNetBalance(before);
}

export function prepareKasaLedgerExportData(
  allHareketler: KasaHareketi[],
  startDate: string,
  endDate: string
): {
  dedupedAll: KasaHareketi[];
  inRange: KasaHareketi[];
  opening: number;
} {
  const dedupedAll = dedupeKasaHareketleriForLedger(allHareketler);
  const inRange = dedupedAll.filter((k) => k.tarih >= startDate && k.tarih <= endDate);
  const opening = computeKasaNetBalance(
    dedupedAll.filter((k) => String(k.tarih) < startDate)
  );
  return { dedupedAll, inRange, opening };
}
