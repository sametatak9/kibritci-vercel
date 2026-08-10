/** Kapı evrakı: tek evrak fotoğrafı (+ isteğe bağlı tarama PDF). */

export type GuvenlikFotoMetod = 'EVRAK' | 'KALEM' | 'FIRMA' | 'FATURA';

export type GuvenlikFotoSlot = {
  id: string;
  dataUrl: string;
  fileName: string;
  fileType: string;
  metod: GuvenlikFotoMetod;
};

export type GuvenlikFotoPaket = {
  /** Birincil: tek evrak fotoğrafı */
  evrakFotolar: GuvenlikFotoSlot[];
  /** Geriye uyum: eski 3 yuvadan kalanlar */
  kalemFotolar: GuvenlikFotoSlot[];
  firmaFotolar: GuvenlikFotoSlot[];
  faturaFotolar: GuvenlikFotoSlot[];
  /** Fotoğraftan üretilen taranmış PDF (data URL veya http) */
  scanPdfUrl?: string;
};

export const GUVENLIK_FOTO_METOD_LABEL: Record<GuvenlikFotoMetod, string> = {
  EVRAK: 'Evrak fotoğrafı',
  FIRMA: '1. Firma ismi görünen',
  KALEM: '2. Ürünler görünen',
  FATURA: '3. Tam hali',
};

export const GUVENLIK_FOTO_METOD_HINT: Record<GuvenlikFotoMetod, string> = {
  EVRAK: 'Belgenin net bir fotoğrafı — tarama PDF otomatik oluşturulur',
  FIRMA: 'Evrakta / antette firma unvanı net görünsün',
  KALEM: 'Ürün adları ve kilolar net görünsün',
  FATURA: 'Evrakın tamamı tek karede net görünsün',
};

export function emptyFotoPaket(): GuvenlikFotoPaket {
  return { evrakFotolar: [], kalemFotolar: [], firmaFotolar: [], faturaFotolar: [] };
}

export function flattenGuvenlikFotolar(paket: Partial<GuvenlikFotoPaket> | null | undefined): GuvenlikFotoSlot[] {
  if (!paket) return [];
  return [
    ...(paket.evrakFotolar || []),
    ...(paket.firmaFotolar || []),
    ...(paket.kalemFotolar || []),
    ...(paket.faturaFotolar || []),
  ];
}

export function slotDisplayUrl(slot?: Pick<GuvenlikFotoSlot, 'dataUrl'> | null): string {
  return String(slot?.dataUrl || '').trim();
}

