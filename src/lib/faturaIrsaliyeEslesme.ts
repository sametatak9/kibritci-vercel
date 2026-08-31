import type { Fatura, Irsaliye } from '../types/erp';
import { findCariMatch, normalizeMatchText } from './evrakBatchImportUtils';
import { findFaturalarForIrsaliye } from './evrakDonusum';
import type { CariKart } from '../types/erp';

export type IrsaliyeEslesme = {
  irsaliye: Irsaliye;
  skor: number;
  neden: 'AYNI_CARI' | 'UNVAN_TAM' | 'UNVAN_ICERIR' | 'UNVAN_YAKIN';
};

function unvanSkoru(faturaUnvan: string, irsaliyeFirma: string): { skor: number; neden: IrsaliyeEslesme['neden'] } | null {
  const a = normalizeMatchText(faturaUnvan);
  const b = normalizeMatchText(irsaliyeFirma);
  if (!a || !b) return null;
  if (a === b) return { skor: 100, neden: 'UNVAN_TAM' };
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return { skor: Math.round(70 + ratio * 20), neden: 'UNVAN_ICERIR' };
  }
  const tokensA = new Set(a.split(' ').filter((t) => t.length > 2));
  const tokensB = b.split(' ').filter((t) => t.length > 2);
  const overlap = tokensB.filter((t) => tokensA.has(t)).length;
  if (overlap >= 1) return { skor: 40 + overlap * 10, neden: 'UNVAN_YAKIN' };
  return null;
}

/** Fatura ünvanına göre faturasız irsaliye adayları (akıllı eşleştirme). */
export function suggestIrsaliyelerForFaturaUnvan(
  faturaUnvan: string,
  irsaliyeler: Irsaliye[],
  faturalar: Fatura[],
  cariKartlar: CariKart[] = []
): IrsaliyeEslesme[] {
  const unvan = String(faturaUnvan || '').trim();
  if (!unvan) return [];
  const cari = findCariMatch(unvan, cariKartlar);
  const out: IrsaliyeEslesme[] = [];

  for (const ir of irsaliyeler || []) {
    if (ir.kaynak === 'MICIR_STABILIZE_FIS') continue;
    if (String(ir.onayDurumu || '').includes('RED')) continue;
    if (ir.faturaNo) continue;
    if (findFaturalarForIrsaliye(ir, faturalar).length > 0) continue;

    if (cari && ir.cariKartId && ir.cariKartId === cari.id) {
      out.push({ irsaliye: ir, skor: 95, neden: 'AYNI_CARI' });
      continue;
    }
    const hit = unvanSkoru(unvan, ir.firma || '');
    if (hit) out.push({ irsaliye: ir, skor: hit.skor, neden: hit.neden });
  }

  return out.sort((a, b) => b.skor - a.skor || String(b.irsaliye.tarih).localeCompare(String(a.irsaliye.tarih)));
}

export function eslesmeNedenLabel(neden: IrsaliyeEslesme['neden']): string {
  switch (neden) {
    case 'AYNI_CARI':
      return 'Aynı cari kart';
    case 'UNVAN_TAM':
      return 'Ünvan birebir';
    case 'UNVAN_ICERIR':
      return 'Ünvan içerir';
    case 'UNVAN_YAKIN':
      return 'Yakın ünvan';
    default:
      return 'Eşleşme';
  }
}
