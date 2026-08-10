import type { Personel } from '../types/erp';
import type { Workbook, Worksheet } from 'exceljs';
import { groupPersonelByGorev } from './anaFirmaGorevPersonelRapor';
import { displayPersonelGorev } from './guvenlikHelpers';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import {
  buildKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';
import { firmaAnahtar } from './taseronUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  canonicalizeAnaFirmaAdi,
  isTaseronPersonel,
} from './yoklamaUtils';

const LIGHT = {
  title: 'FF0F172A',
  meta: 'FF64748B',
  accentBar: 'FF99F6E4',
  tableHeadBg: 'FFF1F5F9',
  tableHeadText: 'FF334155',
  firmaBannerBg: 'FFEFF6FF',
  firmaBannerText: 'FF1E40AF',
  gorevBannerBg: 'FFECFDF5',
  gorevBannerText: 'FF065F46',
  rowAlt: 'FFF8FAFC',
  border: 'FFE2E8F0',
  mykVar: 'FFDCFCE7',
  mykVarText: 'FF166534',
  mykYok: 'FFE2E8F0',
  mykYokText: 'FF334155',
  mykUnknown: 'FFFEF3C7',
  mykUnknownText: 'FF92400E',
} as const;

const esc = (value: string | number | boolean | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function isAktif(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

function firmaLabel(p: Personel): string {
  if (isTaseronPersonel(p)) {
    return String(p.firmaAdi || '').trim() || '— Taşeron Firma Belirtilmemiş —';
  }
  return canonicalizeAnaFirmaAdi(p.firmaAdi);
}

function mykLabel(p: Personel): string {
  const v = p.mykDurumu || 'BILINMIYOR';
  if (v === 'VAR') return 'VAR';
  if (v === 'YOK') return 'YOK';
  return '?';
}

function mykHtmlTone(p: Personel): { bg: string; color: string } {
  const v = p.mykDurumu || 'BILINMIYOR';
  if (v === 'VAR') return { bg: '#dcfce7', color: '#166534' };
  if (v === 'YOK') return { bg: '#e2e8f0', color: '#334155' };
  return { bg: '#fef3c7', color: '#92400e' };
}

export type MykFirmaGorevGroup = {
  firmaAdi: string;
  gorevGroups: ReturnType<typeof groupPersonelByGorev>;
  personelSayisi: number;
};

export function collectMykYoklamaPersoneller(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): Personel[] {
  return personeller
    .filter((p) => (options?.onlyActive !== false ? isAktif(p) : true))
    .sort((a, b) => {
      const firma = firmaLabel(a).localeCompare(firmaLabel(b), 'tr', { sensitivity: 'base' });
      if (firma !== 0) return firma;
      const gorev = displayPersonelGorev(a).localeCompare(displayPersonelGorev(b), 'tr', {
        sensitivity: 'base',
      });
      if (gorev !== 0) return gorev;
      return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' });
    });
}

export function groupMykYoklamaByFirmaAndGorev(personeller: Personel[]): MykFirmaGorevGroup[] {
  const byFirma = new Map<string, Personel[]>();

  for (const p of personeller) {
    const label = firmaLabel(p);
    const key = firmaAnahtar(label) || label.toLocaleLowerCase('tr-TR');
    const list = byFirma.get(key) || [];
    list.push(p);
    byFirma.set(key, list);
  }

  return Array.from(byFirma.entries())
    .map(([, list]) => {
      const firmaAdi = firmaLabel(list[0]);
      const gorevGroups = groupPersonelByGorev(list);
      return {
        firmaAdi,
        gorevGroups,
        personelSayisi: list.length,
      };
    })
    .sort((a, b) => a.firmaAdi.localeCompare(b.firmaAdi, 'tr', { sensitivity: 'base' }));
}

export function buildMykYoklamaReportHtml(options: {
  personeller: Personel[];
  title?: string;
  onlyActive?: boolean;
}): string {
  const rows = collectMykYoklamaPersoneller(options.personeller, {
    onlyActive: options.onlyActive,
  });
  const firmaGroups = groupMykYoklamaByFirmaAndGorev(rows);

  const mykVar = rows.filter((p) => p.mykDurumu === 'VAR').length;
  const mykYok = rows.filter((p) => p.mykDurumu === 'YOK').length;
  const mykUnknown = rows.filter((p) => !p.mykDurumu || p.mykDurumu === 'BILINMIYOR').length;

  const summaryCard = (label: string, value: string | number, tone: string) => `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${tone};border-radius:8px;padding:8px 10px;background:#fff">
      <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.04em">${esc(label)}</div>
      <div style="font-size:18px;color:#0f172a;font-weight:900;line-height:1.15">${esc(value)}</div>
    </div>
  `;

  const cell = 'padding:5px 6px;border:1px solid #e2e8f0;vertical-align:top;line-height:1.25';
  const th =
    'padding:6px;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.03em';

  const sections = firmaGroups
    .map((firma) => {
      const gorevSections = firma.gorevGroups
        .map((g) => {
          const bodyRows = g.personeller
            .map((p, index) => {
              const myk = mykHtmlTone(p);
              return `<tr>
                <td style="${cell};text-align:center;color:#64748b;width:28px">${index + 1}</td>
                <td style="${cell};font-weight:700;color:#0f172a">${esc(p.ad)} ${esc(p.soyad)}</td>
                <td style="${cell};font-family:ui-monospace,Consolas,monospace;font-size:10px">${esc(p.tcNo || '—')}</td>
                <td style="${cell};font-size:10px">${esc(p.telefonNo || '—')}</td>
                <td style="${cell};text-align:center">
                  <span style="display:inline-block;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;background:${myk.bg};color:${myk.color}">${mykLabel(p)}</span>
                </td>
              </tr>`;
            })
            .join('');

          return `
            <div style="margin-top:8px;break-inside:avoid">
              <div style="background:#ecfdf5;color:#065f46;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:800;margin-bottom:0">
                ${esc(g.gorev)} · ${g.personeller.length} kişi
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px">
                <thead>
                  <tr>
                    <th style="${th};text-align:center">#</th>
                    <th style="${th}">Ad Soyad</th>
                    <th style="${th}">TC Kimlik</th>
                    <th style="${th}">Telefon</th>
                    <th style="${th};text-align:center">MYK</th>
                  </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
              </table>
            </div>
          `;
        })
        .join('');

      return `
        <section style="break-inside:avoid;margin-top:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;background:#eff6ff;color:#1e40af;border-radius:8px 8px 0 0;padding:8px 12px;border:1px solid #bfdbfe;border-bottom:none">
            <strong style="font-size:13px;letter-spacing:.02em">${esc(firma.firmaAdi)}</strong>
            <span style="font-size:10px;font-weight:800;background:rgba(255,255,255,.7);border-radius:999px;padding:2px 10px;color:#1e3a8a">${firma.personelSayisi} kişi · ${firma.gorevGroups.length} görev</span>
          </div>
          <div style="border:1px solid #bfdbfe;border-top:none;border-radius:0 0 8px 8px;padding:8px 10px 10px;background:#fafcff">
            ${gorevSections}
          </div>
        </section>
      `;
    })
    .join('');

  const bodyHtml = `
    <style>
      .myk-yoklama-rapor thead { display: table-header-group; }
      .myk-yoklama-rapor tr { break-inside: avoid; page-break-inside: avoid; }
    </style>
    <div class="myk-yoklama-rapor">
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px">
        ${summaryCard('Toplam Personel', rows.length, '#0ea5e9')}
        ${summaryCard('MYK VAR', mykVar, '#16a34a')}
        ${summaryCard('MYK YOK', mykYok, '#64748b')}
        ${summaryCard('MYK ?', mykUnknown, '#d97706')}
        ${summaryCard('Firma Sayısı', firmaGroups.length, '#2563eb')}
      </div>
      <p style="margin:0 0 8px;color:#475569;font-size:11px;line-height:1.35">
        Personel önce firmaya, firma içinde göreve göre gruplanmıştır. TC, telefon ve MYK durumu listelenir.
      </p>
      ${sections || '<p style="color:#64748b;font-style:italic">MYK yoklama raporu için personel bulunamadı.</p>'}
    </div>
  `;

  return buildKibritciReportHtml({
    title: options.title || `${CANONICAL_ANA_FIRMA_ADI} — MYK Yoklama Raporu`,
    subtitle: 'Firma ve görev bazlı MYK durum cetveli',
    meta: [
      `Toplam personel: ${rows.length}`,
      `MYK VAR: ${mykVar} · YOK: ${mykYok} · Bilinmiyor: ${mykUnknown}`,
      `Firma sayısı: ${firmaGroups.length}`,
      `Rapor tarihi: ${new Date().toLocaleString('tr-TR')}`,
    ],
    bodyHtml,
  });
}

export function openMykYoklamaReport(options: {
  personeller: Personel[];
  title?: string;
  onlyActive?: boolean;
}): number {
  const count = collectMykYoklamaPersoneller(options.personeller, {
    onlyActive: options.onlyActive,
  }).length;
  if (count === 0) {
    throw new Error('MYK yoklama raporu için personel bulunamadı.');
  }
  const html = buildMykYoklamaReportHtml(options);
  openKibritciReportPrint(html, options.title || 'MYK Yoklama Raporu');
  return count;
}

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: LIGHT.border } },
    left: { style: 'thin' as const, color: { argb: LIGHT.border } },
    bottom: { style: 'thin' as const, color: { argb: LIGHT.border } },
    right: { style: 'thin' as const, color: { argb: LIGHT.border } },
  };
}

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

