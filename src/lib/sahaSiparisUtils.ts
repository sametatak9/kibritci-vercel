import {
  CariKart,
  SahaSiparis,
  SatinAlmaItem,
  SatinAlmaTalebi,
  StokKart,
} from '../types/erp';
import { saveDocument } from './firebase';
import { linkSatinAlmaKalemler, resolveCariKartId } from './evrakCariStokSync';

export const SAHA_SIPARIS_COLLECTION = 'sahaSiparisleri';

export {
  buildPublicSiparisUrl,
  buildSiparisNo,
  fetchSiparisKatalog,
  isPublicSiparisRoute,
  katalogFromErp,
  siparisEslesmeEtiketi,
  submitSahaSiparis,
  suggestSiparisStoklar,
  suggestSiparisTedarikciler,
} from './sahaSiparisPublic';

export type {
  SiparisEslesme,
  SiparisKatalog,
  SiparisKatalogStok,
  SiparisKatalogTedarikci,
  SiparisStokOneri,
  SiparisTedarikciOneri,
  SubmitSahaSiparisInput,
} from './sahaSiparisPublic';

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
