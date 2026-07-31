import type { Fatura, Irsaliye, SatinAlmaItem, SatinAlmaTalebi } from '../types/erp';
import {
  buildFaturaFromIrsaliyeler,
  linkIrsaliyelerToFatura,
} from './evrakDonusum';
import { appendCariIslemOnce, buildCariEvrakHistory } from './evrakCariStokSync';
import { kalanMiktarForSaKalem } from './satinAlmaIrsaliyeUtils';
import { isSekerVidanjorFirma, normalizeFirmaUnvan } from './vidanjorUtils';
import { isYildirimTankerFirma } from './yildirimTankerUtils';
import type { CariKart, CariKartIslem, StokKart } from '../types/erp';

export type TankerSaMatch = {
  sa: SatinAlmaTalebi;
  kalem: SatinAlmaItem;
  kalan: number;
};

function isOpenSatinAlma(sa?: { onayDurumu?: string } | null): boolean {
  if (!sa) return false;
  const d = String(sa.onayDurumu || '').toLocaleUpperCase('tr-TR');
  if (d.includes('RED') || d.includes('KAPAT')) return false;
  return true;
}

export function satinAlmaKalemMatchesVidanjor(urunAdi?: string | null): boolean {
  const u = normalizeFirmaUnvan(urunAdi);
  if (!u) return false;
  return (
    u.includes('VIDANJOR') ||
    u.includes('CEKIM') ||
    u.includes('SEFER') ||
    u.includes('FOSEPTIK') ||
    u.includes('ATIK SU') ||
    u.includes('ATIKSU')
  );
}

export function satinAlmaKalemMatchesYildirim(
  urunAdi?: string | null,
  tip?: 'ICME' | 'SANAYI' | 'DAMACA' | null
): boolean {
  const u = normalizeFirmaUnvan(urunAdi);
  if (!u) return false;
  if (tip === 'DAMACA') return u.includes('DAMACA') || u.includes('DAMACANA');
  if (tip === 'SANAYI') {
    return (u.includes('SANAYI') || u.includes('SANAY')) && (u.includes('SU') || u.includes('TANKER'));
  }
  if (tip === 'ICME') {
    return (
      u.includes('ICME') ||
      ((u.includes('SU') || u.includes('TANKER')) && !u.includes('SANAYI') && !u.includes('DAMACA'))
    );
  }
  return (
    u.includes('ICME') ||
    u.includes('SANAYI') ||
    u.includes('DAMACA') ||
    u.includes('DAMACANA') ||
    u.includes('TANKER') ||
    u.includes('SU ')
  );
}

function pickBestMatch(
  candidates: TankerSaMatch[],
  preferFirma: (name?: string | null) => boolean
): TankerSaMatch | null {
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aFirm = preferFirma(a.sa.cariFirma) ? 0 : 1;
    const bFirm = preferFirma(b.sa.cariFirma) ? 0 : 1;
    if (aFirm !== bFirm) return aFirm - bFirm;
    const aOpen = a.kalan > 0 ? 0 : 1;
    const bOpen = b.kalan > 0 ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return String(a.sa.tarih || '').localeCompare(String(b.sa.tarih || ''), 'tr');
  });
  return candidates[0];
}

/** Açık Şeker Vidanjör (veya vidanjör kalemli) SA eşleştir */
export function findMatchingVidanjorSatinAlma(
  satinAlmaTalepleri: SatinAlmaTalebi[] | null | undefined,
  irsaliyeler: Irsaliye[] | null | undefined,
  opts?: { preferredSaId?: string | null; preferredSaKalemId?: string | null }
): TankerSaMatch | null {
  const list = satinAlmaTalepleri || [];
  const irs = irsaliyeler || [];
  const score = (sa: SatinAlmaTalebi, kalem: SatinAlmaItem): TankerSaMatch => ({
    sa,
    kalem,
    kalan: kalanMiktarForSaKalem(sa, kalem, irs),
  });

  if (opts?.preferredSaId) {
    const sa = list.find((s) => s.saId === opts.preferredSaId || s.id === opts.preferredSaId);
    if (sa && isOpenSatinAlma(sa)) {
      const preferredKalem = opts.preferredSaKalemId
        ? sa.kalemler.find((k) => k.id === opts.preferredSaKalemId)
        : undefined;
      const kalem =
        preferredKalem && satinAlmaKalemMatchesVidanjor(preferredKalem.urunAdi)
          ? preferredKalem
          : sa.kalemler.find((k) => satinAlmaKalemMatchesVidanjor(k.urunAdi));
      if (kalem) return score(sa, kalem);
    }
  }

  const candidates: TankerSaMatch[] = [];
  for (const sa of list) {
    if (!isOpenSatinAlma(sa)) continue;
    for (const kalem of sa.kalemler || []) {
      if (!satinAlmaKalemMatchesVidanjor(kalem.urunAdi)) continue;
      if (!isSekerVidanjorFirma(sa.cariFirma) && !satinAlmaKalemMatchesVidanjor(kalem.urunAdi)) {
        continue;
      }
      candidates.push(score(sa, kalem));
    }
  }
  return pickBestMatch(candidates, isSekerVidanjorFirma);
}

