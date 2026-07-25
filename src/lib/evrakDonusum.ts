import {
  Fatura,
  FaturaItem,
  Irsaliye,
  IrsaliyeItem,
  SatinAlmaItem,
  SatinAlmaTalebi,
} from '../types/erp';
import { linkFaturaKalemler, linkIrsaliyeKalemler, resolveCariKartId } from './evrakCariStokSync';
import type { CariKart, StokKart } from '../types/erp';

/**
 * Evrak zinciri modeli:
 *   Satın Alma  = sipariş / PO
 *   İrsaliye    = sevk / hazırlık (siparişin fiziksel karşılığı)
 *   Fatura      = mali sonuç (irsaliyenin faturalaşması)
 *
 * Bu modül taslak üretir; kayıt / miktar senkronu ekranlarda yapılır.
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortToken(): string {
  return Math.random().toString(16).slice(2, 6).toUpperCase();
}

function dateKey(d: string): string {
  return String(d || todayIso()).replace(/-/g, '');
}

export function findIrsaliyelerForSa(sa: SatinAlmaTalebi, irsaliyeler: Irsaliye[]): Irsaliye[] {
  const saId = sa.saId || '';
  if (!saId) return [];
  return irsaliyeler.filter((ir) => ir.saId === saId);
}

export function findFaturalarForIrsaliye(ir: Irsaliye, faturalar: Fatura[]): Fatura[] {
  return faturalar.filter(
    (ft) =>
      (ft.bagliIrsaliyeler || []).includes(ir.id) ||
      (ft.bagliIrsaliyeler || []).includes(ir.irsaliyeNo) ||
      (ir.faturaNo && ft.faturaNo === ir.faturaNo)
  );
}

export type SaToIrsaliyeResult = {
  irsaliye: Irsaliye;
  alreadyExists: Irsaliye[];
  warning?: string;
};

/** Satın Alma → İrsaliye Giriş formu ön doldurma (kullanıcı kaydı onaylar) */
export type SaIrsaliyeFormPrefill = {
  saId: string;
  saDocId: string;
  firma: string;
  tarih: string;
  suggestedIrNo: string;
  kalemler: IrsaliyeItem[];
};

/**
 * SA sipariş kalemlerini irsaliye formuna taşır.
 * Daha önce teslim edilen miktar varsa kalan miktarı yazar.
 */
export function buildSaIrsaliyeFormPrefill(
  sa: SatinAlmaTalebi,
  irsaliyeler: Irsaliye[] = []
): SaIrsaliyeFormPrefill {
  const tarih = todayIso();
  const linked = findIrsaliyelerForSa(sa, irsaliyeler);
  const deliveredByKalem = new Map<string, number>();
  for (const ir of linked) {
    for (const ik of ir.kalemler || []) {
      const key = ik.saKalemId || String(ik.urunAdi || '').trim().toLocaleLowerCase('tr-TR');
      if (!key) continue;
      deliveredByKalem.set(key, (deliveredByKalem.get(key) || 0) + (Number(ik.miktar) || 0));
    }
  }

  const kalemler: IrsaliyeItem[] = (sa.kalemler || []).map((k, idx) => {
    const byId = deliveredByKalem.get(k.id) || 0;
    const byName =
      deliveredByKalem.get(String(k.urunAdi || '').trim().toLocaleLowerCase('tr-TR')) || 0;
    const delivered = k.id ? byId : byName;
    const kalan = Math.max(0, (Number(k.miktar) || 0) - delivered);
    return {
      id: `iri_prefill_${sa.id}_${idx}_${shortToken()}`,
      saKalemId: k.id,
      stokKartId: k.stokKartId,
      urunAdi: k.urunAdi,
      miktar: kalan > 0 ? kalan : Number(k.miktar) || 0,
      birim: k.birim || 'ADET',
    };
  });

  return {
    saId: sa.saId,
    saDocId: sa.id,
    firma: sa.cariFirma || '',
    tarih,
    suggestedIrNo: `IRS-${dateKey(tarih)}-${shortToken()}`,
    kalemler,
  };
}

