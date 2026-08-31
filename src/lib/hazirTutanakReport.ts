import type { HazirTutanak, Personel } from '../types/erp';
import { SIPARIS_EDEN_SANTIER } from './catalogFieldUtils';
import { getKibritciLogoUrl, loadKibritciLogoDataUrl } from './kibritciBrand';

const TIP_BASLIK: Record<HazirTutanak['tutanakTipi'], string> = {
  TAHSİS: 'TAHSİS / ZİMMET TUTANAĞI',
  TESLİM: 'MALZEME TESLİM TUTANAĞI',
  SEVK: 'SEVK / SEVKİYAT TUTANAĞI',
  HASAR: 'ZARAR / HASAR TESPİT PROTOKOLÜ',
  GENEL: 'ŞANTİYE GENEL TUTANAĞI',
  CEZA: 'CEZA İHTAR TUTANAĞI',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dotted(value: string, minLen = 52): string {
  const trimmed = value?.trim();
  return trimmed || '.'.repeat(minLen);
}

export function formatTutanakTarih(tarih: string): string {
  const d = tarih ? new Date(`${tarih}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return '... / ... / ....';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd} / ${mm} / ${yyyy}`;
}

export function resolveMuhatapPersonel(ht: HazirTutanak, personeller: Personel[]): string {
  if (ht.muhatapPersonel?.trim()) return ht.muhatapPersonel.trim();
  const p = personeller.find((x) => x.id === ht.personelId);
  if (p) return `${p.ad} ${p.soyad}`.trim();
  return '';
}

function signatureLabels(tip: HazirTutanak['tutanakTipi']): { left: string; right: string } {
  if (tip === 'TESLİM' || tip === 'TAHSİS') {
    return { left: 'TESLİM EDEN', right: 'TESLİM ALAN' };
  }
  return { left: 'HAZIRLAYAN', right: 'MUHATAP' };
}

function metaLinesHtml(ht: HazirTutanak, muhatap: string): string {
  const tarih = formatTutanakTarih(ht.tarih);
  const muhatapLine = dotted(muhatap);

  if (ht.tutanakTipi === 'TESLİM' || ht.tutanakTipi === 'SEVK') {
    return `
      <p class="meta-line"><strong>Tutanak Tarihi:</strong> ${escapeHtml(tarih)}</p>
      <p class="meta-line"><strong>Teslim Eden Şantiye:</strong> ${escapeHtml(SIPARIS_EDEN_SANTIER)}</p>
      <p class="meta-line"><strong>Teslim Edilen Şantiye / Muhatap:</strong> ${escapeHtml(muhatapLine)}</p>
      <p class="meta-line"><strong>Belge No:</strong> ${escapeHtml(ht.belgeNo)}</p>
    `;
  }

  return `
    <p class="meta-line"><strong>Tutanak Tarihi:</strong> ${escapeHtml(tarih)}</p>
    <p class="meta-line"><strong>Şantiye:</strong> ${escapeHtml(SIPARIS_EDEN_SANTIER)}</p>
    <p class="meta-line"><strong>Muhatap Personel:</strong> ${escapeHtml(muhatapLine)}</p>
    <p class="meta-line"><strong>Belge No:</strong> ${escapeHtml(ht.belgeNo)}</p>
  `;
}

function cezaBlockHtml(ht: HazirTutanak): string {
  if (ht.tutanakTipi !== 'CEZA') return '';
  return `
    <div class="ceza-box">
      <p><strong>Cezalı Taşeron:</strong> ${escapeHtml(ht.taseronAdi || 'Belirtilmemiş')}</p>
      <p><strong>Uygulanan Ceza Tutarı:</strong> ₺${(ht.cezaTutari || 0).toLocaleString('tr-TR')}</p>
    </div>
  `;
}

export function buildHazirTutanakHtml(ht: HazirTutanak, muhatap: string): string {
  const logoUrl = getKibritciLogoUrl();
  const title = ht.konu?.trim() || TIP_BASLIK[ht.tutanakTipi];
  const tipBaslik = TIP_BASLIK[ht.tutanakTipi];
  const body = escapeHtml(ht.icerik || '').replace(/\n/g, '<br/>');
  const { left, right } = signatureLabels(ht.tutanakTipi);

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(ht.belgeNo)} — ${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      color: #000;
      margin: 0;
      padding: 24px 28px;
      background: #fff;
      font-size: 12pt;
      line-height: 1.45;
    }
    .letterhead {
      text-align: center;
      margin-bottom: 18px;
      padding-bottom: 8px;
      border-bottom: 2px solid #1e4e78;
    }
    .letterhead img {
      height: 72px;
      width: auto;
      max-width: 280px;
      object-fit: contain;
      display: inline-block;
    }
    .doc-type {
      text-align: center;
      font-weight: 700;
      font-size: 13pt;
      margin: 14px 0 6px;
      text-transform: uppercase;
    }
    .doc-title {
      text-align: center;
      font-weight: 700;
      font-size: 12pt;
      margin: 0 0 16px;
    }
    .meta {
      text-align: center;
      margin: 0 0 18px;
    }
    .meta-line {
      margin: 6px 0;
      font-size: 11pt;
    }
    .content {
      text-align: justify;
      margin: 18px 0 28px;
      white-space: normal;
      min-height: 180px;
    }
    .ceza-box {
      border: 1px solid #b91c1c;
      background: #fef2f2;
      padding: 10px 12px;
      margin: 0 0 16px;
      font-size: 11pt;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 48px;
      text-align: center;
      font-weight: 700;
      font-size: 11pt;
    }
    .sig-line {
      margin-top: 56px;
      border-top: 1px solid #000;
      padding-top: 8px;
      font-weight: 400;
      font-size: 10pt;
    }
    .footer-note {
      margin-top: 28px;
      text-align: center;
      font-size: 9pt;
      color: #64748b;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="letterhead">
    <img src="${logoUrl}" alt="Kibritçi İnşaat"/>
  </div>
  <div class="doc-type">${escapeHtml(tipBaslik)}</div>
  <div class="doc-title">${escapeHtml(title)}</div>
  <div class="meta">
    ${metaLinesHtml(ht, muhatap)}
  </div>
  ${cezaBlockHtml(ht)}
  <div class="content">${body}</div>
  <div class="signatures">
    <div>
      <div>${escapeHtml(left)}</div>
      <div class="sig-line">${escapeHtml(SIPARIS_EDEN_SANTIER)}</div>
    </div>
    <div>
      <div>${escapeHtml(right)}</div>
      <div class="sig-line">${escapeHtml(muhatap || '................................')}</div>
    </div>
  </div>
  <div class="footer-note">Kibritçi İnşaat · ${escapeHtml(ht.belgeNo)} · ${escapeHtml(formatTutanakTarih(ht.tarih))}</div>
</body>
</html>`;
}

export function openHazirTutanakPrint(ht: HazirTutanak, muhatap: string): void {
  const html = buildHazirTutanakHtml(ht, muhatap);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up engellendi. Tarayıcı izinlerini kontrol edin.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.document.title = `${ht.belgeNo} — Tutanak`;
  setTimeout(() => win.print(), 450);
}

export function downloadHazirTutanakHtml(ht: HazirTutanak, muhatap: string): void {
  const html = buildHazirTutanakHtml(ht, muhatap);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ht.belgeNo.replace(/[^\w.-]+/g, '_')}_tutanak.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportHazirTutanakExcel(ht: HazirTutanak, muhatap: string): Promise<void> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  wb.creator = 'Kibritçi ERP';
  wb.created = new Date();

  const ws = wb.addWorksheet('Tutanak', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: false }],
  });

  for (let c = 1; c <= 6; c += 1) {
    ws.getColumn(c).width = c === 1 ? 18 : 16;
  }

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 1.8, row: 0.1 }, ext: { width: 200, height: 78 } });
  }

  const title = ht.konu?.trim() || TIP_BASLIK[ht.tutanakTipi];
  const tipBaslik = TIP_BASLIK[ht.tutanakTipi];
  const { left, right } = signatureLabels(ht.tutanakTipi);

  const setMerged = (row: number, text: string, opts?: { bold?: boolean; size?: number; align?: 'left' | 'center' }) => {
    ws.mergeCells(row, 1, row, 6);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { name: 'Times New Roman', bold: opts?.bold ?? false, size: opts?.size ?? 12 };
    cell.alignment = { horizontal: opts?.align || 'center', vertical: 'middle', wrapText: true };
  };

  ws.getRow(1).height = 58;
  setMerged(2, tipBaslik, { bold: true, size: 14 });
  setMerged(3, title, { bold: true, size: 12 });
  setMerged(4, `Tutanak Tarihi: ${formatTutanakTarih(ht.tarih)}`, { size: 11 });
  setMerged(
    5,
    ht.tutanakTipi === 'TESLİM' || ht.tutanakTipi === 'SEVK'
      ? `Teslim Eden Şantiye: ${SIPARIS_EDEN_SANTIER}`
      : `Şantiye: ${SIPARIS_EDEN_SANTIER}`,
    { size: 11 }
  );
  setMerged(
    6,
    ht.tutanakTipi === 'TESLİM' || ht.tutanakTipi === 'SEVK'
      ? `Teslim Edilen / Muhatap: ${dotted(muhatap)}`
      : `Muhatap Personel: ${dotted(muhatap)}`,
    { size: 11 }
  );
  setMerged(7, `Belge No: ${ht.belgeNo}`, { size: 11 });

  let row = 9;
  if (ht.tutanakTipi === 'CEZA') {
    setMerged(row, `Cezalı Taşeron: ${ht.taseronAdi || 'Belirtilmemiş'}`, { size: 11, align: 'left' });
    row += 1;
    setMerged(row, `Ceza Tutarı: ₺${(ht.cezaTutari || 0).toLocaleString('tr-TR')}`, { size: 11, align: 'left' });
    row += 1;
  }

  ws.mergeCells(row, 1, row + 10, 6);
  const contentCell = ws.getCell(row, 1);
  contentCell.value = ht.icerik || '';
  contentCell.font = { name: 'Times New Roman', size: 11 };
  contentCell.alignment = { horizontal: 'justify', vertical: 'top', wrapText: true };
  row += 12;

  ws.mergeCells(row, 1, row, 3);
  ws.mergeCells(row, 4, row, 6);
  ws.getCell(row, 1).value = left;
  ws.getCell(row, 4).value = right;
  ws.getCell(row, 1).font = { name: 'Times New Roman', bold: true, size: 11 };
  ws.getCell(row, 4).font = { name: 'Times New Roman', bold: true, size: 11 };
  ws.getCell(row, 1).alignment = { horizontal: 'center' };
  ws.getCell(row, 4).alignment = { horizontal: 'center' };

  row += 4;
  ws.mergeCells(row, 1, row, 3);
  ws.mergeCells(row, 4, row, 6);
  ws.getCell(row, 1).value = SIPARIS_EDEN_SANTIER;
  ws.getCell(row, 4).value = muhatap || '................................';
  ws.getCell(row, 1).font = { name: 'Times New Roman', size: 10 };
  ws.getCell(row, 4).font = { name: 'Times New Roman', size: 10 };
  ws.getCell(row, 1).alignment = { horizontal: 'center' };
  ws.getCell(row, 4).alignment = { horizontal: 'center' };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ht.belgeNo.replace(/[^\w.-]+/g, '_')}_tutanak.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