/** Açık Yıldırım Tanker SA eşleştir (içme / sanayi / damaca kalemi) */
export function findMatchingYildirimSatinAlma(
  satinAlmaTalepleri: SatinAlmaTalebi[] | null | undefined,
  irsaliyeler: Irsaliye[] | null | undefined,
  tip: 'ICME' | 'SANAYI' | 'DAMACA' | null = null,
  opts?: { preferredSaId?: string | null; preferredSaKalemId?: string | null }
): TankerSaMatch | null {
  const list = satinAlmaTalepleri || [];
  const irs = irsaliyeler || [];
  const score = (sa: SatinAlmaTalebi, kalem: SatinAlmaItem): TankerSaMatch => ({
    sa,
    kalem,
    kalan: kalanMiktarForSaKalem(sa, kalem, irs),
  });

  if (opts?.preferredSaId) {
    const sa = list.find((s) => s.saId === opts.preferredSaId || s.id === opts.preferredSaId);
    if (sa && isOpenSatinAlma(sa)) {
      const preferredKalem = opts.preferredSaKalemId
        ? sa.kalemler.find((k) => k.id === opts.preferredSaKalemId)
        : undefined;
      const kalem =
        preferredKalem && satinAlmaKalemMatchesYildirim(preferredKalem.urunAdi, tip)
          ? preferredKalem
          : sa.kalemler.find((k) => satinAlmaKalemMatchesYildirim(k.urunAdi, tip));
      if (kalem) return score(sa, kalem);
    }
  }

  const candidates: TankerSaMatch[] = [];
  for (const sa of list) {
    if (!isOpenSatinAlma(sa)) continue;
    for (const kalem of sa.kalemler || []) {
      if (!satinAlmaKalemMatchesYildirim(kalem.urunAdi, tip)) continue;
      candidates.push(score(sa, kalem));
    }
  }
  return pickBestMatch(candidates, isYildirimTankerFirma);
}

/** Onaylı irsaliyeleri tek taslak faturaya yumuşak bağla (kilit yok) */
export function softBindIrsaliyelerToDraftFatura(options: {
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  cariKartlar?: CariKart[];
  stokKartlar?: StokKart[];
  setFaturalar: (updater: Fatura[] | ((prev: Fatura[]) => Fatura[])) => void;
  setIrsaliyeler: (updater: Irsaliye[] | ((prev: Irsaliye[]) => Irsaliye[])) => void;
  setCariIslemGecmisi?: (
    updater: CariKartIslem[] | ((prev: CariKartIslem[]) => CariKartIslem[])
  ) => void;
  baslik?: string;
}): { fatura: Fatura; warning?: string } {
  const withKalem = options.irsaliyeler.filter((ir) => (ir.kalemler || []).length > 0);
  if (!withKalem.length) {
    throw new Error('Faturaya bağlanacak kalemli irsaliye yok.');
  }
  const { fatura, warning } = buildFaturaFromIrsaliyeler(withKalem, {
    faturalar: options.faturalar,
    cariKartlar: options.cariKartlar,
    stokKartlar: options.stokKartlar,
    allowDuplicate: true,
  });

  options.setFaturalar((prev) => [fatura, ...prev]);
  options.setIrsaliyeler((prev) => linkIrsaliyelerToFatura(prev, fatura));

  if (fatura.cariKartId && options.setCariIslemGecmisi) {
    const nos = withKalem.map((ir) => ir.irsaliyeNo).join(', ');
    appendCariIslemOnce(
      options.setCariIslemGecmisi,
      buildCariEvrakHistory({
        cariKartId: fatura.cariKartId,
        islemTipi: 'FATURA',
        islemId: fatura.id,
        islemBaslik: options.baslik || 'İrsaliyelerden Taslak Fatura',
        islemDetay: `${withKalem.length} irsaliye → ${fatura.faturaNo} · ${fatura.cariUnvan} · ${nos}`,
        tarih: fatura.tarih,
        belgeNo: fatura.faturaNo,
        tutar: fatura.genelToplam,
      })
    );
  }

  return { fatura, warning };
}
