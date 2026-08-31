import type { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';

export type EksikHalkaTip =
  | 'SA_IRSALIYESIZ'
  | 'IRSALIYE_SA_SIZ'
  | 'IRSALIYE_FATURASIZ'
  | 'FATURA_IRSALIYESIZ';

export type EksikHalkaSatir = {
  tip: EksikHalkaTip;
  id: string;
  kod: string;
  firma: string;
  tarih: string;
  detay: string;
  navigateTab: 'satin_alma' | 'irsaliye_giris' | 'fatura_giris';
};

function isReddedilmis(durum?: string | null): boolean {
  return String(durum || '').toLocaleUpperCase('tr-TR').includes('RED');
}

function isSaAktif(sa: SatinAlmaTalebi): boolean {
  if (sa.arsivde) return false;
  if (isReddedilmis(sa.onayDurumu)) return false;
  return true;
}

function isIrsaliyeAktif(ir: Irsaliye): boolean {
  if (ir.kaynak === 'MICIR_STABILIZE_FIS') return false;
  if (isReddedilmis(ir.onayDurumu)) return false;
  return true;
}

function isFaturaAktif(ft: Fatura): boolean {
  const d = String(ft.durum || '').toLocaleUpperCase('tr-TR');
  if (d.includes('RED') || d.includes('IPTAL') || d.includes('İPTAL')) return false;
  return true;
}

function daysSince(isoDate?: string | null): number {
  const raw = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  const then = new Date(`${raw}T12:00:00`).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}

function isSaOnayli(sa: SatinAlmaTalebi): boolean {
  const durum = String(sa.onayDurumu || '').toLocaleUpperCase('tr-TR');
  return (
    durum.includes('ONAYLANDI') ||
    durum.includes('ONAYLI') ||
    durum.includes('TAMAMLANDI') ||
    durum.includes('SEVK')
  );
}

/**
 * Salt okunur mutabakat — O(n) indeksli; ana iş parçacığını kilitlemez.
 */
export function listEksikHalka(input: {
  satinAlmaTalepleri?: SatinAlmaTalebi[];
  irsaliyeler?: Irsaliye[];
  faturalar?: Fatura[];
  saMinGun?: number;
  /** Liste üst sınırı (UI donmasın) */
  limit?: number;
}): EksikHalkaSatir[] {
  const saList = input.satinAlmaTalepleri || [];
  const irsList = input.irsaliyeler || [];
  const fatList = input.faturalar || [];
  const saMinGun = input.saMinGun ?? 1;
  const limit = input.limit ?? 80;
  const rows: EksikHalkaSatir[] = [];

  // saId → irsaliye var mı
  const irsBySaId = new Set<string>();
  // irsaliye id / no → fatura bağlı mı
  const faturaLinkedIrs = new Set<string>();
  const faturaNos = new Set<string>();

  for (const ft of fatList) {
    if (!isFaturaAktif(ft)) continue;
    if (ft.faturaNo) faturaNos.add(String(ft.faturaNo));
    for (const ref of ft.bagliIrsaliyeler || []) {
      if (ref) faturaLinkedIrs.add(String(ref));
    }
    if (ft.saId) {
      // SA üzerinden dolaylı bağ — irsaliye kontrolünde kullanılmaz
    }
  }

  const aktifIrs: Irsaliye[] = [];
  for (const ir of irsList) {
    if (!isIrsaliyeAktif(ir)) continue;
    aktifIrs.push(ir);
    if (ir.saId) irsBySaId.add(String(ir.saId));
  }

  for (const sa of saList) {
    if (rows.length >= limit) break;
    if (!isSaAktif(sa) || !isSaOnayli(sa)) continue;
    const saId = String(sa.saId || '');
    if (saId && irsBySaId.has(saId)) continue;
    if (daysSince(sa.tarih) < saMinGun) continue;
    rows.push({
      tip: 'SA_IRSALIYESIZ',
      id: sa.id,
      kod: sa.saId || sa.id,
      firma: sa.cariFirma || '—',
      tarih: sa.tarih || '',
      detay: `Onaylı sipariş · ${daysSince(sa.tarih)} gündür irsaliyesiz`,
      navigateTab: 'satin_alma',
    });
  }

  for (const ir of aktifIrs) {
    if (rows.length >= limit) break;
    const hasSa = Boolean(String(ir.saId || '').trim());
    if (!hasSa) {
      rows.push({
        tip: 'IRSALIYE_SA_SIZ',
        id: ir.id,
        kod: ir.irsaliyeNo || ir.id,
        firma: ir.firma || '—',
        tarih: ir.tarih || '',
        detay: 'Satın alma bağlantısı yok',
        navigateTab: 'irsaliye_giris',
      });
    }
    if (rows.length >= limit) break;

    const hasFatura =
      Boolean(String(ir.faturaNo || '').trim()) ||
      faturaLinkedIrs.has(String(ir.id)) ||
      (ir.irsaliyeNo ? faturaLinkedIrs.has(String(ir.irsaliyeNo)) : false) ||
      (ir.faturaNo ? faturaNos.has(String(ir.faturaNo)) : false);

    if (!hasFatura) {
      const gecikme = daysSince(ir.tarih);
      rows.push({
        tip: 'IRSALIYE_FATURASIZ',
        id: ir.id,
        kod: ir.irsaliyeNo || ir.id,
        firma: ir.firma || '—',
        tarih: ir.tarih || '',
        detay: gecikme >= 3 ? `Faturasız · ${gecikme} gün` : 'Fatura bağlantısı yok',
        navigateTab: 'irsaliye_giris',
      });
    }
  }

  // Fatura → irsaliye yok: bagli boş ve faturaNo ile irsaliye eşleşmiyor
  const irsFaturaNo = new Set(
    aktifIrs.map((ir) => String(ir.faturaNo || '').trim()).filter(Boolean)
  );
  const irsIds = new Set(aktifIrs.map((ir) => ir.id));
  const irsNos = new Set(aktifIrs.map((ir) => String(ir.irsaliyeNo || '')).filter(Boolean));

  for (const ft of fatList) {
    if (rows.length >= limit) break;
    if (!isFaturaAktif(ft)) continue;
    const bagli = ft.bagliIrsaliyeler || [];
    const hasLink =
      bagli.some((ref) => irsIds.has(ref) || irsNos.has(ref)) ||
      (ft.faturaNo ? irsFaturaNo.has(String(ft.faturaNo)) : false);
    if (!hasLink) {
      rows.push({
        tip: 'FATURA_IRSALIYESIZ',
        id: ft.id,
        kod: ft.faturaNo || ft.id,
        firma: ft.cariUnvan || '—',
        tarih: ft.tarih || '',
        detay: 'İrsaliye bağlantısı yok',
        navigateTab: 'fatura_giris',
      });
    }
  }

  const tipOrder: Record<EksikHalkaTip, number> = {
    SA_IRSALIYESIZ: 0,
    IRSALIYE_FATURASIZ: 1,
    IRSALIYE_SA_SIZ: 2,
    FATURA_IRSALIYESIZ: 3,
  };

  return rows.sort(
    (a, b) =>
      tipOrder[a.tip] - tipOrder[b.tip] ||
      String(b.tarih).localeCompare(String(a.tarih)) ||
      a.kod.localeCompare(b.kod, 'tr')
  );
}

export function summarizeEksikHalka(rows: EksikHalkaSatir[]): Record<EksikHalkaTip, number> & {
  toplam: number;
} {
  const base = {
    SA_IRSALIYESIZ: 0,
    IRSALIYE_SA_SIZ: 0,
    IRSALIYE_FATURASIZ: 0,
    FATURA_IRSALIYESIZ: 0,
    toplam: rows.length,
  };
  for (const r of rows) base[r.tip] += 1;
  return base;
}

export const EKSIK_HALKA_LABEL: Record<EksikHalkaTip, string> = {
  SA_IRSALIYESIZ: 'SA → irsaliye yok',
  IRSALIYE_SA_SIZ: 'İrsaliye → SA yok',
  IRSALIYE_FATURASIZ: 'İrsaliye → fatura yok',
  FATURA_IRSALIYESIZ: 'Fatura → irsaliye yok',
};
