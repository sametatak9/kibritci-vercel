import type { Worksheet, Workbook } from 'exceljs';
import type { KasaHareketi, KasaOdemeDurumu, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciReportAssets } from './kibritciBrand';
import { resolvePersonelUnvan, KASA_ADSIZ_UNVAN } from './personelUnvanUtils';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';
import { ensureKasaFisFotoPersisted, isKasaFisPdfUrl } from './sahaFaaliyetFotoStorage';
import {
  KASA_EXCEL_ARGB,
  KASA_REPORT_FORMAT,
} from './kasaReportTheme';
import {
  computeKasaLedgerTotals,
  computeKasaOdemeBazliOzet,
  filterPostDonemBazHareketleri,
  buildKasaKisiHarcamaRows,
  KASA_DONEM_BAZ,
  prepareKasaLedgerExportData,
  roundKasaMoney,
  shouldApplyDonemBazToBalance,
  type KasaLedgerTotals,
} from './kasaLedgerUtils';

function odemeLabel(d: KasaOdemeDurumu | null): string {
  if (d === 'BORC') return 'BORÇ';
  if (d === 'PERSONEL_ODEDI') return 'PERSONEL ÖDEDİ';
  if (d === 'KASA_ODEDI') return 'KASA ÖDEDİ';
  return '';
}

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: KASA_EXCEL_ARGB.border } },
    left: { style: 'thin' as const, color: { argb: KASA_EXCEL_ARGB.border } },
    bottom: { style: 'thin' as const, color: { argb: KASA_EXCEL_ARGB.border } },
    right: { style: 'thin' as const, color: { argb: KASA_EXCEL_ARGB.border } },
  };
}

function downloadBuffer(buffer: ArrayBuffer | Uint8Array | Blob, fileName: string) {
  const blob =
    buffer instanceof Blob
      ? buffer
      : new Blob([buffer as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function isOpenablePhotoUrl(url: string): boolean {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u);
}

/**
 * Excel HYPERLINK için https URL.
 * Export sırasında her fişi Storage’a yüklemek (eski davranış) butonu dakikalarca kilitliyordu.
 * Zaten https olanlar kullanılır; data: için sayfa içi «Fis Fotograflari» linki yeter.
 * İsteğe bağlı kısa deneme: yalnızca birkaç kayıt, sıkı zaman aşımı.
 */
async function resolvePhotoHttpUrl(hareketId: string, url: string): Promise<string> {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (isOpenablePhotoUrl(raw)) return raw;
  // data: / uzun inline — Storage yüklemesini export’ta atla (UI donmasın)
  if (raw.startsWith('data:') || raw.length > 80_000) return '';
  try {
    const persisted = await Promise.race([
      ensureKasaFisFotoPersisted(hareketId || `excel_${Date.now()}`, raw),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 2500)),
    ]);
    if (isOpenablePhotoUrl(persisted)) return persisted;
  } catch (err) {
    console.warn('[kasa-excel] fiş URL çözülemedi', hareketId, err);
  }
  return '';
}

/**
 * Excel’de tıklanabilir orijinal foto linki.
 * ExcelJS {hyperlink} nesnesi bazı sürümlerde açılmaz → HYPERLINK formülü kullanılır.
 * http yoksa sayfa içi «Fis Fotograflari» satırına gider.
 */
function setOriginalPhotoHyperlink(
  cell: {
    value: unknown;
    font?: unknown;
    alignment?: unknown;
    border?: unknown;
  },
  opts: {
    httpUrl?: string;
    /** 1-based Excel satırı — Fis Fotograflari sayfasında görsel */
    fotoSheetRow?: number;
  }
): void {
  const http = String(opts.httpUrl || '').trim();
  const linkFont = {
    color: { argb: 'FF0563C1' },
    underline: true,
    bold: true,
    size: 9,
  } as const;

  if (isOpenablePhotoUrl(http)) {
    // Çift tırnak kaçışı (formül içinde)
    const safeUrl = http.replace(/"/g, '""');
    cell.value = {
      formula: `HYPERLINK("${safeUrl}","Orijinali aç →")`,
    };
    cell.font = linkFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    return;
  }

  if (opts.fotoSheetRow && opts.fotoSheetRow > 0) {
    // Dahili sayfa linki — gömülü büyük görsele atlar
    cell.value = {
      text: 'Büyüğe git →',
      hyperlink: `#'Fis Fotograflari'!G${opts.fotoSheetRow}`,
      tooltip: 'Fiş Fotoğrafları sayfasındaki büyük görsele gider',
    };
    cell.font = linkFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    return;
  }

  cell.value = 'Link yok';
  cell.font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

const IMAGE_LOAD_TIMEOUT_MS = 12000;

/** Excel tablo başlığı — açık turuncu */
function applyExcelTableHead(cell: {
  value: unknown;
  font?: unknown;
  fill?: unknown;
  alignment?: unknown;
  border?: unknown;
}): void {
  cell.font = { bold: true, color: { argb: KASA_EXCEL_ARGB.tableHeadText }, size: 9 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.tableHeadBg } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = thinBorder();
}

/** Excel grup başlığı — açık turuncu */
function applyExcelGroupHead(
  cell: { value: unknown; font?: unknown; fill?: unknown; alignment?: unknown },
  row: { height?: number }
): void {
  cell.font = { bold: true, color: { argb: KASA_EXCEL_ARGB.groupHeadText }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.groupHeadBg } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 22;
}

/** Excel'e gömmek için görseli JPEG base64'e çevirir (yüksek çözünürlük, net okuma) */
async function loadImageAsJpegBase64(
  url: string,
  maxW = 1280,
  quality = 0.88
): Promise<string | null> {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const fromCanvas = (src: string): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      let done = false;
      const settle = (value: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => settle(null), IMAGE_LOAD_TIMEOUT_MS);
      const finish = () => {
        try {
          const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width || 1));
          const w = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            settle(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          settle(dataUrl.replace(/^data:image\/jpeg;base64,/i, '') || null);
        } catch {
          settle(null);
        }
      };
      img.onload = finish;
      img.onerror = () => settle(null);
      img.src = src;
    });

  try {
    // Büyük data URL’leri doğrudan gömme — xlsx şişer / yazım çöker; her zaman küçült
    if (raw.startsWith('data:image/')) {
      return await fromCanvas(raw);
    }
    return await fromCanvas(raw);
  } catch {
    return null;
  }
}

