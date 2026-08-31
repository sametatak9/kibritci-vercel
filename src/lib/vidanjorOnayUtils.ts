import { CariKart, CariKartIslem, Irsaliye, SatinAlmaTalebi, VidanjorFis } from '../types/erp';
import { saveDocument } from './firebase';
import {
  SEKER_VIDANJOR_UNVAN,
  findSekerVidanjorCari,
  isSekerVidanjorFirma,
} from './vidanjorUtils';
import { findMatchingVidanjorSatinAlma, type TankerSaMatch } from './tankerEvrakDonusum';

export type VidanjorFisOnayDurum = 'YONETICI_ONAYINDA' | 'ONAYLANDI' | 'REDDEDILDI';

export type VidanjorFisCorrection = {
  tarih: string;
  fisNo: string;
  plaka: string;
  cekimAdedi: number;
  fisGorselUrl?: string;
  firmaUnvan: string;
  cariKartId?: string;
  saId?: string;
  saKalemId?: string;
};

export function isVidanjorFisPending(f?: Pick<VidanjorFis, 'durum'> | null): boolean {
  return !f?.durum || f.durum === 'YONETICI_ONAYINDA';
}

export function buildVidanjorKalemler(fisId: string, cekimAdedi: number) {
  return [
    {
      id: `k_${fisId}`,
      urunAdi: 'Vidanjör Çekim',
      miktar: cekimAdedi,
      birim: 'ADET' as const,
    },
  ];
}

