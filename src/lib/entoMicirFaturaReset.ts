/**
 * Ento Maden / mıcır-stabilize — irsaliye→taslak fatura bağlarını sıfırla (mutabakat öncesi).
 */
import type { CariKart, CariKartIslem, Fatura, Irsaliye } from '../types/erp';
import { findFaturalarForIrsaliye } from './evrakDonusum';
import { findEntoMadenCari, isEntoMadenFirma, ENTO_MADEN_UNVAN } from './micirUtils';

export type EntoMicirFaturaResetPlan = {
  cari: CariKart | null;
  micirIrsaliyeler: Irsaliye[];
  linkedIrsaliyeler: Irsaliye[];
  faturalarToDelete: Fatura[];
  cariIslemIdsToDelete: string[];
  ozet: string;
};

function isMicirIrsaliye(ir: Irsaliye): boolean {
  if (ir.kaynak === 'MICIR_STABILIZE_FIS' || ir.micirFisId) return true;
  if (!isEntoMadenFirma(ir.firma)) return false;
  if (ir.malzemeTipi) return true;
  if (Number(ir.tonaj) > 0 || Number(ir.kiloKg) > 0) return true;
  return (ir.kalemler || []).some((k) => {
    const ad = String(k.urunAdi || '').toLocaleUpperCase('tr-TR');
    return (
      ad.includes('MICIR') ||
      ad.includes('STABIL') ||
      (ad.includes('TAS') && ad.includes('TOZ')) ||
      ad.includes('KIRMATA')
    );
  });
}

function faturaTargetsMicir(ft: Fatura, micirIrs: Irsaliye[], cariId?: string): boolean {
  const ids = new Set(micirIrs.map((ir) => ir.id));
  const nos = new Set(micirIrs.map((ir) => ir.irsaliyeNo).filter(Boolean));
  const bagli = ft.bagliIrsaliyeler || [];
  if (bagli.some((ref) => ids.has(ref) || nos.has(ref))) return true;
  if (ft.donusumKaynagi === 'IR_FATURA' && isEntoMadenFirma(ft.cariUnvan)) return true;
  if (cariId && ft.cariKartId === cariId && ft.donusumKaynagi === 'IR_FATURA') return true;
  return micirIrs.some((ir) => ir.faturaNo && ir.faturaNo === ft.faturaNo);
}

export function planEntoMicirFaturaReset(input: {
  cariKartlar: CariKart[];
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  cariIslemGecmisi?: CariKartIslem[];
  cariKartId?: string;
}): EntoMicirFaturaResetPlan {
  const cari =
    (input.cariKartId
      ? input.cariKartlar.find((c) => c.id === input.cariKartId)
      : undefined) ||
    findEntoMadenCari(input.cariKartlar) ||
    null;

  const cariId = cari?.id;
  const micirIrsaliyeler = (input.irsaliyeler || []).filter((ir) => {
    if (!isMicirIrsaliye(ir)) return false;
    if (cariId && ir.cariKartId && ir.cariKartId !== cariId) return false;
    if (cariId && !ir.cariKartId && !isEntoMadenFirma(ir.firma)) return false;
    if (!cariId && !isEntoMadenFirma(ir.firma) && ir.kaynak !== 'MICIR_STABILIZE_FIS') return false;
    return true;
  });

  const linkedIrsaliyeler = micirIrsaliyeler.filter((ir) => {
    if (ir.faturaNo) return true;
    return findFaturalarForIrsaliye(ir, input.faturalar || []).length > 0;
  });

  const faturaMap = new Map<string, Fatura>();
  for (const ir of linkedIrsaliyeler) {
    for (const ft of findFaturalarForIrsaliye(ir, input.faturalar || [])) {
      if (faturaTargetsMicir(ft, micirIrsaliyeler, cariId)) faturaMap.set(ft.id, ft);
    }
  }
  for (const ft of input.faturalar || []) {
    if (faturaTargetsMicir(ft, micirIrsaliyeler, cariId)) faturaMap.set(ft.id, ft);
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
    `Cari: ${cari?.unvan || ENTO_MADEN_UNVAN}`,
    `Mıcır/Stabilize irsaliye: ${micirIrsaliyeler.length}`,
    `Faturaya bağlı irsaliye: ${linkedIrsaliyeler.length}`,
    `Silinecek taslak/bağlı fatura: ${faturalarToDelete.length}`,
    `Silinecek cari FATURA işlemi: ${cariIslemIdsToDelete.length}`,
  ].join(' · ');

  return {
    cari,
    micirIrsaliyeler,
    linkedIrsaliyeler,
    faturalarToDelete,
    cariIslemIdsToDelete,
    ozet,
  };
}

export function applyEntoMicirFaturaResetInMemory(input: {
  irsaliyeler: Irsaliye[];
  faturalar: Fatura[];
  cariIslemGecmisi: CariKartIslem[];
  plan: EntoMicirFaturaResetPlan;
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
