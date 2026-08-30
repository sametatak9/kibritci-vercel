import {
  CariKart,
  SahaSiparis,
  SahaSiparisKalem,
  StokKart,
} from '../types/erp';
import { fetchApiJson } from './apiClient';
import { levenshteinDistance, normalizeStockCompareName } from './duplicateNameUtils';

export type SiparisKatalogStok = {
  id: string;
  stokKodu: string;
  stokAdi: string;
  birim: string;
  kategori: string;
};

export type SiparisKatalogTedarikci = {
  id: string;
  unvan: string;
};

export type SiparisKatalog = {
  stoklar: SiparisKatalogStok[];
  tedarikciler: SiparisKatalogTedarikci[];
};

export type SiparisEslesme = 'TAM' | 'ICERIR' | 'BENZER';

export type SiparisStokOneri = SiparisKatalogStok & { eslesme: SiparisEslesme };
export type SiparisTedarikciOneri = SiparisKatalogTedarikci & { eslesme: SiparisEslesme };

function normalizeSiparisText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim();
}

export function siparisEslesmeEtiketi(eslesme: SiparisEslesme): string {
  if (eslesme === 'TAM') return 'Tam eşleşme';
  if (eslesme === 'ICERIR') return 'İsim içerir';
  return 'Benzer isim';
}

export function suggestSiparisStoklar(
  query: string,
  stoklar: SiparisKatalogStok[],
  limit = 8
): SiparisStokOneri[] {
  const q = normalizeStockCompareName(query);
  if (q.length < 2) return [];
  const scored: Array<SiparisStokOneri & { score: number }> = [];
  for (const s of stoklar) {
    const name = normalizeStockCompareName(s.stokAdi);
    const kod = normalizeStockCompareName(s.stokKodu);
    const kat = normalizeStockCompareName(s.kategori);
    if (!name && !kod) continue;
    let eslesme: SiparisEslesme | null = null;
    let score = 99;
    if (name === q || (kod && kod === q)) {
      eslesme = 'TAM';
      score = 0;
    } else if (
      (name && (name.includes(q) || (q.length >= 4 && q.includes(name)))) ||
      (kod && kod.includes(q)) ||
      (kat && kat.includes(q))
    ) {
      eslesme = 'ICERIR';
      score = 1 + Math.abs((name || '').length - q.length);
    } else if (name) {
      const dist = levenshteinDistance(q, name);
      const maxDist = q.length <= 4 ? 1 : 2;
      if (dist <= maxDist) {
        eslesme = 'BENZER';
        score = 10 + dist;
      }
    }
    if (eslesme) scored.push({ ...s, eslesme, score });
  }
  scored.sort((a, b) => a.score - b.score || a.stokAdi.localeCompare(b.stokAdi, 'tr'));
  const seen = new Set<string>();
  const out: SiparisStokOneri[] = [];
  for (const row of scored) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      stokKodu: row.stokKodu,
      stokAdi: row.stokAdi,
      birim: row.birim,
      kategori: row.kategori,
      eslesme: row.eslesme,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function suggestSiparisTedarikciler(
  query: string,
  tedarikciler: SiparisKatalogTedarikci[],
  limit = 6
): SiparisTedarikciOneri[] {
  const q = normalizeSiparisText(query);
  if (q.length < 2) return [];
  const scored: Array<SiparisTedarikciOneri & { score: number }> = [];
  for (const t of tedarikciler) {
    const name = normalizeSiparisText(t.unvan);
    if (!name) continue;
    let eslesme: SiparisEslesme | null = null;
    let score = 99;
    if (name === q) {
      eslesme = 'TAM';
      score = 0;
    } else if (name.includes(q) || (q.length >= 4 && q.includes(name))) {
      eslesme = 'ICERIR';
      score = 1 + Math.abs(name.length - q.length);
    } else {
      const dist = levenshteinDistance(q, name);
      const maxDist = q.length <= 4 ? 1 : 2;
      if (dist <= maxDist) {
        eslesme = 'BENZER';
        score = 10 + dist;
      }
    }
    if (eslesme) scored.push({ ...t, eslesme, score });
  }
  scored.sort((a, b) => a.score - b.score || a.unvan.localeCompare(b.unvan, 'tr'));
  return scored.slice(0, limit).map(({ score: _s, ...rest }) => rest);
}

export function buildPublicSiparisUrl(): string {
  if (typeof window === 'undefined') return '/siparis.html';
  return `${window.location.origin}/siparis.html`;
}

/** Üyeliksiz sipariş formu — /siparis, query veya hash. ERP bootstrap çalışmamalı. */
export function isPublicSiparisRoute(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/siparis' || path.endsWith('/siparis.html')) return true;
    const search = new URLSearchParams(window.location.search);
    if (search.has('siparis') || search.get('view') === 'siparis') return true;
    const hash = String(window.location.hash || '');
    if (!hash) return false;
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    if (hashQuery) {
      const hp = new URLSearchParams(hashQuery);
      if (hp.has('siparis') || hp.get('view') === 'siparis') return true;
    }
    const hashPath = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
    return hashPath === 'siparis';
  } catch {
    return false;
  }
}

