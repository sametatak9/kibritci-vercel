import type { KasaHareketi } from '../types/erp';

/** Kasa muhasebe miladı — 01.01.2026 öncesi geçmiş bu özet satırında toplanır */
export const KASA_MILAD = {
  /** Rapor başlangıcı bu tarihten itibaren milad kullanır */
  tarih: '2026-01-01',
  /** Bu tarihten önceki Firestore kayıtları milada gömülü; detay/toplama dışı */
  detayBaslangic: '2026-08-11',
  giren: 25000,
  cikan: 24981.59,
  bakiye: 18.41,
  cikisKalem: 27,
  carryLabel: '01.01.2026 MİLAD — DÖNEM BAŞI BAKİYE',
} as const;

export function isKasaMiladReport(startDate: string): boolean {
  return String(startDate).slice(0, 10) >= KASA_MILAD.tarih;
}

export type KasaMiladContext = {
  active: boolean;
  opening: number;
  miladGiren: number;
  miladCikan: number;
  miladBakiye: number;
  miladCikisKalem: number;
  carryLabel: string;
};

export type KasaMiladTotals = {
  totalIn: number;
  totalOut: number;
  closing: number;
  cikisKalem: number;
  detayIn: number;
  detayOut: number;
};

/** Milad + detayBaslangic sonrası kayıtların birleşik toplamları */
export function computeKasaMiladTotals(
  milad: KasaMiladContext,
  detayHareketler: KasaHareketi[]
): KasaMiladTotals {
  const detayIn = roundKasaMoney(
    detayHareketler
      .filter((k) => k.hareketTipi === 'GİRİŞ')
      .reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
  );
  const detayOut = roundKasaMoney(
    detayHareketler
      .filter((k) => k.hareketTipi === 'ÇIKIŞ')
      .reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
  );
  const detayCikisKalem = detayHareketler.filter((k) => k.hareketTipi === 'ÇIKIŞ').length;

  if (!milad.active) {
    return {
      totalIn: detayIn,
      totalOut: detayOut,
      closing: roundKasaMoney(detayIn - detayOut),
      cikisKalem: detayCikisKalem,
      detayIn,
      detayOut,
    };
  }

  return {
    totalIn: roundKasaMoney(milad.miladGiren + detayIn),
    totalOut: roundKasaMoney(milad.miladCikan + detayOut),
    closing: roundKasaMoney(milad.miladBakiye + detayIn - detayOut),
    cikisKalem: milad.miladCikisKalem + detayCikisKalem,
    detayIn,
    detayOut,
  };
}

function buildKasaMiladContext(startDate: string): KasaMiladContext {
  const active = isKasaMiladReport(startDate);
  if (!active) {
    return {
      active: false,
      opening: 0,
      miladGiren: 0,
      miladCikan: 0,
      miladBakiye: 0,
      miladCikisKalem: 0,
      carryLabel: 'DÖNEM BAŞI BAKİYE (0)',
    };
  }
  return {
    active: true,
    opening: KASA_MILAD.bakiye,
    miladGiren: KASA_MILAD.giren,
    miladCikan: KASA_MILAD.cikan,
    miladBakiye: KASA_MILAD.bakiye,
    miladCikisKalem: KASA_MILAD.cikisKalem,
    carryLabel: KASA_MILAD.carryLabel,
  };
}

/** Milad aktifken yalnızca detayBaslangic sonrası kayıtlar listelenir / toplanır */
export function filterKasaMiladDetayHareketleri(
  hareketler: KasaHareketi[],
  startDate: string,
  endDate: string,
  miladActive: boolean
): KasaHareketi[] {
  const inRange = (hareketler || []).filter(
    (k) => k.tarih >= startDate && k.tarih <= endDate
  );
  if (!miladActive) return inRange;
  return inRange.filter((k) => k.tarih >= KASA_MILAD.detayBaslangic);
}

/** Kasa tutarları — 2 ondalık, kayan nokta artığı yok */
export function roundKasaMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

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
    const t = roundKasaMoney(kh.tutar);
    if (kh.hareketTipi === 'GİRİŞ') bal += t;
    else bal -= t;
  }
  return roundKasaMoney(bal);
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

export interface KasaLedgerExportOptions {
  /**
   * true (varsayılan): yalnızca seçili tarih aralığı — açılış bakiyesi 0.
   * false: dönem öncesi tüm geçmiş devreden bakiyeye dahil.
   */
  periodOnly?: boolean;
}

export function prepareKasaLedgerExportData(
  allHareketler: KasaHareketi[],
  startDate: string,
  endDate: string,
  opts?: KasaLedgerExportOptions
): {
  dedupedAll: KasaHareketi[];
  inRange: KasaHareketi[];
  opening: number;
  periodOnly: boolean;
  milad: KasaMiladContext;
  totals: KasaMiladTotals;
} {
  const periodOnly = opts?.periodOnly !== false;
  const dedupedAll = dedupeKasaHareketleriForLedger(allHareketler);
  const milad = buildKasaMiladContext(startDate);

  let inRange: KasaHareketi[];
  let opening: number;

  if (milad.active) {
    inRange = filterKasaMiladDetayHareketleri(dedupedAll, startDate, endDate, true);
    opening = milad.opening;
  } else if (periodOnly) {
    inRange = dedupedAll.filter((k) => k.tarih >= startDate && k.tarih <= endDate);
    opening = 0;
  } else {
    inRange = dedupedAll.filter((k) => k.tarih >= startDate && k.tarih <= endDate);
    opening = computeKasaNetBalance(dedupedAll.filter((k) => String(k.tarih) < startDate));
  }

  const totals = computeKasaMiladTotals(milad, inRange);
  return { dedupedAll, inRange, opening, periodOnly, milad, totals };
}
