import type { Dispatch, SetStateAction } from 'react';
import {
  CariKart,
  CariKartIslem,
  FaturaItem,
  IrsaliyeItem,
  SatinAlmaItem,
  StokKart,
  StokKartIslem,
} from '../types/erp';
import { findCariMatch, findStokMatch } from './evrakBatchImportUtils';

export type LineWithStok = {
  urunAdi: string;
  miktar: number;
  birim: string;
  stokKartId?: string;
};

export type ResolveCariResult = {
  cariKartId: string;
  cariUnvan: string;
  matched: boolean;
};

/** Firma adından cari kartı eşle (yeni kart açmaz). */
export function resolveCariKartId(
  firmaAdi: string,
  cariKartlar: CariKart[]
): ResolveCariResult {
  const name = String(firmaAdi || '').trim();
  if (!name) return { cariKartId: '', cariUnvan: '', matched: false };
  const hit = findCariMatch(name, cariKartlar);
  if (hit) return { cariKartId: hit.id, cariUnvan: hit.unvan, matched: true };
  return { cariKartId: '', cariUnvan: name, matched: false };
}

/** Kalemlere stokKartId basar; varsa stok adını karttan normalize eder. */
export function linkKalemlerToStok<T extends LineWithStok>(
  kalemler: T[],
  stokKartlar: StokKart[]
): T[] {
  return kalemler.map((k) => {
    const hit = findStokMatch(k.urunAdi, stokKartlar);
    if (!hit) return { ...k, stokKartId: k.stokKartId || undefined };
    return {
      ...k,
      urunAdi: hit.stokAdi,
      birim: k.birim || hit.birim || 'ADET',
      stokKartId: hit.id,
    };
  });
}

export function countLinkedStok(kalemler: { stokKartId?: string }[]): {
  linked: number;
  total: number;
} {
  const total = kalemler.length;
  const linked = kalemler.filter((k) => Boolean(k.stokKartId)).length;
  return { linked, total };
}