async function applyKasaAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; colCount: number }
): Promise<number> {
  const colCount = opts.colCount;
  ws.getRow(1).height = 58;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 14;
  ws.mergeCells(1, 1, 3, Math.min(3, colCount));

  const assets = await loadKibritciReportAssets();
  const headerBase64 =
    assets.headerDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (headerBase64) {
    const headerId = wb.addImage({ base64: headerBase64, extension: 'png' });
    ws.addImage(headerId, { tl: { col: 0.05, row: 0.05 }, ext: { width: 280, height: 62 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: KASA_EXCEL_ARGB.accentText } };
  }

  const metaStart = Math.min(4, colCount);
  ws.mergeCells(1, metaStart, 1, colCount);
  const titleCell = ws.getCell(1, metaStart);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 14, color: { argb: KASA_EXCEL_ARGB.accentText } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, metaStart, 2, colCount);
  const sub = ws.getCell(2, metaStart);
  sub.value = opts.subtitle;
  sub.font = { size: 9, color: { argb: KASA_EXCEL_ARGB.muted } };
  sub.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, metaStart, 3, colCount);
  const company = ws.getCell(3, metaStart);
  company.value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  company.font = { size: 8, color: { argb: KASA_EXCEL_ARGB.muted } };
  company.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: KASA_EXCEL_ARGB.accentBar },
  };
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: KASA_EXCEL_ARGB.muted } };
  ws.getRow(5).height = 16;

  // Format rozeti — Excel / HTML karışmasın
  ws.mergeCells(6, 1, 6, colCount);
  const badge = ws.getCell(6, 1);
  badge.value = KASA_REPORT_FORMAT.excel.badge;
  badge.font = { bold: true, size: 9, color: { argb: KASA_EXCEL_ARGB.badgeText } };
  badge.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.badgeBg } };
  badge.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(6).height = 22;

  return 8;
}

/** Yazdırma için kısa antet — daha az dikey alan */
async function applyKasaAntetCompact(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; colCount: number }
): Promise<number> {
  const colCount = opts.colCount;
  ws.getRow(1).height = 44;
  ws.getRow(2).height = 14;
  ws.mergeCells(1, 1, 2, Math.min(3, colCount));

  const assets = await loadKibritciReportAssets();
  const headerBase64 =
    assets.headerDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (headerBase64) {
    const headerId = wb.addImage({ base64: headerBase64, extension: 'png' });
    ws.addImage(headerId, { tl: { col: 0.05, row: 0.02 }, ext: { width: 200, height: 46 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 11, color: { argb: KASA_EXCEL_ARGB.accentText } };
  }

  const metaStart = Math.min(4, colCount);
  ws.mergeCells(1, metaStart, 1, colCount);
  const titleCell = ws.getCell(1, metaStart);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 12, color: { argb: KASA_EXCEL_ARGB.accentText } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, metaStart, 2, colCount);
  const sub = ws.getCell(2, metaStart);
  sub.value = opts.subtitle;
  sub.font = { size: 8, color: { argb: KASA_EXCEL_ARGB.muted } };
  sub.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };

  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: KASA_EXCEL_ARGB.accentBar },
  };
  ws.getRow(3).height = 3;

  return 5;
}

/** Yazdırma altı imza alanı */
function applyKasaSignatureBar(ws: Worksheet, startRow: number, colCount: number): number {
  const labels = ['HAZIRLAYAN', 'SATIN ALMA MÜDÜRÜ', 'MUHASEBE', 'ŞANTİYE ŞEFİ'];
  const span = Math.max(1, Math.floor(colCount / 4));
  let row = startRow + 1;

  ws.mergeCells(row, 1, row, colCount);
  ws.getCell(row, 1).value = 'ONAY VE İMZA';
  ws.getCell(row, 1).font = { bold: true, size: 8, color: { argb: KASA_EXCEL_ARGB.accentText } };
  ws.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(row).height = 14;
  row += 1;

  const labelRow = ws.getRow(row);
  labelRow.height = 16;
  for (let i = 0; i < 4; i += 1) {
    const startCol = i * span + 1;
    const endCol = i === 3 ? colCount : Math.min(colCount, (i + 1) * span);
    ws.mergeCells(row, startCol, row, endCol);
    const cell = ws.getCell(row, startCol);
    cell.value = labels[i];
    cell.font = { bold: true, size: 7, color: { argb: KASA_EXCEL_ARGB.tableHeadText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.tableHeadBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  }
  row += 1;

  const sigRow = ws.getRow(row);
  sigRow.height = 42;
  for (let i = 0; i < 4; i += 1) {
    const startCol = i * span + 1;
    const endCol = i === 3 ? colCount : Math.min(colCount, (i + 1) * span);
    ws.mergeCells(row, startCol, row, endCol);
    const cell = ws.getCell(row, startCol);
    cell.border = thinBorder();
    cell.alignment = { vertical: 'bottom', horizontal: 'center' };
  }
  row += 1;

  const noteRow = ws.getRow(row);
  noteRow.height = 12;
  for (let i = 0; i < 4; i += 1) {
    const startCol = i * span + 1;
    const endCol = i === 3 ? colCount : Math.min(colCount, (i + 1) * span);
    ws.mergeCells(row, startCol, row, endCol);
    const cell = ws.getCell(row, startCol);
    cell.value = 'Ad Soyad / İmza / Tarih';
    cell.font = { italic: true, size: 7, color: { argb: KASA_EXCEL_ARGB.muted } };
    cell.alignment = { horizontal: 'center', vertical: 'top' };
    cell.border = thinBorder();
  }
  row += 1;

  return row;
}

function applyPrintPageSetupFotoSheet(ws: Worksheet, lastRow: number): void {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.45,
      header: 0.15,
      footer: 0.15,
    },
  };
  if (lastRow >= 1) {
    ws.pageSetup.printArea = `A1:H${lastRow}`;
  }
}

async function embedKasaEvrakInSheet(
  workbook: Workbook,
  ws: Worksheet,
  kh: KasaHareketi,
  opts: {
    startCol: number;
    endCol: number;
    metaRow: number;
    descRow: number;
    imgRow: number;
    sira: number;
    label: string;
    httpUrlById: Map<string, string>;
  }
): Promise<void> {
  const { startCol, endCol, metaRow, descRow, imgRow, sira, label, httpUrlById } = opts;
  const odeme = resolveKasaOdemeDurumu(kh);
  const tutar = Number(kh.tutar) || 0;

  ws.mergeCells(metaRow, startCol, metaRow, endCol);
  const metaCell = ws.getCell(metaRow, startCol);
  metaCell.value = `#${sira} · ${kh.tarih} · ${label} · ${odemeLabel(odeme) || 'KASA ÖDEDİ'} · ${kh.fisNo || '—'} · ${tutar}`;
  metaCell.font = { bold: true, size: 8, color: { argb: KASA_EXCEL_ARGB.accentText } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.headerBg } };
  metaCell.alignment = { vertical: 'middle', wrapText: true };
  metaCell.border = thinBorder();

  ws.mergeCells(descRow, startCol, descRow, endCol);
  const descCell = ws.getCell(descRow, startCol);
  descCell.value = String(kh.aciklama || '—');
  descCell.font = { size: 8 };
  descCell.alignment = { vertical: 'top', wrapText: true };
  descCell.border = thinBorder();

  ws.mergeCells(imgRow, startCol, imgRow, endCol);
  const imgCell = ws.getCell(imgRow, startCol);
  imgCell.border = thinBorder();
  imgCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const fotoUrl = String(kh.fisEvrakUrl || '').trim();
  const httpUrl = httpUrlById.get(kh.id) || '';
  const isPdf = isKasaFisPdfUrl(fotoUrl) || isKasaFisPdfUrl(httpUrl);

  if (isPdf) {
    setOriginalPhotoHyperlink(imgCell, { httpUrl: httpUrl || fotoUrl, fotoSheetRow: metaRow });
    return;
  }

  const b64 = await loadImageAsJpegBase64(httpUrl || fotoUrl, 1280, 0.9);
  if (b64) {
    const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
    ws.addImage(imageId, {
      tl: { col: startCol - 1 + 0.08, row: imgRow - 1 + 0.05 },
      ext: { width: 360, height: EVRAK_PAIR_IMG_H - 12 },
      editAs: 'oneCell',
    });
  } else {
    imgCell.value = 'Görsel yüklenemedi';
    imgCell.font = { italic: true, color: { argb: 'FF94A3B8' }, size: 8 };
  }
}

