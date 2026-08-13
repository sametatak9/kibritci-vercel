/**
 * Kamp krokisi — taşeron / firma bazında oda ve personel özeti (Kibritçi antet + logo).
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { KampKaydi, KampOdasi, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import {
  KIBRITCI_COMPANY,
  loadKibritciAntetDataUrl,
  loadKibritciLogoDataUrl,
} from './kibritciBrand';
import { buildKampKrokiModel, type KampYerleskeKroki } from './kampKrokiUtils';
import { isKibritciCompany } from './yoklamaUtils';

export type KampKrokiTaseronOda = {
  yerleske: string;
  kat: string;
  odaNo: string;
  kisi: number;
  kapasite: number;
  sakinler: string[];
};

export type KampKrokiTaseronOzet = {
  firma: string;
  tip: 'ANA_FIRMA' | 'TASERON';
  kisi: number;
  odaSayisi: number;
  odalar: KampKrokiTaseronOda[];
};

function pngBase64(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  const stripped = dataUrl.replace(/^data:image\/png;base64,/i, '');
  return stripped || null;
}

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  };
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

function odaSort(a: KampKrokiTaseronOda, b: KampKrokiTaseronOda): number {
  const y = a.yerleske.localeCompare(b.yerleske, 'tr');
  if (y) return y;
  const k = a.kat.localeCompare(b.kat, 'tr', { numeric: true });
  if (k) return k;
  return a.odaNo.localeCompare(b.odaNo, 'tr', { numeric: true });
}

function odaEtiket(o: KampKrokiTaseronOda): string {
  return `${o.yerleske} / ${o.kat} / Oda ${o.odaNo} (${o.kisi} kişi)`;
}

export function buildKampKrokiTaseronOzeti(
  model: KampYerleskeKroki[]
): KampKrokiTaseronOzet[] {
  const map = new Map<string, KampKrokiTaseronOzet>();

  for (const campus of model) {
    for (const kat of campus.katlar) {
      for (const cell of kat.odalar) {
        if (cell.dolu <= 0) continue;
        const byFirma = new Map<string, string[]>();
        for (const s of cell.sakinler) {
          const firma = String(s.firma || 'TAŞERON').trim() || 'TAŞERON';
          const list = byFirma.get(firma) || [];
          list.push(s.isim);
          byFirma.set(firma, list);
        }
        for (const [firma, sakinler] of byFirma) {
          let row = map.get(firma);
          if (!row) {
            row = {
              firma,
              tip: isKibritciCompany(firma) ? 'ANA_FIRMA' : 'TASERON',
              kisi: 0,
              odaSayisi: 0,
              odalar: [],
            };
            map.set(firma, row);
          }
          row.kisi += sakinler.length;
          row.odalar.push({
            yerleske: campus.yerleske,
            kat: kat.kat,
            odaNo: cell.room.odaNo || '—',
            kisi: sakinler.length,
            kapasite: cell.kapasite,
            sakinler: [...sakinler].sort((a, b) => a.localeCompare(b, 'tr')),
          });
        }
      }
    }
  }

  for (const row of map.values()) {
    row.odalar.sort(odaSort);
    row.odaSayisi = row.odalar.length;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.tip !== b.tip) return a.tip === 'TASERON' ? -1 : 1;
    return b.kisi - a.kisi || a.firma.localeCompare(b.firma, 'tr');
  });
}

async function applyKampKrokiAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(5, opts.colCount);
  const [antetDataUrl, logoDataUrl] = await Promise.all([
    loadKibritciAntetDataUrl(),
    loadKibritciLogoDataUrl(),
  ]);
  const antetB64 = pngBase64(antetDataUrl);
  const logoB64 = pngBase64(logoDataUrl);

  ws.getRow(1).height = 26;
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
      tl: { col: Math.max(colCount - 1.7, 3.4), row: 0.1 },
      ext: { width: 112, height: 44 },
    });
  }
  if (!antetB64 && !logoB64) {
    ws.mergeCells(1, 1, 2, 2);
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E4E78' } };
    ws.getCell(1, 1).alignment = { vertical: 'middle' };
  }

  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).value = `${KIBRITCI_COMPANY.legalName}  ·  ${KIBRITCI_COMPANY.phone}  ·  ${KIBRITCI_COMPANY.email}`;
  ws.getCell(3, 1).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  setFill(ws.getCell(4, 1), 'FF1E4E78');
  ws.getRow(4).height = 5;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
  ws.getCell(5, 1).alignment = { wrapText: true };
  ws.getRow(5).height = 18;

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value = opts.title;
  ws.getCell(6, 1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  ws.getCell(6, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(ws.getCell(6, 1), 'FFF1F5F9');
  ws.getRow(6).height = 22;

  ws.mergeCells(7, 1, 7, colCount);
  ws.getCell(7, 1).value = opts.subtitle;
  ws.getCell(7, 1).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(7, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.headerFooter = {
    oddHeader: `&L${KIBRITCI_COMPANY.shortName}&CKamp Krokisi Taşeron Özeti&R&D`,
    oddFooter: `&L${KIBRITCI_COMPANY.web}&C&P / &N&R${KIBRITCI_COMPANY.email}`,
  };
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  return 9;
}

function writeHeaderRow(ws: Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  ws.getRow(row).height = 22;
}

function writeFooter(ws: Worksheet, startRow: number, colCount: number) {
  const row = startRow + 1;
  ws.mergeCells(row, 1, row, colCount);
  ws.getCell(row, 1).value =
    `${KIBRITCI_COMPANY.legalName} · Antetli kamp krokisi raporu · Yalnızca AKTİF konaklama`;
  ws.getCell(row, 1).font = { size: 7, italic: true, color: { argb: 'FF94A3B8' } };
}

export async function exportKampKrokiTaseronExcel(input: {
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
  personeller: Personel[];
  yerleske?: string;
}): Promise<void> {
  const fullModel = buildKampKrokiModel(
    input.kampOdalari,
    input.kampKayitlari,
    input.personeller
  );
  const filter = String(input.yerleske || '').trim();
  const model = filter ? fullModel.filter((c) => c.yerleske === filter) : fullModel;
  const rows = buildKampKrokiTaseronOzeti(model);

  if (rows.length === 0) {
    throw new Error('Bu kapsamda aktif konaklayan personel yok. Excel üretilemedi.');
  }

  const wb = await createExcelWorkbook();
  wb.creator = 'Kibritçi ERP';
  wb.created = new Date();

  const stamp = new Date().toLocaleString('tr-TR');
  const kapsam = filter || 'Tüm yerleşkeler';
  const toplamKisi = rows.reduce((s, r) => s + r.kisi, 0);
  const toplamOda = rows.reduce((s, r) => s + r.odaSayisi, 0);
  const taseronSayisi = rows.filter((r) => r.tip === 'TASERON').length;
  const subtitle = `${kapsam}  ·  ${taseronSayisi} taşeron  ·  ${toplamKisi} kişi  ·  ${toplamOda} oda  ·  ${stamp}`;

  const ozet = wb.addWorksheet('TASERON OZET', { views: [{ state: 'frozen', ySplit: 9 }] });
  ozet.getColumn(1).width = 38;
  ozet.getColumn(2).width = 14;
  ozet.getColumn(3).width = 12;
  ozet.getColumn(4).width = 12;
  ozet.getColumn(5).width = 72;
  const ozetStart = await applyKampKrokiAntet(wb, ozet, {
    title: 'KAMP KROKİSİ — TAŞERON ODA ÖZETİ',
    subtitle,
    colCount: 5,
  });
  writeHeaderRow(ozet, ozetStart, ['Taşeron / Firma', 'Tip', 'Personel', 'Oda', 'Kaldığı odalar']);

  let r = ozetStart + 1;
  for (const row of rows) {
    ozet.getCell(r, 1).value = row.firma;
    ozet.getCell(r, 2).value = row.tip === 'ANA_FIRMA' ? 'Ana firma' : 'Taşeron';
    ozet.getCell(r, 3).value = row.kisi;
    ozet.getCell(r, 4).value = row.odaSayisi;
    ozet.getCell(r, 5).value = row.odalar.map(odaEtiket).join('  ·  ');
    ozet.getCell(r, 3).alignment = { horizontal: 'center' };
    ozet.getCell(r, 4).alignment = { horizontal: 'center' };
    ozet.getCell(r, 5).alignment = { wrapText: true, vertical: 'middle' };
    for (let c = 1; c <= 5; c += 1) {
      ozet.getCell(r, c).border = thinBorder();
      ozet.getCell(r, c).font = { size: 9 };
      if (r % 2 === 0) setFill(ozet.getCell(r, c), 'FFF8FAFC');
    }
    ozet.getRow(r).height = Math.min(60, 18 + Math.ceil(row.odalar.length / 2) * 10);
    r += 1;
  }
  ozet.getCell(r, 1).value = 'TOPLAM';
  ozet.getCell(r, 1).font = { bold: true, size: 9 };
  ozet.getCell(r, 3).value = toplamKisi;
  ozet.getCell(r, 3).font = { bold: true };
  ozet.getCell(r, 4).value = toplamOda;
  ozet.getCell(r, 4).font = { bold: true };
  for (let c = 1; c <= 5; c += 1) {
    setFill(ozet.getCell(r, c), 'FFE2E8F0');
    ozet.getCell(r, c).border = thinBorder();
  }
  writeFooter(ozet, r + 1, 5);

  const odaWs = wb.addWorksheet('ODA DETAY', { views: [{ state: 'frozen', ySplit: 9 }] });
  odaWs.getColumn(1).width = 34;
  odaWs.getColumn(2).width = 22;
  odaWs.getColumn(3).width = 16;
  odaWs.getColumn(4).width = 12;
  odaWs.getColumn(5).width = 10;
  odaWs.getColumn(6).width = 12;
  odaWs.getColumn(7).width = 48;
  const odaStart = await applyKampKrokiAntet(wb, odaWs, {
    title: 'KAMP KROKİSİ — ODA DETAY',
    subtitle,
    colCount: 7,
  });
  writeHeaderRow(odaWs, odaStart, [
    'Taşeron / Firma',
    'Yerleşke',
    'Kat',
    'Oda',
    'Kişi',
    'Kapasite',
    'Sakinler',
  ]);
  let or = odaStart + 1;
  for (const row of rows) {
    for (const oda of row.odalar) {
      odaWs.getCell(or, 1).value = row.firma;
      odaWs.getCell(or, 2).value = oda.yerleske;
      odaWs.getCell(or, 3).value = oda.kat;
      odaWs.getCell(or, 4).value = oda.odaNo;
      odaWs.getCell(or, 5).value = oda.kisi;
      odaWs.getCell(or, 6).value = oda.kapasite;
      odaWs.getCell(or, 7).value = oda.sakinler.join(', ');
      odaWs.getCell(or, 5).alignment = { horizontal: 'center' };
      odaWs.getCell(or, 6).alignment = { horizontal: 'center' };
      odaWs.getCell(or, 7).alignment = { wrapText: true, vertical: 'middle' };
      for (let c = 1; c <= 7; c += 1) {
        odaWs.getCell(or, c).border = thinBorder();
        odaWs.getCell(or, c).font = { size: 9 };
        if (or % 2 === 0) setFill(odaWs.getCell(or, c), 'FFF8FAFC');
      }
      or += 1;
    }
  }
  writeFooter(odaWs, or, 7);

  const kisiWs = wb.addWorksheet('KISI LISTESI', { views: [{ state: 'frozen', ySplit: 9 }] });
  kisiWs.getColumn(1).width = 34;
  kisiWs.getColumn(2).width = 28;
  kisiWs.getColumn(3).width = 22;
  kisiWs.getColumn(4).width = 16;
  kisiWs.getColumn(5).width = 12;
  const kisiStart = await applyKampKrokiAntet(wb, kisiWs, {
    title: 'KAMP KROKİSİ — KİŞİ LİSTESİ',
    subtitle,
    colCount: 5,
  });
  writeHeaderRow(kisiWs, kisiStart, ['Taşeron / Firma', 'Personel', 'Yerleşke', 'Kat', 'Oda']);
  let kr = kisiStart + 1;
  for (const row of rows) {
    for (const oda of row.odalar) {
      for (const isim of oda.sakinler) {
        kisiWs.getCell(kr, 1).value = row.firma;
        kisiWs.getCell(kr, 2).value = isim;
        kisiWs.getCell(kr, 3).value = oda.yerleske;
        kisiWs.getCell(kr, 4).value = oda.kat;
        kisiWs.getCell(kr, 5).value = oda.odaNo;
        for (let c = 1; c <= 5; c += 1) {
          kisiWs.getCell(kr, c).border = thinBorder();
          kisiWs.getCell(kr, c).font = { size: 9 };
          if (kr % 2 === 0) setFill(kisiWs.getCell(kr, c), 'FFF8FAFC');
        }
        kr += 1;
      }
    }
  }
  writeFooter(kisiWs, kr, 5);

  const day = new Date().toISOString().slice(0, 10);
  const yerleskeSlug = (filter || 'Tum_Yerleskeler')
    .replace(/[^\w.\-ğüşıöçĞÜŞİÖÇ ]+/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Kamp_Krokisi_Taseron_Ozeti_${yerleskeSlug}_${day}.xlsx`
  );
}