async function applyMykExcelAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; metaLine: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(4, opts.colCount);
  ws.getRow(1).height = 52;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 14;
  ws.mergeCells(1, 1, 3, Math.min(2, colCount));

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.05, row: 0.08 }, ext: { width: 150, height: 58 } });
  } else {
    const logoCell = ws.getCell(1, 1);
    logoCell.value = KIBRITCI_COMPANY.shortName;
    logoCell.font = { bold: true, size: 13, color: { argb: 'FF1E4E78' } };
    logoCell.alignment = { vertical: 'middle' };
  }

  const metaStart = Math.min(3, colCount);
  ws.mergeCells(1, metaStart, 1, colCount);
  ws.getCell(1, metaStart).value = opts.title;
  ws.getCell(1, metaStart).font = { bold: true, size: 13, color: { argb: LIGHT.title } };
  ws.getCell(1, metaStart).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, metaStart, 2, colCount);
  ws.getCell(2, metaStart).value = opts.subtitle;
  ws.getCell(2, metaStart).font = { size: 9, color: { argb: LIGHT.meta } };
  ws.getCell(2, metaStart).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, metaStart, 3, colCount);
  ws.getCell(3, metaStart).value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  ws.getCell(3, metaStart).font = { size: 8, color: { argb: LIGHT.meta } };
  ws.getCell(3, metaStart).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  setFill(ws.getCell(4, 1), LIGHT.accentBar);
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: LIGHT.meta } };

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value = opts.metaLine;
  ws.getCell(6, 1).font = { size: 9, color: { argb: LIGHT.meta } };
  ws.getCell(6, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(ws.getCell(6, 1), 'FFF8FAFC');
  ws.getRow(6).height = 20;

  return 8;
}

