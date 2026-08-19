import {
  buildKibritciReportHtml,
  downloadKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl, loadKibritciReportAssets, type KibritciReportAssets } from './kibritciBrand';
import { createExcelWorkbook } from './exceljsLoader';
import { computeMalzemeOzet, malzemeOzetHtml, writeMalzemeOzetSheetContent, type MalzemeOzetKalem } from './malzemeTonajOzet';

export type ReportExportFormat = 'html' | 'csv' | 'txt' | 'xlsx';

export interface HistoryLogKalemRow {
  urunAdi: string;
  miktar?: number | string;
  birim?: string;
  birimFiyat?: number;
  toplam?: number;
}

export interface HistoryLogRow {
  date: string;
  type: string;
  title: string;
  desc: string;
  kalemler?: HistoryLogKalemRow[];
  malzemeTipi?: string | null;
  miktar?: number;
  birim?: string;
  plaka?: string;
}

const fmtTutar = (n?: number): string =>
  n != null && !Number.isNaN(Number(n)) ? `₺${Number(n).toLocaleString('tr-TR')}` : '';

function historyLogTon(log: HistoryLogRow): number {
  const birim = String(log.birim || '').toLocaleLowerCase('tr-TR');
  if (birim === 'ton' || birim === 'tonaj') return Number(log.miktar) || 0;
  return 0;
}

function historyLogsToOzetKalemler(logs: HistoryLogRow[]): MalzemeOzetKalem[] {
  return logs.map((log) => ({
    tip: log.malzemeTipi ?? 'DIGER',
    ton: historyLogTon(log),
    kg: historyLogTon(log) * 1000,
    plaka: log.plaka,
    tarih: log.date,
    evrakTipi: log.type,
  }));
}