/** Satın alma (sipariş) → irsaliye (sevk hazırlık) taslağı */
export function buildIrsaliyeFromSatinAlma(
  sa: SatinAlmaTalebi,
  opts?: {
    irsaliyeler?: Irsaliye[];
    cariKartlar?: CariKart[];
    stokKartlar?: StokKart[];
    tarih?: string;
    irsaliyeNo?: string;
    allowDuplicate?: boolean;
  }
): SaToIrsaliyeResult {
  const existing = findIrsaliyelerForSa(sa, opts?.irsaliyeler || []);
  const tarih = opts?.tarih || todayIso();
  const cari =
    sa.cariKartId ||
    resolveCariKartId(sa.cariFirma, opts?.cariKartlar || []).cariKartId ||
    undefined;

  const rawKalemler: IrsaliyeItem[] = (sa.kalemler || []).map((k: SatinAlmaItem, idx) => ({
    id: `iri_from_sa_${sa.id}_${idx}_${shortToken()}`,
    saKalemId: k.id,
    stokKartId: k.stokKartId,
    urunAdi: k.urunAdi,
    miktar: Number(k.miktar) || 0,
    birim: k.birim || 'ADET',
  }));

  const kalemler = opts?.stokKartlar
    ? linkIrsaliyeKalemler(rawKalemler, opts.stokKartlar)
    : rawKalemler;

  const irsaliyeNo =
    opts?.irsaliyeNo || `IRS-${dateKey(tarih)}-${shortToken()}`;

  const irsaliye: Irsaliye = {
    id: `ir_from_sa_${sa.id}_${Date.now()}`,
    irsaliyeId: `IR-${dateKey(tarih)}-${shortToken()}`,
    irsaliyeNo,
    tarih,
    firma: sa.cariFirma,
    cariKartId: cari,
    saId: sa.saId,
    onayDurumu: 'ONAY BEKLİYOR',
    kalemler,
  };

  let warning: string | undefined;
  if (existing.length > 0 && !opts?.allowDuplicate) {
    warning = `Bu sipariş (${sa.saId}) için zaten ${existing.length} irsaliye var. Yine de yeni sevk oluşturabilirsiniz.`;
  }

  return { irsaliye, alreadyExists: existing, warning };
}

export type IrsaliyeToFaturaResult = {
  fatura: Fatura;
  alreadyExists: Fatura[];
  warning?: string;
};

function mergeIrsaliyeKalemlerToFaturaItems(irsaliyeler: Irsaliye[]): FaturaItem[] {
  const map = new Map<string, FaturaItem>();

  for (const ir of irsaliyeler) {
    for (const k of ir.kalemler || []) {
      const key = `${k.stokKartId || ''}|${String(k.urunAdi || '')
        .toLocaleLowerCase('tr-TR')
        .trim()}|${k.birim || ''}`;
      const prev = map.get(key);
      if (prev) {
        prev.miktar += Number(k.miktar) || 0;
        prev.toplam = prev.miktar * prev.birimFiyat;
        continue;
      }
      map.set(key, {
        id: `fti_from_ir_${ir.id}_${k.id}_${shortToken()}`,
        urunAdi: k.urunAdi,
        miktar: Number(k.miktar) || 0,
        birim: k.birim || 'ADET',
        birimFiyat: 0,
        kdvOran: 20,
        toplam: 0,
        stokKartId: k.stokKartId,
      });
    }
  }

  return Array.from(map.values());
}

/** İrsaliye(ler) (hazırlık/sevk) → fatura (mali) taslağı */
export function buildFaturaFromIrsaliyeler(
  irsaliyeler: Irsaliye[],
  opts?: {
    faturalar?: Fatura[];
    cariKartlar?: CariKart[];
    stokKartlar?: StokKart[];
    tarih?: string;
    faturaNo?: string;
    kdvOran?: number;
    /** Birim fiyat yoksa 0 bırakılır; kullanıcı faturada doldurur */
    birimFiyatMap?: Record<string, number>;
    allowDuplicate?: boolean;
  }
): IrsaliyeToFaturaResult {
  if (!irsaliyeler.length) {
    throw new Error('Faturaya dönüştürmek için en az bir irsaliye gerekir.');
  }

  const primary = irsaliyeler[0];
  const alreadyExists = irsaliyeler.flatMap((ir) =>
    findFaturalarForIrsaliye(ir, opts?.faturalar || [])
  );
  // unique by id
  const uniqueExisting = Array.from(new Map(alreadyExists.map((f) => [f.id, f])).values());

  const tarih = opts?.tarih || todayIso();
  const firma = primary.firma;
  const cariResolved = resolveCariKartId(firma, opts?.cariKartlar || []);
  const cariKartId = primary.cariKartId || cariResolved.cariKartId || '';

  let kalemler = mergeIrsaliyeKalemlerToFaturaItems(irsaliyeler);
  const kdv = opts?.kdvOran ?? 20;
  const priceMap = opts?.birimFiyatMap || {};
  kalemler = kalemler.map((k) => {
    const price =
      priceMap[k.stokKartId || ''] ??
      priceMap[k.urunAdi] ??
      k.birimFiyat ??
      0;
    const toplam = Number(k.miktar) * Number(price);
    return { ...k, birimFiyat: price, kdvOran: kdv, toplam };
  });

  if (opts?.stokKartlar) {
    kalemler = linkFaturaKalemler(kalemler, opts.stokKartlar);
  }

  const sub = kalemler.reduce((a, k) => a + Number(k.toplam || 0), 0);
  const kdvTutar = kalemler.reduce((a, k) => a + Number(k.toplam || 0) * (k.kdvOran / 100), 0);

  const saId =
    irsaliyeler.map((ir) => ir.saId).find(Boolean) || undefined;

  const faturaNo = opts?.faturaNo || `FAT-${dateKey(tarih)}-${shortToken()}`;

  const fatura: Fatura = {
    id: `ft_from_ir_${primary.id}_${Date.now()}`,
    faturaNo,
    tarih,
    cariUnvan: firma,
    cariKartId,
    saId,
    toplamTutar: sub,
    kdvTutar,
    genelToplam: sub + kdvTutar,
    durum: 'KONTROL BEKLEYOR',
    kalemler,
    bagliIrsaliyeler: irsaliyeler.map((ir) => ir.id),
  };

  let warning: string | undefined;
  if (uniqueExisting.length > 0 && !opts?.allowDuplicate) {
    warning = `Seçili irsaliye(ler) için zaten ${uniqueExisting.length} fatura bağlı. Yeni fatura mükerrer olabilir.`;
  }
  if (kalemler.some((k) => !k.birimFiyat)) {
    warning = [warning, 'Birim fiyatlar 0 — faturada fiyatları doldurun.']
      .filter(Boolean)
      .join(' ');
  }

  return { fatura, alreadyExists: uniqueExisting, warning };
}

