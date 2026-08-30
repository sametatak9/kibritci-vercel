import { Irsaliye, Fatura } from '../types/erp';

/** bagliIrsaliyeler eski kayıtlarda irsaliyeNo, yenilerde id tutulabilir */
export function irsaliyeMatchesRef(ir: Irsaliye, ref: string): boolean {
  if (!ref) return false;
  return ir.id === ref || ir.irsaliyeNo === ref;
}

export function filterLinkedIrsaliyeler(irsaliyeler: Irsaliye[], refs: string[]): Irsaliye[] {
  if (!refs?.length) return [];
  return irsaliyeler.filter(ir => refs.some(ref => irsaliyeMatchesRef(ir, ref)));
}

export function faturaIsLinked(ft: Fatura): boolean {
  return Boolean(ft.saId) || (ft.bagliIrsaliyeler?.length ?? 0) > 0;
}

/** İrsaliye seçildiğinde PO otomatik bağlansın (irsaliyede saId varsa) */
export function resolveSaIdFromIrsaliyeler(
  irsaliyeler: Irsaliye[],
  selectedIrsIds: string[],
  currentSaId?: string
): string | undefined {
  if (currentSaId) return currentSaId;
  const linked = filterLinkedIrsaliyeler(irsaliyeler, selectedIrsIds);
  const withSa = linked.find(ir => ir.saId);
  return withSa?.saId;
}
