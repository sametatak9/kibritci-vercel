import type { KasaHareketi, KasaOdemeDurumu, Personel } from '../types/erp';
import { KASA_ADSIZ_UNVAN, resolvePersonelUnvan } from './personelUnvanUtils';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';

/**
 * 01.01.2026 dönem baz — eski düzen ile yeni düzen arasındaki tek seferlik
 * açılış mutabakatı. Kayıtlar defterde kalır; bu dönemden sonraki hareketler
 * normal giriş/çıkış olarak eklenir.
 */
export const KASA_DONEM_BAZ = {
  baslangic: '2026-01-01',
  kapanis: '2026-08-11',
  /** Dönem başında kasaya ödenecek / borç tutarı */
  borc: 24981.59,
  /** Toplam giriş − toplam çıkış için dönem başı hedef net */
  netHedef: 24981.59,
  cikisKalem: 27,
  carryLabel: '01.01.2026 DÖNEM BAZ — KASAYA BORÇ / DEVREDEN NET',
} as const;

/** Dönem baz yalnızca tam mutabakat tarih aralığını kapsayan raporlarda kullanılır. */
export function isKasaDonemBazReport(startDate: string, endDate: string): boolean {
  const start = String(startDate).slice(0, 10);
  const end = String(endDate).slice(0, 10);
  return start === KASA_DONEM_BAZ.baslangic && end >= KASA_DONEM_BAZ.kapanis;
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
  /** Defter / devreden bakiye — giren − çıkan */
  closing: number;
  /** Rapor neti — toplam giriş − toplam çıkış */
  netDurum: number;
  cikisKalem: number;
  donemBazAktif: boolean;
};

export function computeKasaLedgerTotals(
  hareketler: KasaHareketi[],
  opts?: { donemBazAktif?: boolean }
): KasaLedgerTotals {
  const donemBazAktif = Boolean(opts?.donemBazAktif);

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
    const closing = roundKasaMoney(totalIn - totalOut);
    return {
      totalIn,
      totalOut,
      closing,
      netDurum: closing,
      cikisKalem,
      donemBazAktif: false,
    };
  }

  const post = filterPostDonemBazHareketleri(hareketler);
  const donemPersonelOdedi = (hareketler || []).filter((k) => {
    if (String(k.tarih).slice(0, 10) > KASA_DONEM_BAZ.kapanis) return false;
    return k.hareketTipi === 'ÇIKIŞ' && resolveKasaOdemeDurumu(k) === 'PERSONEL_ODEDI';
  });
  const donemPersonelToplam = roundKasaMoney(
    donemPersonelOdedi.reduce((sum, k) => sum + roundKasaMoney(k.tutar), 0)
  );
  const postIn = roundKasaMoney(
    post.filter((k) => k.hareketTipi === 'GİRİŞ').reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
  );
  const postOut = roundKasaMoney(
    post.filter((k) => k.hareketTipi === 'ÇIKIŞ').reduce((s, k) => s + roundKasaMoney(k.tutar), 0)
  );
  const postCikisKalem = post.filter((k) => k.hareketTipi === 'ÇIKIŞ').length;

  /**
   * Eski dönemden yalnızca personel tarafından ödenen DB kayıtları taşınır.
   * Diğer eski KASA / BORÇ satırları bir defalık açılış borcunda mutabık kalınır.
   */
  const donemCikis = roundKasaMoney(KASA_DONEM_BAZ.borc + donemPersonelToplam);
  const donemGiris = roundKasaMoney(donemCikis + KASA_DONEM_BAZ.netHedef);
  const totalOut = roundKasaMoney(donemCikis + postOut);
  const totalIn = roundKasaMoney(donemGiris + postIn);
  const closing = roundKasaMoney(KASA_DONEM_BAZ.netHedef + postIn - postOut);

  return {
    totalIn,
    totalOut,
    closing,
    netDurum: closing,
    cikisKalem: KASA_DONEM_BAZ.cikisKalem + donemPersonelOdedi.length + postCikisKalem,
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
  const donemBazAktif = isKasaDonemBazReport(startDate, endDate);
  const inRangePostBaz = donemBazAktif ? filterPostDonemBazHareketleri(inRange) : inRange;

  let opening: number;
  if (donemBazAktif) {
    opening = KASA_DONEM_BAZ.netHedef;
  } else if (periodOnly) {
    opening = 0;
  } else {
    opening = computeKasaNetBalance(dedupedAll.filter((k) => String(k.tarih) < startDate));
  }

  const totals = computeKasaLedgerTotals(inRange, { donemBazAktif });
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
  kalem: number;
  borc: number;
  personel: number;
  kasa: number;
  durum: KasaOdemeDurumu;
};

export type KasaKisiHarcamaRow = KasaOdemeBazliOzetSatir;