/** Sipariş → doğrudan fatura (irsaliyesiz kısayol; nadir) */
export function buildFaturaFromSatinAlma(
  sa: SatinAlmaTalebi,
  opts?: {
    cariKartlar?: CariKart[];
    stokKartlar?: StokKart[];
    tarih?: string;
    faturaNo?: string;
    kdvOran?: number;
  }
): Fatura {
  const tarih = opts?.tarih || todayIso();
  const cari =
    sa.cariKartId ||
    resolveCariKartId(sa.cariFirma, opts?.cariKartlar || []).cariKartId ||
    '';
  const kdv = opts?.kdvOran ?? 20;

  let kalemler: FaturaItem[] = (sa.kalemler || []).map((k, idx) => ({
    id: `fti_from_sa_${sa.id}_${idx}_${shortToken()}`,
    urunAdi: k.urunAdi,
    miktar: Number(k.miktar) || 0,
    birim: k.birim || 'ADET',
    birimFiyat: 0,
    kdvOran: kdv,
    toplam: 0,
    stokKartId: k.stokKartId,
  }));

  if (opts?.stokKartlar) {
    kalemler = linkFaturaKalemler(kalemler, opts.stokKartlar);
  }

  return {
    id: `ft_from_sa_${sa.id}_${Date.now()}`,
    faturaNo: opts?.faturaNo || `FAT-${dateKey(tarih)}-${shortToken()}`,
    tarih,
    cariUnvan: sa.cariFirma,
    cariKartId: cari,
    saId: sa.saId,
    toplamTutar: 0,
    kdvTutar: 0,
    genelToplam: 0,
    durum: 'KONTROL BEKLEYOR',
    kalemler,
    bagliIrsaliyeler: [],
  };
}

/** İrsaliyeleri faturaya bağladıktan sonra irsaliye kayıtlarını güncelle */
export function linkIrsaliyelerToFatura(
  irsaliyeler: Irsaliye[],
  fatura: Fatura
): Irsaliye[] {
  const ids = new Set(fatura.bagliIrsaliyeler || []);
  return irsaliyeler.map((ir) => {
    if (!ids.has(ir.id) && !ids.has(ir.irsaliyeNo)) return ir;
    return {
      ...ir,
      faturaNo: fatura.faturaNo,
      saId: fatura.saId || ir.saId,
      cariKartId: ir.cariKartId || fatura.cariKartId || undefined,
    };
  });
}

export function describeEvrakZinciri(
  sa: SatinAlmaTalebi | undefined,
  irsaliyeler: Irsaliye[],
  faturalar: Fatura[]
): { siparis: boolean; sevk: number; fatura: number; tamamlandi: boolean } {
  const sevk = sa ? findIrsaliyelerForSa(sa, irsaliyeler).length : 0;
  const relatedIrs = sa ? findIrsaliyelerForSa(sa, irsaliyeler) : [];
  const faturaCount = relatedIrs.reduce(
    (n, ir) => n + findFaturalarForIrsaliye(ir, faturalar).length,
    0
  );
  const linkedFt = faturalar.filter((ft) => ft.saId && sa && ft.saId === sa.saId).length;
  const fatura = Math.max(faturaCount, linkedFt);
  return {
    siparis: Boolean(sa),
    sevk,
    fatura,
    tamamlandi: Boolean(sa) && sevk > 0 && fatura > 0,
  };
}
