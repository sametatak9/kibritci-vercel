/**
 * Evrak zinciri görsel işaretleri (SA → İrsaliye → Fatura).
 * Mevcut soft-link alanlarından (saId, bagliIrsaliyeler, kaynak) türetilir;
 * yeni kayıtlarda donusumKaynagi tercih edilir.
 */

export type EvrakDonusumKaynagi =
  | 'SA_DONUSUM'
  | 'KAPI_SA_ESLESME'
  | 'KAPI_EVRAK'
  | 'IR_FATURA'
  | 'MANUEL_BAGLAMA'
  | 'ARSIV';

export type ProvenanceBadge = {
  kind: EvrakDonusumKaynagi | 'IR_SA' | 'FT_ZINCIR' | 'BAGIMSIZ';
  label: string;
  /** Tailwind sınıfları */
  className: string;
  title?: string;
};

const BADGE_BASE =
  'text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded w-fit border';

export function resolveIrsaliyeProvenance(ir: {
  saId?: string | null;
  faturaNo?: string | null;
  kaynak?: string | null;
  donusumKaynagi?: string | null;
  guvenlikEvrakId?: string | null;
}): ProvenanceBadge[] {
  const out: ProvenanceBadge[] = [];
  const kaynak = String(ir.donusumKaynagi || ir.kaynak || '').trim();
  const saId = String(ir.saId || '').trim();
  const hasFatura = Boolean(String(ir.faturaNo || '').trim());

  if (kaynak === 'SA_DONUSUM' || (saId && !kaynak.startsWith('KAPI') && !ir.guvenlikEvrakId)) {
    out.push({
      kind: 'SA_DONUSUM',
      label: `SA → İrsaliye${saId ? ` · ${saId}` : ''}`,
      className: `${BADGE_BASE} bg-violet-50 text-violet-800 border-violet-200`,
      title: 'Satın alma talebinden dönüştürüldü — karşılaştırma zincirinde',
    });
  } else if (saId && (kaynak === 'KAPI_SA_ESLESME' || kaynak === 'KAPI_EVRAK' || ir.guvenlikEvrakId)) {
    out.push({
      kind: 'KAPI_SA_ESLESME',
      label: `Kapı ↔ SA · ${saId}`,
      className: `${BADGE_BASE} bg-teal-50 text-teal-800 border-teal-200`,
      title: 'Kapı evrakı satın alma ile eşleştirildi',
    });
  } else if (saId) {
    out.push({
      kind: 'IR_SA',
      label: `SA bağlı · ${saId}`,
      className: `${BADGE_BASE} bg-violet-50 text-violet-700 border-violet-200`,
      title: 'Satın alma bağlantısı var',
    });
  }

  if (hasFatura) {
    out.push({
      kind: 'IR_FATURA',
      label: '→ Fatura',
      className: `${BADGE_BASE} bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200`,
      title: 'Faturaya dönüştürülmüş / bağlı',
    });
  }

  if (
    !saId &&
    (kaynak === 'KAPI_EVRAK' || ir.guvenlikEvrakId) &&
    out.length === 0
  ) {
    out.push({
      kind: 'KAPI_EVRAK',
      label: 'Kapı · arşiv/doğrudan',
      className: `${BADGE_BASE} bg-slate-100 text-slate-600 border-slate-200`,
      title: 'SA eşleşmesi yok — arşiv / doğrudan sevk',
    });
  }

  if (out.length === 0) {
    out.push({
      kind: 'BAGIMSIZ',
      label: 'Bağımsız',
      className: `${BADGE_BASE} bg-slate-50 text-slate-500 border-slate-200`,
      title: 'Zincir bağlantısı yok',
    });
  }

  return out;
}

export function resolveFaturaProvenance(ft: {
  saId?: string | null;
  bagliIrsaliyeler?: string[] | null;
  donusumKaynagi?: string | null;
}): ProvenanceBadge[] {
  const out: ProvenanceBadge[] = [];
  const saId = String(ft.saId || '').trim();
  const bagli = ft.bagliIrsaliyeler || [];
  const kaynak = String(ft.donusumKaynagi || '').trim();

  if (kaynak === 'IR_FATURA' || bagli.length > 0) {
    out.push({
      kind: 'IR_FATURA',
      label: bagli.length > 1 ? `İrsaliye → Fatura (${bagli.length})` : 'İrsaliye → Fatura',
      className: `${BADGE_BASE} bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200`,
      title: 'Sevk irsaliyesinden mali faturaya dönüşüm',
    });
  }

  if (saId) {
    out.push({
      kind: 'SA_DONUSUM',
      label: `SA · ${saId}`,
      className: `${BADGE_BASE} bg-violet-50 text-violet-800 border-violet-200`,
      title: 'Satın alma zincirinde',
    });
  }

  if (out.length === 0) {
    out.push({
      kind: 'ARSIV',
      label: 'Arşiv / bağımsız',
      className: `${BADGE_BASE} bg-slate-100 text-slate-600 border-slate-200`,
      title: 'Karşılaştırılacak SA/irsaliye bağı yok — arşiv',
    });
  } else if (bagli.length > 0 || saId) {
    out.push({
      kind: 'FT_ZINCIR',
      label: 'Karşılaştırma',
      className: `${BADGE_BASE} bg-emerald-50 text-emerald-800 border-emerald-200`,
      title: 'Eşleşmeli zincir — mutabakat için',
    });
  }

  return out;
}

export function resolveGuvenlikEvrakProvenance(e: {
  saId?: string | null;
  irsaliyeId?: string | null;
  islenenEvrakTuru?: string | null;
  durum?: string | null;
  evrakTuru?: string | null;
}): ProvenanceBadge[] {
  const out: ProvenanceBadge[] = [];
  const saId = String(e.saId || '').trim();
  const processed = String(e.islenenEvrakTuru || '').trim();
  const onayli = e.durum === 'ONAYLANDI';

  if (saId) {
    out.push({
      kind: 'KAPI_SA_ESLESME',
      label: `SA eşleşti · ${saId}`,
      className: `${BADGE_BASE} bg-teal-50 text-teal-800 border-teal-200`,
      title: 'Satın alma ile akıllı eşleşme',
    });
  }

  if (onayli && (processed === 'İRSALİYE' || e.irsaliyeId)) {
    out.push({
      kind: 'SA_DONUSUM',
      label: saId ? 'İşlendi → İrsaliye' : 'İşlendi · doğrudan irsaliye',
      className: `${BADGE_BASE} bg-amber-50 text-amber-800 border-amber-200`,
      title: saId
        ? 'Yönetici onayladı — SA bağlı irsaliye'
        : 'Yönetici onayladı — SA’sız doğrudan sevk',
    });
  } else if (onayli && processed === 'FATURA') {
    out.push({
      kind: 'IR_FATURA',
      label: 'İşlendi → Fatura',
      className: `${BADGE_BASE} bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200`,
    });
  } else if (onayli && !saId) {
    out.push({
      kind: 'ARSIV',
      label: 'Arşiv',
      className: `${BADGE_BASE} bg-slate-100 text-slate-600 border-slate-200`,
      title: 'Karşılaştırma yok — arşiv kaydı',
    });
  }

  return out;
}