/** Onayda cari kart yoksa Şeker Vidanjör kartını oluşturur */
export async function ensureSekerVidanjorCari(
  cariKartlar: CariKart[],
  setCariKartlar?: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void
): Promise<CariKart> {
  const existing = findSekerVidanjorCari(cariKartlar);
  if (existing) return existing;

  const created: CariKart = {
    id: `cari_seker_vid_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CAR-VID-${Date.now().toString().slice(-6)}`,
    unvan: SEKER_VIDANJOR_UNVAN,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'Vidanjör hizmeti — kampçı fişlerinden otomatik oluşturuldu.',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Sistem tarafından vidanjör onayında oluşturuldu.',
  };
  await saveDocument('cariKartlar', created);
  setCariKartlar?.((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
  return created;
}

/**
 * Yönetici onayında:
 * 1) vidanjorFisleri güncellenir (ONAYLANDI)
 * 2) irsaliyeler sekmesine irsaliye yazılır (+ SA soft bağ)
 * 3) cariIslemGecmisi ile cari kart altına bağlanır
 * 4) guvenlikGelenEvraklar ONAYLANDI yapılır
 */
export async function approveVidanjorFis(options: {
  fis: VidanjorFis;
  correction: VidanjorFisCorrection;
  onaylayan: string;
  cariKartlar: CariKart[];
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  setCariKartlar?: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void;
  setIrsaliyeler?: (updater: Irsaliye[] | ((prev: Irsaliye[]) => Irsaliye[])) => void;
  setCariIslemGecmisi?: (
    updater: CariKartIslem[] | ((prev: CariKartIslem[]) => CariKartIslem[])
  ) => void;
}): Promise<{
  irsaliye: Irsaliye;
  fis: VidanjorFis;
  cariIslem: CariKartIslem;
  saMatch: TankerSaMatch | null;
}> {
  const { fis, correction, onaylayan } = options;
  const now = new Date().toISOString();

  let cariKartId = correction.cariKartId;
  let firmaUnvan = correction.firmaUnvan || SEKER_VIDANJOR_UNVAN;

  if (!cariKartId || isSekerVidanjorFirma(firmaUnvan)) {
    const cari = await ensureSekerVidanjorCari(options.cariKartlar, options.setCariKartlar);
    cariKartId = cari.id;
    firmaUnvan = cari.unvan || SEKER_VIDANJOR_UNVAN;
  }

  const saMatch = findMatchingVidanjorSatinAlma(
    options.satinAlmaTalepleri,
    options.irsaliyeler,
    {
      preferredSaId: correction.saId || fis.saId,
      preferredSaKalemId: correction.saKalemId || fis.saKalemId,
    }
  );
  const saId = saMatch?.sa.saId || correction.saId || fis.saId;
  const saKalemId = saMatch?.kalem.id || correction.saKalemId || fis.saKalemId;

  const irsaliyeId = fis.irsaliyeId || `IR-VID-${fis.id}`;
  const guvenlikEvrakId = fis.guvenlikEvrakId || `EVR-VID-${fis.id}`;
  const kalemler = buildVidanjorKalemler(fis.id, correction.cekimAdedi).map((k) => ({
    ...k,
    saKalemId: saKalemId || undefined,
  }));

  const updatedFis: VidanjorFis = {
    ...fis,
    tarih: correction.tarih,
    fisNo: correction.fisNo.trim().toUpperCase(),
    plaka: correction.plaka.trim().toUpperCase(),
    cekimAdedi: correction.cekimAdedi,
    fisGorselUrl: correction.fisGorselUrl || fis.fisGorselUrl || '',
    firmaUnvan,
    cariKartId,
    saId,
    saKalemId,
    irsaliyeId,
    guvenlikEvrakId,
    durum: 'ONAYLANDI',
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
    guncellenme: now,
  };

  const irsaliye: Irsaliye = {
    id: irsaliyeId,
    irsaliyeId,
    irsaliyeNo: updatedFis.fisNo,
    firma: firmaUnvan,
    cariKartId,
    saId,
    tarih: updatedFis.tarih,
    onayDurumu: 'ONAYLANDI' as Irsaliye['onayDurumu'],
    fisEvrakUrl: updatedFis.fisGorselUrl || '',
    kaynak: 'VIDANJOR_FIS',
    plaka: updatedFis.plaka,
    cekimAdedi: updatedFis.cekimAdedi,
    fisNo: updatedFis.fisNo,
    vidanjorFisId: fis.id,
    guvenlikEvrakId,
    kalemler,
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
  };

  const cariIslem: CariKartIslem = {
    id: `cari_islem_vid_${fis.id}`,
    cariKartId: cariKartId!,
    islemTipi: 'IRSALIYE',
    islemId: irsaliyeId,
    islemBaslik: 'Vidanjör İrsaliyesi',
    islemDetay: `${updatedFis.fisNo} · ${updatedFis.plaka} · ${updatedFis.cekimAdedi} çekim${
      saId ? ` · SA ${saId}` : ''
    }`,
    tarih: updatedFis.tarih,
    belgeNo: updatedFis.fisNo,
  };

  await saveDocument('vidanjorFisleri', updatedFis);
  await saveDocument('irsaliyeler', irsaliye);
  await saveDocument('cariIslemGecmisi', cariIslem);
  await saveDocument('guvenlikGelenEvraklar', {
    id: guvenlikEvrakId,
    evrakNo: updatedFis.fisNo,
    evrakTuru: 'İRSALİYE',
    firma: firmaUnvan,
    tarih: updatedFis.tarih,
    fotoUrl: updatedFis.fisGorselUrl || '',
    fileName: `vidanjor_${updatedFis.fisNo}.jpg`,
    fileType: 'image/jpeg',
    durum: 'ONAYLANDI',
    aciklama: `Kampçı vidanjör fişi onaylandı · Plaka ${updatedFis.plaka} · ${updatedFis.cekimAdedi} çekim${
      saId ? ` · SA ${saId}` : ''
    }`,
    kaynak: 'VIDANJOR_FIS',
    vidanjorFisId: fis.id,
    irsaliyeId,
    cariKartId,
    saId,
    saKalemId,
    plaka: updatedFis.plaka,
    cekimAdedi: updatedFis.cekimAdedi,
    kalemler,
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
    islenenEvrakTuru: 'İRSALİYE',
    aiStatus: 'SKIPPED',
  });

  options.setIrsaliyeler?.((prev) => {
    const others = prev.filter((x) => x.id !== irsaliyeId && x.irsaliyeId !== irsaliyeId);
    return [irsaliye, ...others];
  });
  options.setCariIslemGecmisi?.((prev) => {
    const others = prev.filter((x) => x.id !== cariIslem.id);
    return [cariIslem, ...others];
  });

  return { irsaliye, fis: updatedFis, cariIslem, saMatch };
}

export async function rejectVidanjorFis(options: {
  fis: VidanjorFis;
  onaylayan: string;
  redNedeni?: string;
}): Promise<VidanjorFis> {
  const now = new Date().toISOString();
  const guvenlikEvrakId = options.fis.guvenlikEvrakId || `EVR-VID-${options.fis.id}`;
  const updated: VidanjorFis = {
    ...options.fis,
    durum: 'REDDEDILDI',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    guncellenme: now,
  };
  await saveDocument('vidanjorFisleri', updated);
  await saveDocument('guvenlikGelenEvraklar', {
    id: guvenlikEvrakId,
    durum: 'REDDEDİLDİ',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    kaynak: 'VIDANJOR_FIS',
    vidanjorFisId: options.fis.id,
  });
  return updated;
}
