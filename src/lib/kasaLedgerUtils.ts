import type { KasaHareketi, KasaOdemeDurumu, Personel } from '../types/erp';
import { KASA_ADSIZ_UNVAN, resolvePersonelUnvan } from './personelUnvanUtils';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';

/**
 * 01.01.2026 dönem baz — bir defalık onaylı kasa özeti (içe aktarım sonrası).
 * Kayıtlar listede kalır; rapor toplamları bu baz + 11.08.2026 sonrası hareketlerden gelir.
 */
export const KASA_DONEM_BAZ = {
  baslangic: '2026-01-01',
  kapanis: '2026-08-11',
  giren: 25000,
  cikan: 24981.59,
  bakiye: 18.41,
  cikisKalem: 27,
  carryLabel: '01.01.2026 DÖNEM BAZ — DEVREDEN BAKİYE',
} as const;

export function isKasaDonemBazReport(startDate: string): boolean {
  return String(startDate).slice(0, 10) >= KASA_DONEM_BAZ.baslangic;
}

/** Dönem baz kapanışından sonraki kayıtlar — toplama / bakiye için */
export function filterPostDonemBazHareketleri(hareketler: KasaHareketi[]): KasaHareketi[] {
  return (hareketler || []).filter((k) => k.tarih > KASA_DONEM_BAZ.kapanis);
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

export type KasaLedgerTotals = {
  totalIn: number;
  totalOut: number;
  closing: number;
  cikisKalem: number;
  donemBazAktif: boolean;
};

export function computeKasaLedgerTotals(
  hareketler: KasaHareketi[],
  opts?: { donemBazAktif?: boolean; startDate?: string }
): KasaLedgerTotals {
  const donemBazAktif = Boolean(opts?.donemBazAktif && opts?.startDate && isKasaDonemBazReport(opts.startDate));

  if (!donemBazAktif) {
    const totalIn = roundKasaMoney(
      hareketler
        .filter((k) => k.hareketTipi === 'GİRİŞ')
        .reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
    );
    const totalOut = roundKasaMoney(
      hareketler
        .filter((k) => k.hareketTipi === 'ÇIKIŞ')
        .reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
    );
    const cikisKalem = hareketler.filter((k) => k.hareketTipi === 'ÇIKIŞ').length;
    return {
      totalIn,
      totalOut,
      closing: roundKasaMoney(totalIn - totalOut),
      cikisKalem,
      donemBazAktif: false,
    };
  }

  const post = filterPostDonemBazHareketleri(hareketler);
  const postIn = roundKasaMoney(
    post.filter((k) => k.hareketTipi === 'GİRİŞ').reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
  );
  const postOut = roundKasaMoney(
    post.filter((k) => k.hareketTipi === 'ÇIKIŞ').reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
  );
  const postCikisKalem = post.filter((k) => k.hareketTipi === 'ÇIKIŞ').length;

  return {
    totalIn: roundKasaMoney(KASA_DONEM_BAZ.giren + postIn),
    totalOut: roundKasaMoney(KASA_DONEM_BAZ.cikan + postOut),
    closing: roundKasaMoney(KASA_DONEM_BAZ.bakiye + postIn - postOut),
    cikisKalem: KASA_DONEM_BAZ.cikisKalem + postCikisKalem,
    donemBazAktif: true,
  };
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
  inRangePostBaz: KasaHareketi[];
  opening: number;
  periodOnly: boolean;
  totals: KasaLedgerTotals;
  donemBazAktif: boolean;
} {
  const periodOnly = opts?.periodOnly !== false;
  const dedupedAll = dedupeKasaHareketleriForLedger(allHareketler);
  const inRange = dedupedAll.filter((k) => k.tarih >= startDate && k.tarih <= endDate);
  const donemBazAktif = isKasaDonemBazReport(startDate);
  const inRangePostBaz = donemBazAktif ? filterPostDonemBazHareketleri(inRange) : inRange;

  let opening: number;
  if (donemBazAktif) {
    opening = KASA_DONEM_BAZ.bakiye;
  } else if (periodOnly) {
    opening = 0;
  } else {
    opening = computeKasaNetBalance(dedupedAll.filter((k) => String(k.tarih) < startDate));
  }

  const totals = computeKasaLedgerTotals(inRange, { donemBazAktif, startDate });
  return { dedupedAll, inRange, inRangePostBaz, opening, periodOnly, totals, donemBazAktif };
}

/** Dönem baz aktifken bakiye sütununa yalnızca kapanış sonrası hareketler yansır */
export function shouldApplyDonemBazToBalance(
  kh: Pick<KasaHareketi, 'tarih'>,
  donemBazAktif: boolean
): boolean {
  if (!donemBazAktif) return true;
  return String(kh.tarih).slice(0, 10) > KASA_DONEM_BAZ.kapanis;
}

export type KasaOdemeBazliOzetSatir = {
  key: string;
  label: string;
  tutar: number;
  durum: KasaOdemeDurumu;
};

export function computeKasaOdemeBazliOzet(
  hareketler: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  opts?: { donemBazAktif?: boolean; totalOut?: number }
): {
  satirlar: KasaOdemeBazliOzetSatir[];
  totals: Record<KasaOdemeDurumu, number>;
  genelToplam: number;
} {
  const donemBazAktif = Boolean(opts?.donemBazAktif);
  const buckets = new Map<string, KasaOdemeBazliOzetSatir>();
  const totals: Record<KasaOdemeDurumu, number> = {
    BORC: 0,
    PERSONEL_ODEDI: 0,
    KASA_ODEDI: 0,
  };

  const add = (key: string, label: string, durum: KasaOdemeDurumu, tutar: number) => {
    const t = roundKasaMoney(tutar);
    if (t <= 0) return;
    totals[durum] = roundKasaMoney(totals[durum] + t);
    const prev = buckets.get(key);
    if (prev) prev.tutar = roundKasaMoney(prev.tutar + t);
    else buckets.set(key, { key, label, tutar: t, durum });
  };

  if (donemBazAktif) {
    add(
      'donem-baz:kasa',
      `KASA · dönem baz (${formatDonemBazLabel()})`,
      'KASA_ODEDI',
      KASA_DONEM_BAZ.cikan
    );
  }

  const cikisKaynak = donemBazAktif ? filterPostDonemBazHareketleri(hareketler) : hareketler;
  for (const kh of cikisKaynak) {
    if (kh.hareketTipi !== 'ÇIKIŞ') continue;
    const tutar = roundKasaMoney(kh.tutar);
    if (tutar <= 0) continue;
    const durum = resolveKasaOdemeDurumu(kh) || 'KASA_ODEDI';
    const unvan = resolvePersonelUnvan(
      { personelId: kh.personelId, personelAdi: kh.personelAdi, surucu: kh.surucu },
      personeller
    );

    if (durum === 'KASA_ODEDI') {
      const label = unvan.label === KASA_ADSIZ_UNVAN ? 'KASA' : `${unvan.label} · KASA ÖDEDİ`;
      add(`kasa:${unvan.key}`, label, 'KASA_ODEDI', tutar);
      continue;
    }
    if (durum === 'BORC') {
      add(`borc:${unvan.key}`, `BORÇ · ${unvan.label}`, 'BORC', tutar);
      continue;
    }
    add(`podedi:${unvan.key}`, `${unvan.label} · PERSONEL ÖDEDİ`, 'PERSONEL_ODEDI', tutar);
  }

  const satirlar = [...buckets.values()].sort((a, b) => {
    const order = { BORC: 0, PERSONEL_ODEDI: 1, KASA_ODEDI: 2 };
    if (order[a.durum] !== order[b.durum]) return order[a.durum] - order[b.durum];
    return b.tutar - a.tutar || a.label.localeCompare(b.label, 'tr');
  });

  const genelToplam =
    opts?.totalOut ??
    roundKasaMoney(totals.BORC + totals.PERSONEL_ODEDI + totals.KASA_ODEDI);

  return { satirlar, totals, genelToplam };
}

function formatDonemBazLabel(): string {
  const fmt = (iso: string) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  };
  return `${fmt(KASA_DONEM_BAZ.baslangic)}—${fmt(KASA_DONEM_BAZ.kapanis)}`;
}
