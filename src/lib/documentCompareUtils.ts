import { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { CompareKalemRow, UserEditLog } from './documentCompareTypes';

export function buildCompareKalemRows(
  sa: SatinAlmaTalebi | undefined,
  irsaliyeler: Irsaliye[],
  fatura?: Fatura
): CompareKalemRow[] {
  const rows: CompareKalemRow[] = [];

  sa?.kalemler.forEach(k => {
    rows.push({
      id: `sa-${k.id}`,
      kaynak: 'SA',
      kaynakRef: sa.saId,
      urunAdi: k.urunAdi,
      miktar: k.miktar,
      birim: k.birim,
      selected: true,
      originalUrunAdi: k.urunAdi,
      originalMiktar: k.miktar,
      originalBirim: k.birim,
    });
  });

  irsaliyeler.forEach(ir => {
    ir.kalemler.forEach(k => {
      rows.push({
        id: `ir-${ir.id}-${k.id}`,
        kaynak: 'İRSALİYE',
        kaynakRef: ir.irsaliyeNo,
        urunAdi: k.urunAdi,
        miktar: k.miktar,
        birim: k.birim,
        selected: true,
        originalUrunAdi: k.urunAdi,
        originalMiktar: k.miktar,
        originalBirim: k.birim,
      });
    });
  });

  fatura?.kalemler.forEach(k => {
    rows.push({
      id: `ft-${k.id}`,
      kaynak: 'FATURA',
      kaynakRef: fatura.faturaNo,
      urunAdi: k.urunAdi,
      miktar: k.miktar,
      birim: k.birim,
      birimFiyat: k.birimFiyat,
      selected: true,
      originalUrunAdi: k.urunAdi,
      originalMiktar: k.miktar,
      originalBirim: k.birim,
    });
  });

  return rows;
}

export function collectUserEdits(rows: CompareKalemRow[]): UserEditLog[] {
  const edits: UserEditLog[] = [];
  for (const r of rows) {
    if (r.urunAdi !== r.originalUrunAdi) {
      edits.push({ kalemId: r.id, alan: 'urunAdi', eski: r.originalUrunAdi, yeni: r.urunAdi });
    }
    if (r.miktar !== r.originalMiktar) {
      edits.push({ kalemId: r.id, alan: 'miktar', eski: String(r.originalMiktar), yeni: String(r.miktar) });
    }
    if (r.birim !== r.originalBirim) {
      edits.push({ kalemId: r.id, alan: 'birim', eski: r.originalBirim, yeni: r.birim });
    }
  }
  return edits;
}

export function applyKalemRowsToPayload(
  sa: SatinAlmaTalebi | undefined,
  irsaliyeler: Irsaliye[],
  fatura: Fatura | undefined,
  rows: CompareKalemRow[]
) {
  const selected = rows.filter(r => r.selected);
  const saPayload = sa ? {
    ...sa,
    kalemler: sa.kalemler
      .filter(k => selected.some(r => r.id === `sa-${k.id}`))
      .map(k => {
        const row = selected.find(r => r.id === `sa-${k.id}`);
        return row ? { ...k, urunAdi: row.urunAdi, miktar: row.miktar, birim: row.birim } : k;
      }),
  } : undefined;

  const irPayload = irsaliyeler.map(ir => ({
    ...ir,
    kalemler: ir.kalemler
      .filter(k => selected.some(r => r.id === `ir-${ir.id}-${k.id}`))
      .map(k => {
        const row = selected.find(r => r.id === `ir-${ir.id}-${k.id}`);
        return row ? { ...k, urunAdi: row.urunAdi, miktar: row.miktar, birim: row.birim } : k;
      }),
  })).filter(ir => ir.kalemler.length > 0);

  const ftPayload = fatura ? {
    ...fatura,
    kalemler: fatura.kalemler
      .filter(k => selected.some(r => r.id === `ft-${k.id}`))
      .map(k => {
        const row = selected.find(r => r.id === `ft-${k.id}`);
        return row ? { ...k, urunAdi: row.urunAdi, miktar: row.miktar, birim: row.birim } : k;
      }),
  } : undefined;

  return { saPayload, irPayload, ftPayload };
}

export function loadComparisonReports(key: string) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveComparisonReports(key: string, reports: unknown[]) {
  localStorage.setItem(key, JSON.stringify(reports));
}

export function sendReportEmail(
  report: { status: string; report: string; faturaNo?: string; saId?: string } | string,
  subject: string
) {
  const text =
    typeof report === 'string'
      ? report
      : `Kibritçi İnşaat — ${subject}\n\nDurum: ${report.status}\n\n${report.report}\n\n---\nBu rapor ERP sisteminden gönderilmiştir.`;
  void import('./reportEmail').then(({ openReportEmailComposer }) => {
    openReportEmailComposer({
      subject,
      body: text,
      defaultTo: typeof report === 'string' ? '' : 'santiye@kibritci.com',
      fileName: `Kibritci_${subject.replace(/[^\w.\-]+/g, '_').slice(0, 40)}.txt`,
    });
  });
}
