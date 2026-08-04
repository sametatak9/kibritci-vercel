/** Kapı evrakı: 3 yöntemli fotoğraf (görünmeme sorununu çözmek için). */

export type GuvenlikFotoMetod = 'KALEM' | 'FIRMA' | 'FATURA';

export type GuvenlikFotoSlot = {
  id: string;
  dataUrl: string;
  fileName: string;
  fileType: string;
  metod: GuvenlikFotoMetod;
};

export type GuvenlikFotoPaket = {
  kalemFotolar: GuvenlikFotoSlot[];
  firmaFotolar: GuvenlikFotoSlot[];
  faturaFotolar: GuvenlikFotoSlot[];
};

export const GUVENLIK_FOTO_METOD_LABEL: Record<GuvenlikFotoMetod, string> = {
  FIRMA: '1. Firma ismi görünen',
  KALEM: '2. Ürünler görünen',
  FATURA: '3. Tam hali',
};

export const GUVENLIK_FOTO_METOD_HINT: Record<GuvenlikFotoMetod, string> = {
  FIRMA: 'Evrakta / antette firma unvanı net görünsün',
  KALEM: 'Ürün adları ve kilolar net görünsün',
  FATURA: 'Evrakın tamamı tek karede net görünsün',
};

export function emptyFotoPaket(): GuvenlikFotoPaket {
  return { kalemFotolar: [], firmaFotolar: [], faturaFotolar: [] };
}

export function flattenGuvenlikFotolar(paket: Partial<GuvenlikFotoPaket> | null | undefined): GuvenlikFotoSlot[] {
  if (!paket) return [];
  return [
    ...(paket.kalemFotolar || []),
    ...(paket.firmaFotolar || []),
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

/** Geriye uyumlu tek fotoUrl: önce firma, kalem, tam hali. */
export function pickPrimaryFotoUrl(doc: {
  fotoUrl?: string;
  fotoUrls?: string[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
}): string {
  const fromPaket =
    slotDisplayUrl(doc.firmaFotolar?.[0]) ||
    slotDisplayUrl(doc.kalemFotolar?.[0]) ||
    slotDisplayUrl(doc.faturaFotolar?.[0]) ||
    '';
  if (fromPaket) return fromPaket;
  if (doc.fotoUrl) return doc.fotoUrl;
  if (Array.isArray(doc.fotoUrls) && doc.fotoUrls[0]) return doc.fotoUrls[0];
  return '';
}

export function collectAllFotoUrls(doc: {
  fotoUrl?: string;
  fotoUrls?: string[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
}): string[] {
  const urls = [
    ...(doc.firmaFotolar || []).map((f) => f.dataUrl),
    ...(doc.kalemFotolar || []).map((f) => f.dataUrl),
    ...(doc.faturaFotolar || []).map((f) => f.dataUrl),
  ].filter(Boolean);
  if (urls.length) return Array.from(new Set(urls));
  if (Array.isArray(doc.fotoUrls) && doc.fotoUrls.length) return doc.fotoUrls.filter(Boolean);
  if (doc.fotoUrl) return [doc.fotoUrl];
  return [];
}

export function countPaketFotolar(paket: GuvenlikFotoPaket): number {
  return flattenGuvenlikFotolar(paket).length;
}

/** Ana firma evrakı: 3 yuvanın her birinde en az 1 foto zorunlu */
export function hasAnaFirmaUcFotograf(paket: Partial<GuvenlikFotoPaket> | null | undefined): boolean {
  if (!paket) return false;
  return (
    (paket.firmaFotolar?.length || 0) >= 1 &&
    (paket.kalemFotolar?.length || 0) >= 1 &&
    (paket.faturaFotolar?.length || 0) >= 1
  );
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
