import type { Dispatch, SetStateAction } from 'react';
import {
  CariKart,
  CariKartIslem,
  Fatura,
  FaturaItem,
  Irsaliye,
  IrsaliyeItem,
  SatinAlmaTalebi,
  StokKart,
  StokKartIslem,
} from '../types/erp';
import { saveDocument } from './firebase';
import {
  appendCariIslemOnce,
  applyStokGirisFromKalemler,
  buildCariEvrakHistory,
  countLinkedStok,
  linkIrsaliyeKalemler,
  resolveCariKartId,
} from './evrakCariStokSync';
import { autoEnsureCari, autoEnsureStok } from './evrakBatchImportUtils';
import { ensureKapiIrsaliyeFotoPersisted } from './sahaFaaliyetFotoStorage';
import { kalanMiktarForSaKalem } from './satinAlmaIrsaliyeUtils';

export const KAPI_EVRAK_KAYNAK = 'KAPI_EVRAK';

export type KapiKalemInput = {
  urunAdi?: string;
  miktar?: number | string;
  birim?: string;
  stokKartId?: string;
  saKalemId?: string;
  id?: string;
};

export type KapiMatchSummary = {
  cariMatched: boolean;
  cariKartId: string;
  cariUnvan: string;
  /** Onayda yeni cari kart açıldıysa true */
  cariCreated?: boolean;
  stokLinked: number;
  stokTotal: number;
  /** Onayda otomatik oluşturulan stok kartı sayısı */
  stokCreated?: number;
  unmatchedKalemler: string[];
  /** Kapı ↔ SA eşleşmesi (opsiyonel) */
  saId?: string;
  saMatched?: boolean;
};

function withSaMatchSummary(summary: KapiMatchSummary, saId: string): KapiMatchSummary {
  return {
    ...summary,
    saId: saId || '',
    saMatched: Boolean(saId),
  };
}

function normTr(s: string): string {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o');
}

function isOpenSatinAlmaForKapi(sa: SatinAlmaTalebi): boolean {
  if (sa.arsivde) return false;
  const d = String(sa.onayDurumu || '');
  if (d === 'REDDEDİLDİ' || d === 'KAPATILDI') return false;
  return true;
}

export type KapiSaKalemEslesme = {
  kapiUrunAdi: string;
  saKalemId: string;
  saUrunAdi: string;
  kalan: number;
};

export type KapiSaOneri = {
  saId: string;
  saDocId: string;
  cariFirma: string;
  tarih: string;
  score: number;
  reason: string;
  matchedKalemler: KapiSaKalemEslesme[];
};

/**
 * Kapı irsaliyesi için açık satın alma önerileri (otomatik bağlama yok).
 * Cari + ürün/stok örtüşmesi + kalan miktar skorlanır.
 */