function dominantKasaOdemeDurumu(
  w: Partial<Record<KasaOdemeDurumu, number>>
): KasaOdemeDurumu {
  let best: KasaOdemeDurumu = 'KASA_ODEDI';
  let bestV = -1;
  for (const d of ['KASA_ODEDI', 'PERSONEL_ODEDI', 'BORC'] as const) {
    const v = w[d] || 0;
    if (v > bestV) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

/** Kişi / KASA bazlı harcama satırları — aynı kişinin borç+personel+kasa kayıtları birleşir */
function aggregateKasaKisiHarcamaRows(
  cikislar: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>
): KasaKisiHarcamaRow[] {
  type Acc = {
    key: string;
    label: string;
    kalem: number;
    borc: number;
    personel: number;
    kasa: number;
    w: Partial<Record<KasaOdemeDurumu, number>>;
  };
  const map = new Map<string, Acc>();

  for (const kh of cikislar) {
    if (kh.hareketTipi !== 'ÇIKIŞ') continue;
    const tutar = roundKasaMoney(kh.tutar);
    if (tutar <= 0) continue;
    const durum = resolveKasaOdemeDurumu(kh) || 'KASA_ODEDI';
    const unvan = resolvePersonelUnvan(
      { personelId: kh.personelId, personelAdi: kh.personelAdi, surucu: kh.surucu },
      personeller
    );

    const key =
      unvan.label === KASA_ADSIZ_UNVAN && durum === 'KASA_ODEDI'
        ? 'kasa:anon'
        : `kisi:${unvan.key}`;
    const label = key === 'kasa:anon' ? 'KASA' : unvan.label;

    let acc = map.get(key);
    if (!acc) {
      acc = { key, label, kalem: 0, borc: 0, personel: 0, kasa: 0, w: {} };
      map.set(key, acc);
    }
    acc.kalem += 1;
    acc.w[durum] = roundKasaMoney((acc.w[durum] || 0) + tutar);
    if (durum === 'BORC') acc.borc = roundKasaMoney(acc.borc + tutar);
    else if (durum === 'PERSONEL_ODEDI') acc.personel = roundKasaMoney(acc.personel + tutar);
    else acc.kasa = roundKasaMoney(acc.kasa + tutar);
  }

  return [...map.values()]
    .map((acc) => ({
      key: acc.key,
      label: acc.label,
      kalem: acc.kalem,
      borc: acc.borc,
      personel: acc.personel,
      kasa: acc.kasa,
      tutar: roundKasaMoney(acc.borc + acc.personel + acc.kasa),
      durum: dominantKasaOdemeDurumu(acc.w),
    }))
    .sort((a, b) => b.tutar - a.tutar || a.label.localeCompare(b.label, 'tr'));
}

export function buildKasaKisiHarcamaRows(
  cikislar: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  opts?: { donemBazAktif?: boolean; totalOut?: number }
): KasaKisiHarcamaRow[] {
  if (!opts?.donemBazAktif) {
    return aggregateKasaKisiHarcamaRows(cikislar, personeller);
  }

  /**
   * Dönem baz: başlangıç borcu tek BORÇ satırıdır. Eski dönemin yalnızca
   * PERSONEL ÖDEDİ kayıtları (Celal, Sabri, Enes, Fatih vb.) kişi bazında taşınır.
   * Eski KASA / BORÇ kayıtları ikinci kez rapora katılmaz.
   */
  const donemPersonelOdedi = (cikislar || []).filter(
    (k) =>
      String(k.tarih).slice(0, 10) <= KASA_DONEM_BAZ.kapanis &&
      k.hareketTipi === 'ÇIKIŞ' &&
      resolveKasaOdemeDurumu(k) === 'PERSONEL_ODEDI'
  );
  const postCikis = filterPostDonemBazHareketleri(cikislar);
  const personelVeSonrakiRows = aggregateKasaKisiHarcamaRows(
    [...donemPersonelOdedi, ...postCikis],
    personeller
  );

  const borcRow: KasaKisiHarcamaRow = {
    key: 'borc:donem-baz',
    label: 'BORÇ · dönem başlangıcı',
    kalem: KASA_DONEM_BAZ.cikisKalem,
    borc: KASA_DONEM_BAZ.borc,
    personel: 0,
    kasa: 0,
    tutar: KASA_DONEM_BAZ.borc,
    durum: 'BORC',
  };

  return [...personelVeSonrakiRows, borcRow].sort(
    (a, b) => b.tutar - a.tutar || a.label.localeCompare(b.label, 'tr')
  );
}

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
  const cikislar = (hareketler || []).filter((k) => k.hareketTipi === 'ÇIKIŞ');
  const satirlar = buildKasaKisiHarcamaRows(cikislar, personeller, {
    donemBazAktif,
    totalOut: opts?.totalOut,
  });

  const sumFromRows = (rows: KasaKisiHarcamaRow[]) => ({
    BORC: roundKasaMoney(rows.reduce((s, r) => s + r.borc, 0)),
    PERSONEL_ODEDI: roundKasaMoney(rows.reduce((s, r) => s + r.personel, 0)),
    KASA_ODEDI: roundKasaMoney(rows.reduce((s, r) => s + r.kasa, 0)),
  });

  let totals: Record<KasaOdemeDurumu, number>;

  totals = sumFromRows(satirlar);

  const genelToplam =
    opts?.totalOut ??
    roundKasaMoney(totals.BORC + totals.PERSONEL_ODEDI + totals.KASA_ODEDI);

  return { satirlar, totals, genelToplam };
}