export async function exportMykYoklamaExcel(options: {
  personeller: Personel[];
  title?: string;
  onlyActive?: boolean;
}): Promise<number> {
  const rows = collectMykYoklamaPersoneller(options.personeller, {
    onlyActive: options.onlyActive,
  });
  if (rows.length === 0) {
    throw new Error('MYK yoklama Excel raporu için personel bulunamadı.');
  }

  const firmaGroups = groupMykYoklamaByFirmaAndGorev(rows);
  const workbook = await createExcelWorkbook();
  workbook.creator = KIBRITCI_COMPANY.shortName;
  const sheet = workbook.addWorksheet('MYK Yoklama', {
    views: [{ state: 'frozen', ySplit: 8 }],
  });

  const headers = ['#', 'Firma', 'Görev', 'Ad Soyad', 'TC Kimlik', 'Telefon', 'MYK', 'Departman'];
  const colCount = headers.length;
  const stamp = new Date().toLocaleString('tr-TR');
  const mykVar = rows.filter((p) => p.mykDurumu === 'VAR').length;
  const mykYok = rows.filter((p) => p.mykDurumu === 'YOK').length;
  const mykUnknown = rows.filter((p) => !p.mykDurumu || p.mykDurumu === 'BILINMIYOR').length;

  const headerRowIndex = await applyMykExcelAntet(workbook, sheet, {
    title: options.title || `${CANONICAL_ANA_FIRMA_ADI} — MYK Yoklama Raporu`,
    subtitle: 'Firma ve görev bazlı MYK durum cetveli',
    metaLine: `Oluşturma: ${stamp} · Toplam: ${rows.length} · MYK VAR: ${mykVar} · YOK: ${mykYok} · ?: ${mykUnknown}`,
    colCount,
  });

  sheet.columns = [
    { width: 5 },
    { width: 28 },
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
    { width: 12 },
  ];

  const headerRow = sheet.getRow(headerRowIndex);
  headers.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, name: 'Arial', size: 10, color: { argb: LIGHT.tableHeadText } };
    setFill(cell, LIGHT.tableHeadBg);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 22;

  let rowIndex = 0;

  const writeBanner = (text: string, bg: string, color: string) => {
    const bannerRow = sheet.addRow([text]);
    sheet.mergeCells(bannerRow.number, 1, bannerRow.number, colCount);
    const cell = bannerRow.getCell(1);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: color } };
    setFill(cell, bg);
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = thinBorder();
    bannerRow.height = 20;
  };

  const writePersonelRow = (p: Personel, firma: string, gorev: string) => {
    rowIndex += 1;
    const myk = mykLabel(p);
    const row = sheet.addRow([
      rowIndex,
      firma,
      gorev,
      `${p.ad || ''} ${p.soyad || ''}`.trim(),
      p.tcNo || '',
      p.telefonNo || '',
      myk,
      p.departman || '',
    ]);
    const alt = rowIndex % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF0F172A' },
        bold: colNumber === 4,
      };
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 || colNumber === 7 ? 'center' : 'left',
      };
      if (alt) setFill(cell, LIGHT.rowAlt);
      if (colNumber === 7) {
        const v = p.mykDurumu || 'BILINMIYOR';
        if (v === 'VAR') setFill(cell, LIGHT.mykVar);
        else if (v === 'YOK') setFill(cell, LIGHT.mykYok);
        else setFill(cell, LIGHT.mykUnknown);
        cell.font = {
          ...cell.font,
          bold: true,
          color: {
            argb: v === 'VAR' ? LIGHT.mykVarText : v === 'YOK' ? LIGHT.mykYokText : LIGHT.mykUnknownText,
          },
        };
      }
    });
  };

  for (const firma of firmaGroups) {
    writeBanner(`${firma.firmaAdi} — ${firma.personelSayisi} kişi`, LIGHT.firmaBannerBg, LIGHT.firmaBannerText);
    for (const g of firma.gorevGroups) {
      writeBanner(`${g.gorev} — ${g.personeller.length} kişi`, LIGHT.gorevBannerBg, LIGHT.gorevBannerText);
      for (const p of g.personeller) {
        writePersonelRow(p, firma.firmaAdi, g.gorev);
      }
    }
  }

  const footerRow = sheet.addRow([
    `${KIBRITCI_COMPANY.shortName} · ${KIBRITCI_COMPANY.web} · ${KIBRITCI_COMPANY.email}`,
  ]);
  sheet.mergeCells(footerRow.number, 1, footerRow.number, colCount);
  const footerCell = footerRow.getCell(1);
  footerCell.font = { size: 8, italic: true, color: { argb: LIGHT.meta } };
  footerCell.alignment = { horizontal: 'center' };
  setFill(footerCell, 'FFF8FAFC');

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MYK_Yoklama_Raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
