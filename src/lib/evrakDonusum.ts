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

/** SA ile irsaliye bağını bul: saId, SA doc id veya kalem.saKalemId */
export function findIrsaliyelerForSa(sa: SatinAlmaTalebi, irsaliyeler: Irsaliye[]): Irsaliye[] {
  const saId = String(sa.saId || '').trim();
  const saDocId = String(sa.id || '').trim();
  const kalemIds = new Set(
    (sa.kalemler || []).map((k) => String(k.id || '').trim()).filter(Boolean)
  );
  if (!saId && !saDocId && kalemIds.size === 0) return [];

  return (irsaliyeler || []).filter((ir) => {
    const irSa = String(ir.saId || '').trim();
    if (saId && irSa === saId) return true;
    if (saDocId && irSa === saDocId) return true;
    if (kalemIds.size === 0) return false;
    return (ir.kalemler || []).some((k) => {
      const kid = String(k.saKalemId || '').trim();
      return Boolean(kid && kalemIds.has(kid));
    });
  });
}

/**
 * Kalem üzerinden bulunan ama saId yazılmamış irsaliyelere SA no'sunu yazar (yumuşak onarım).
 * Rapor / dönüşüm sonrası state senkronu için.
 */
export function ensureIrsaliyeSaBaglari(
  sa: SatinAlmaTalebi,
  irsaliyeler: Irsaliye[]
): { irsaliyeler: Irsaliye[]; repairedIds: string[] } {
  const saId = String(sa.saId || '').trim();
  if (!saId) return { irsaliyeler, repairedIds: [] };
  const linkedIds = new Set(findIrsaliyelerForSa(sa, irsaliyeler).map((ir) => ir.id));
  const repairedIds: string[] = [];
  const next = irsaliyeler.map((ir) => {
    if (!linkedIds.has(ir.id)) return ir;
    if (String(ir.saId || '').trim() === saId) return ir;
    repairedIds.push(ir.id);
    return { ...ir, saId };
  });
  return { irsaliyeler: next, repairedIds };
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
    donusumKaynagi: 'SA_DONUSUM',
  };

  let warning: string | undefined;
  if (existing.length > 0 && !opts?.allowDuplicate) {
    warning = `Bu sipariş (${sa.saId}) için zaten ${existing.length} irsaliye var. Yine de yeni sevk oluşturabilirsiniz.`;
  }

  return { irsaliye, alreadyExists: existing, warning };
}

/**
 * Satın alma (sipariş) → N adet irsaliye üretir.
 * Her irsaliye aynı kalemleri içerir (tonaj/yük birimi durumunda
 * kullanıcı miktarı irsaliye ekranında günceller).
 *
 * Örnek kullanım: 20 araç mıcır siparişi → 20 adet irsaliye
 */
