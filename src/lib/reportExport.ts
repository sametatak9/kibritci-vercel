import {
  buildKibritciReportHtml,
  downloadKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';
import { loadKibritciReportAssets, type KibritciReportAssets } from './kibritciBrand';

export type ReportExportFormat = 'html' | 'csv' | 'txt';

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
}

const fmtTutar = (n?: number): string =>
  n != null && !Number.isNaN(Number(n)) ? `₺${Number(n).toLocaleString('tr-TR')}` : '';

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
  const bodyHtml = `<table style="width:100%;border-collapse:collapse;font-size:12px">
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