export function buildCariEvrakHistory(opts: {
  cariKartId: string;
  islemTipi: CariKartIslem['islemTipi'];
  islemId: string;
  islemBaslik: string;
  islemDetay: string;
  tarih: string;
  belgeNo?: string;
  tutar?: number;
}): CariKartIslem {
  return {
    id: `cari_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    cariKartId: opts.cariKartId,
    islemTipi: opts.islemTipi,
    islemId: opts.islemId,
    islemBaslik: opts.islemBaslik,
    islemDetay: opts.islemDetay,
    tarih: opts.tarih,
    belgeNo: opts.belgeNo,
    tutar: opts.tutar,
  };
}

/**
 * Stok kartlarına giriş uygular: işlem geçmişi + (opsiyonel) miktar artışı.
 * Aynı stokKartId|belgeNo|islemTipi tekrar yazılmaz.
 */
export function applyStokGirisFromKalemler(opts: {
  kalemler: LineWithStok[];
  belgeNo: string;
  tarih: string;
  supplier: string;
  islemBaslik: string;
  islemDetayPrefix: string;
  bumpMiktar: boolean;
  stokKartlar: StokKart[];
  setStokKartlar?: Dispatch<SetStateAction<StokKart[]>>;
  setStokIslemGecmisi?: Dispatch<SetStateAction<StokKartIslem[]>>;
  aciklamaTag?: string;
}): { stokIslemleri: StokKartIslem[]; bumped: number } {
  const {
    kalemler,
    belgeNo,
    tarih,
    supplier,
    islemBaslik,
    islemDetayPrefix,
    bumpMiktar,
    setStokKartlar,
    setStokIslemGecmisi,
    aciklamaTag = 'Evrak',
  } = opts;

  if (!setStokKartlar) return { stokIslemleri: [], bumped: 0 };

  const islemSatirlari: StokKartIslem[] = [];
  let bumped = 0;
  const bumpIds = new Set<string>();

  setStokKartlar((prev) => {
    let next = [...prev];
    for (const kalem of kalemler) {
      const rawName = String(kalem.urunAdi || '').trim();
      if (!rawName) continue;

      let stok =
        (kalem.stokKartId && next.find((s) => s.id === kalem.stokKartId)) ||
        findStokMatch(rawName, next);

      if (!stok) {
        stok = {
          id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
          stokAdi: rawName,
          kategori: 'Kaba İnşaat İmalatı',
          birim: kalem.birim || 'ADET',
          kritikSeviye: 5,
          durum: 'AKTIF',
          miktar: 0,
          aciklama: `${aciklamaTag} entegrasyonuyla otomatik oluşturuldu.`,
        };
        next = [stok, ...next];
      }

      const qty = Number(kalem.miktar || 0);
      const historyLine = `${tarih} ${belgeNo} · ${supplier} · ${qty} ${kalem.birim || stok.birim}`;

      next = next.map((s) => {
        if (s.id !== stok!.id) return s;
        const oldDesc = String(s.aciklama || '');
        const alreadyLogged = oldDesc.includes(belgeNo);
        const mergedDesc = alreadyLogged
          ? oldDesc
          : `${oldDesc}\n[${aciklamaTag}] ${historyLine}`.trim();
        const shouldBump = bumpMiktar && !alreadyLogged && qty > 0;
        if (shouldBump) bumpIds.add(s.id);
        return {
          ...s,
          stokAdi: stok!.stokAdi,
          birim: s.birim || kalem.birim || 'ADET',
          aciklama: mergedDesc,
          miktar: shouldBump ? Number(s.miktar || 0) + qty : Number(s.miktar || 0),
        };
      });

      islemSatirlari.push({
        id: `stk_islem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        stokKartId: stok.id,
        islemTipi: 'GIRIS',
        islemId: belgeNo,
        islemBaslik,
        islemDetay: `${islemDetayPrefix} ${supplier}`.trim(),
        miktarDegisimi: qty,
        tarih,
        belgeNo,
      });
    }
    bumped = bumpIds.size;
    return next;
  });

  if (setStokIslemGecmisi && islemSatirlari.length > 0) {
    setStokIslemGecmisi((prev) => {
      const existingKeys = new Set(
        prev.map((row) => `${row.stokKartId}|${row.belgeNo}|${row.islemTipi}`)
      );
      const uniqueIncoming = islemSatirlari.filter((row) => {
        const key = `${row.stokKartId}|${row.belgeNo}|${row.islemTipi}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      return [...uniqueIncoming, ...prev];
    });
  }

  return { stokIslemleri: islemSatirlari, bumped };
}

export function appendCariIslemOnce(
  setCariIslemGecmisi: Dispatch<SetStateAction<CariKartIslem[]>> | undefined,
  row: CariKartIslem | null
) {
  if (!setCariIslemGecmisi || !row?.cariKartId) return;
  setCariIslemGecmisi((prev) => {
    const key = `${row.cariKartId}|${row.islemTipi}|${row.belgeNo || row.islemId}`;
    const exists = prev.some(
      (p) => `${p.cariKartId}|${p.islemTipi}|${p.belgeNo || p.islemId}` === key
    );
    if (exists) return prev;
    return [row, ...prev];
  });
}

export function linkSatinAlmaKalemler(
  kalemler: SatinAlmaItem[],
  stokKartlar: StokKart[]
): SatinAlmaItem[] {
  return linkKalemlerToStok(kalemler, stokKartlar);
}

export function linkIrsaliyeKalemler(
  kalemler: IrsaliyeItem[],
  stokKartlar: StokKart[]
): IrsaliyeItem[] {
  return linkKalemlerToStok(kalemler, stokKartlar);
}

export function linkFaturaKalemler(
  kalemler: FaturaItem[],
  stokKartlar: StokKart[]
): FaturaItem[] {
  return linkKalemlerToStok(kalemler, stokKartlar);
}
