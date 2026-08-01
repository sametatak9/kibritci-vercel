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
  KALEM: '1. Kalem fotoğraf',
  FIRMA: '2. Firma adı fotoğraf',
  FATURA: '3. Fatura fotoğraf',
};

export const GUVENLIK_FOTO_METOD_HINT: Record<GuvenlikFotoMetod, string> = {
  KALEM: 'Malzeme kalemleri / miktarlar net görünsün',
  FIRMA: 'Firma unvanı / antet net görünsün',
  FATURA: 'Fatura / mali belge net görünsün',
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

/** Geriye uyumlu tek fotoUrl: önce kalem, sonra firma, sonra fatura. */
export function pickPrimaryFotoUrl(doc: {
  fotoUrl?: string;
  fotoUrls?: string[];
  kalemFotolar?: GuvenlikFotoSlot[];
  firmaFotolar?: GuvenlikFotoSlot[];
  faturaFotolar?: GuvenlikFotoSlot[];
}): string {
  const fromPaket =
    slotDisplayUrl(doc.kalemFotolar?.[0]) ||
    slotDisplayUrl(doc.firmaFotolar?.[0]) ||
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
    ...(doc.kalemFotolar || []).map((f) => f.dataUrl),
    ...(doc.firmaFotolar || []).map((f) => f.dataUrl),
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

export function createEmptyUploadPackage(): {
  id: string;
  evrakTuru: 'İRSALİYE' | 'FATURA' | 'MAKBUZ' | 'GENEL_EVRAK';
  aciklama: string;
  firma: string;
  cariKartId: string;
} & GuvenlikFotoPaket {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    evrakTuru: 'İRSALİYE',
    aciklama: '',
    firma: '',
    cariKartId: '',
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