export function suggestSatinAlmaForKapiEvrak(opts: {
  firma?: string;
  cariKartId?: string;
  kalemler?: KapiKalemInput[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  limit?: number;
}): KapiSaOneri[] {
  const firma = String(opts.firma || '').trim();
  const cariId = String(opts.cariKartId || '').trim();
  const kalemler = (opts.kalemler || []).filter((k) => String(k.urunAdi || '').trim());
  if (!firma && !cariId && kalemler.length === 0) return [];

  const irs = opts.irsaliyeler || [];
  const firmaN = normTr(firma);
  const scored: KapiSaOneri[] = [];

  for (const sa of opts.satinAlmaTalepleri || []) {
    if (!isOpenSatinAlmaForKapi(sa)) continue;
    const saId = String(sa.saId || '').trim();
    if (!saId) continue;

    let score = 0;
    const reasons: string[] = [];

    if (cariId && sa.cariKartId && cariId === sa.cariKartId) {
      score += 50;
      reasons.push('cari');
    } else {
      const saFirma = normTr(sa.cariFirma || '');
      if (firmaN && saFirma) {
        if (firmaN === saFirma) {
          score += 40;
          reasons.push('firma tam');
        } else if (firmaN.includes(saFirma) || saFirma.includes(firmaN)) {
          score += 25;
          reasons.push('firma benzer');
        }
      }
    }

    const matchedKalemler: KapiSaKalemEslesme[] = [];
    for (const kk of kalemler) {
      const ku = normTr(String(kk.urunAdi || ''));
      const kStok = String(kk.stokKartId || '').trim();
      for (const sk of sa.kalemler || []) {
        const su = normTr(sk.urunAdi || '');
        const sStok = String(sk.stokKartId || '').trim();
        let hit = false;
        if (kStok && sStok && kStok === sStok) hit = true;
        else if (ku && su && (ku === su || ku.includes(su) || su.includes(ku))) hit = true;
        if (!hit) continue;
        const kalan = kalanMiktarForSaKalem(sa, sk, irs);
        matchedKalemler.push({
          kapiUrunAdi: String(kk.urunAdi || '').trim(),
          saKalemId: sk.id,
          saUrunAdi: sk.urunAdi,
          kalan,
        });
        score += 22;
        if (kalan > 0) score += 8;
      }
    }
    if (matchedKalemler.length) reasons.push(`${matchedKalemler.length} kalem`);

    // Eşik: en az cari/firma veya kalem örtüşmesi
    if (score < 25) continue;

    scored.push({
      saId,
      saDocId: sa.id,
      cariFirma: sa.cariFirma,
      tarih: sa.tarih,
      score,
      reason: reasons.join(' · ') || 'yakın',
      matchedKalemler,
    });
  }

  scored.sort((a, b) => b.score - a.score || String(b.tarih).localeCompare(String(a.tarih)));
  return scored.slice(0, opts.limit ?? 5);
}

/** Kapı kalemlerine SA kalem id yazar (isim/stok örtüşmesi). */
export function linkKapiKalemlerToSa(
  kalemler: IrsaliyeItem[],
  sa: SatinAlmaTalebi | null | undefined,
  irsaliyeler: Irsaliye[] = []
): IrsaliyeItem[] {
  if (!sa) return kalemler;
  return kalemler.map((k) => {
    if (k.saKalemId) return k;
    const ku = normTr(k.urunAdi || '');
    const kStok = String(k.stokKartId || '').trim();
    let best: { id: string; kalan: number } | null = null;
    for (const sk of sa.kalemler || []) {
      const su = normTr(sk.urunAdi || '');
      const sStok = String(sk.stokKartId || '').trim();
      const hit =
        (kStok && sStok && kStok === sStok) ||
        (ku && su && (ku === su || ku.includes(su) || su.includes(ku)));
      if (!hit) continue;
      const kalan = kalanMiktarForSaKalem(sa, sk, irsaliyeler);
      if (!best || kalan > best.kalan) best = { id: sk.id, kalan };
    }
    return best ? { ...k, saKalemId: best.id } : k;
  });
}

export function normalizeKapiKalemler(raw: KapiKalemInput[], prefix = 'kapi'): IrsaliyeItem[] {
  return (raw || [])
    .map((k, idx) => {
      const urunAdi = String(k.urunAdi || '').trim();
      if (!urunAdi) return null;
      const miktar = Number(k.miktar);
      return {
        id: k.id || `${prefix}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        urunAdi,
        miktar: Number.isFinite(miktar) ? miktar : 0,
        birim: String(k.birim || 'Adet').trim() || 'Adet',
        stokKartId: k.stokKartId || undefined,
        saKalemId: k.saKalemId || undefined,
      } as IrsaliyeItem;
    })
    .filter(Boolean) as IrsaliyeItem[];
}

/** Firma + kalem adlarını cari/stok kartlarıyla eşleştirir (yeni kart açmaz). */
export function matchKapiEvrakToDb(
  firma: string,
  kalemler: KapiKalemInput[],
  cariKartlar: CariKart[],
  stokKartlar: StokKart[]
): { summary: KapiMatchSummary; kalemler: IrsaliyeItem[] } {
  const cari = resolveCariKartId(firma, cariKartlar);
  const linked = linkIrsaliyeKalemler(normalizeKapiKalemler(kalemler), stokKartlar);
  const counts = countLinkedStok(linked);
  const unmatchedKalemler = linked
    .filter((k) => !k.stokKartId)
    .map((k) => k.urunAdi)
    .slice(0, 8);

  return {
    summary: {
      cariMatched: cari.matched,
      cariKartId: cari.cariKartId,
      cariUnvan: cari.cariUnvan || String(firma || '').trim(),
      stokLinked: counts.linked,
      stokTotal: counts.total,
      unmatchedKalemler,
    },
    kalemler: linked,
  };
}

/**
 * İki geçişli kontrol: 1) ham firma/kalem 2) eşleşen cari unvanı + normalize stok adlarıyla tekrar.
 * Yeni kart açmaz; mevcut cari/stoka bağlar.
 */
export function doubleCheckKapiMatch(
  firma: string,
  kalemler: KapiKalemInput[],
  cariKartlar: CariKart[],
  stokKartlar: StokKart[]
): { summary: KapiMatchSummary; kalemler: IrsaliyeItem[]; pass1: KapiMatchSummary; pass2: KapiMatchSummary } {
  const pass1 = matchKapiEvrakToDb(firma, kalemler, cariKartlar, stokKartlar);
  const pass2 = matchKapiEvrakToDb(
    pass1.summary.cariUnvan || firma,
    pass1.kalemler,
    cariKartlar,
    stokKartlar
  );
  return {
    summary: pass2.summary,
    kalemler: pass2.kalemler,
    pass1: pass1.summary,
    pass2: pass2.summary,
  };
}

export function buildKapiDraftIrsaliye(opts: {
  guvenlikEvrakId: string;
  irsaliyeNo: string;
  firma: string;
  tarih: string;
  fotoUrl?: string;
  kalemler: IrsaliyeItem[];
  cariKartId?: string;
  kaydeden?: string;
  saId?: string;
}): Irsaliye {
  const id = opts.guvenlikEvrakId;
  const saId = String(opts.saId || '').trim();
  return {
    id,
    irsaliyeId: id,
    irsaliyeNo: String(opts.irsaliyeNo || id).trim() || id,
    firma: String(opts.firma || '').trim() || 'Bilinmeyen Firma',
    cariKartId: opts.cariKartId || undefined,
    saId: saId || '',
    tarih: opts.tarih || new Date().toISOString().split('T')[0],
    onayDurumu: 'ONAY BEKLİYOR',
    fisEvrakUrl: opts.fotoUrl || '',
    kaynak: KAPI_EVRAK_KAYNAK,
    guvenlikEvrakId: opts.guvenlikEvrakId,
    kalemler: opts.kalemler,
    kaydeden: opts.kaydeden,
    donusumKaynagi: saId ? 'KAPI_SA_ESLESME' : 'KAPI_EVRAK',
  } as Irsaliye & { kaydeden?: string };
}

/**
 * Kapı AI parse sonrası: eşleştirilmiş taslak irsaliye yazar.
 * Son onay yöneticide kalır (ONAY BEKLİYOR).
 */
export async function upsertKapiDraftIrsaliye(opts: {
  guvenlikEvrakId: string;
  firma: string;
  irsaliyeNo: string;
  tarih: string;
  fotoUrl?: string;
  kalemler: KapiKalemInput[];
  cariKartlar: CariKart[];
  stokKartlar: StokKart[];
  kaydeden?: string;
  /** Kullanıcı onaylı SA bağı (otomatik yazılmaz) */
  saId?: string;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
}): Promise<{ irsaliye: Irsaliye; summary: KapiMatchSummary }> {
  const { summary, kalemler } = doubleCheckKapiMatch(
    opts.firma,
    opts.kalemler,
    opts.cariKartlar,
    opts.stokKartlar
  );

  const saId = String(opts.saId || '').trim();
  const sa = saId
    ? (opts.satinAlmaTalepleri || []).find((s) => s.saId === saId || s.id === saId)
    : undefined;
  const linkedKalemler = linkKapiKalemlerToSa(kalemler, sa, opts.irsaliyeler || []);

  const irsaliye = buildKapiDraftIrsaliye({
    guvenlikEvrakId: opts.guvenlikEvrakId,
    irsaliyeNo: opts.irsaliyeNo || opts.guvenlikEvrakId,
    firma: summary.cariUnvan || opts.firma,
    tarih: opts.tarih,
    fotoUrl: opts.fotoUrl,
    kalemler: linkedKalemler,
    cariKartId: summary.cariKartId || undefined,
    kaydeden: opts.kaydeden,
    saId,
  });

  await saveDocument('irsaliyeler', irsaliye);
  return {
    irsaliye,
    summary: withSaMatchSummary(summary, saId),
  };
}

type KapiFaturaKalemInput = {
  id?: string;
  urunAdi?: string;
  miktar?: number | string;
  birim?: string;
  birimFiyat?: number | string;
  kdvOran?: number | string;
  toplam?: number | string;
  stokKartId?: string;
};

/**
 * Ana Firma kapı faturası — yönetici onayı öncesi taslak (stok / cari işlem yazılmaz).
 * Taranmış PDF `evrakUrl` olarak fatura arşivinde görünür.
 */
export async function upsertKapiDraftFatura(opts: {
  guvenlikEvrakId: string;
  firma: string;
  faturaNo: string;
  tarih: string;
  evrakUrl?: string;
  kalemler?: KapiFaturaKalemInput[];
  toplamTutar?: number;
  kdvTutar?: number;
  genelToplam?: number;
  cariKartlar: CariKart[];
  kaydeden?: string;
}): Promise<{
  fatura: Fatura;
  summary: Pick<KapiMatchSummary, 'cariMatched' | 'cariKartId' | 'cariUnvan'>;
}> {
  const cariHit = resolveCariKartId(opts.firma, opts.cariKartlar);
  const kalemler: FaturaItem[] = (opts.kalemler || [])
    .map((k, i) => {
      const miktar = Number(String(k.miktar ?? '').replace(',', '.')) || 0;
      const birimFiyat = Number(k.birimFiyat) || 0;
      return {
        id: k.id || `fk_${i}`,
        urunAdi: String(k.urunAdi || '').trim(),
        miktar,
        birim: String(k.birim || 'Adet').trim() || 'Adet',
        birimFiyat,
        kdvOran: Number(k.kdvOran) || 20,
        toplam: Number(k.toplam) || miktar * birimFiyat,
        stokKartId: k.stokKartId || undefined,
      };
    })
    .filter((k) => k.urunAdi);

  const fatura: Fatura = {
    id: opts.guvenlikEvrakId,
    faturaNo: String(opts.faturaNo || opts.guvenlikEvrakId).trim() || opts.guvenlikEvrakId,
    tarih: opts.tarih || new Date().toISOString().split('T')[0],
    cariKartId: cariHit.cariKartId || '',
    cariUnvan: cariHit.cariUnvan || String(opts.firma || '').trim() || 'Bilinmeyen Firma',
    toplamTutar: Number(opts.toplamTutar) || 0,
    kdvTutar: Number(opts.kdvTutar) || 0,
    genelToplam: Number(opts.genelToplam) || 0,
    durum: 'KONTROL BEKLEYOR',
    evrakUrl: opts.evrakUrl || '',
    kalemler,
    bagliIrsaliyeler: [],
    donusumKaynagi: 'KAPI_EVRAK',
    kaynak: KAPI_EVRAK_KAYNAK,
    guvenlikEvrakId: opts.guvenlikEvrakId,
  };

  await saveDocument('faturalar', fatura);
  return {
    fatura,
    summary: {
      cariMatched: cariHit.matched,
      cariKartId: cariHit.cariKartId,
      cariUnvan: cariHit.cariUnvan || fatura.cariUnvan,
    },
  };
}

/**
 * Yönetici kapı evrak onayında irsaliyeyi finalize eder + cari/stok bağlar.
 * Eşleşmeyen cari/stok için kart oluşturur. Stok miktarı yalnızca onayda artar.
 * Evrak görseli Storage'a alınır (büyük data URL Firestore yazımını düşürmesin).
 */
export async function finalizeKapiIrsaliyeApproval(opts: {
  guvenlikEvrakId: string;
  irsaliyeNo: string;
  firma: string;
  tarih: string;
  fotoUrl?: string;
  kalemler: KapiKalemInput[];
  onaylayan: string;
  cariKartlar: CariKart[];
  stokKartlar: StokKart[];
  setIrsaliyeler?: Dispatch<SetStateAction<Irsaliye[]>>;
  setCariKartlar?: Dispatch<SetStateAction<CariKart[]>>;
  setCariIslemGecmisi?: Dispatch<SetStateAction<CariKartIslem[]>>;
  setStokKartlar?: Dispatch<SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: Dispatch<SetStateAction<StokKartIslem[]>>;
  saId?: string;
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
}): Promise<{ irsaliye: Irsaliye; summary: KapiMatchSummary; kalemler: IrsaliyeItem[] }> {
  const now = new Date().toISOString();
  const { summary: matchedSummary, kalemler } = doubleCheckKapiMatch(
    opts.firma,
    opts.kalemler,
    opts.cariKartlar,
    opts.stokKartlar
  );

  let workingCari = [...opts.cariKartlar];
  let workingStok = [...opts.stokKartlar];
  let cariCreated = false;
  let stokCreated = 0;

  let summary: KapiMatchSummary = { ...matchedSummary };

  // Eşleşmeyen gönderen firma → tedarikçi cari kartı oluştur
  if (!summary.cariKartId && String(opts.firma || '').trim()) {
    const ensured = autoEnsureCari(
      String(opts.firma).trim(),
      workingCari,
      'Kapı irsaliye onayından otomatik oluşturuldu.'
    );
    if (ensured.cari) {
      workingCari = ensured.cariler;
      cariCreated = true;
      summary = {
        ...summary,
        cariMatched: true,
        cariKartId: ensured.cari.id,
        cariUnvan: ensured.cari.unvan,
        cariCreated: true,
      };
      await saveDocument('cariKartlar', ensured.cari);
      opts.setCariKartlar?.((prev) => [ensured.cari!, ...prev.filter((c) => c.id !== ensured.cari!.id)]);
    }
  }

  const saId = String(opts.saId || '').trim();
  const sa = saId
    ? (opts.satinAlmaTalepleri || []).find((s) => s.saId === saId || s.id === saId)
    : undefined;
  let linkedKalemler = linkKapiKalemlerToSa(kalemler, sa, opts.irsaliyeler || []);

  // Eşleşmeyen kalemler → stok kartı oluştur (irsaliye satırına id yazılsın)
  linkedKalemler = linkedKalemler.map((k) => {
    if (k.stokKartId) return k;
    const beforeIds = new Set(workingStok.map((s) => s.id));
    const ensured = autoEnsureStok(
      k.urunAdi,
      k.birim || 'Adet',
      workingStok,
      'Kapı irsaliye onayından otomatik oluşturuldu.'
    );
    if (!ensured.stok) return k;
    workingStok = ensured.stoklar;
    if (!beforeIds.has(ensured.stok.id)) stokCreated += 1;
    return {
      ...k,
      urunAdi: ensured.stok.stokAdi,
      birim: k.birim || ensured.stok.birim || 'Adet',
      stokKartId: ensured.stok.id,
    };
  });

  const newlyCreatedStok = workingStok.filter(
    (s) => !opts.stokKartlar.some((o) => o.id === s.id)
  );
  for (const stok of newlyCreatedStok) {
    await saveDocument('stokKartlar', stok);
  }
  if (newlyCreatedStok.length > 0) {
    opts.setStokKartlar?.((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      const add = newlyCreatedStok.filter((s) => !ids.has(s.id));
      return add.length ? [...add, ...prev] : prev;
    });
  }

  const stokCounts = countLinkedStok(linkedKalemler);
  summary = {
    ...summary,
    stokLinked: stokCounts.linked,
    stokTotal: stokCounts.total,
    stokCreated,
    unmatchedKalemler: [],
    cariCreated,
  };

  const firmaUnvan = summary.cariUnvan || String(opts.firma || '').trim();
  const fisEvrakUrl = await ensureKapiIrsaliyeFotoPersisted(
    opts.guvenlikEvrakId,
    opts.fotoUrl
  );

  const irsaliye: Irsaliye = {
    id: opts.guvenlikEvrakId,
    irsaliyeId: opts.guvenlikEvrakId,
    irsaliyeNo: String(opts.irsaliyeNo || opts.guvenlikEvrakId).trim(),
    firma: firmaUnvan,
    cariKartId: summary.cariKartId || undefined,
    saId: saId || '',
    tarih: opts.tarih,
    onayDurumu: 'ONAYLANDI',
    fisEvrakUrl,
    kaynak: KAPI_EVRAK_KAYNAK,
    guvenlikEvrakId: opts.guvenlikEvrakId,
    kalemler: linkedKalemler,
    onaylayanYonetici: opts.onaylayan,
    onayTarihi: now,
    donusumKaynagi: saId ? 'KAPI_SA_ESLESME' : 'KAPI_EVRAK',
  };

  await saveDocument('irsaliyeler', irsaliye);

  opts.setIrsaliyeler?.((prev) => {
    const without = prev.filter(
      (x) => x.id !== irsaliye.id && x.irsaliyeId !== irsaliye.irsaliyeId
    );
    return [irsaliye, ...without];
  });

  if (summary.cariKartId) {
    const cariRow = buildCariEvrakHistory({
      cariKartId: summary.cariKartId,
      islemTipi: 'IRSALIYE',
      islemId: irsaliye.id,
      islemBaslik: `Kapı İrsaliyesi · ${firmaUnvan}`,
      islemDetay: `${irsaliye.irsaliyeNo} · ${linkedKalemler.length} kalem · güvenlik kapısı${
        saId ? ` · SA ${saId}` : ''
      }${cariCreated ? ' · yeni cari kart açıldı' : ''}`,
      tarih: opts.tarih,
      belgeNo: irsaliye.irsaliyeNo,
    });
    await saveDocument('cariIslemGecmisi', cariRow);
    appendCariIslemOnce(opts.setCariIslemGecmisi, cariRow);
  }

  const stokBagliKalemler = linkedKalemler.filter((k) => Boolean(k.stokKartId));
  applyStokGirisFromKalemler({
    kalemler: stokBagliKalemler,
    belgeNo: irsaliye.irsaliyeNo,
    tarih: opts.tarih,
    supplier: firmaUnvan,
    islemBaslik: 'Kapı İrsaliye Girişi',
    islemDetayPrefix: 'Güvenlik kapısı onaylı sevk ·',
    bumpMiktar: true,
    stokKartlar: workingStok,
    setStokKartlar: opts.setStokKartlar,
    setStokIslemGecmisi: opts.setStokIslemGecmisi,
    aciklamaTag: 'Kapı İrsaliye',
  });

  return {
    irsaliye,
    kalemler: linkedKalemler,
    summary: withSaMatchSummary(summary, saId),
  };
}

export function formatKapiMatchLabel(summary?: Partial<KapiMatchSummary> | null): string {
  if (!summary) return '';
  const cari = summary.cariMatched
    ? summary.cariCreated
      ? 'Cari oluşturuldu'
      : 'Cari eşleşti'
    : 'Cari bulunamadı';
  const stok =
    typeof summary.stokTotal === 'number' && summary.stokTotal > 0
      ? `Stok ${summary.stokLinked || 0}/${summary.stokTotal}`
      : 'Kalem yok';
  const created =
    summary.stokCreated && summary.stokCreated > 0
      ? ` · ${summary.stokCreated} stok kartı açıldı`
      : '';
  const sa = summary.saMatched && summary.saId ? ` · SA ${summary.saId}` : '';
  return `${cari} · ${stok}${created}${sa}`;
}

export type CariOneri = {
  id: string;
  unvan: string;
  reason: 'TAM' | 'ICERIR' | 'YAKIN';
};

export type StokOneri = {
  id: string;
  stokAdi: string;
  birim?: string;
  reason: 'TAM' | 'ICERIR' | 'YAKIN';
};

/** Kapı evrak girişinde firma yazılırken DB’deki cari kart önerileri (yeni kart açmaz). */
export function suggestCariFromDb(
  query: string,
  cariler: CariKart[],
  limit = 6
): CariOneri[] {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const seen = new Set<string>();
  const out: CariOneri[] = [];

  const push = (c: CariKart | undefined, reason: CariOneri['reason']) => {
    if (!c?.id || seen.has(c.id)) return;
    seen.add(c.id);
    out.push({ id: c.id, unvan: c.unvan, reason });
  };

  const exact = resolveCariKartId(q, cariler);
  if (exact.matched) {
    const hit = cariler.find((c) => c.id === exact.cariKartId);
    push(hit, 'TAM');
  }

  const qNorm = q
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o');

  for (const c of cariler) {
    if (out.length >= limit) break;
    const cu = String(c.unvan || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[ıİ]/g, 'i')
      .replace(/[şŞ]/g, 's')
      .replace(/[çÇ]/g, 'c')
      .replace(/[ğĞ]/g, 'g')
      .replace(/[üÜ]/g, 'u')
      .replace(/[öÖ]/g, 'o');
    if (!cu) continue;
    if (cu.includes(qNorm) || qNorm.includes(cu)) push(c, 'ICERIR');
  }

  // Yakın unvanlar (yazım farkı)
  const scored = cariler
    .map((c) => {
      const cu = String(c.unvan || '').trim();
      if (!cu) return null;
      const a = qNorm;
      const b = cu
        .toLocaleLowerCase('tr-TR')
        .replace(/[ıİ]/g, 'i')
        .replace(/[şŞ]/g, 's')
        .replace(/[çÇ]/g, 'c')
        .replace(/[ğĞ]/g, 'g')
        .replace(/[üÜ]/g, 'u')
        .replace(/[öÖ]/g, 'o');
      let dist = 0;
      const max = Math.max(a.length, b.length);
      if (!max) return null;
      // basit fark oranı — çok uzun metinde erken kes
      if (Math.abs(a.length - b.length) > 4) return null;
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) dist++;
      dist += Math.abs(a.length - b.length);
      return dist <= 3 ? { c, dist } : null;
    })
    .filter(Boolean) as Array<{ c: CariKart; dist: number }>;

  scored
    .sort((x, y) => x.dist - y.dist)
    .forEach((row) => {
      if (out.length < limit) push(row.c, 'YAKIN');
    });

  return out.slice(0, limit);
}

/** Kalem adı için stok kartı önerileri (yeni kart açmaz). */
export function suggestStokFromDb(
  urunAdi: string,
  stoklar: StokKart[],
  limit = 5
): StokOneri[] {
  const linked = linkIrsaliyeKalemler(
    [{ id: 'tmp', urunAdi: String(urunAdi || '').trim(), miktar: 0, birim: 'Adet' }],
    stoklar
  );
  const hitId = linked[0]?.stokKartId;
  if (hitId) {
    const s = stoklar.find((x) => x.id === hitId);
    if (s) return [{ id: s.id, stokAdi: s.stokAdi, birim: s.birim, reason: 'TAM' }];
  }

  const q = String(urunAdi || '').trim().toLocaleLowerCase('tr-TR');
  if (q.length < 2) return [];
  const out: StokOneri[] = [];
  for (const s of stoklar) {
    if (out.length >= limit) break;
    const sn = String(s.stokAdi || '').toLocaleLowerCase('tr-TR');
    if (sn.includes(q) || q.includes(sn)) {
      out.push({ id: s.id, stokAdi: s.stokAdi, birim: s.birim, reason: 'ICERIR' });
    }
  }
  return out;
}

export function cariOneriReasonLabel(reason: CariOneri['reason']): string {
  if (reason === 'TAM') return 'Tam eşleşme';
  if (reason === 'ICERIR') return 'İsim benzeri';
  return 'Yakın unvan';
}

