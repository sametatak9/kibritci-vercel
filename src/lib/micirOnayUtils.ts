import { CariKart, CariKartIslem, Irsaliye, MicirStabilizeFis, SatinAlmaItem, SatinAlmaTalebi } from '../types/erp';
import { saveDocument } from './firebase';
import {
  ENTO_MADEN_UNVAN,
  findEntoMadenCari,
  formatMicirMiktarLabel,
  isEntoMadenFirma,
  isOpenMicirSatinAlma,
  kgToTon,
  malzemeTipiLabel,
  MicirMalzemeTipi,
  resolveMicirKiloKg,
  satinAlmaKalemMatchesMicir,
  tonToKg,
} from './micirUtils';
import { kalanMiktarForSaKalem } from './satinAlmaIrsaliyeUtils';

export type MicirFisOnayDurum = 'YONETICI_ONAYINDA' | 'ONAYLANDI' | 'REDDEDILDI';

export type MicirFisCorrection = {
  tarih: string;
  irsaliyeNo: string;
  plaka: string;
  tonaj: number;
  kiloKg?: number;
  malzemeTipi: MicirMalzemeTipi;
  fisGorselUrl?: string;
  firmaUnvan: string;
  cariKartId?: string;
  /** Manuel seçim / kapıda önceden bağlanmış SA */
  saId?: string;
  saKalemId?: string;
};

export type MicirSaMatch = {
  sa: SatinAlmaTalebi;
  kalem: SatinAlmaItem;
  kalan: number;
};

/**
 * Açık Ento Maden (veya mıcır/stabilize kalemli) satın alma ile kapı fişini eşleştir.
 * Önce kalan miktarı olan SA, yoksa aynı malzeme kalemli açık SA.
 */
export function findMatchingMicirSatinAlma(
  satinAlmaTalepleri: SatinAlmaTalebi[] | null | undefined,
  irsaliyeler: Irsaliye[] | null | undefined,
  malzemeTipi: MicirMalzemeTipi,
  opts?: { preferredSaId?: string | null; preferredSaKalemId?: string | null }
): MicirSaMatch | null {
  const list = satinAlmaTalepleri || [];
  const irs = irsaliyeler || [];

  const scoreMatch = (sa: SatinAlmaTalebi, kalem: SatinAlmaItem): MicirSaMatch => ({
    sa,
    kalem,
    kalan: kalanMiktarForSaKalem(sa, kalem, irs),
  });

  if (opts?.preferredSaId) {
    const sa = list.find(
      (s) => s.saId === opts.preferredSaId || s.id === opts.preferredSaId
    );
    if (sa && isOpenMicirSatinAlma(sa)) {
      const preferredKalem = opts.preferredSaKalemId
        ? sa.kalemler.find((k) => k.id === opts.preferredSaKalemId)
        : undefined;
      const kalem =
        preferredKalem && satinAlmaKalemMatchesMicir(preferredKalem.urunAdi, malzemeTipi)
          ? preferredKalem
          : sa.kalemler.find((k) => satinAlmaKalemMatchesMicir(k.urunAdi, malzemeTipi));
      if (kalem) return scoreMatch(sa, kalem);
    }
  }

  const candidates: MicirSaMatch[] = [];
  for (const sa of list) {
    if (!isOpenMicirSatinAlma(sa)) continue;
    const ento = isEntoMadenFirma(sa.cariFirma);
    for (const kalem of sa.kalemler || []) {
      if (!satinAlmaKalemMatchesMicir(kalem.urunAdi, malzemeTipi)) continue;
      // Ento dışı firmada yalnızca kalem adı net eşleşirse kabul
      if (!ento && !satinAlmaKalemMatchesMicir(kalem.urunAdi, malzemeTipi)) continue;
      candidates.push(scoreMatch(sa, kalem));
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aEnto = isEntoMadenFirma(a.sa.cariFirma) ? 0 : 1;
    const bEnto = isEntoMadenFirma(b.sa.cariFirma) ? 0 : 1;
    if (aEnto !== bEnto) return aEnto - bEnto;
    const aOpen = a.kalan > 0 ? 0 : 1;
    const bOpen = b.kalan > 0 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return String(a.sa.tarih || '').localeCompare(String(b.sa.tarih || ''), 'tr');
  });

  return candidates[0];
}

