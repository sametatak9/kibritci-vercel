/**
 * Şeker Vidanjör — irsaliye→taslak fatura bağlarını sıfırla (mutabakat öncesi).
 * Gerçek tedarikçi faturalarını değil; VIDANJOR_FIS irsaliyelerine bağlanmış
 * IR_FATURA / bagliIrsaliye dönüşümlerini hedefler.
 */
import type { CariKart, CariKartIslem, Fatura, Irsaliye } from '../types/erp';
import { findFaturalarForIrsaliye } from './evrakDonusum';
import { isSekerVidanjorFirma, findSekerVidanjorCari, SEKER_VIDANJOR_UNVAN } from './vidanjorUtils';

export type SekerFaturaResetPlan = {
  cari: CariKart | null;
  vidanjorIrsaliyeler: Irsaliye[];
  linkedIrsaliyeler: Irsaliye[];
  faturalarToDelete: Fatura[];
  cariIslemIdsToDelete: string[];
  ozet: string;
};

function isVidanjorIrsaliye(ir: Irsaliye): boolean {
  if (ir.kaynak === 'VIDANJOR_FIS' || ir.vidanjorFisId) return true;
  const firma = isSekerVidanjorFirma(ir.firma);
  if (!firma) return false;
  // Şeker + çekim kalemi / plaka — vidanjör irsaliyesi varsay
  if (Number(ir.cekimAdedi || 0) > 0) return true;
  const kalem = (ir.kalemler || []).some((k) => {
    const ad = String(k.urunAdi || '').toLocaleLowerCase('tr-TR');
    return ad.includes('çekim') || ad.includes('cekim') || ad.includes('vidanj');
  });
  return kalem;
}

function faturaTargetsVidanjor(
  ft: Fatura,
  vidanjorIrs: Irsaliye[],
  cariId?: string
): boolean {
  const vidIds = new Set(vidanjorIrs.map((ir) => ir.id));
  const vidNos = new Set(vidanjorIrs.map((ir) => ir.irsaliyeNo).filter(Boolean));
  const bagli = ft.bagliIrsaliyeler || [];
  const bagliHit = bagli.some((ref) => vidIds.has(ref) || vidNos.has(ref));
  if (bagliHit) return true;
  if (ft.donusumKaynagi === 'IR_FATURA' && isSekerVidanjorFirma(ft.cariUnvan)) return true;
  if (cariId && ft.cariKartId === cariId && ft.donusumKaynagi === 'IR_FATURA') return true;
  // İrsaliye faturaNo eşleşmesi
  return vidanjorIrs.some((ir) => ir.faturaNo && ir.faturaNo === ft.faturaNo);
}

export function planSekerVidanjorFaturaReset(input: {
  cariKartlar: CariKart[];
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  cariIslemGecmisi?: CariKartIslem[];
  cariKartId?: string;
}): SekerFaturaResetPlan {
  const cari =
    (input.cariKartId
      ? input.cariKartlar.find((c) => c.id === input.cariKartId)
      : undefined) || findSekerVidanjorCari(input.cariKartlar) || null;

  const cariId = cari?.id;
  const vidanjorIrsaliyeler = (input.irsaliyeler || []).filter((ir) => {
    if (!isVidanjorIrsaliye(ir)) return false;
    if (cariId && ir.cariKartId && ir.cariKartId !== cariId) return false;
    if (cariId && !ir.cariKartId && !isSekerVidanjorFirma(ir.firma)) return false;
    if (!cariId && !isSekerVidanjorFirma(ir.firma) && ir.kaynak !== 'VIDANJOR_FIS') return false;
    return true;
  });

  const linkedIrsaliyeler = vidanjorIrsaliyeler.filter((ir) => {
    if (ir.faturaNo) return true;
    return findFaturalarForIrsaliye(ir, input.faturalar || []).length > 0;
  });

  const faturaMap = new Map<string, Fatura>();
  for (const ir of linkedIrsaliyeler) {
    for (const ft of findFaturalarForIrsaliye(ir, input.faturalar || [])) {
      if (faturaTargetsVidanjor(ft, vidanjorIrsaliyeler, cariId)) {
        faturaMap.set(ft.id, ft);
      }
    }
  }
  for (const ft of input.faturalar || []) {
    if (faturaTargetsVidanjor(ft, vidanjorIrsaliyeler, cariId)) {
      faturaMap.set(ft.id, ft);
    }
  }

  const faturalarToDelete = [...faturaMap.values()];
  const faturaIds = new Set(faturalarToDelete.map((f) => f.id));
  const faturaNos = new Set(faturalarToDelete.map((f) => f.faturaNo).filter(Boolean));

  const cariIslemIdsToDelete = (input.cariIslemGecmisi || [])
    .filter((islem) => {
      if (cariId && islem.cariKartId && islem.cariKartId !== cariId) return false;
      const tip = String(islem.islemTipi || '').toLocaleUpperCase('tr-TR');
      if (!tip.includes('FATURA')) return false;
      if (islem.islemId && faturaIds.has(String(islem.islemId))) return true;
      if (islem.belgeNo && faturaNos.has(String(islem.belgeNo))) return true;
      const detay = String(islem.islemDetay || islem.islemBaslik || '');
      if (detay.includes('İrsaliyelerden Taslak Fatura') || detay.includes('irsaliye →')) {
        if (!cariId || islem.cariKartId === cariId) return true;
      }
      return false;
    })
    .map((x) => x.id);

  const ozet = [
    `Cari: ${cari?.unvan || SEKER_VIDANJOR_UNVAN}`,
    `Vidanjör irsaliye: ${vidanjorIrsaliyeler.length}`,
    `Faturaya bağlı irsaliye: ${linkedIrsaliyeler.length}`,
    `Silinecek taslak/bağlı fatura: ${faturalarToDelete.length}`,
    `Silinecek cari FATURA işlemi: ${cariIslemIdsToDelete.length}`,
  ].join(' · ');

  return {
    cari,
    vidanjorIrsaliyeler,
    linkedIrsaliyeler,
    faturalarToDelete,
    cariIslemIdsToDelete,
    ozet,
  };
}

export function applySekerVidanjorFaturaResetInMemory(input: {
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  cariIslemGecmisi: CariKartIslem[];
  plan: SekerFaturaResetPlan;
}): {
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  cariIslemGecmisi: CariKartIslem[];
} {
  const deleteFtIds = new Set(input.plan.faturalarToDelete.map((f) => f.id));
  const deleteFtNos = new Set(
    input.plan.faturalarToDelete.map((f) => f.faturaNo).filter(Boolean) as string[]
  );
  const linkedIrIds = new Set(input.plan.linkedIrsaliyeler.map((ir) => ir.id));
  const deleteIslemIds = new Set(input.plan.cariIslemIdsToDelete);

  const irsaliyeler = input.irsaliyeler.map((ir) => {
    if (!linkedIrIds.has(ir.id)) return ir;
    const { faturaNo: _drop, ...rest } = ir as Irsaliye & { faturaNo?: string };
    return { ...rest, faturaNo: undefined };
  });

  const faturalar = input.faturalar.filter((ft) => !deleteFtIds.has(ft.id));
  const cariIslemGecmisi = input.cariIslemGecmisi.filter((islem) => {
    if (deleteIslemIds.has(islem.id)) return false;
    if (islem.islemId && deleteFtIds.has(String(islem.islemId))) return false;
    if (islem.belgeNo && deleteFtNos.has(String(islem.belgeNo))) return false;
    return true;
  });

  return { irsaliyeler, faturalar, cariIslemGecmisi };
}