export function buildSiparisNo(tarih: string): string {
  const dateKey = String(tarih || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const seq = Date.now().toString(36).slice(-4).toUpperCase();
  return `SP-${dateKey}-${seq}`;
}

export async function fetchSiparisKatalog(): Promise<SiparisKatalog> {
  try {
    const data = await fetchApiJson<SiparisKatalog & { success?: boolean }>('/api/public/siparis-katalog');
    return {
      stoklar: Array.isArray(data.stoklar) ? data.stoklar : [],
      tedarikciler: Array.isArray(data.tedarikciler) ? data.tedarikciler : [],
    };
  } catch {
    return { stoklar: [], tedarikciler: [] };
  }
}

export function katalogFromErp(cariKartlar: CariKart[], stokKartlar: StokKart[]): SiparisKatalog {
  const tedarikciler = (cariKartlar || [])
    .filter((c) => c.durum !== 'PASIF' && (c.kartTipi === 'TEDARIKCI' || c.kartTipi === 'SATICI' || !c.kartTipi))
    .map((c) => ({ id: c.id, unvan: c.unvan }))
    .sort((a, b) => a.unvan.localeCompare(b.unvan, 'tr'));
  const stoklar = (stokKartlar || [])
    .filter((s) => s.durum !== 'PASIF' && !s.arsivde)
    .map((s) => ({
      id: s.id,
      stokKodu: s.stokKodu || '',
      stokAdi: s.stokAdi || '',
      birim: s.birim || 'ADET',
      kategori: s.kategori || '',
    }))
    .sort((a, b) => a.stokAdi.localeCompare(b.stokAdi, 'tr'));
  return { stoklar, tedarikciler };
}

export type SubmitSahaSiparisInput = {
  personelAdSoyad: string;
  personelGorev?: string;
  telefon?: string;
  kullanilacakYer: string;
  cariFirma?: string;
  cariKartId?: string;
  aciklama?: string;
  kalemler: SahaSiparisKalem[];
  olusturanEmail?: string;
};

/** Public sipariş yalnızca Admin API’ye yazar — Firestore oturumu açılmaz. */
export async function submitSahaSiparis(input: SubmitSahaSiparisInput): Promise<SahaSiparis> {
  const personelAdSoyad = input.personelAdSoyad.trim();
  const kullanilacakYer = input.kullanilacakYer.trim();
  const kalemler = (input.kalemler || []).filter((k) => k.urunAdi.trim() && Number(k.miktar) > 0);
  if (personelAdSoyad.length < 3) throw new Error('Personel adı soyadı zorunlu.');
  if (kullanilacakYer.length < 3) throw new Error('Malzemenin nerede kullanılacağı zorunlu.');
  if (kalemler.length === 0) throw new Error('En az bir malzeme kalemi ekleyin.');

  const tarih = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const id = `sip_${Date.now()}`;
  const payload: SahaSiparis = {
    id,
    siparisNo: buildSiparisNo(tarih),
    tarih,
    personelAdSoyad,
    personelGorev: input.personelGorev?.trim() || '',
    telefon: input.telefon?.trim() || '',
    kullanilacakYer,
    cariFirma: input.cariFirma?.trim() || '',
    cariKartId: input.cariKartId || '',
    aciklama: input.aciklama?.trim() || '',
    kalemler: kalemler.map((k, i) => ({
      ...k,
      id: k.id || `sipk_${Date.now()}_${i}`,
      urunAdi: k.urunAdi.trim(),
      miktar: Number(k.miktar) || 0,
      birim: k.birim || 'ADET',
      kullanilacakYer: k.kullanilacakYer || kullanilacakYer,
    })),
    durum: 'ONAY_BEKLIYOR',
    kaynak: 'SIPARIS_FORMU',
    olusturanEmail: input.olusturanEmail || '',
    olusturulma: now,
  };

  const data = await fetchApiJson<{ siparis?: SahaSiparis; success?: boolean }>('/api/public/saha-siparis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data?.siparis?.id) return { ...payload, ...data.siparis, id: data.siparis.id };
  return payload;
}
