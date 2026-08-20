import type { Workbook, Worksheet } from 'exceljs';
import type { Personel } from '../types/erp';
import { collectAktifAnaFirmaPersonelNow } from './aktifPersonelListeExcel';
import { createExcelWorkbook } from './exceljsLoader';
import { kadroPersonelGorev, displayPersonelNitelik } from './guvenlikHelpers';
import {
  KIBRITCI_COMPANY,
  loadKibritciAntetDataUrl,
  loadKibritciLogoDataUrl,
} from './kibritciBrand';
import {
  buildKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';
import { CANONICAL_ANA_FIRMA_ADI, isTaseronPersonel } from './yoklamaUtils';

export type GorevPersonelGroup = {
  gorev: string;
  personeller: Personel[];
};

export const GOREVSIZ_LABEL = 'GÖREVSİZ (ARAF — yoklamaya alınmaz)';

const esc = (v: string | number | undefined | null): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function isAktif(p: Personel): boolean {
  if (p.durum === false) return false;
  const durum = String(p.durum ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (durum === 'PASIF' || durum === 'FALSE' || durum === '0') return false;
  const onay = String(p.onayDurumu || '').toLocaleUpperCase('tr-TR');
  if (onay.includes('BEKLIYOR') || onay.includes('RED')) return false;
  return p.durum === true || durum === 'TRUE' || durum === 'AKTIF' || durum === '';
}

function sortByName(a: Personel, b: Personel): number {
  return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', {
    sensitivity: 'base',
  });
}

function gorevEtiketi(p: Personel): string {
  return kadroPersonelGorev(p) || GOREVSIZ_LABEL;
}

function pngBase64(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  const stripped = dataUrl.replace(/^data:image\/png;base64,/i, '');
  return stripped || null;
}

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  };
}

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; metaLine: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(3, opts.colCount);
  const [antetDataUrl, logoDataUrl] = await Promise.all([
    loadKibritciAntetDataUrl(),
    loadKibritciLogoDataUrl(),
  ]);
  const antetB64 = pngBase64(antetDataUrl);
  const logoB64 = pngBase64(logoDataUrl);

  ws.getRow(1).height = 28;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 16;

  if (antetB64) {
    const antetId = wb.addImage({ base64: antetB64, extension: 'png' });
    ws.addImage(antetId, {
      tl: { col: 0.05, row: 0.06 },
      ext: { width: 380, height: 56 },
    });
  }
  if (logoB64) {
    const logoId = wb.addImage({ base64: logoB64, extension: 'png' });
    ws.addImage(logoId, {
      tl: { col: Math.max(colCount - 1.85, 2.8), row: 0.08 },
      ext: { width: 112, height: 44 },
    });
  }
  if (!antetB64 && !logoB64) {
    ws.mergeCells(1, 1, 2, 3);
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E4E78' } };
  }

  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).value =
    `${KIBRITCI_COMPANY.legalName}  ·  ${KIBRITCI_COMPANY.phone}  ·  ${KIBRITCI_COMPANY.email}`;
  ws.getCell(3, 1).font = { size: 8, color: { argb: 'FF64748B' } };

  ws.mergeCells(4, 1, 5, colCount);
  ws.getCell(4, 1).value = opts.title;
  ws.getCell(4, 1).font = { bold: true, size: 13, color: { argb: 'FF0F2744' } };
  ws.getCell(4, 1).alignment = { vertical: 'middle', wrapText: true };

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value = opts.subtitle;
  ws.getCell(6, 1).font = { size: 10, color: { argb: 'FF475569' } };

  ws.mergeCells(7, 1, 7, colCount);
  ws.getCell(7, 1).value = opts.metaLine;
  ws.getCell(7, 1).font = { size: 9, italic: true, color: { argb: 'FF64748B' } };

  return 9;
}

function writeBanner(
  ws: Worksheet,
  text: string,
  bg: string,
  fg: string,
  size: number,
  colCount: number
) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  const cell = row.getCell(1);
  cell.font = { name: 'Arial', size, bold: true, color: { argb: fg } };
  setFill(cell, bg);
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = thinBorder();
  row.height = size >= 12 ? 22 : 18;
}

/** Aynı görevdekiler alt alta; eş anlamlı görevler tek çatıda (FORMEN, KAMPÇI vb.) */
export function groupPersonelByGorev(personeller: Personel[]): GorevPersonelGroup[] {
  const map = new Map<string, Personel[]>();
  for (const p of personeller) {
    const gorev = gorevEtiketi(p);
    const list = map.get(gorev) || [];
    list.push(p);
    map.set(gorev, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === GOREVSIZ_LABEL) return 1;
      if (b === GOREVSIZ_LABEL) return -1;
      return a.localeCompare(b, 'tr', { sensitivity: 'base' });
    })
    .map(([gorev, list]) => ({
      gorev,
      personeller: list.slice().sort(sortByName),
    }));
}