/** Büyük data URL’leri tekrar yazma — Firestore timeout / rollback kök nedeni */
const MAX_INLINE_IMAGE_CHARS = 120_000;

function leanImageUrl(url?: string | null): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('data:') && raw.length > MAX_INLINE_IMAGE_CHARS) return '';
  return raw;
}

export function isMicirFisPending(f?: Pick<MicirStabilizeFis, 'durum'> | null): boolean {
  return !f?.durum || f.durum === 'YONETICI_ONAYINDA';
}

export function buildMicirKalemler(
  fisId: string,
  tonaj: number,
  malzemeTipi: MicirMalzemeTipi,
  kiloKg?: number
) {
  const kg = resolveMicirKiloKg({ tonaj, kiloKg });
  const ton = kg > 0 ? kgToTon(kg) : tonaj;
  return [
    {
      id: `k_${fisId}`,
      urunAdi: malzemeTipiLabel(malzemeTipi),
      miktar: ton,
      birim: 'TON' as const,
      kiloKg: kg || tonToKg(ton),
    },
  ];
}

/** Onayda cari kart yoksa Ento Maden kartını oluşturur */
export async function ensureEntoMadenCari(
  cariKartlar: CariKart[],
  setCariKartlar?: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void
): Promise<CariKart> {
  const existing = findEntoMadenCari(cariKartlar);
  if (existing) return existing;

  const created: CariKart = {
    id: `cari_ento_maden_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CAR-ENTO-${Date.now().toString().slice(-6)}`,
    unvan: ENTO_MADEN_UNVAN,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: 'Mıcır & stabilize kapı irsaliyelerinden otomatik oluşturuldu.',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Sistem tarafından mıcır/stabilize onayında oluşturuldu.',
  };
  await saveDocument('cariKartlar', created);
  setCariKartlar?.((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
  return created;
}

/**
 * Yönetici onayında (yalın yazım — büyük foto tekrar yazılmaz):
 * 1) micirStabilizeFisleri → ONAYLANDI (görsel dokunulmaz)
 * 2) irsaliyeler sekmesine irsaliye
 * 3) cariIslemGecmisi → Ento Maden
 * 4) guvenlikGelenEvraklar → ONAYLANDI
 */
export async function approveMicirFis(options: {
  fis: MicirStabilizeFis;
  correction: MicirFisCorrection;
  onaylayan: string;
  cariKartlar: CariKart[];
  setCariKartlar?: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void;
  setIrsaliyeler?: (updater: Irsaliye[] | ((prev: Irsaliye[]) => Irsaliye[])) => void;
  setCariIslemGecmisi?: (
    updater: CariKartIslem[] | ((prev: CariKartIslem[]) => CariKartIslem[])
  ) => void;
  /** Kapı mıcır ↔ satın alma senkronu */
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
}): Promise<{
  irsaliye: Irsaliye;
  fis: MicirStabilizeFis;
  cariIslem: CariKartIslem;
  saMatch: MicirSaMatch | null;
}> {
  const { fis, correction, onaylayan } = options;
  const now = new Date().toISOString();

  let cariKartId = correction.cariKartId;
  let firmaUnvan = correction.firmaUnvan || ENTO_MADEN_UNVAN;

  if (!cariKartId || isEntoMadenFirma(firmaUnvan)) {
    const cari = await ensureEntoMadenCari(options.cariKartlar, options.setCariKartlar);
    cariKartId = cari.id;
    firmaUnvan = cari.unvan || ENTO_MADEN_UNVAN;
  }

  const kiloKg = resolveMicirKiloKg({
    tonaj: correction.tonaj,
    kiloKg: correction.kiloKg,
  });
  const tonaj = kiloKg > 0 ? kgToTon(kiloKg) : correction.tonaj;

  if (!correction.tarih?.trim()) {
    throw new Error('İrsaliye tarihi zorunludur.');
  }
  if (!correction.irsaliyeNo?.trim()) {
    throw new Error('İrsaliye no zorunludur.');
  }
  if (!plakaOk(correction.plaka)) {
    throw new Error('Plaka zorunludur.');
  }
  if (!kiloKg || kiloKg <= 0 || !tonaj || tonaj <= 0) {
    throw new Error('Kilo / tonaj zorunludur.');
  }

  const saMatch = findMatchingMicirSatinAlma(
    options.satinAlmaTalepleri,
    options.irsaliyeler,
    correction.malzemeTipi,
    {
      preferredSaId: correction.saId || fis.saId,
      preferredSaKalemId: correction.saKalemId || fis.saKalemId,
    }
  );
  const linkedSaId = saMatch?.sa.saId || correction.saId || fis.saId;
  const linkedSaKalemId = saMatch?.kalem.id || correction.saKalemId || fis.saKalemId;

  const irsaliyeId = fis.irsaliyeId || `IR-MIC-${fis.id}`;
  const guvenlikEvrakId = fis.guvenlikEvrakId || `EVR-MIC-${fis.id}`;
  const kalemler = buildMicirKalemler(fis.id, tonaj, correction.malzemeTipi, kiloKg).map((k) => ({
    ...k,
    saKalemId: linkedSaKalemId || undefined,
  }));
  const malzemeAdi = malzemeTipiLabel(correction.malzemeTipi);
  const miktarLabel = formatMicirMiktarLabel(tonaj, kiloKg);
  const existingImage = String(fis.fisGorselUrl || '').trim();
  const correctionImage = leanImageUrl(correction.fisGorselUrl);
  const imageForIrsaliye = correctionImage || leanImageUrl(existingImage);

  const fisPatch: MicirStabilizeFis = {
    id: fis.id,
    tarih: correction.tarih,
    irsaliyeNo: correction.irsaliyeNo.trim().toUpperCase(),
    plaka: correction.plaka.trim().toUpperCase(),
    tonaj,
    kiloKg,
    malzemeTipi: correction.malzemeTipi,
    firmaUnvan,
    cariKartId,
    saId: linkedSaId || undefined,
    saKalemId: linkedSaKalemId || undefined,
    irsaliyeId,
    guvenlikEvrakId,
    kapıLogId: fis.kapıLogId,
    kaydeden: fis.kaydeden,
    durum: 'ONAYLANDI',
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
    olusturulma: fis.olusturulma || now,
    guncellenme: now,
  };
  if (correctionImage) {
    fisPatch.fisGorselUrl = correctionImage;
  }

  const irsaliye: Irsaliye = {
    id: irsaliyeId,
    irsaliyeId,
    irsaliyeNo: fisPatch.irsaliyeNo,
    saId: linkedSaId || undefined,
    firma: firmaUnvan,
    cariKartId,
    tarih: fisPatch.tarih,
    onayDurumu: 'ONAYLANDI' as Irsaliye['onayDurumu'],
    fisEvrakUrl: imageForIrsaliye,
    kaynak: 'MICIR_STABILIZE_FIS',
    plaka: fisPatch.plaka,
    fisNo: fisPatch.irsaliyeNo,
    micirFisId: fis.id,
    tonaj: fisPatch.tonaj,
    kiloKg: fisPatch.kiloKg,
    malzemeTipi: fisPatch.malzemeTipi,
    guvenlikEvrakId,
    kalemler,
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
  };

  const cariIslem: CariKartIslem = {
    id: `cari_islem_mic_${fis.id}`,
    cariKartId: cariKartId!,
    islemTipi: 'IRSALIYE',
    islemId: irsaliyeId,
    islemBaslik: `${malzemeAdi} İrsaliyesi · ${firmaUnvan}`,
    islemDetay: `${fisPatch.irsaliyeNo} · ${fisPatch.plaka} · ${miktarLabel} · ${malzemeAdi}${
      linkedSaId ? ` · SA ${linkedSaId}` : ''
    }`,
    tarih: fisPatch.tarih,
    belgeNo: fisPatch.irsaliyeNo,
  };

  await saveDocument('micirStabilizeFisleri', fisPatch);
  await saveDocument('irsaliyeler', irsaliye);
  await saveDocument('cariIslemGecmisi', cariIslem);
  await saveDocument('guvenlikGelenEvraklar', {
    id: guvenlikEvrakId,
    evrakNo: fisPatch.irsaliyeNo,
    evrakTuru: 'İRSALİYE',
    firma: firmaUnvan,
    tarih: fisPatch.tarih,
    fileName: `micir_${fisPatch.irsaliyeNo}.jpg`,
    fileType: 'image/jpeg',
    durum: 'ONAYLANDI',
    aciklama: `Kapı ${malzemeAdi} irsaliyesi onaylandı · Plaka ${fisPatch.plaka} · ${miktarLabel}${
      linkedSaId ? ` · SA ${linkedSaId}` : ''
    }`,
    kaynak: 'MICIR_STABILIZE_FIS',
    micirFisId: fis.id,
    irsaliyeId,
    saId: linkedSaId || null,
    cariKartId,
    plaka: fisPatch.plaka,
    tonaj: fisPatch.tonaj,
    kiloKg: fisPatch.kiloKg,
    malzemeTipi: fisPatch.malzemeTipi,
    kalemler,
    onaylayanYonetici: onaylayan,
    onayTarihi: now,
    islenenEvrakTuru: 'İRSALİYE',
    aiStatus: 'SKIPPED',
  });

  if (fis.kapıLogId) {
    await saveDocument('guvenlikTankerLoglari', {
      id: fis.kapıLogId,
      onayDurumu: 'ONAYLANDI',
      irsaliyeId,
      micirFisId: fis.id,
      saId: linkedSaId || null,
      guncellenme: now,
    });
  }

  const updatedFis: MicirStabilizeFis = {
    ...fis,
    ...fisPatch,
    fisGorselUrl: correctionImage || existingImage,
  };

  options.setIrsaliyeler?.((prev) => {
    const others = (prev || []).filter(
      (x) => x.id !== irsaliye.id && x.irsaliyeId !== irsaliye.irsaliyeId
    );
    return [irsaliye, ...others];
  });

  options.setCariIslemGecmisi?.((prev) => {
    const others = prev.filter((x) => x.id !== cariIslem.id);
    return [cariIslem, ...others];
  });

  return { irsaliye, fis: updatedFis, cariIslem, saMatch };
}

function plakaOk(plaka?: string): boolean {
  return String(plaka || '').trim().length > 0;
}

export async function rejectMicirFis(options: {
  fis: MicirStabilizeFis;
  onaylayan: string;
  redNedeni?: string;
}): Promise<MicirStabilizeFis> {
  const now = new Date().toISOString();
  const guvenlikEvrakId = options.fis.guvenlikEvrakId || `EVR-MIC-${options.fis.id}`;
  await saveDocument('micirStabilizeFisleri', {
    id: options.fis.id,
    durum: 'REDDEDILDI',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    guncellenme: now,
  });
  await saveDocument('guvenlikGelenEvraklar', {
    id: guvenlikEvrakId,
    durum: 'REDDEDILDI',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    kaynak: 'MICIR_STABILIZE_FIS',
    micirFisId: options.fis.id,
  });
  if (options.fis.kapıLogId) {
    await saveDocument('guvenlikTankerLoglari', {
      id: options.fis.kapıLogId,
      onayDurumu: 'REDDEDILDI',
      micirFisId: options.fis.id,
      guncellenme: now,
    });
  }
  return {
    ...options.fis,
    durum: 'REDDEDILDI',
    onaylayanYonetici: options.onaylayan,
    onayTarihi: now,
    redNedeni: options.redNedeni || '',
    guncellenme: now,
  };
}