export function escapeCsvCell(value: string): string {
  const v = String(value ?? '').replace(/"/g, '""');
  return /[",\n\r]/.test(v) ? `"${v}"` : v;
}

export function downloadCsv(rows: string[][], fileName: string): void {
  const bom = '\uFEFF';
  const body = rows.map((r) => r.map(escapeCsvCell).join(';')).join('\r\n');
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPlainText(lines: string[], fileName: string): void {
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildHistoryTableHtml(options: {
  title: string;
  subtitle?: string;
  meta?: string[];
  logs: HistoryLogRow[];
  assets?: KibritciReportAssets;
}): string {
  const rows = options.logs
    .map((log) => {
      const kalemHtml =
        log.kalemler && log.kalemler.length
          ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:11px">
              <thead><tr style="background:#f8fafc">
                <th style="padding:4px 6px;text-align:left;border:1px solid #e2e8f0">Ürün / Kalem</th>
                <th style="padding:4px 6px;text-align:right;border:1px solid #e2e8f0">Miktar</th>
                <th style="padding:4px 6px;text-align:right;border:1px solid #e2e8f0">Birim Fiyat</th>
                <th style="padding:4px 6px;text-align:right;border:1px solid #e2e8f0">Toplam</th>
              </tr></thead>
              <tbody>${log.kalemler
                .map(
                  (k) =>
                    `<tr><td style="padding:4px 6px;border:1px solid #e2e8f0">${k.urunAdi || '-'}</td><td style="padding:4px 6px;text-align:right;border:1px solid #e2e8f0">${k.miktar ?? ''} ${k.birim || ''}</td><td style="padding:4px 6px;text-align:right;border:1px solid #e2e8f0">${fmtTutar(k.birimFiyat)}</td><td style="padding:4px 6px;text-align:right;border:1px solid #e2e8f0">${fmtTutar(k.toplam)}</td></tr>`
                )
                .join('')}</tbody>
            </table>`
          : '';
      return `<tr><td style="padding:8px;vertical-align:top">${log.date}</td><td style="padding:8px;vertical-align:top">${log.type}</td><td style="padding:8px"><strong>${log.title}</strong><br/><span style="color:#64748b;font-size:11px">${log.desc}</span>${kalemHtml}</td></tr>`;
    })
    .join('');
  const ozetHtml = malzemeOzetHtml(computeMalzemeOzet(historyLogsToOzetKalemler(options.logs)));
  const bodyHtml = `${ozetHtml}<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">Tarih</th><th style="padding:8px;text-align:left">Tip</th><th style="padding:8px;text-align:left">Detay</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  return buildKibritciReportHtml({
    title: options.title,
    subtitle: options.subtitle,
    meta: options.meta,
    bodyHtml,
    assets: options.assets,
  });
}

export async function exportHistoryReport(options: {
  title: string;
  fileBase: string;
  meta: string[];
  logs: HistoryLogRow[];
  format: ReportExportFormat;
}): Promise<void> {
  if (options.logs.length === 0) {
    alert('İndirilecek kayıt bulunmamaktadır.');
    return;
  }

  if (options.format === 'csv') {
    const csvRows: string[][] = [
      ['Tarih', 'Tip', 'Belge / Başlık', 'Ürün / Kalem', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam'],
    ];
    for (const l of options.logs) {
      if (l.kalemler && l.kalemler.length) {
        for (const k of l.kalemler) {
          csvRows.push([
            l.date,
            l.type,
            l.title,
            k.urunAdi || '',
            k.miktar != null ? String(k.miktar) : '',
            k.birim || '',
            k.birimFiyat != null ? String(k.birimFiyat) : '',
            k.toplam != null ? String(k.toplam) : '',
          ]);
        }
      } else {
        csvRows.push([l.date, l.type, l.title, l.desc, '', '', '', '']);
      }
    }
    downloadCsv(csvRows, `${options.fileBase}.csv`);
    return;
  }

  if (options.format === 'xlsx') {
    await exportHistoryExcelWorkbook(options);
    return;
  }

  if (options.format === 'html') {
    // Görselleri base64 gömerek indirilen HTML'de de antet/logo/filigranın görünmesini sağla
    const assets = await loadKibritciReportAssets();
    const html = buildHistoryTableHtml({
      title: options.title,
      meta: options.meta,
      logs: options.logs,
      assets,
    });
    downloadKibritciReportHtml(html, `${options.fileBase}.html`);
    return;
  }

  downloadPlainText(
    [
      options.title,
      ...options.meta,
      '---------------------------------------------',
      ...options.logs.flatMap((l, i) => {
        const base = `[${i + 1}] ${l.date} | ${l.type}\n    ${l.title}\n    ${l.desc}`;
        if (l.kalemler && l.kalemler.length) {
          return [
            base,
            ...l.kalemler.map(
              (k) =>
                `        - ${k.urunAdi} · ${k.miktar ?? ''} ${k.birim || ''}`.trimEnd() +
                (k.birimFiyat != null ? ` × ${fmtTutar(k.birimFiyat)}` : '') +
                (k.toplam != null ? ` = ${fmtTutar(k.toplam)}` : '')
            ),
          ];
        }
        return [base];
      }),
    ],
    `${options.fileBase}.txt`
  );
}

async function exportHistoryExcelWorkbook(options: {
  title: string;
  fileBase: string;
  meta: string[];
  logs: HistoryLogRow[];
}): Promise<void> {
  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.created = new Date();

  const malzemeOzet = computeMalzemeOzet(historyLogsToOzetKalemler(options.logs));
  const ozetWs = wb.addWorksheet('ÖZET', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ozetWs.columns = Array.from({ length: 9 }, () => ({ width: 16 }));
  ozetWs.getCell(1, 1).value = options.title;
  ozetWs.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  ozetWs.mergeCells(1, 1, 1, 9);
  ozetWs.getCell(2, 1).value = `${options.logs.length} kayıt  ·  ${new Date().toLocaleString('tr-TR')}`;
  ozetWs.getCell(2, 1).font = { size: 9, color: { argb: 'FF64748B' } };
  ozetWs.mergeCells(2, 1, 2, 9);
  let ozetRow = 4;
  for (const line of options.meta) {
    ozetWs.mergeCells(ozetRow, 1, ozetRow, 9);
    ozetWs.getCell(ozetRow, 1).value = line;
    ozetWs.getCell(ozetRow, 1).font = { size: 9, color: { argb: 'FF334155' } };
    ozetRow += 1;
  }
  ozetRow += 1;
  const irsaliyeAdet = options.logs.filter((l) => String(l.type || '').toLocaleUpperCase('tr-TR').includes('İRSALİYE')).length;
  writeMalzemeOzetSheetContent(ozetWs, malzemeOzet, ozetRow, {
    kayitAdet: options.logs.length,
    irsaliyeAdet,
  });

  const ws = wb.addWorksheet('KAYITLAR', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [
    { width: 5 },
    { width: 14 },
    { width: 18 },
    { width: 36 },
    { width: 48 },
    { width: 28 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
  ];

  ws.getRow(1).height = 58;
  ws.mergeCells(1, 1, 2, 3);
  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 168, height: 64 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  }
  ws.mergeCells(1, 4, 1, 10);
  ws.getCell(1, 4).value = options.title;
  ws.getCell(1, 4).font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  ws.getCell(1, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.mergeCells(2, 4, 2, 10);
  ws.getCell(2, 4).value = `${options.logs.length} kayıt  ·  ${new Date().toLocaleString('tr-TR')}`;
  ws.getCell(2, 4).font = { size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(2, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.mergeCells(3, 1, 3, 10);
  ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getRow(3).height = 4;
  ws.mergeCells(4, 1, 4, 10);
  ws.getCell(4, 1).value = KIBRITCI_COMPANY.legalName;
  ws.getCell(4, 1).font = { bold: true, size: 8, color: { argb: 'FF334155' } };
  ws.mergeCells(5, 1, 5, 10);
  ws.getCell(5, 1).value = `${KIBRITCI_COMPANY.address}  ·  ${KIBRITCI_COMPANY.phone}  ·  ${KIBRITCI_COMPANY.email}`;
  ws.getCell(5, 1).font = { size: 7, color: { argb: 'FF64748B' } };
  let row = 7;
  for (const line of options.meta) {
    ws.mergeCells(row, 1, row, 10);
    ws.getCell(row, 1).value = line;
    ws.getCell(row, 1).font = { size: 9, color: { argb: 'FF334155' } };
    row += 1;
  }
  row += 1;
  const headers = [
    '#',
    'Tarih',
    'Tip',
    'Belge / Başlık',
    'Açıklama',
    'Ürün / Kalem',
    'Miktar',
    'Birim',
    'Birim Fiyat',
    'Toplam',
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  });
  const headerRow = row;
  row += 1;
  let n = 0;
  for (const log of options.logs) {
    const kalemler = log.kalemler?.length ? log.kalemler : [{ urunAdi: '' }];
    for (const k of kalemler) {
      n += 1;
      const vals = [
        n,
        log.date,
        log.type,
        log.title,
        log.desc,
        k.urunAdi || '',
        k.miktar != null ? String(k.miktar) : '',
        k.birim || '',
        k.birimFiyat != null ? String(k.birimFiyat) : '',
        k.toplam != null ? String(k.toplam) : '',
      ];
      vals.forEach((v, i) => {
        const c = ws.getCell(row, i + 1);
        c.value = v;
        c.font = { size: 8 };
        if (n % 2 === 0) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
      row += 1;
    }
  }
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(headerRow, row - 1), column: headers.length },
  };
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.fileBase}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return String(value ?? '').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
}

function buildPersonelTableHtml(
  rows: Record<string, string>[],
  columns: { key: string; label: string }[]
): string {
  const head = columns.map((c) => `<th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;background:#f8fafc;color:#0f172a">${escapeHtml(c.label)}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td style="padding:9px 8px;border:1px solid #e2e8f0;vertical-align:top">${escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px">` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildGroupedPersonelHtml(
  rows: Record<string, string>[],
  columns: { key: string; label: string }[],
  groupByFirma: boolean,
  groupByRole: boolean
): string {
  if (!groupByFirma) {
    return buildPersonelTableHtml(rows, columns);
  }

  const firmaKey = columns.find((c) => c.key === 'firmaAdi')?.key;
  const roleKey = columns.find((c) => c.key === 'gorev')?.key;
  if (!firmaKey) {
    return buildPersonelTableHtml(rows, columns);
  }

  const firms = rows.reduce<Record<string, Record<string, Record<string, string>[]>>>(
    (acc, row) => {
      const firma = row[firmaKey] || 'Firma Bilgisi Yok';
      const gorev = (groupByRole && roleKey ? row[roleKey] : 'Personel') || 'Diğer';
      acc[firma] = acc[firma] || {};
      acc[firma][gorev] = acc[firma][gorev] || [];
      acc[firma][gorev].push(row);
      return acc;
    },
    {}
  );

  const groupHtml = Object.keys(firms)
    .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
    .map((firma) => {
      const subgroups = firms[firma];
      const counts = Object.values(subgroups).reduce((sum, arr) => sum + arr.length, 0);
      const sections = Object.keys(subgroups)
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
        .map((gorev) => {
          const groupRows = subgroups[gorev];
          const rowsHtml = groupRows
            .map(
              (r) =>
                `<tr>${columns.map((c) => `<td style="padding:9px 8px;border:1px solid #e2e8f0;vertical-align:top">${escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`
            )
            .join('');
          return `
            <tr style="background:#eff6ff">
              <td colspan="${columns.length}" style="padding:10px 12px;font-weight:700;color:#1d4ed8;border:1px solid #e2e8f0">${escapeHtml(gorev)} · ${groupRows.length} kişi</td>
            </tr>
            ${rowsHtml}`;
        })
        .join('');

      const head = columns.map((c) => `<th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;background:#f8fafc;color:#0f172a">${escapeHtml(c.label)}</th>`).join('');
      return `
        <section style="margin-bottom:32px">
          <div style="padding:16px 18px;border:1px solid #c7d2fe;border-radius:14px;background:#eff6ff;margin-bottom:14px">
            <div style="font-size:15px;font-weight:800;color:#1e3a8a;margin-bottom:4px">Firma: ${escapeHtml(firma)}</div>
            <div style="font-size:12px;color:#334155">${counts} personel · ${Object.keys(subgroups).length} görev grubu</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">` +
          `<thead><tr>${head}</tr></thead><tbody>${sections}</tbody></table>
        </section>`;
    })
    .join('');

  return groupHtml;
}

export function exportPersonelRows(
  rows: Record<string, string>[],
  columns: { key: string; label: string }[],
  fileName: string,
  format: 'html' | 'csv',
  options?: {
    title?: string;
    subtitle?: string;
    meta?: string[];
    groupByFirma?: boolean;
    groupByRole?: boolean;
  }
): void {
  if (rows.length === 0) {
    alert('Dışa aktarılacak personel seçilmedi.');
    return;
  }

  if (format === 'csv') {
    downloadCsv(
      [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r[c.key] ?? ''))],
      fileName
    );
    return;
  }

  const bodyHtml = buildGroupedPersonelHtml(
    rows,
    columns,
    Boolean(options?.groupByFirma),
    Boolean(options?.groupByRole)
  );
  const html = buildKibritciReportHtml({
    title: options?.title || 'Personel Dışa Aktarım',
    subtitle: options?.subtitle,
    meta: options?.meta,
    bodyHtml,
  });
  downloadKibritciReportHtml(html, fileName.endsWith('.html') ? fileName : `${fileName}.html`);
}

export { openKibritciReportPrint, downloadKibritciReportHtml };
