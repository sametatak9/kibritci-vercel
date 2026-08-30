import { PDFDocument } from 'pdf-lib';
import { CariKart, CariKartIslem, StokKart } from '../types/erp';
import { findNearDuplicateCariNames, levenshteinDistance, normalizeStockCompareName } from './duplicateNameUtils';

export const normalizeMatchText = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim();

export async function splitPdfFileToPageBase64(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages: string[] = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const one = await PDFDocument.create();
    const [copied] = await one.copyPages(src, [i]);
    one.addPage(copied);
    const bytes = await one.save();
    const binary = new Uint8Array(bytes);
    let bin = '';
    for (let j = 0; j < binary.length; j++) bin += String.fromCharCode(binary[j]);
    pages.push(btoa(bin));
  }
  return pages;
}

export function findCariMatch(unvan: string, cariler: CariKart[]): CariKart | undefined {
  const norm = normalizeMatchText(unvan);
  if (!norm) return undefined;

  const exact = cariler.find((c) => normalizeMatchText(c.unvan) === norm);
  if (exact) return exact;

  const contains = cariler.find((c) => {
    const cu = normalizeMatchText(c.unvan);
    return cu.includes(norm) || norm.includes(cu);
  });
  if (contains) return contains;

  const near = findNearDuplicateCariNames(cariler, unvan, 3);
  return near[0];
}

export function findStokMatch(urunAdi: string, stoklar: StokKart[]): StokKart | undefined {
  const norm = normalizeStockCompareName(urunAdi);
  if (!norm) return undefined;

  const exact = stoklar.find((s) => normalizeStockCompareName(s.stokAdi) === norm);
  if (exact) return exact;

  const contains = stoklar.find((s) => {
    const sn = normalizeStockCompareName(s.stokAdi);
    if (!sn || sn.length < 4 || norm.length < 4) return false;
    return sn.includes(norm) || norm.includes(sn);
  });
  if (contains) return contains;

  let best: StokKart | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const stok of stoklar) {
    const dist = levenshteinDistance(norm, normalizeStockCompareName(stok.stokAdi));
    if (dist < bestDist) {
      bestDist = dist;
      best = stok;
    }
  }
  return bestDist <= 2 ? best : undefined;
}

export function resolveCariForBatchImport(
  supplierName: string,
  cariler: CariKart[],
  sourceNote: string,
  createDecisions: Map<string, boolean>
): { cariler: CariKart[]; cari: CariKart | null; created: boolean } {
  const name = supplierName.trim();
  if (!name) return { cariler, cari: null, created: false };

  const existing = findCariMatch(name, cariler);
  if (existing) return { cariler, cari: existing, created: false };

  if (!createDecisions.has(name)) {
    const create = window.confirm(
      `"${name}" cari kartlarda bulunamadı.\n\nEvet = yeni tedarikçi cari kartı açılır\nHayır = yeni kart açılmaz; fatura mevcut firma adıyla kaydedilir`
    );
    createDecisions.set(name, create);
  }

  if (!createDecisions.get(name)) {
    return { cariler, cari: null, created: false };
  }

  const ensured = autoEnsureCari(name, cariler, sourceNote);
  return { cariler: ensured.cariler, cari: ensured.cari, created: Boolean(ensured.cari) };
}

export function buildCariFaturaHistory(
  cariKartId: string,
  faturaId: string,
  faturaNo: string,
  firma: string,
  tarih: string,
  sourceTag: string,
  createdCari?: boolean
): CariKartIslem {
  return {
    id: `cari_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    cariKartId,
    islemTipi: 'FATURA',
    islemId: faturaId,
    islemBaslik: 'Toplu PDF Fatura Aktarımı',
    islemDetay: `${faturaNo} · ${firma}${createdCari ? ' · yeni cari kart açıldı' : ' · mevcut cari kart'} ${sourceTag}`,
    tarih,
    belgeNo: faturaNo,
  };
}

export function autoEnsureCari(
  supplierName: string,
  cariler: CariKart[],
  sourceNote: string
): { cariler: CariKart[]; cari: CariKart | null } {
  const name = supplierName.trim();
  if (!name) return { cariler, cari: null };
  const existing = findCariMatch(name, cariler);
  if (existing) return { cariler, cari: existing };
  const cari: CariKart = {
    id: `ck_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kartTipi: 'TEDARIKCI',
    kod: `CAR-${Math.floor(100 + Math.random() * 900)}`,
    unvan: name,
    yetkili: 'Toplu Evrak Aktarım',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'Toplu PDF evrak aktarımından otomatik oluşturuldu.',
    iban: '',
    durum: 'AKTIF',
    notlar: sourceNote,
  };
  return { cariler: [cari, ...cariler], cari };
}

export function autoEnsureStok(
  urunAdi: string,
  birim: string,
  stoklar: StokKart[],
  sourceNote: string
): { stoklar: StokKart[]; stok: StokKart | null } {
  const name = urunAdi.trim();
  if (!name) return { stoklar, stok: null };
  const existing = findStokMatch(name, stoklar);
  if (existing) return { stoklar, stok: existing };
  const stok: StokKart = {
    id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
    stokAdi: name,
    kategori: '157-46 Dograma / İnşaat Malzemesi',
    birim: birim || 'ADET',
    kritikSeviye: 5,
    durum: 'AKTIF',
    aciklama: sourceNote,
  };
  return { stoklar: [stok, ...stoklar], stok };
}

export type BatchImportRow = {
  pageNo: number;
  status: 'pending' | 'parsing' | 'ok' | 'error' | 'skipped';
  detectedType?: string;
  evrakNo?: string;
  firma?: string;
  message?: string;
};
