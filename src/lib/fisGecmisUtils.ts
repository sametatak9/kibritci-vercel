import { CariKartIslem, Irsaliye, MicirStabilizeFis, VidanjorFis, YildirimTankerFis } from '../types/erp';
import { removeDocument } from './firebase';

async function silentRemove(collectionName: string, id?: string | null) {
  if (!id) return;
  try {
    await removeDocument(collectionName, id);
  } catch {
    /* kayıt yoksa sorun değil */
  }
}

function findLinkedIrsaliye(
  irsaliyeler: Irsaliye[] | undefined,
  ids: { irsaliyeId?: string; fisId: string; fisField: 'yildirimTankerFisId' | 'vidanjorFisId' | 'micirFisId' }
): Irsaliye | undefined {
  const { irsaliyeId, fisId, fisField } = ids;
  return (irsaliyeler || []).find(
    (x) =>
      x.id === irsaliyeId ||
      x.irsaliyeId === irsaliyeId ||
      x[fisField] === fisId
  );
}

function assertNotFaturaBagli(ir?: Irsaliye) {
  if (ir?.faturaNo) {
    throw new Error(`Bu kayıt faturaya bağlı (${ir.faturaNo}). Önce fatura bağını çözün.`);
  }
}

type CascadeSetters = {
  irsaliyeler?: Irsaliye[];
  setIrsaliyeler?: (updater: Irsaliye[] | ((prev: Irsaliye[]) => Irsaliye[])) => void;
  setCariIslemGecmisi?: (
    updater: CariKartIslem[] | ((prev: CariKartIslem[]) => CariKartIslem[])
  ) => void;
};

function dropLinkedState(
  setters: CascadeSetters,
  irsaliyeId: string | undefined,
  fisId: string,
  fisField: 'yildirimTankerFisId' | 'vidanjorFisId' | 'micirFisId',
  cariIslemId: string
) {
  setters.setIrsaliyeler?.((prev) =>
    prev.filter(
      (x) =>
        x.id !== irsaliyeId &&
        x.irsaliyeId !== irsaliyeId &&
        x[fisField] !== fisId
    )
  );
  setters.setCariIslemGecmisi?.((prev) =>
    prev.filter((x) => x.id !== cariIslemId && x.islemId !== irsaliyeId)
  );
}

/** Onaylı Yıldırım Tanker fişi + bağlı irsaliye / cari / kapı evrakını siler. */
export async function deleteYildirimTankerFisCascade(
  options: CascadeSetters & { fis: YildirimTankerFis }
): Promise<void> {
  const { fis } = options;
  const irsaliyeId = fis.irsaliyeId || `IR-YT-${fis.id}`;
  const linked = findLinkedIrsaliye(options.irsaliyeler, {
    irsaliyeId,
    fisId: fis.id,
    fisField: 'yildirimTankerFisId',
  });
  assertNotFaturaBagli(linked);
  const guvenlikEvrakId = fis.guvenlikEvrakId || `EVR-YT-${fis.id}`;
  const cariIslemId = `cari_islem_yt_${fis.id}`;

  await removeDocument('yildirimTankerFisleri', fis.id);
  await silentRemove('irsaliyeler', irsaliyeId);
  await silentRemove('cariIslemGecmisi', cariIslemId);
  await silentRemove('guvenlikGelenEvraklar', guvenlikEvrakId);
  dropLinkedState(options, irsaliyeId, fis.id, 'yildirimTankerFisId', cariIslemId);
}

/** Onaylı vidanjör fişi + bağlı irsaliye / cari / kapı evrakını siler. */
export async function deleteVidanjorFisCascade(
  options: CascadeSetters & { fis: VidanjorFis }
): Promise<void> {
  const { fis } = options;
  const irsaliyeId = fis.irsaliyeId || `IR-VID-${fis.id}`;
  const linked = findLinkedIrsaliye(options.irsaliyeler, {
    irsaliyeId,
    fisId: fis.id,
    fisField: 'vidanjorFisId',
  });
  assertNotFaturaBagli(linked);
  const guvenlikEvrakId = fis.guvenlikEvrakId || `EVR-VID-${fis.id}`;
  const cariIslemId = `cari_islem_vid_${fis.id}`;

  await removeDocument('vidanjorFisleri', fis.id);
  await silentRemove('irsaliyeler', irsaliyeId);
  await silentRemove('cariIslemGecmisi', cariIslemId);
  await silentRemove('guvenlikGelenEvraklar', guvenlikEvrakId);
  dropLinkedState(options, irsaliyeId, fis.id, 'vidanjorFisId', cariIslemId);
}

/** Onaylı mıcır/stabilize fişi + bağlı irsaliye / cari / kapı evrakını siler. */
export async function deleteMicirFisCascade(
  options: CascadeSetters & { fis: MicirStabilizeFis }
): Promise<void> {
  const { fis } = options;
  const irsaliyeId = fis.irsaliyeId || `IR-MIC-${fis.id}`;
  const linked = findLinkedIrsaliye(options.irsaliyeler, {
    irsaliyeId,
    fisId: fis.id,
    fisField: 'micirFisId',
  });
  assertNotFaturaBagli(linked);
  const guvenlikEvrakId = fis.guvenlikEvrakId || `EVR-MIC-${fis.id}`;
  const cariIslemId = `cari_islem_mic_${fis.id}`;

  await removeDocument('micirStabilizeFisleri', fis.id);
  await silentRemove('irsaliyeler', irsaliyeId);
  await silentRemove('cariIslemGecmisi', cariIslemId);
  await silentRemove('guvenlikGelenEvraklar', guvenlikEvrakId);
  dropLinkedState(options, irsaliyeId, fis.id, 'micirFisId', cariIslemId);
}

export function fisDurumLabel(durum?: string): { text: string; className: string } {
  if (durum === 'ONAYLANDI') {
    return { text: 'ONAYLANDI', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (durum === 'REDDEDILDI' || durum === 'REDDEDİLDİ') {
    return { text: 'REDDEDİLDİ', className: 'bg-rose-100 text-rose-800' };
  }
  return { text: 'ONAY BEKLİYOR', className: 'bg-amber-100 text-amber-800' };
}