const EVRAK_PAIR_META_H = 32;
const EVRAK_PAIR_DESC_H = 28;
const EVRAK_PAIR_IMG_H = 200;

function applyPrintPageSetup(ws: Worksheet, headerRow: number, colCount: number, lastRow: number): void {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.45,
      header: 0.15,
      footer: 0.15,
    },
  };
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  if (lastRow >= headerRow) {
    const lastCol = String.fromCharCode(64 + Math.min(colCount, 26));
    ws.pageSetup.printArea = `A1:${lastCol}${lastRow}`;
  }
}

type KisiBucket = {
  key: string;
  label: string;
  toplam: number;
  kalemler: KasaHareketi[];
};

function groupByPersonel(
  rows: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>
): KisiBucket[] {
  const map = new Map<string, KisiBucket>();
  for (const kh of rows) {
    if (kh.hareketTipi !== 'ÇIKIŞ') continue;
    const tutar = Number(kh.tutar) || 0;
    if (tutar <= 0) continue;
    const unvan = resolvePersonelUnvan(
      {
        personelId: kh.personelId,
        personelAdi: kh.personelAdi,
        surucu: kh.surucu,
      },
      personeller
    );
    const prev = map.get(unvan.key);
    if (prev) {
      prev.toplam += tutar;
      prev.kalemler.push(kh);
    } else {
      map.set(unvan.key, {
        key: unvan.key,
        label: unvan.label || KASA_ADSIZ_UNVAN,
        toplam: tutar,
        kalemler: [kh],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.toplam - a.toplam);
}

type ExcelPersonRow = {
  label: string;
  kalem: number;
  borc: number;
  personel: number;
  kasa: number;
  toplam: number;
};

/** Excel özet tablosu — kişi kırılımı (BORÇ / Personel / Kasa sütunları) */
function buildKasaExcelPersonRows(
  inRange: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  donemBazAktif: boolean,
  totalOut?: number
): ExcelPersonRow[] {
  const cikislar = inRange.filter((k) => k.hareketTipi === 'ÇIKIŞ');
  return buildKasaKisiHarcamaRows(cikislar, personeller, { donemBazAktif, totalOut }).map(
    (r) => ({
      label: r.label,
      kalem: r.kalem,
      borc: r.borc,
      personel: r.personel,
      kasa: r.kasa,
      toplam: r.tutar,
    })
  );
}

function writeOzetBaslik(
  sheet: Worksheet,
  row: number,
  cols: number,
  title: string,
  bg = 'FFFFF7ED'
): void {
  sheet.mergeCells(row, 1, row, cols);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 10 };
  cell.alignment = { vertical: 'middle', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  sheet.getRow(row).height = 20;
}

function writeOzetTabloBaslik(sheet: Worksheet, row: number): void {
  const hr = sheet.getRow(row);
  hr.height = 18;
  const headers = ['#', 'AÇIKLAMA / KİŞİ', '', '', 'KALEM', '', 'TOPLAM (₺)'];
  headers.forEach((h, i) => {
    if (i === 2 || i === 3 || i === 5) return;
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: i >= 4 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  sheet.mergeCells(row, 2, row, 4);
}

function writeOzetSatir(
  sheet: Worksheet,
  row: number,
  sira: number,
  label: string,
  kalem: number,
  toplam: number,
  bold = false
): void {
  const r = sheet.getRow(row);
  r.height = 18;
  r.getCell(1).value = sira;
  r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells(row, 2, row, 4);
  const labelCell = r.getCell(2);
  labelCell.value = label;
  labelCell.alignment = { vertical: 'middle', wrapText: true };
  labelCell.font = { size: 10, bold };
  r.getCell(5).value = kalem;
  r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  setDefterMoneyValue(r.getCell(7), toplam);
  for (let c = 1; c <= 7; c++) {
    const cell = r.getCell(c);
    cell.border = thinBorder();
    if (!bold) cell.font = { size: 10, ...(c === 2 ? { bold: true } : {}) };
    else cell.font = { size: 10, bold: true };
  }
}

/** Üst özet: genel toplam + kişi + kategori — altına defter gelir */
function appendKasaMasrafOzetBlock(
  sheet: Worksheet,
  inRange: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  startRow: number,
  cols: number,
  totals?: KasaLedgerTotals
): number {
  let row = startRow;
  const donemBazAktif = Boolean(totals?.donemBazAktif);
  const cikislar = inRange.filter((k) => k.hareketTipi === 'ÇIKIŞ');
  const girisler = inRange.filter((k) => k.hareketTipi === 'GİRİŞ');
  const postGirisler = donemBazAktif ? filterPostDonemBazHareketleri(girisler) : girisler;
  const effectiveTotals = totals ?? computeKasaLedgerTotals(inRange);
  const totalOut = effectiveTotals.totalOut;
  const totalIn = effectiveTotals.totalIn;

  writeOzetBaslik(sheet, row, cols, 'GENEL TOPLAM — KASA HARCAMA (ÇIKIŞ)', 'FFFFEDD5');
  row += 1;
  writeOzetSatir(
    sheet,
    row,
    1,
    `${effectiveTotals.cikisKalem} kalem · BORÇ + Personel ödedi + Kasa ödedi`,
    effectiveTotals.cikisKalem,
    totalOut,
    true
  );
  row += 2;

  if (girisler.length > 0 || donemBazAktif) {
    writeOzetBaslik(sheet, row, cols, 'KASA GİRİŞLERİ (EFT / TAHSİLAT)', 'FFC6EFCE');
    row += 1;
    writeOzetTabloBaslik(sheet, row);
    row += 1;
    if (donemBazAktif) {
      writeOzetSatir(
        sheet,
        row,
        1,
        `Dönem baz giriş (${KASA_DONEM_BAZ.baslangic} — ${KASA_DONEM_BAZ.kapanis})`,
        1,
        KASA_DONEM_BAZ.giren
      );
      row += 1;
    }
    postGirisler
      .slice()
      .sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)))
      .forEach((kh, i) => {
        writeOzetSatir(
          sheet,
          row,
          donemBazAktif ? i + 2 : i + 1,
          `${formatTarihDdMmYyyy(kh.tarih)} · ${buildDefterAciklama(kh, personeller)}`,
          1,
          roundKasaMoney(kh.tutar)
        );
        row += 1;
      });
    const girisKalem = donemBazAktif ? 1 + postGirisler.length : girisler.length;
    writeOzetSatir(sheet, row, 0, 'GİRİŞ TOPLAMI', girisKalem, totalIn, true);
    row += 2;
  }

  writeOzetBaslik(
    sheet,
    row,
    cols,
    'HARCAMA BAZLI KİŞİ ÖZETİ — KİM NE KADAR MASRAF YAPMIŞ'
  );
  row += 1;
  writeOzetTabloBaslik(sheet, row);
  row += 1;
  const kisiOzet = computeKasaOdemeBazliOzet(cikislar, personeller, {
    donemBazAktif,
    totalOut,
  });
  kisiOzet.satirlar.forEach((b, i) => {
    writeOzetSatir(sheet, row, i + 1, b.label, b.kalem, roundKasaMoney(b.tutar));
    row += 1;
  });
  if (kisiOzet.satirlar.length === 0) {
    writeOzetSatir(sheet, row, 1, 'Bu dönemde kasa çıkışı yok', 0, 0);
    row += 1;
  } else {
    writeOzetSatir(sheet, row, 0, 'TOPLAM', effectiveTotals.cikisKalem, totalOut, true);
    row += 1;
  }
  row += 1;

  writeOzetBaslik(sheet, row, cols, 'KALEM KALEM DEFTER — DETAY HAREKETLER', 'FFE2E8F0');
  row += 1;
  return row;
}

const TR_AY_UPPER = [
  'OCAK',
  'ŞUBAT',
  'MART',
  'NİSAN',
  'MAYIS',
  'HAZİRAN',
  'TEMMUZ',
  'AĞUSTOS',
  'EYLÜL',
  'EKİM',
  'KASIM',
  'ARALIK',
] as const;

const DEFTER_GIRIS_FILL = 'FFC6EFCE';
/** Excel format tanımı — binlik , ondalık . (Excel locale'e göre 25.000,00 gösterir) */
const DEFTER_NUM_FMT = '#,##0.00';

function formatTarihDdMmYyyy(iso: string): string {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso || '');
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
}

function tarihAyYilParts(iso: string): { ay: string; yil: string } {
  const [, m, y] = String(iso || '').slice(0, 10).split('-');
  const mi = Math.max(0, Math.min(11, (Number(m) || 1) - 1));
  return { ay: TR_AY_UPPER[mi], yil: y || '' };
}

function applyDefterMoneyCell(cell: {
  numFmt?: string;
  alignment?: unknown;
  value?: unknown;
}): void {
  cell.numFmt = DEFTER_NUM_FMT;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

/** Para hücresine yuvarlanmış sayı yazar — kayan nokta / fazla sıfır olmaz */
function setDefterMoneyValue(
  cell: { value?: unknown; numFmt?: string; alignment?: unknown },
  amount: number
): void {
  cell.value = roundKasaMoney(amount);
  applyDefterMoneyCell(cell);
}

function buildDefterAciklama(
  kh: KasaHareketi,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>
): string {
  const raw = String(kh.aciklama || '').trim();
  if (raw) return raw.toLocaleUpperCase('tr-TR');

  const unvan = resolvePersonelUnvan(
    { personelId: kh.personelId, personelAdi: kh.personelAdi, surucu: kh.surucu },
    personeller
  );
  if (kh.hareketTipi === 'GİRİŞ') {
    if (unvan.label !== KASA_ADSIZ_UNVAN) {
      return `${unvan.label} TARAFINDAN YAPILAN GİRİŞ`;
    }
    return 'KASA GİRİŞİ';
  }
  if (unvan.label !== KASA_ADSIZ_UNVAN) {
    return `${unvan.label} — KASA ÇIKIŞI`;
  }
  return 'KASA HARCAMASI';
}

/** Sade kayıt defteri — Tarih · Ay · Yıl · Açıklama · Giren · Çıkan · Bakiye */
function addHaftalikKasaDefterSheet(
  workbook: Workbook,
  inRange: KasaHareketi[],
  startDate: string,
  endDate: string,
  openingBalance: number,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  totals?: KasaLedgerTotals
): void {
  const COLS = 7;
  const sheet = workbook.addWorksheet('Haftalik Defter', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: true }],
  });
  sheet.columns = [
    { width: 12 },
    { width: 11 },
    { width: 7 },
    { width: 52 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
  ];

  const title = `ARNAVUTKÖY HAFTALIK KASA HARCAMASI ${formatTarihDdMmYyyy(endDate)}`;
  sheet.mergeCells(1, 1, 1, COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  let row = appendKasaMasrafOzetBlock(sheet, inRange, personeller, 2, COLS, totals);

  const headers = ['TARİH', 'AY', 'YIL', 'AÇIKLAMA', 'GİREN', 'ÇIKAN', 'BAKİYE'];
  const hr = sheet.getRow(row);
  hr.height = 20;
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  row += 1;

  let balance = openingBalance;
  const donemBazAktif = Boolean(totals?.donemBazAktif);
  writeDefterCarryRow(
    sheet,
    row,
    COLS,
    openingBalance,
    donemBazAktif ? KASA_DONEM_BAZ.carryLabel : undefined
  );
  row += 1;

  const sorted = [...inRange].sort((a, b) => {
    const dc = String(a.tarih).localeCompare(String(b.tarih));
    if (dc !== 0) return dc;
    if (a.hareketTipi !== b.hareketTipi) {
      return a.hareketTipi === 'GİRİŞ' ? -1 : 1;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  for (const kh of sorted) {
    const t = roundKasaMoney(kh.tutar);
    const isGiris = kh.hareketTipi === 'GİRİŞ';
    const { ay, yil } = tarihAyYilParts(kh.tarih);
    const r = sheet.getRow(row);
    r.height = 18;

    r.getCell(1).value = formatTarihDdMmYyyy(kh.tarih);
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).value = ay;
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(3).value = yil;
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).value = buildDefterAciklama(kh, personeller);
    r.getCell(4).alignment = { vertical: 'middle', wrapText: true };
    setDefterMoneyValue(r.getCell(5), isGiris ? t : 0);
    setDefterMoneyValue(r.getCell(6), isGiris ? 0 : t);
    if (shouldApplyDonemBazToBalance(kh, donemBazAktif)) {
      balance = roundKasaMoney(isGiris ? balance + t : balance - t);
    }
    setDefterMoneyValue(r.getCell(7), balance);

    for (let c = 1; c <= COLS; c++) {
      const cell = r.getCell(c);
      cell.border = thinBorder();
      cell.font = { size: 10 };
      if (c >= 5) applyDefterMoneyCell(cell);
      if (isGiris) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DEFTER_GIRIS_FILL } };
      }
    }
    row += 1;
  }

  for (let i = 0; i < 10; i++) {
    const r = sheet.getRow(row);
    r.height = 18;
    for (let c = 1; c <= COLS; c++) {
      r.getCell(c).border = thinBorder();
    }
    row += 1;
  }

  sheet.pageSetup.printArea = `A1:G${row - 1}`;
}