export function buildMultiIrsaliyeFromSatinAlma(
  sa: SatinAlmaTalebi,
  adet: number,
  opts?: {
    irsaliyeler?: Irsaliye[];
    cariKartlar?: CariKart[];
    stokKartlar?: StokKart[];
    tarih?: string;
    /** Her irsaliyeye bölünmüş miktar mı kullanılsın? Varsayılan: false (tam miktar) */
    bolunmuslu?: boolean;
  }
): { irsaliyeler: Irsaliye[]; alreadyExists: Irsaliye[]; warning?: string } {
  if (adet < 1) throw new Error('En az 1 irsaliye üretilmelidir.');
  if (adet > 500) throw new Error('Tek seferde en fazla 500 irsaliye üretilebilir.');

  const tarih = opts?.tarih || todayIso();
  const cari =
    sa.cariKartId ||
    resolveCariKartId(sa.cariFirma, opts?.cariKartlar || []).cariKartId ||
    undefined;

  const existing = findIrsaliyelerForSa(sa, opts?.irsaliyeler || []);

  const dateK = dateKey(tarih);
  // Sıralı token üret: IRS-20250725-001, IRS-20250725-002 ...
  const existingNos = new Set((opts?.irsaliyeler || []).map((ir) => ir.irsaliyeNo));
  const baseNo = `IRS-${dateK}`;
  let seqStart = 1;
  while (existingNos.has(`${baseNo}-${String(seqStart).padStart(3, '0')}`)) {
    seqStart++;
  }

  const irsaliyeler: Irsaliye[] = [];
  for (let i = 0; i < adet; i++) {
    const seq = seqStart + i;
    const irsaliyeNo = `${baseNo}-${String(seq).padStart(3, '0')}`;

    const rawKalemler: IrsaliyeItem[] = (sa.kalemler || []).map((k: SatinAlmaItem, idx) => {
      let miktar = Number(k.miktar) || 0;
      // Bölünmüş mod: toplam miktarı irsaliye sayısına böl (tam sayı bölümü)
      if (opts?.bolunmuslu && adet > 1) {
        miktar = Math.ceil(miktar / adet);
      }
      return {
        id: `iri_multi_${sa.id}_${seq}_${idx}_${shortToken()}`,
        saKalemId: k.id,
        stokKartId: k.stokKartId,
        urunAdi: k.urunAdi,
        miktar,
        birim: k.birim || 'ADET',
      };
    });

    const kalemler = opts?.stokKartlar
      ? linkIrsaliyeKalemler(rawKalemler, opts.stokKartlar)
      : rawKalemler;

    irsaliyeler.push({
      id: `ir_multi_${sa.id}_${seq}_${Date.now() + i}`,
      irsaliyeId: `IR-${dateK}-${String(seq).padStart(3, '0')}`,
      irsaliyeNo,
      tarih,
      firma: sa.cariFirma,
      cariKartId: cari,
      saId: sa.saId,
      onayDurumu: 'ONAY BEKLİYOR',
      kalemler,
    });
  }

  let warning: string | undefined;
  if (existing.length > 0) {
    warning = `Bu sipariş için zaten ${existing.length} irsaliye var. ${adet} yeni irsaliye eklenecek.`;
  }

  return { irsaliyeler, alreadyExists: existing, warning };
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
    donusumKaynagi: 'IR_FATURA',
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

/** İrsaliyeleri faturaya bağladıktan sonra irsaliye kayıtlarını güncelle (yumuşak bağ — kilit yok) */
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

/** Fatura–irsaliye bağını kaldır (düzenleme / hata düzeltme) */
export function unlinkIrsaliyeFromFatura(
  irsaliyeler: Irsaliye[],
  fatura: Fatura,
  irsaliyeIdOrNo: string
): Irsaliye[] {
  return irsaliyeler.map((ir) => {
    if (ir.id !== irsaliyeIdOrNo && ir.irsaliyeNo !== irsaliyeIdOrNo) return ir;
    if (ir.faturaNo && ir.faturaNo !== fatura.faturaNo) return ir;
    return { ...ir, faturaNo: undefined };
  });
}

/** Faturanın bagliIrsaliyeler listesini güncelle; çıkarılan irsaliyelerin faturaNo'sunu temizle */
export function syncFaturaIrsaliyeBaglari(
  fatura: Fatura,
  nextBagliIds: string[],
  irsaliyeler: Irsaliye[]
): { fatura: Fatura; irsaliyeler: Irsaliye[] } {
  const prev = new Set(fatura.bagliIrsaliyeler || []);
  const next = new Set(nextBagliIds);
  const removed = [...prev].filter((id) => !next.has(id));
  const added = [...next].filter((id) => !prev.has(id));

  let nextIrs = irsaliyeler;
  for (const id of removed) {
    nextIrs = unlinkIrsaliyeFromFatura(nextIrs, fatura, id);
  }
  const patchedFatura: Fatura = { ...fatura, bagliIrsaliyeler: nextBagliIds };
  if (added.length) {
    nextIrs = linkIrsaliyelerToFatura(nextIrs, patchedFatura);
  }
  return { fatura: patchedFatura, irsaliyeler: nextIrs };
}

/** Seçilen irsaliyelerin aynı cariye ait olup olmadığını kontrol et */
export function assertSameCariIrsaliyeler(irsaliyeler: Irsaliye[]): {
  ok: boolean;
  message?: string;
  cariKartId?: string;
  firma?: string;
} {
  if (!irsaliyeler.length) {
    return { ok: false, message: 'En az bir irsaliye seçin.' };
  }
  const cariIds = new Set(
    irsaliyeler.map((ir) => String(ir.cariKartId || '').trim()).filter(Boolean)
  );
  const firmas = new Set(
    irsaliyeler.map((ir) => String(ir.firma || '').trim().toLocaleLowerCase('tr-TR')).filter(Boolean)
  );
  if (cariIds.size > 1) {
    return { ok: false, message: 'Seçilen irsaliyeler farklı cari kartlara ait; tek faturaya bağlanamaz.' };
  }
  if (cariIds.size === 0 && firmas.size > 1) {
    return { ok: false, message: 'Seçilen irsaliyeler farklı firmalara ait; tek faturaya bağlanamaz.' };
  }
  return {
    ok: true,
    cariKartId: cariIds.size === 1 ? [...cariIds][0] : undefined,
    firma: irsaliyeler[0]?.firma,
  };
}

export type EvrakZincirOzet = {
  siparis: boolean;
  sevk: number;
  fatura: number;
  /** Faturaya bağlanmış sevk irsaliye adedi */
  faturayaBagliSevk: number;
  /** Henüz faturaya bağlanmamış sevk */
  faturasizSevk: number;
  tamamlandi: boolean;
  /** Kısa durum cümlesi (rapor / rozet) */
  durumMetni: string;
};

/** Fiyatı 0 kalan IR→FAT dönüşümü: gerçek fatura girişi değil, taslak mali bağ */
export function isTaslakMaliBagFatura(
  ft: Pick<Fatura, 'genelToplam' | 'toplamTutar' | 'donusumKaynagi' | 'bagliIrsaliyeler'>
): boolean {
  const tutar = Number(ft.genelToplam ?? ft.toplamTutar ?? 0);
  if (tutar > 0) return false;
  if (ft.donusumKaynagi === 'IR_FATURA') return true;
  return (ft.bagliIrsaliyeler || []).length > 0;
}

/** Gerçek tedarikçi faturası (matrah/toplam > 0) */
export function isGercekFaturaGirisi(ft: Pick<Fatura, 'genelToplam' | 'toplamTutar'>): boolean {
  return Number(ft.genelToplam ?? ft.toplamTutar ?? 0) > 0;
}

/** İrsaliyedeki hizmet / miktar (vidanjör çekim · mıcır ton · diğer kalem) */
export function irsaliyeHizmetMiktari(ir: Irsaliye): {
  miktar: number;
  birim: string;
  etiket: string;
} {
  if (
    ir.kaynak === 'MICIR_STABILIZE_FIS' ||
    Boolean(ir.malzemeTipi) ||
    Boolean(ir.micirFisId)
  ) {
    const ton =
      Number(ir.tonaj) > 0
        ? Number(ir.tonaj)
        : Number(ir.kiloKg) > 0
          ? Math.round((Number(ir.kiloKg) / 1000) * 1000) / 1000
          : (ir.kalemler || []).reduce((s, k) => s + (Number(k.miktar) || 0), 0);
    if (ton > 0) {
      return { miktar: ton, birim: 'TON', etiket: 'ton' };
    }
  }
  if (Number(ir.cekimAdedi) > 0) {
    return { miktar: Number(ir.cekimAdedi), birim: 'ADET', etiket: 'çekim' };
  }
  let cekim = 0;
  let diger = 0;
  let digerBirim = 'ADET';
  for (const k of ir.kalemler || []) {
    const ad = String(k.urunAdi || '').toLocaleLowerCase('tr-TR');
    const m = Number(k.miktar) || 0;
    if (ad.includes('çekim') || ad.includes('cekim') || ad.includes('vidanj')) {
      cekim += m;
    } else {
      diger += m;
      if (k.birim) digerBirim = String(k.birim);
    }
  }
  if (cekim > 0) return { miktar: cekim, birim: 'ADET', etiket: 'çekim' };
  if (diger > 0) return { miktar: diger, birim: digerBirim, etiket: 'hizmet' };
  return { miktar: 0, birim: 'ADET', etiket: 'çekim' };
}

export function describeEvrakZinciri(
  sa: SatinAlmaTalebi | undefined,
  irsaliyeler: Irsaliye[],
  faturalar: Fatura[]
): EvrakZincirOzet {
  const relatedIrs = sa ? findIrsaliyelerForSa(sa, irsaliyeler) : [];
  const sevk = relatedIrs.length;
  const ftIds = new Set<string>();
  let faturayaBagliSevk = 0;
  for (const ir of relatedIrs) {
    const linked = findFaturalarForIrsaliye(ir, faturalar);
    if (linked.some((ft) => isGercekFaturaGirisi(ft))) faturayaBagliSevk += 1;
    for (const ft of linked) ftIds.add(ft.id);
  }
  if (sa?.saId) {
    const sid = String(sa.saId).trim();
    for (const ft of faturalar) {
      if (String(ft.saId || '').trim() === sid) ftIds.add(ft.id);
    }
  }
  const linkedFats = [...ftIds]
    .map((id) => faturalar.find((f) => f.id === id))
    .filter((ft): ft is Fatura => Boolean(ft));
  const gercekFaturaSayisi = linkedFats.filter((ft) => isGercekFaturaGirisi(ft)).length;
  const taslakSayisi = linkedFats.filter((ft) => isTaslakMaliBagFatura(ft)).length;
  const fatura = linkedFats.length;
  const faturasizSevk = Math.max(0, sevk - faturayaBagliSevk);
  const tamamlandi = Boolean(sa) && sevk > 0 && gercekFaturaSayisi > 0 && faturasizSevk === 0;

  let durumMetni: string;
  if (!sa) {
    durumMetni = sevk
      ? `${sevk} irsaliye · ${
          gercekFaturaSayisi
            ? `${gercekFaturaSayisi} fatura`
            : taslakSayisi
              ? 'taslak bağ var (gerçek fatura yok)'
              : 'fatura bekliyor'
        }`
      : 'Zincir seçimi yok';
  } else if (sevk === 0) {
    durumMetni = 'SA’ya bağlı irsaliye yok — dönüşüm henüz kurulmadı';
  } else if (gercekFaturaSayisi === 0) {
    durumMetni =
      taslakSayisi > 0
        ? `${sevk} sevk irsaliyesi · taslak mali bağ var — gerçek fatura girişi yok`
        : `${sevk} sevk irsaliyesi oluştu — henüz faturaya bağlanmadı`;
  } else if (faturasizSevk > 0) {
    durumMetni = `${faturayaBagliSevk}/${sevk} irsaliye faturaya bağlandı · ${faturasizSevk} bekliyor`;
  } else {
    durumMetni = `${sevk} irsaliye faturaya bağlandı · zincir tamam`;
  }

  return {
    siparis: Boolean(sa),
    sevk,
    fatura,
    faturayaBagliSevk,
    faturasizSevk,
    tamamlandi,
    durumMetni,
  };
}