/** Aktif ana firma kadrosu — taşeron yok, onay bekleyen yok */
export function collectAktifAnaFirmaGorevGroups(personeller: Personel[]): GorevPersonelGroup[] {
  return groupPersonelByGorev(collectAktifAnaFirmaPersonelNow(personeller));
}

/** Ana firma kadrosu → göreve göre gruplanmış liste */
export function collectAnaFirmaGorevGroups(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): GorevPersonelGroup[] {
  const pool = personeller
    .filter((p) => !isTaseronPersonel(p))
    .filter((p) => (options?.onlyActive !== false ? isAktif(p) : true));
  return groupPersonelByGorev(pool);
}

/** Düz satır listesi: önce görev, sonra isim (Excel sırası için) */
export function flattenGorevGroups(groups: GorevPersonelGroup[]): Personel[] {
  return groups.flatMap((g) => g.personeller);
}

export function buildAnaFirmaGorevPersonelReportHtml(
  personeller: Personel[],
  options?: { onlyActive?: boolean; autoPrint?: boolean }
): string {
  const onlyActive = options?.onlyActive !== false;
  const groups = onlyActive
    ? collectAktifAnaFirmaGorevGroups(personeller)
    : collectAnaFirmaGorevGroups(personeller, { onlyActive: false });
  const total = groups.reduce((s, g) => s + g.personeller.length, 0);

  if (total === 0) {
    return buildKibritciReportHtml({
      title: `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi (Göreve Göre)`,
      subtitle: 'Ana firma kadrosu',
      meta: [`Kayıt: 0${onlyActive ? ' (yalnız aktif)' : ''}`],
      bodyHtml: '<p style="color:#64748b">Listelenecek ana firma personeli bulunamadı.</p>',
    });
  }

  const cell = 'padding:2px 6px;border:1px solid #e2e8f0;line-height:1.25';
  const th =
    'padding:3px 6px;border:1px solid #cbd5e1;font-size:9px;text-transform:uppercase;letter-spacing:0.02em';

  const sections = groups
    .map((g, gi) => {
      const rows = g.personeller
        .map(
          (p, idx) => `<tr>
          <td style="${cell};text-align:center;width:28px">${idx + 1}</td>
          <td style="${cell};font-weight:600">${esc(p.ad)} ${esc(p.soyad)}</td>
          <td style="${cell};font-family:ui-monospace,monospace;font-size:10px">${esc(p.tcNo || '—')}</td>
          <td style="${cell};font-weight:700;color:#1e3a5f">${esc(gorevEtiketi(p))}</td>
          <td style="${cell};color:#475569">${esc(displayPersonelNitelik(p) || '—')}</td>
          <td style="${cell}">${esc(p.iseGirisTarihi || '—')}</td>
        </tr>`
        )
        .join('');

      return `
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin:${gi === 0 ? '0' : '8px'} 0 0">
        <thead>
          <tr>
            <th colspan="6" style="background:#1e3a5f;color:#fff;padding:4px 8px;text-align:left;border:1px solid #1e3a5f;font-size:11px;font-weight:800;letter-spacing:0.03em;text-transform:uppercase">
              ${esc(g.gorev)}
              <span style="float:right;font-size:10px;font-weight:700;background:rgba(255,255,255,0.15);padding:1px 7px;border-radius:999px;text-transform:none;letter-spacing:0">${g.personeller.length} kişi</span>
            </th>
          </tr>
          <tr style="background:#f1f5f9">
            <th style="${th};text-align:center">#</th>
            <th style="${th};text-align:left">Ad Soyad</th>
            <th style="${th};text-align:left">T.C.</th>
            <th style="${th};text-align:left">Görev (program)</th>
            <th style="${th};text-align:left">Nitelik (SGK meslek)</th>
            <th style="${th};text-align:left">İşe Giriş</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    })
    .join('');

  const ozet = groups
    .map(
      (g) =>
        `<span style="display:inline-block;margin:1px 4px 1px 0;padding:1px 6px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;font-size:10px"><strong>${esc(g.gorev)}</strong>: ${g.personeller.length}</span>`
    )
    .join('');

  const bodyHtml = `
    <style>
      .gorev-rapor table { page-break-inside: auto; }
      .gorev-rapor thead { display: table-header-group; }
      .gorev-rapor tbody tr { page-break-inside: avoid; break-inside: avoid; }
    </style>
    <div class="gorev-rapor">
      <p style="margin:0 0 6px;font-size:11px;color:#475569;line-height:1.3">
        <strong>Görev</strong> = programdaki yoklama ünvanı · <strong>Nitelik</strong> = SGK meslek / kart niteliği.
        Taşeron hariç · yalnız aktif ana firma. Toplam <strong>${total}</strong> kişi · <strong>${groups.length}</strong> görev grubu.
      </p>
      <div style="margin:0 0 8px;line-height:1.35">${ozet}</div>
      ${sections}
    </div>
  `;

  let html = buildKibritciReportHtml({
    title: `${CANONICAL_ANA_FIRMA_ADI} — Aktif Personel (Göreve Göre)`,
    subtitle: 'Ana firma kadrosu · görev + SGK nitelik',
    meta: [
      `Firma: ${CANONICAL_ANA_FIRMA_ADI}`,
      `Toplam personel: ${total}`,
      `Görev grubu: ${groups.length}`,
      onlyActive ? 'Filtre: Yalnız aktif ana firma' : 'Filtre: Aktif + pasif ana firma',
      `Rapor tarihi: ${new Date().toLocaleString('tr-TR')}`,
    ],
    bodyHtml,
  });

  if (options?.autoPrint) {
    html = html.replace(
      '</body>',
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body>'
    );
  }
  return html;
}

export function printAnaFirmaGorevPersonelReport(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): number {
  const onlyActive = options?.onlyActive !== false;
  const groups = onlyActive
    ? collectAktifAnaFirmaGorevGroups(personeller)
    : collectAnaFirmaGorevGroups(personeller, { onlyActive: false });
  const total = groups.reduce((s, g) => s + g.personeller.length, 0);
  if (total === 0) {
    throw new Error('Listelenecek aktif ana firma personeli bulunamadı.');
  }
  const html = buildAnaFirmaGorevPersonelReportHtml(personeller, { onlyActive, autoPrint: true });
  openKibritciReportPrint(html, `${CANONICAL_ANA_FIRMA_ADI} Personel (Göreve Göre)`);
  return total;
}

/** Antetli Excel — göreve göre gruplu, T.C. + görev + nitelik + işe giriş */
export async function exportAnaFirmaGorevPersonelExcel(
  personeller: Personel[]
): Promise<number> {
  const groups = collectAktifAnaFirmaGorevGroups(personeller);
  const rows = flattenGorevGroups(groups);
  if (rows.length === 0) {
    throw new Error('Listelenecek aktif ana firma personeli bulunamadı.');
  }

  const stamp = new Date().toLocaleString('tr-TR');
  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.title = `Aktif Ana Firma — Göreve Göre`;

  const ws = wb.addWorksheet('Göreve Göre', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  ws.columns = [
    { width: 6 },
    { width: 28 },
    { width: 14 },
    { width: 22 },
    { width: 28 },
    { width: 14 },
  ];

  const headerRow = await applyAntet(wb, ws, {
    title: `${CANONICAL_ANA_FIRMA_ADI} — AKTİF PERSONEL (GÖREVE GÖRE)`,
    subtitle: 'Taşeron hariç · Görev = program ünvanı · Nitelik = SGK meslek',
    metaLine: `Toplam: ${rows.length} kişi · ${groups.length} görev · Oluşturma: ${stamp}`,
    colCount: 6,
  });

  const headers = ['#', 'Ad Soyad', 'T.C.', 'Görev (program)', 'Nitelik (SGK)', 'İşe Giriş'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });

  writeBanner(
    ws,
    `${CANONICAL_ANA_FIRMA_ADI}  ·  ${rows.length} aktif personel`,
    'FF0F2744',
    'FFF4EAD5',
    12,
    6
  );

  let sira = 0;
  for (const grup of groups) {
    writeBanner(
      ws,
      `Görev: ${grup.gorev}  ·  ${grup.personeller.length} kişi`,
      'FFECFDF5',
      'FF065F46',
      10,
      6
    );
    for (const p of grup.personeller) {
      sira += 1;
      const excelRow = ws.addRow([
        sira,
        `${p.ad || ''} ${p.soyad || ''}`.trim(),
        String(p.tcNo || '').trim() || '—',
        gorevEtiketi(p),
        displayPersonelNitelik(p) || '—',
        p.iseGirisTarihi || '—',
      ]);
      excelRow.height = 18;
      excelRow.eachCell((cell, col) => {
        cell.font = {
          name: 'Arial',
          size: 10,
          bold: col === 2,
          color: { argb: 'FF0F172A' },
        };
        cell.border = thinBorder();
        cell.alignment = {
          vertical: 'middle',
          horizontal: col === 1 || col === 3 || col === 6 ? 'center' : 'left',
        };
        if (sira % 2 === 0) setFill(cell, 'FFF8FAFC');
        if (col === 3) cell.numFmt = '@';
      });
    }
  }

  const ozet = wb.addWorksheet('Özet', {
    views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
  });
  ozet.columns = [{ width: 32 }, { width: 10 }];
  await applyAntet(wb, ozet, {
    title: 'GÖREV ÖZETİ',
    subtitle: CANONICAL_ANA_FIRMA_ADI,
    metaLine: `Toplam: ${rows.length} kişi · ${stamp}`,
    colCount: 2,
  });
  ['Görev', 'Kişi'].forEach((h, i) => {
    const cell = ozet.getCell(10, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  for (const g of groups) {
    const r = ozet.addRow([g.gorev, g.personeller.length]);
    r.eachCell((cell, col) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'center' : 'left' };
    });
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_AnaFirma_Gorev_Listesi_${today}.xlsx`
  );
  return rows.length;
}
