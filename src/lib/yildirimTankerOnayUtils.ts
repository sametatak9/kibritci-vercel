import { CariKart, CariKartIslem, Irsaliye, SatinAlmaTalebi, YildirimTankerFis } from '../types/erp';
import { saveDocument } from './firebase';
import {
  YILDIRIM_TANKER_UNVAN,
  buildYildirimCariIslem,
  ensureYildirimTankerCari,
  isYildirimTankerFirma,
} from './yildirimTankerUtils';
import { findMatchingYildirimSatinAlma, type TankerSaMatch } from './tankerEvrakDonusum';

export type YildirimFisOnayDurum = 'YONETICI_ONAYINDA' | 'ONAYLANDI' | 'REDDEDILDI';

export type YildirimFisCorrection = {
  tarih: string;
  fisNo: string;
  icmeSuyuAdet: number;
  sanayiSuyuAdet: number;
  damacaAdet: number;
  fisGorselUrl?: string;
  firmaUnvan: string;
  cariKartId?: string;
  saId?: string;
  saKalemId?: string;
};

/** Yalnızca açıkça yönetici onayına gönderilmiş fişler (eski otomatik onaylı kayıtlar hariç) */
export function isYildirimFisPending(f?: Pick<YildirimTankerFis, 'durum'> | null): boolean {
  return f?.durum === 'YONETICI_ONAYINDA';
}

export function buildYildirimKalemler(
  fisId: string,
  icme: number,
  sanayi: number,
  damaca: number
) {
  return [
    {
      id: `k_icme_${fisId}`,
      urunAdi: 'İçme Suyu Tanker',
      miktar: icme,
      birim: 'ADET' as const,
    },
    {
      id: `k_sanayi_${fisId}`,
      urunAdi: 'Sanayi Suyu Tanker',
      miktar: sanayi,
      birim: 'ADET' as const,
    },
    {
      id: `k_damaca_${fisId}`,
      urunAdi: 'Damaca',
      miktar: damaca,
      birim: 'ADET' as const,
    },
  ].filter((k) => Number(k.miktar) > 0);
}

/**
 * Yönetici onayında (Şeker Vidanjör / MICIR ile aynı mantık):
 * 1) yildirimTankerFisleri → ONAYLANDI
 * 2) irsaliyeler'e Yıldırım Tanker irsaliyesi (+ SA soft bağ)
 * 3) cariIslemGecmisi
 * 4) guvenlikGelenEvraklar → ONAYLANDI
 */