export function isLikelyImageUrl(url: string): boolean {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('data:image/')) return true;
  if (/\.(jpe?g|png|webp|gif|bmp)(\?|#|$)/i.test(u)) return true;
  if (/^https?:\/\//i.test(u) && !/\.pdf(\?|#|$)/i.test(u)) return true;
  return false;
}

/** Geriye uyumlu tek fotoUrl: önce evrak, firma, kalem, tam hali. */
export function pickPrimaryFotoUrl(doc: {
  fotoUrl?: string;
  fotoUrls?: string[];
  scanPdfUrl?: string;
  evrakFotolar?: GuvenlikFotoSlot[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
}): string {
  const fromPaket =
    slotDisplayUrl(doc.evrakFotolar?.[0]) ||
    slotDisplayUrl(doc.firmaFotolar?.[0]) ||
    slotDisplayUrl(doc.kalemFotolar?.[0]) ||
    slotDisplayUrl(doc.faturaFotolar?.[0]) ||
    '';
  if (fromPaket) return fromPaket;
  if (doc.fotoUrl) return doc.fotoUrl;
  if (Array.isArray(doc.fotoUrls) && doc.fotoUrls[0]) return doc.fotoUrls[0];
  return '';
}

/** Tarama PDF veya birincil foto */
export function pickEvrakDisplayUrl(doc: {
  scanPdfUrl?: string;
  fotoUrl?: string;
  evrakFotolar?: GuvenlikFotoSlot[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
}): string {
  if (String(doc.scanPdfUrl || '').trim()) return String(doc.scanPdfUrl);
  return pickPrimaryFotoUrl(doc);
}

export function collectAllFotoUrls(doc: {
  fotoUrl?: string;
  fotoUrls?: string[];
  scanPdfUrl?: string;
  evrakFotolar?: GuvenlikFotoSlot[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
}): string[] {
  const urls = [
    ...(doc.evrakFotolar || []).map((f) => f.dataUrl),
    ...(doc.firmaFotolar || []).map((f) => f.dataUrl),
    ...(doc.kalemFotolar || []).map((f) => f.dataUrl),
    ...(doc.faturaFotolar || []).map((f) => f.dataUrl),
  ].filter(Boolean);
  if (doc.scanPdfUrl) urls.unshift(doc.scanPdfUrl);
  if (urls.length) return Array.from(new Set(urls));
  if (Array.isArray(doc.fotoUrls) && doc.fotoUrls.length) return doc.fotoUrls.filter(Boolean);
  if (doc.fotoUrl) return [doc.fotoUrl];
  return [];
}

export function countPaketFotolar(paket: Partial<GuvenlikFotoPaket> | null | undefined): number {
  return flattenGuvenlikFotolar(paket).length;
}

/** En az bir evrak fotoğrafı (yeni tek foto veya eski 3 yuva) */
export function hasEvrakFotografi(paket: Partial<GuvenlikFotoPaket> | null | undefined): boolean {
  if (!paket) return false;
  if ((paket.evrakFotolar?.length || 0) >= 1) return true;
  return flattenGuvenlikFotolar(paket).length >= 1;
}

/** @deprecated hasEvrakFotografi kullanın */
export function hasAnaFirmaUcFotograf(paket: Partial<GuvenlikFotoPaket> | null | undefined): boolean {
  return hasEvrakFotografi(paket);
}

export type GuvenlikFirmaKaynakTipi = 'ANA_FIRMA' | 'TASERON';

export type GuvenlikUploadKalem = {
  id: string;
  urunAdi: string;
  miktar: string;
  birim: string;
  stokKartId?: string;
};

export type GuvenlikUploadPackage = {
  id: string;
  /** İlk adım: Ana Firma (Kibritçi) mı Taşeron mu? */
  firmaKaynakTipi: GuvenlikFirmaKaynakTipi | '';
  evrakTuru: 'İRSALİYE' | 'FATURA' | 'MAKBUZ' | 'GENEL_EVRAK';
  aciklama: string;
  /** Ana firma: gönderen firma · Taşeron: seçilen taşeron unvanı */
  firma: string;
  cariKartId: string;
  evrakNo: string;
  plaka: string;
  saId: string;
  kalemler: GuvenlikUploadKalem[];
  scanPdfUrl?: string;
} & GuvenlikFotoPaket;

export function createEmptyUploadKalem(): GuvenlikUploadKalem {
  return {
    id: `k_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    urunAdi: '',
    miktar: '',
    birim: 'KG',
    stokKartId: '',
  };
}

export function createEmptyUploadPackage(): GuvenlikUploadPackage {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    firmaKaynakTipi: '',
    evrakTuru: 'İRSALİYE',
    aciklama: '',
    firma: '',
    cariKartId: '',
    evrakNo: '',
    plaka: '',
    saId: '',
    kalemler: [createEmptyUploadKalem()],
    ...emptyFotoPaket(),
  };
}

/** Kapı / güvenlik evrakının sisteme gönderildiği an (kayitZamani öncelikli) */
export function formatEvrakGonderimLabel(e: {
  kayitZamani?: string | null;
  tarih?: string | null;
  saat?: string | null;
  islemTarihi?: string | null;
} | null | undefined): string {
  if (!e) return '—';
  const iso = String(e.kayitZamani || '').trim();
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  const tarih = String(e.tarih || e.islemTarihi || '').trim();
  const saat = String(e.saat || '').trim();
  if (tarih && saat) return `${tarih} · ${saat}`;
  if (tarih) return tarih;
  return '—';
}