function writeDefterCarryRow(
  sheet: Worksheet,
  row: number,
  cols: number,
  openingBalance: number,
  carryLabel?: string
): void {
  const carry = sheet.getRow(row);
  carry.height = 18;
  carry.getCell(4).value =
    carryLabel ||
    (openingBalance === 0 ? 'DÖNEM BAŞI BAKİYE (0)' : 'GEÇEN HAFTADAN DEVREDEN');
  setDefterMoneyValue(carry.getCell(5), 0);
  setDefterMoneyValue(carry.getCell(6), 0);
  setDefterMoneyValue(carry.getCell(7), openingBalance);
  carry.getCell(4).font = { bold: true, size: 10 };
  carry.getCell(4).alignment = { vertical: 'middle', wrapText: true };
  for (let c = 1; c <= cols; c++) {
    const cell = carry.getCell(c);
    cell.border = thinBorder();
    cell.font = { size: 10, ...(c === 4 ? { bold: true } : {}) };
    if (c >= 5) applyDefterMoneyCell(cell);
  }
}

/** ARNAVUTKÖY.xls şablonu — tek sayfa, özet satırı + başlık + defter */
function addArnavutkoyKasaDefterSheet(
  workbook: Workbook,
  inRange: KasaHareketi[],
  startDate: string,
  endDate: string,
  openingBalance: number,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  totals?: KasaLedgerTotals
): void {
  const COLS = 7;
  const sheet = workbook.addWorksheet('ARNAVUTKÖY', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: true }],
  });
  sheet.columns = [
    { width: 12 },
    { width: 11 },
    { width: 7 },
    { width: 52 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
  ];

  let totalIn = totals?.totalIn ?? 0;
  let totalOut = totals?.totalOut ?? 0;
  let closingBalance = totals?.closing ?? openingBalance;
  if (!totals) {
    for (const kh of inRange) {
      const t = roundKasaMoney(kh.tutar);
      if (kh.hareketTipi === 'GİRİŞ') totalIn += t;
      else totalOut += t;
    }
    totalIn = roundKasaMoney(totalIn);
    totalOut = roundKasaMoney(totalOut);
    closingBalance = roundKasaMoney(openingBalance + totalIn - totalOut);
  }
  let balance = openingBalance;
  const donemBazAktif = Boolean(totals?.donemBazAktif);

  sheet.mergeCells(1, 1, 1, COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `ARNAVUTKÖY KASA DEFTERİ · ${formatTarihLabelTr(startDate)} — ${formatTarihLabelTr(endDate)}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  let row = appendKasaMasrafOzetBlock(sheet, inRange, personeller, 2, COLS, totals);

  const headers = ['TARİH', 'AY', 'YIL', 'AÇIKLAMA', 'GİREN', 'ÇIKAN', 'BAKİYE'];
  const hr = sheet.getRow(row);
  hr.height = 20;
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  row += 1;
  writeDefterCarryRow(
    sheet,
    row,
    COLS,
    openingBalance,
    donemBazAktif ? KASA_DONEM_BAZ.carryLabel : undefined
  );
  row += 1;

  const sorted = [...inRange].sort((a, b) => {
    const dc = String(a.tarih).localeCompare(String(b.tarih));
    if (dc !== 0) return dc;
    if (a.hareketTipi !== b.hareketTipi) {
      return a.hareketTipi === 'GİRİŞ' ? -1 : 1;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  for (const kh of sorted) {
    const t = roundKasaMoney(kh.tutar);
    const isGiris = kh.hareketTipi === 'GİRİŞ';
    const { ay, yil } = tarihAyYilParts(kh.tarih);
    const r = sheet.getRow(row);
    r.height = 18;

    const dateCell = r.getCell(1);
    dateCell.value = new Date(`${String(kh.tarih).slice(0, 10)}T12:00:00`);
    dateCell.numFmt = 'dd.mm.yyyy';
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).value = ay;
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(3).value = Number(yil) || yil;
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).value = buildDefterAciklama(kh, personeller);
    r.getCell(4).alignment = { vertical: 'middle', wrapText: true };
    setDefterMoneyValue(r.getCell(5), isGiris ? t : 0);
    setDefterMoneyValue(r.getCell(6), isGiris ? 0 : t);
    if (shouldApplyDonemBazToBalance(kh, donemBazAktif)) {
      balance = roundKasaMoney(isGiris ? balance + t : balance - t);
    }
    setDefterMoneyValue(r.getCell(7), balance);

    for (let c = 1; c <= COLS; c++) {
      const cell = r.getCell(c);
      cell.border = thinBorder();
      cell.font = { size: 10 };
      if (c >= 5) applyDefterMoneyCell(cell);
      if (isGiris) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DEFTER_GIRIS_FILL } };
      }
    }
    row += 1;
  }

  const footer = sheet.getRow(row);
  footer.height = 22;
  footer.getCell(2).value = 'PROJE MÜDÜRÜ';
  footer.getCell(2).font = { bold: true, size: 10 };
  footer.getCell(4).value = 'DÖNEM TOPLAMLARI';
  footer.getCell(4).font = { bold: true, size: 10 };
  setDefterMoneyValue(footer.getCell(5), totalIn);
  setDefterMoneyValue(footer.getCell(6), totalOut);
  setDefterMoneyValue(footer.getCell(7), closingBalance);
  for (let c = 1; c <= COLS; c++) {
    const cell = footer.getCell(c);
    cell.border = thinBorder();
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }
  row += 1;

  sheet.pageSetup.printArea = `A1:G${Math.max(row - 1, 1)}`;
}

/**
 * Yalnızca ARNAVUTKÖY tarzı kasa defteri (.xlsx) — tek sayfa.
 */
export async function buildKasaDefterOnlyExcelBuffer(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = [],
  allKasaHareketleri?: KasaHareketi[]
): Promise<ArrayBuffer> {
  const all = allKasaHareketleri ?? kasaHareketleri ?? [];
  const { inRange, opening, totals } = prepareKasaLedgerExportData(all, startDate, endDate);

  if (inRange.length === 0 && opening === 0) {
    throw new Error('Seçili aralıkta dışa aktarılacak kasa hareketi yok. Tarih filtresini kontrol edin.');
  }

  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();
  addArnavutkoyKasaDefterSheet(
    workbook,
    inRange,
    startDate,
    endDate,
    opening,
    personeller,
    totals
  );
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function exportKasaDefterExcel(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = [],
  allKasaHareketleri?: KasaHareketi[]
): Promise<void> {
  const { KASA_REPORT_FORMAT } = await import('./kasaReportTheme');
  const buffer = await buildKasaDefterOnlyExcelBuffer(
    kasaHareketleri,
    startDate,
    endDate,
    personeller,
    allKasaHareketleri
  );
  downloadBuffer(
    buffer,
    `${KASA_REPORT_FORMAT.defterExcel.filePrefix}_${startDate}_${endDate}.xlsx`
  );
}

function formatTarihLabelTr(iso: string): string {
  return formatTarihDdMmYyyy(iso);
}

/** Haftalık Kasa İcmali — aralık özeti + defter + alt toplam satırı */
function addHaftalikKasaIcmalSheet(
  workbook: Workbook,
  inRange: KasaHareketi[],
  startDate: string,
  endDate: string,
  openingBalance: number,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>,
  totals?: KasaLedgerTotals
): void {
  const COLS = 7;
  const sheet = workbook.addWorksheet('KASA İCMALİ', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: true }],
  });
  sheet.columns = [
    { width: 12 },
    { width: 11 },
    { width: 7 },
    { width: 52 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
  ];

  let totalIn = totals?.totalIn ?? 0;
  let totalOut = totals?.totalOut ?? 0;
  const opening = openingBalance;
  let balance = opening;
  const closing = totals?.closing ?? roundKasaMoney(opening + totalIn - totalOut);
  if (!totals) {
    for (const kh of inRange) {
      const t = roundKasaMoney(kh.tutar);
      if (kh.hareketTipi === 'GİRİŞ') totalIn += t;
      else totalOut += t;
    }
    totalIn = roundKasaMoney(totalIn);
    totalOut = roundKasaMoney(totalOut);
  }

  sheet.mergeCells(1, 1, 1, COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `HAFTALIK KASA İCMALİ · ${formatTarihLabelTr(startDate)} — ${formatTarihLabelTr(endDate)}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  let row = appendKasaMasrafOzetBlock(sheet, inRange, personeller, 2, COLS, totals);

  const headers = ['TARİH', 'AY', 'YIL', 'AÇIKLAMA', 'GİREN', 'ÇIKAN', 'BAKİYE'];
  const hr = sheet.getRow(row);
  hr.height = 20;
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  row += 1;
  const donemBazAktif = Boolean(totals?.donemBazAktif);
  writeDefterCarryRow(
    sheet,
    row,
    COLS,
    openingBalance,
    donemBazAktif ? KASA_DONEM_BAZ.carryLabel : undefined
  );
  row += 1;

  const sorted = [...inRange].sort((a, b) => {
    const dc = String(a.tarih).localeCompare(String(b.tarih));
    if (dc !== 0) return dc;
    if (a.hareketTipi !== b.hareketTipi) return a.hareketTipi === 'GİRİŞ' ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });

  for (const kh of sorted) {
    const t = roundKasaMoney(kh.tutar);
    const isGiris = kh.hareketTipi === 'GİRİŞ';
    const { ay, yil } = tarihAyYilParts(kh.tarih);
    const r = sheet.getRow(row);
    r.height = 18;
    const dateCell = r.getCell(1);
    dateCell.value = new Date(`${String(kh.tarih).slice(0, 10)}T12:00:00`);
    dateCell.numFmt = 'dd.mm.yyyy';
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).value = ay;
    r.getCell(3).value = Number(yil) || yil;
    r.getCell(4).value = buildDefterAciklama(kh, personeller);
    setDefterMoneyValue(r.getCell(5), isGiris ? t : 0);
    setDefterMoneyValue(r.getCell(6), isGiris ? 0 : t);
    if (shouldApplyDonemBazToBalance(kh, donemBazAktif)) {
      balance = roundKasaMoney(isGiris ? balance + t : balance - t);
    }
    setDefterMoneyValue(r.getCell(7), balance);
    for (let c = 1; c <= COLS; c++) {
      const cell = r.getCell(c);
      cell.border = thinBorder();
      cell.font = { size: 10 };
      if (c >= 5) applyDefterMoneyCell(cell);
      if (isGiris) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DEFTER_GIRIS_FILL } };
      }
    }
    row += 1;
  }

  const totalRow = sheet.getRow(row);
  totalRow.height = 22;
  totalRow.getCell(4).value = `DÖNEM TOPLAMI (${formatTarihLabelTr(startDate)} — ${formatTarihLabelTr(endDate)})`;
  totalRow.getCell(4).font = { bold: true, size: 10 };
  setDefterMoneyValue(totalRow.getCell(5), totalIn);
  setDefterMoneyValue(totalRow.getCell(6), totalOut);
  setDefterMoneyValue(totalRow.getCell(7), closing);
  for (let c = 1; c <= COLS; c++) {
    const cell = totalRow.getCell(c);
    cell.border = thinBorder();
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  }

  sheet.pageSetup.printArea = `A1:G${row}`;
}