export async function approveYildirimTankerFis(options: {
  fis: YildirimTankerFis;
  correction: YildirimFisCorrection;
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
  fis: YildirimTankerFis;
  cariIslem: CariKartIslem;
  saMatch: TankerSaMatch | null;
}> {
  const { fis, correction, onaylayan } = options;
  const now = new Date().toISOString();

  let cariKartId = correction.cariKartId;
  let firmaUnvan = correction.firmaUnvan || YILDIRIM_TANKER_UNVAN;

  if (!cariKartId || isYildirimTankerFirma(firmaUnvan)) {
    const cari = await ensureYildirimTankerCari(options.cariKartlar, options.setCariKartlar);
    cariKartId = cari.id;
    firmaUnvan = cari.unvan || YILDIRIM_TANKER_UNVAN;
  }

  const tipHint: 'ICME' | 'SANAYI' | 'DAMACA' | null =
    correction.icmeSuyuAdet > 0
      ? 'ICME'
      : correction.sanayiSuyuAdet > 0
        ? 'SANAYI'
        : correction.damacaAdet > 0
          ? 'DAMACA'
          : null;

  const saMatch = findMatchingYildirimSatinAlma(
    options.satinAlmaTalepleri,
    options.irsaliyeler,
    tipHint,
    {
      preferredSaId: correction.saId || fis.saId,
      preferredSaKalemId: correction.saKalemId || fis.saKalemId,
    }
  );
  const saId = saMatch?.sa.saId || correction.saId || fis.saId;
  const saKalemId = saMatch?.kalem.id || correction.saKalemId || fis.saKalemId;

  const irsaliyeId = fis.irsaliyeId || `IR-YT-${fis.id}`;
  const guvenlikEvrakId = fis.guvenlikEvrakId || `EVR-YT-${fis.id}`;
  const kalemler = buildYildirimKalemler(
    fis.id,
    correction.icmeSuyuAdet,
    correction.sanayiSuyuAdet,
    correction.damacaAdet
  ).map((k) => ({ ...k, saKalemId: saKalemId || undefined }));

  const updatedFis: YildirimTankerFis = {
    ...fis,
    tarih: correction.tarih,
    fisNo: correction.fisNo.trim().toUpperCase(),
    icmeSuyuAdet: correction.icmeSuyuAdet,
    sanayiSuyuAdet: correction.sanayiSuyuAdet,
    damacaAdet: correction.damacaAdet,
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
    kaynak: 'YILDIRIM_TANKER_FIS',
    fisNo: updatedFis.fisNo,
    icmeSuyuAdet: updatedFis.icmeSuyuAdet,
    sanayiSuyuAdet: updatedFis.sanayiSuyuAdet,
    damacaAdet: updatedFis.damacaAdet || 0,
    yildirimTankerFisId: fis.id,
    guvenlikEvrakId,
    kalemler,
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
  };

  const cariIslem = buildYildirimCariIslem({
    fisId: fis.id,
    irsaliyeId,
    cariKartId: cariKartId!,
    fisNo: updatedFis.fisNo,
    tarih: updatedFis.tarih,
    icme: updatedFis.icmeSuyuAdet,
    sanayi: updatedFis.sanayiSuyuAdet,
    damaca: updatedFis.damacaAdet || 0,
  });
  cariIslem.islemDetay = `${cariIslem.islemDetay}${saId ? ` · SA ${saId}` : ''}`;

  await saveDocument('yildirimTankerFisleri', updatedFis);
  await saveDocument('irsaliyeler', irsaliye);
  await saveDocument('cariIslemGecmisi', cariIslem);
  await saveDocument('guvenlikGelenEvraklar', {
    id: guvenlikEvrakId,
    evrakNo: updatedFis.fisNo,
    evrakTuru: 'İRSALİYE',
    firma: firmaUnvan,
    tarih: updatedFis.tarih,
    fotoUrl: updatedFis.fisGorselUrl || '',
    fileName: `yildirim_${updatedFis.fisNo}.jpg`,
    fileType: 'image/jpeg',
    durum: 'ONAYLANDI',
    aciklama: `Yıldırım Tanker irsaliyesi onaylandı · İçme ${updatedFis.icmeSuyuAdet} ton · Sanayi ${updatedFis.sanayiSuyuAdet} ton · Damacana ${updatedFis.damacaAdet || 0} adet${
      saId ? ` · SA ${saId}` : ''
    }`,
    kaynak: 'YILDIRIM_TANKER_FIS',
    yildirimTankerFisId: fis.id,
    irsaliyeId,
    cariKartId,
    saId,
    saKalemId,
    icmeSuyuAdet: updatedFis.icmeSuyuAdet,
    sanayiSuyuAdet: updatedFis.sanayiSuyuAdet,
    damacaAdet: updatedFis.damacaAdet || 0,
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

export async function rejectYildirimTankerFis(options: {
  fis: YildirimTankerFis;
  onaylayan: string;
  redNedeni?: string;
}): Promise<YildirimTankerFis> {
  const now = new Date().toISOString();
  const guvenlikEvrakId = options.fis.guvenlikEvrakId || `EVR-YT-${options.fis.id}`;
  const updated: YildirimTankerFis = {
    ...options.fis,
    durum: 'REDDEDILDI',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    guncellenme: now,
  };
  await saveDocument('yildirimTankerFisleri', updated);
  await saveDocument('guvenlikGelenEvraklar', {
    id: guvenlikEvrakId,
    durum: 'REDDEDİLDİ',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    kaynak: 'YILDIRIM_TANKER_FIS',
    yildirimTankerFisId: options.fis.id,
  });
  return updated;
}
