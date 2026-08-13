import { collection, doc, setDoc } from 'firebase/firestore';
import {
  CariKart,
  SahaSiparis,
  SahaSiparisKalem,
  SatinAlmaItem,
  SatinAlmaTalebi,
  StokKart,
} from '../types/erp';
import { fetchApiJson } from './apiClient';
import { auth, db, saveDocument } from './firebase';
import { linkSatinAlmaKalemler, resolveCariKartId } from './evrakCariStokSync';
import { levenshteinDistance, normalizeStockCompareName } from './duplicateNameUtils';
import { normalizeMatchText } from './evrakBatchImportUtils';

export const SAHA_SIPARIS_COLLECTION = 'sahaSiparisleri';

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
  const q = normalizeMatchText(query);
  if (q.length < 2) return [];
  const scored: Array<SiparisTedarikciOneri & { score: number }> = [];
  for (const t of tedarikciler) {
    const name = normalizeMatchText(t.unvan);
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
      const maxDist = q.length <= 5 ? 1 : 2;
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
  if (typeof window === 'undefined') return '/?siparis=1';
  return `${window.location.origin}/?siparis=1`;
}

/** Üyeliksiz sipariş formu — query veya hash. ERP bootstrap çalışmamalı. */
export function isPublicSiparisRoute(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.has('siparis') || search.get('view') === 'siparis') return true;
    const hash = String(window.location.hash || '');
    if (!hash) return false;
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    if (hashQuery) {
      const hp = new URLSearchParams(hashQuery);
      if (hp.has('siparis') || hp.get('view') === 'siparis') return true;
    }
    const path = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
    return path === 'siparis';
  } catch {
    return false;
  }
}

export function buildSiparisNo(tarih: string): string {
  const dateKey = String(tarih || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const seq = Date.now().toString(36).slice(-4).toUpperCase();
  return `SP-${dateKey}-${seq}`;
}

function buildSaId(orderDate: string, existing: SatinAlmaTalebi[]): string {
  const dateKey = String(orderDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const prefix = `SA-${dateKey}-`;
  const used = new Set(existing.map((s) => s.saId));
  let seq = existing.filter((s) => String(s.saId || '').includes(prefix)).length + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;
  while (used.has(candidate)) {
    seq += 1;
    candidate = `${prefix}${String(seq).padStart(3, '0')}`;
  }
  return candidate;
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

  try {
    const data = await fetchApiJson<{ siparis?: SahaSiparis; success?: boolean }>('/api/public/saha-siparis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (data?.siparis?.id) return { ...payload, ...data.siparis, id: data.siparis.id };
  } catch (err) {
    console.warn('Sipariş API başarısız, Firestore deneniyor:', err);
    const emailUser = Boolean(auth.currentUser && !auth.currentUser.isAnonymous);
    if (!emailUser) {
      const msg = err instanceof Error ? err.message : 'Sipariş kaydedilemedi';
      throw new Error(
        msg || 'Sipariş sunucuya kaydedilemedi. Sayfayı yenileyip tekrar deneyin.'
      );
    }
  }

  await setDoc(doc(collection(db, SAHA_SIPARIS_COLLECTION), id), payload);
  return payload;
}

export async function approveSahaSiparisToSatinAlma(options: {
  siparis: SahaSiparis;
  onaylayan: string;
  cariKartlar: CariKart[];
  stokKartlar: StokKart[];
  satinAlmaTalepleri: SatinAlmaTalebi[];
  setSatinAlmaTalepleri?: (
    updater: SatinAlmaTalebi[] | ((prev: SatinAlmaTalebi[]) => SatinAlmaTalebi[])
  ) => void;
}): Promise<{ sa: SatinAlmaTalebi; siparis: SahaSiparis }> {
  const { siparis, onaylayan } = options;
  if (siparis.durum === 'ONAYLANDI' && siparis.satinAlmaTalepId) {
    throw new Error('Bu sipariş zaten satın alma talebine dönüştürüldü.');
  }
  const now = new Date().toISOString();
  const saId = buildSaId(siparis.tarih, options.satinAlmaTalepleri);
  const cariResolved = resolveCariKartId(siparis.cariFirma || '', options.cariKartlar);
  const rawKalemler: SatinAlmaItem[] = (siparis.kalemler || []).map((k, i) => ({
    id: k.id || `sai_sip_${siparis.id}_${i}`,
    urunAdi: k.urunAdi,
    miktar: Number(k.miktar) || 0,
    birim: k.birim || 'ADET',
    marka: k.marka || '',
    kullanilacakYer: k.kullanilacakYer || siparis.kullanilacakYer,
    aciklama: k.aciklama || siparis.aciklama || '',
    stokKartId: k.stokKartId,
  }));
  const kalemler = linkSatinAlmaKalemler(rawKalemler, options.stokKartlar);
  const sa: SatinAlmaTalebi = {
    id: `sa_sip_${siparis.id}`,
    saId,
    tarih: siparis.tarih,
    talepEden: siparis.personelAdSoyad,
    cariFirma: siparis.cariFirma || cariResolved.cariUnvan || 'Belirtilmedi',
    cariKartId: siparis.cariKartId || cariResolved.cariKartId || undefined,
    aciklama: [
      `Saha siparişi ${siparis.siparisNo}`,
      `Kullanılacak yer: ${siparis.kullanilacakYer}`,
      siparis.aciklama ? siparis.aciklama : '',
    ]
      .filter(Boolean)
      .join(' · '),
    onayDurumu: 'ONAYLANDI',
    kalemler,
    eImzalar: [],
    kaynak: 'SIPARIS_FORMU',
    siparisId: siparis.id,
  };

  const updatedSiparis: SahaSiparis = {
    ...siparis,
    durum: 'ONAYLANDI',
    satinAlmaTalepId: sa.id,
    saId,
    onaylayan,
    onayTarihi: now,
    guncellenme: now,
  };

  await saveDocument('satinAlmaTalepleri', sa);
  await saveDocument(SAHA_SIPARIS_COLLECTION, updatedSiparis);
  options.setSatinAlmaTalepleri?.((prev) => [sa, ...prev.filter((x) => x.id !== sa.id)]);
  return { sa, siparis: updatedSiparis };
}

export async function rejectSahaSiparis(options: {
  siparis: SahaSiparis;
  onaylayan: string;
  redNedeni?: string;
}): Promise<SahaSiparis> {
  const now = new Date().toISOString();
  const updated: SahaSiparis = {
    ...options.siparis,
    durum: 'REDDEDILDI',
    onaylayan: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    guncellenme: now,
  };
  await saveDocument(SAHA_SIPARIS_COLLECTION, updated);
  return updated;
}