export async function buildKasaHaftalikIcmalExcelBuffer(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = [],
  allKasaHareketleri?: KasaHareketi[]
): Promise<ArrayBuffer> {
  const all = allKasaHareketleri ?? kasaHareketleri ?? [];
  const { inRange, opening, totals } = prepareKasaLedgerExportData(all, startDate, endDate);
  if (inRange.length === 0 && opening === 0) {
    throw new Error('Seçili aralıkta icmal raporu için kasa hareketi yok.');
  }
  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();
  addHaftalikKasaIcmalSheet(
    workbook,
    inRange,
    startDate,
    endDate,
    opening,
    personeller,
    totals
  );
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function exportKasaHaftalikIcmalExcel(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = [],
  allKasaHareketleri?: KasaHareketi[]
): Promise<void> {
  const { KASA_REPORT_FORMAT } = await import('./kasaReportTheme');
  const buffer = await buildKasaHaftalikIcmalExcelBuffer(
    kasaHareketleri,
    startDate,
    endDate,
    personeller,
    allKasaHareketleri
  );
  downloadBuffer(
    buffer,
    `${KASA_REPORT_FORMAT.icmalExcel.filePrefix}_${startDate}_${endDate}.xlsx`
  );
}

/**
 * Haftalık Kasa Excel — Kibritçi antetli, kişi bazlı masraf özeti + kalem kalem + fiş fotoğrafları.
 * @returns xlsx binary buffer (e-posta paylaşımı / indirme için)
 */
export async function buildKasaExcelBuffer(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = [],
  allKasaHareketleri?: KasaHareketi[]
): Promise<ArrayBuffer> {
  const all = allKasaHareketleri ?? kasaHareketleri ?? [];
  const { inRange, totals, donemBazAktif } = prepareKasaLedgerExportData(all, startDate, endDate);

  if (inRange.length === 0 && totals.closing === 0 && totals.totalIn === 0 && totals.totalOut === 0) {
    throw new Error('Seçili aralıkta dışa aktarılacak kasa hareketi yok. Tarih filtresini kontrol edin.');
  }

  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();

  const cikislar = inRange.filter((k) => k.hareketTipi === 'ÇIKIŞ');
  const girisler = inRange.filter((k) => k.hareketTipi === 'GİRİŞ');
  const personRows = buildKasaExcelPersonRows(inRange, personeller, donemBazAktif, totals.totalOut);
  const ozet = computeKasaOdemeBazliOzet(cikislar, personeller, {
    donemBazAktif,
    totalOut: totals.totalOut,
  });

  const totalIn = totals.totalIn;
  const totalOut = totals.totalOut;
  const borc = ozet.totals.BORC;
  const personelOdedi = ozet.totals.PERSONEL_ODEDI;
  const kasaOdedi = ozet.totals.KASA_ODEDI;

  const digerKalem = cikislar.filter((k) => {
    const d = resolveKasaOdemeDurumu(k) || 'KASA_ODEDI';
    return d === 'BORC' || d === 'PERSONEL_ODEDI';
  }).length;
  const kasaKalem = Math.max(0, totals.cikisKalem - digerKalem);

  // Fiş URL’leri — yalnızca hazır https (Storage upload export’u kilitlemesin)
  const withFotoAll = cikislar.filter((k) => String(k.fisEvrakUrl || '').trim());
  const httpUrlById = new Map<string, string>();
  await Promise.all(
    withFotoAll.map(async (kh) => {
      const resolved = await resolvePhotoHttpUrl(kh.id, String(kh.fisEvrakUrl));
      if (resolved) httpUrlById.set(kh.id, resolved);
    })
  );

  const COL = 8;
  const OZET_COLS = 7;

  // ─── Sayfa 1: Kişi özeti + imza + kalem kalem (tek yazdırma sayfası) ───
  const sheet = workbook.addWorksheet('Haftalik Kasa', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  sheet.columns = [
    { width: 4 },
    { width: 22 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 9 },
  ];

  let row = await applyKasaAntetCompact(workbook, sheet, {
    title: 'HAFTALIK KASA — KİŞİ BAZLI MASRAF ÖZETİ',
    subtitle: `Dönem: ${startDate} — ${endDate} · Baskı: ${new Date().toLocaleString('tr-TR')}`,
    colCount: COL,
  });

  sheet.mergeCells(row, 1, row, COL);
  sheet.getCell(row, 1).value = KASA_REPORT_FORMAT.excel.badge;
  sheet.getCell(row, 1).font = { bold: true, size: 7, color: { argb: KASA_EXCEL_ARGB.badgeText } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.badgeBg } };
  sheet.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(row).height = 14;
  row += 1;

  sheet.mergeCells(row, 1, row, COL);
  sheet.getCell(row, 1).value =
    'Kim ne kadar masraf yapmış — çıkışlar personele / şoföre göre gruplanır';
  sheet.getCell(row, 1).font = { size: 8, italic: true, color: { argb: 'FF475569' } };
  row += 2;

  const digerSum = roundKasaMoney(borc + personelOdedi);

  const kaynakRows = [
    { label: 'DİĞER HARCAMALAR (borç + personel ödedi)', count: digerKalem, total: digerSum },
    { label: 'KASANIN HARCAMASI (kasa ödedi)', count: kasaKalem, total: kasaOdedi },
    { label: 'GENEL TOPLAM', count: totals.cikisKalem, total: totalOut, bold: true },
  ];
  for (const kr of kaynakRows) {
    sheet.mergeCells(row, 1, row, 4);
    const lc = sheet.getCell(row, 1);
    lc.value = kr.label;
    lc.font = { bold: !!kr.bold, size: 8, color: { argb: kr.bold ? KASA_EXCEL_ARGB.accentText : 'FF334155' } };
    sheet.getCell(row, 5).value = `${kr.count} kalem`;
    sheet.getCell(row, 5).font = { size: 8, color: { argb: 'FF64748B' } };
    sheet.mergeCells(row, 6, row, OZET_COLS);
    const tc = sheet.getCell(row, 6);
    tc.value = kr.total;
    tc.numFmt = '#,##0.00 "₺"';
    tc.font = { bold: true, size: 8, color: { argb: kr.bold ? 'FFB91C1C' : 'FF0F172A' } };
    tc.alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.getRow(row).height = 14;
    row += 1;
  }
  row += 1;

  const ozetHeaders = ['#', 'PERSONEL / ŞOFÖR', 'KALEM', 'BORÇ', 'PERSONEL ÖDEDİ', 'KASA ÖDEDİ', 'TOPLAM'];
  const oh = sheet.getRow(row);
  oh.height = 16;
  ozetHeaders.forEach((h, i) => {
    const cell = oh.getCell(i + 1);
    cell.value = h;
    applyExcelTableHead(cell);
  });
  row += 1;

  personRows.forEach((b, idx) => {
    const r = sheet.getRow(row);
    r.height = 15;
    const vals: (string | number)[] = [
      idx + 1,
      b.label,
      b.kalem,
      b.borc,
      b.personel,
      b.kasa,
      b.toplam,
    ];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.border = thinBorder();
      cell.font = { size: 8 };
      cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
      if (i >= 3) {
        cell.numFmt = '#,##0.00 "₺"';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      if (i === 1) cell.font = { bold: true, size: 8 };
      if (i === 6) cell.font = { bold: true, size: 8, color: { argb: 'FFB91C1C' } };
    });
    row += 1;
  });

  row += 1;
  const ozetTotals: Array<{ label: string; value: number; color: string }> = [
    { label: 'BORÇ TOPLAM', value: borc, color: 'FFB45309' },
    { label: 'PERSONEL ÖDEDİ TOPLAM', value: personelOdedi, color: 'FF6D28D9' },
    { label: 'KASA ÖDEDİ TOPLAM', value: kasaOdedi, color: 'FF1D4ED8' },
    { label: 'TOPLAM ÇIKIŞ', value: totalOut, color: 'FFB91C1C' },
    { label: 'TOPLAM GİRİŞ', value: totalIn, color: 'FF047857' },
    { label: 'NET DURUM (KASAYA BORÇ)', value: totals.netDurum, color: 'FF1E4E78' },
  ];
  for (const ot of ozetTotals) {
    sheet.mergeCells(row, 1, row, 5);
    sheet.getCell(row, 1).value = ot.label;
    sheet.getCell(row, 1).font = { bold: true, size: 8, color: { argb: ot.color } };
    sheet.getCell(row, 1).alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.mergeCells(row, 6, row, OZET_COLS);
    const vc = sheet.getCell(row, 6);
    vc.value = ot.value;
    vc.numFmt = '#,##0.00 "₺"';
    vc.font = { bold: true, size: 8, color: { argb: ot.color } };
    vc.alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.getRow(row).height = 14;
    row += 1;
  }

  row = applyKasaSignatureBar(sheet, row, COL);
  row += 1;

  sheet.mergeCells(row, 1, row, COL);
  const kalemHead = sheet.getCell(row, 1);
  kalemHead.value = 'KALEM KALEM DETAY';
  applyExcelGroupHead(kalemHead, sheet.getRow(row));
  row += 1;

  const headerRow = row;
  const kalemHeaders = ['#', 'TARİH', 'PERSONEL / ŞOFÖR', 'ÖDEME', 'FİŞ NO', 'AÇIKLAMA', 'TUTAR', 'FİŞ'];
  const khRow = sheet.getRow(row);
  khRow.height = 16;
  kalemHeaders.forEach((h, i) => {
    const cell = khRow.getCell(i + 1);
    cell.value = h;
    applyExcelTableHead(cell);
  });
  row += 1;

  const pendingOriginalLinks: Array<{
    hareketId: string;
    cell: { value: unknown; font?: unknown; alignment?: unknown; border?: unknown };
    rawUrl: string;
  }> = [];

  const allCikisSorted = [...cikislar].sort((a, c) => {
    const dateCmp = String(a.tarih).localeCompare(String(c.tarih));
    if (dateCmp !== 0) return dateCmp;
    const la = resolvePersonelUnvan(
      { personelId: a.personelId, personelAdi: a.personelAdi, surucu: a.surucu },
      personeller
    ).label;
    const lb = resolvePersonelUnvan(
      { personelId: c.personelId, personelAdi: c.personelAdi, surucu: c.surucu },
      personeller
    ).label;
    return la.localeCompare(lb, 'tr');
  });

  allCikisSorted.forEach((kh, idx) => {
    const unvan = resolvePersonelUnvan(
      { personelId: kh.personelId, personelAdi: kh.personelAdi, surucu: kh.surucu },
      personeller
    );
    const odeme = resolveKasaOdemeDurumu(kh);
    const r = sheet.getRow(row);
    r.height = 15;
    const vals: (string | number)[] = [
      idx + 1,
      kh.tarih,
      unvan.label,
      odemeLabel(odeme) || 'KASA ÖDEDİ',
      kh.fisNo || '—',
      kh.aciklama || '—',
      Number(kh.tutar) || 0,
      '',
    ];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.border = thinBorder();
      cell.font = { size: 8 };
      cell.alignment = { vertical: 'middle', wrapText: i === 5 };
      if (i === 2 || i === 5) cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      if (i === 6) {
        cell.numFmt = '#,##0.00 "₺"';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.font = { bold: true, size: 8, color: { argb: KASA_EXCEL_ARGB.amountOut } };
      }
      if (i === 0 || i === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const fotoUrl = String(kh.fisEvrakUrl || '').trim();
    const fisCell = r.getCell(8);
    fisCell.border = thinBorder();
    if (fotoUrl) {
      fisCell.value = 'Var';
      fisCell.font = { bold: true, size: 8, color: { argb: 'FF047857' } };
      fisCell.alignment = { horizontal: 'center', vertical: 'middle' };
      pendingOriginalLinks.push({ hareketId: kh.id, cell: fisCell, rawUrl: fotoUrl });
    } else {
      fisCell.value = '—';
      fisCell.font = { italic: true, size: 7, color: { argb: 'FF94A3B8' } };
      fisCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    row += 1;
  });

  if (girisler.length > 0) {
    sheet.mergeCells(row, 1, row, COL);
    const gHead = sheet.getCell(row, 1);
    gHead.value = `GİRİŞLER (${girisler.length})`;
    applyExcelGroupHead(gHead, sheet.getRow(row));
    row += 1;
    for (const kh of girisler.sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)))) {
      const r = sheet.getRow(row);
      r.height = 15;
      const vals: (string | number)[] = [
        '',
        kh.tarih,
        kh.personelAdi || kh.surucu || '—',
        'GİRİŞ',
        kh.fisNo || '—',
        kh.aciklama || '—',
        Number(kh.tutar) || 0,
        '—',
      ];
      vals.forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.border = thinBorder();
        cell.font = { size: 8 };
        if (i === 6) {
          cell.numFmt = '#,##0.00 "₺"';
          cell.font = { bold: true, size: 8, color: { argb: KASA_EXCEL_ARGB.amountIn } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
      row += 1;
    }
  }

  applyPrintPageSetup(sheet, headerRow, COL, row);

  // ─── Sayfa 2: Fiş evrakları — açıklama + foto/PDF (2'li sıkışık yazdırma) ───
  const withFoto = withFotoAll
    .slice()
    .sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)));
  const fotoSheet = workbook.addWorksheet('Fis Fotograflari', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  fotoSheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];
  row = await applyKasaAntetCompact(workbook, fotoSheet, {
    title: 'HAFTALIK KASA — FİŞ / FATURA EVRAKLARI',
    subtitle: `Dönem: ${startDate} — ${endDate} · ${withFoto.length} evrak · 2\'li sıkışık (açıklama + görsel)`,
    colCount: 8,
  });
  row += 1;

  const fotoRowById = new Map<string, number>();

  if (withFoto.length === 0) {
    fotoSheet.mergeCells(row, 1, row, 8);
    fotoSheet.getCell(row, 1).value = 'Bu aralıkta fiş / fatura evrakı olan çıkış kaydı yok.';
    fotoSheet.getCell(row, 1).font = { italic: true, color: { argb: 'FF94A3B8' } };
  } else {
    let fotoSira = 0;
    for (let i = 0; i < withFoto.length; i += 2) {
      const left = withFoto[i];
      const right = withFoto[i + 1];
      const metaRow = row;
      const descRow = row + 1;
      const imgRow = row + 2;

      fotoSheet.getRow(metaRow).height = EVRAK_PAIR_META_H;
      fotoSheet.getRow(descRow).height = EVRAK_PAIR_DESC_H;
      fotoSheet.getRow(imgRow).height = EVRAK_PAIR_IMG_H;

      fotoSira += 1;
      const leftUnvan = resolvePersonelUnvan(
        { personelId: left.personelId, personelAdi: left.personelAdi, surucu: left.surucu },
        personeller
      );
      await embedKasaEvrakInSheet(workbook, fotoSheet, left, {
        startCol: 1,
        endCol: 4,
        metaRow,
        descRow,
        imgRow,
        sira: fotoSira,
        label: leftUnvan.label,
        httpUrlById,
      });
      fotoRowById.set(left.id, metaRow);

      if (right) {
        fotoSira += 1;
        const rightUnvan = resolvePersonelUnvan(
          { personelId: right.personelId, personelAdi: right.personelAdi, surucu: right.surucu },
          personeller
        );
        await embedKasaEvrakInSheet(workbook, fotoSheet, right, {
          startCol: 5,
          endCol: 8,
          metaRow,
          descRow,
          imgRow,
          sira: fotoSira,
          label: rightUnvan.label,
          httpUrlById,
        });
        fotoRowById.set(right.id, metaRow);
      }

      row += 3;
    }
  }

  applyPrintPageSetupFotoSheet(fotoSheet, row);

  // Haftalik Kasa «FİŞ» linklerini yaz (https veya sayfa içi büyük foto)
  for (const pending of pendingOriginalLinks) {
    setOriginalPhotoHyperlink(pending.cell, {
      httpUrl: httpUrlById.get(pending.hareketId) || '',
      fotoSheetRow: fotoRowById.get(pending.hareketId),
    });
    pending.cell.border = thinBorder();
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function exportKasaExcel(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = [],
  allKasaHareketleri?: KasaHareketi[]
): Promise<void> {
  const buffer = await buildKasaExcelBuffer(
    kasaHareketleri,
    startDate,
    endDate,
    personeller,
    allKasaHareketleri
  );
  downloadBuffer(
    buffer,
    `${KASA_REPORT_FORMAT.excel.filePrefix}_${startDate}_${endDate}.xlsx`
  );
}
