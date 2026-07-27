import {
  buildKibritciReportHtml,
  downloadKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';

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
  });
}

export function exportHistoryReport(options: {
  title: string;
  fileBase: string;
  meta: string[];
  logs: HistoryLogRow[];
  format: ReportExportFormat;
}): void {
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
    const html = buildHistoryTableHtml({
      title: options.title,
      meta: options.meta,
      logs: options.logs,
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

export function exportPersonelRows(
  rows: Record<string, string>[],
  columns: { key: string; label: string }[],
  fileName: string,
  format: 'html' | 'csv'
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

  const head = columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td>${String(r[c.key] ?? '').replace(/</g, '&lt;')}</td>`).join('')}</tr>`
    )
    .join('');
  const html = buildKibritciReportHtml({
    title: 'Personel Dışa Aktarım',
    bodyHtml: `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#f1f5f9">${head}</tr></thead><tbody>${body}</tbody></table>`,
  });
  downloadKibritciReportHtml(html, fileName.endsWith('.html') ? fileName : `${fileName}.html`);
}

export { openKibritciReportPrint, downloadKibritciReportHtml };
