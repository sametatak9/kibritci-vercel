import type { Worksheet, Workbook } from 'exceljs';
import type { KasaHareketi, KasaOdemeDurumu, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciReportAssets } from './kibritciBrand';
import { resolvePersonelUnvan } from './personelUnvanUtils';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';
import { ensureKasaFisFotoPersisted } from './sahaFaaliyetFotoStorage';
import {
  buildFisKayitEtiketi,
  KASA_EXCEL_ARGB,
  KASA_REPORT_FORMAT,
} from './kasaReportTheme';

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
        label: unvan.label || 'Personel (adsız)',
        toplam: tutar,
        kalemler: [kh],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.toplam - a.toplam);
}

/**
 * Haftalık Kasa Excel — Kibritçi antetli, kişi bazlı masraf özeti + kalem kalem + fiş fotoğrafları.
 */
export async function exportKasaExcel(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = []
): Promise<void> {
  if (!Array.isArray(kasaHareketleri) || kasaHareketleri.length === 0) {
    throw new Error('Seçili aralıkta dışa aktarılacak kasa hareketi yok. Tarih filtresini kontrol edin.');
  }

  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();

  const cikislar = kasaHareketleri.filter((k) => k.hareketTipi === 'ÇIKIŞ');
  const girisler = kasaHareketleri.filter((k) => k.hareketTipi === 'GİRİŞ');
  const buckets = groupByPersonel(cikislar, personeller);

  // Fiş URL’leri — yalnızca hazır https (Storage upload export’u kilitlemesin)
  const withFotoAll = cikislar.filter((k) => String(k.fisEvrakUrl || '').trim());
  const httpUrlById = new Map<string, string>();
  await Promise.all(
    withFotoAll.map(async (kh) => {
      const resolved = await resolvePhotoHttpUrl(kh.id, String(kh.fisEvrakUrl));
      if (resolved) httpUrlById.set(kh.id, resolved);
    })
  );

  let totalIn = 0;
  let totalOut = 0;
  let borc = 0;
  let personelOdedi = 0;
  let kasaOdedi = 0;
  for (const kh of kasaHareketleri) {
    const t = Number(kh.tutar) || 0;
    if (kh.hareketTipi === 'GİRİŞ') totalIn += t;
    else {
      totalOut += t;
      const d = resolveKasaOdemeDurumu(kh) || 'KASA_ODEDI';
      if (d === 'BORC') borc += t;
      else if (d === 'PERSONEL_ODEDI') personelOdedi += t;
      else kasaOdedi += t;
    }
  }

  const KALEM_COL_COUNT = 8;

  // ─── Sayfa 1: Kalem kalem (yazdırma / imza) ───
  const kalem = workbook.addWorksheet('Haftalik Kasa', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  kalem.columns = [
    { width: 4 },
    { width: 11 },
    { width: 20 },
    { width: 13 },
    { width: 10 },
    { width: 38 },
    { width: 13 },
    { width: 9 },
  ];

  let row = await applyKasaAntetCompact(workbook, kalem, {
    title: 'HAFTALIK KASA RAPORU — KALEM KALEM',
    subtitle: `Dönem: ${startDate} — ${endDate} · ${cikislar.length} çıkış · ${girisler.length} giriş · Fiş görselleri: «Fis Fotograflari» sayfası`,
    colCount: KALEM_COL_COUNT,
  });

  kalem.mergeCells(row, 1, row, KALEM_COL_COUNT);
  kalem.getCell(row, 1).value = KASA_REPORT_FORMAT.excel.badge;
  kalem.getCell(row, 1).font = { bold: true, size: 7, color: { argb: KASA_EXCEL_ARGB.badgeText } };
  kalem.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.badgeBg } };
  kalem.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  kalem.getRow(row).height = 14;
  row += 1;

  const headerRow = row;
  const kalemHeaders = ['#', 'TARİH', 'PERSONEL / ŞOFÖR', 'ÖDEME', 'FİŞ NO', 'AÇIKLAMA', 'TUTAR', 'FİŞ'];
  const khRow = kalem.getRow(row);
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
    const r = kalem.getRow(row);
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
    kalem.mergeCells(row, 1, row, KALEM_COL_COUNT);
    const gHead = kalem.getCell(row, 1);
    gHead.value = `GİRİŞLER (${girisler.length})`;
    applyExcelGroupHead(gHead, kalem.getRow(row));
    row += 1;
    for (const kh of girisler.sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)))) {
      const r = kalem.getRow(row);
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

  row += 1;
  kalem.mergeCells(row, 1, row, KALEM_COL_COUNT);
  kalem.getCell(row, 1).value = 'ÖZET TOPLAMLAR';
  kalem.getCell(row, 1).font = { bold: true, size: 8, color: { argb: KASA_EXCEL_ARGB.accentText } };
  row += 1;

  const summaryLabels = ['BORÇ', 'PERS. ÖDEDİ', 'KASA ÖDEDİ', 'ÇIKIŞ', 'GİRİŞ', 'NET'];
  const summaryValues = [borc, personelOdedi, kasaOdedi, totalOut, totalIn, totalIn - totalOut];
  const summaryColors = ['FFB45309', 'FF6D28D9', 'FF1D4ED8', 'FFB91C1C', 'FF047857', 'FF1E4E78'];
  const sumHead = kalem.getRow(row);
  sumHead.height = 14;
  summaryLabels.forEach((label, i) => {
    const cell = sumHead.getCell(i + 1);
    cell.value = label;
    applyExcelTableHead(cell);
    cell.font = { bold: true, size: 7, color: { argb: KASA_EXCEL_ARGB.tableHeadText } };
  });
  row += 1;
  const sumVal = kalem.getRow(row);
  sumVal.height = 16;
  summaryValues.forEach((value, i) => {
    const cell = sumVal.getCell(i + 1);
    cell.value = value;
    cell.numFmt = '#,##0.00 "₺"';
    cell.font = { bold: true, size: 8, color: { argb: summaryColors[i] } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });
  row += 1;

  row = applyKasaSignatureBar(kalem, row, KALEM_COL_COUNT);
  applyPrintPageSetup(kalem, headerRow, KALEM_COL_COUNT, row);

  // ─── Sayfa 2: Kişi Özeti ───
  const ozet = workbook.addWorksheet('Kisi Ozeti', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  ozet.columns = [
    { width: 6 },
    { width: 28 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  row = await applyKasaAntetCompact(workbook, ozet, {
    title: 'HAFTALIK KASA — KİŞİ BAZLI ÖZET',
    subtitle: `Dönem: ${startDate} — ${endDate}`,
    colCount: 7,
  });

  ozet.mergeCells(row, 1, row, 7);
  ozet.getCell(row, 1).value =
    'Kim ne kadar masraf yapmış — çıkışlar personele / şoföre göre gruplanır';
  ozet.getCell(row, 1).font = { size: 8, italic: true, color: { argb: 'FF475569' } };
  row += 2;

  let genelSum = 0;
  for (const kh of cikislar) {
    genelSum += Number(kh.tutar) || 0;
  }
  ozet.mergeCells(row, 1, row, 5);
  ozet.getCell(row, 1).value = `GENEL TOPLAM · ${cikislar.length} kalem`;
  ozet.getCell(row, 1).font = { bold: true, size: 9 };
  ozet.getCell(row, 7).value = genelSum;
  ozet.getCell(row, 7).numFmt = '#,##0.00 "₺"';
  ozet.getCell(row, 7).font = { bold: true, color: { argb: 'FFB91C1C' } };
  row += 2;

  const ozetHeaders = ['#', 'PERSONEL / ŞOFÖR', 'KALEM', 'BORÇ', 'PERSONEL ÖDEDİ', 'KASA ÖDEDİ', 'TOPLAM'];
  const oh = ozet.getRow(row);
  ozetHeaders.forEach((h, i) => {
    const cell = oh.getCell(i + 1);
    cell.value = h;
    applyExcelTableHead(cell);
  });
  oh.height = 18;
  row += 1;

  buckets.forEach((b, idx) => {
    let bBorc = 0;
    let bPers = 0;
    let bKasa = 0;
    for (const kh of b.kalemler) {
      const d = resolveKasaOdemeDurumu(kh) || 'KASA_ODEDI';
      const t = Number(kh.tutar) || 0;
      if (d === 'BORC') bBorc += t;
      else if (d === 'PERSONEL_ODEDI') bPers += t;
      else bKasa += t;
    }
    const r = ozet.getRow(row);
    r.height = 15;
    const vals: (string | number)[] = [idx + 1, b.label, b.kalemler.length, bBorc, bPers, bKasa, b.toplam];
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

  // ─── Sayfa 3: Fis Fotograflari (büyük gömülü + çalışan orijinal link) ───
  // Sayfa adı ASCII — Excel iç linkleri Türkçe karakterde bozulabiliyor
  const withFoto = withFotoAll
    .slice()
    .sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)));
  const fotoSheet = workbook.addWorksheet('Fis Fotograflari', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  fotoSheet.columns = [
    { width: 6 },
    { width: 14 },
    { width: 26 },
    { width: 14 },
    { width: 14 },
    { width: 40 },
    { width: 48 },
    { width: 18 },
  ];
  row = await applyKasaAntet(workbook, fotoSheet, {
    title: 'HAFTALIK KASA — FİŞ / FATURA GÖRSELLERİ (BÜYÜK BOY)',
    subtitle: `Dönem: ${startDate} — ${endDate} · ${withFoto.length} görsel · Her fişin üstünde kayıt etiketi`,
    colCount: 8,
  });

  const fh = fotoSheet.getRow(row);
  ['#', 'TARİH', 'PERSONEL', 'FİŞ NO', 'TUTAR', 'FİŞ KAYDI ETİKETİ', 'BÜYÜK FOTO', 'ORİJİNAL LİNK'].forEach(
    (h, i) => {
      const cell = fh.getCell(i + 1);
      cell.value = h;
      applyExcelTableHead(cell);
    }
  );
  row += 1;

  const fotoRowById = new Map<string, number>();

  if (withFoto.length === 0) {
    fotoSheet.mergeCells(row, 1, row, 8);
    fotoSheet.getCell(row, 1).value = 'Bu aralıkta fiş görseli olan çıkış kaydı yok.';
    fotoSheet.getCell(row, 1).font = { italic: true, color: { argb: 'FF94A3B8' } };
  } else {
    let fotoSira = 0;
    for (const kh of withFoto) {
      fotoSira += 1;
      const unvan = resolvePersonelUnvan(
        {
          personelId: kh.personelId,
          personelAdi: kh.personelAdi,
          surucu: kh.surucu,
        },
        personeller
      );
      const kayitEtiketi = buildFisKayitEtiketi(kh, unvan.label, fotoSira);
      const r = fotoSheet.getRow(row);
      r.height = 340;
      [
        fotoSira,
        kh.tarih,
        unvan.label,
        kh.fisNo || '—',
        Number(kh.tutar) || 0,
        kayitEtiketi,
        '',
        '',
      ].forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.border = thinBorder();
        cell.alignment = { vertical: 'top', wrapText: true };
        if (i === 4) {
          cell.numFmt = '#,##0.00 "₺"';
          cell.font = { bold: true, color: { argb: 'FFB91C1C' } };
        }
        if (i === 5) {
          cell.font = { bold: true, size: 10, color: { argb: KASA_EXCEL_ARGB.accentText } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KASA_EXCEL_ARGB.headerBg } };
        }
      });

      const fotoUrl = String(kh.fisEvrakUrl || '').trim();
      const httpUrl = httpUrlById.get(kh.id) || '';
      const b64 = await loadImageAsJpegBase64(httpUrl || fotoUrl, 1400, 0.92);
      if (b64) {
        const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
        fotoSheet.addImage(imageId, {
          tl: { col: 6, row: row - 1 },
          ext: { width: 440, height: 290 },
          editAs: 'oneCell',
        });
      } else {
        r.getCell(7).value = 'Görsel yüklenemedi';
        r.getCell(7).font = { italic: true, color: { argb: 'FF94A3B8' }, size: 8 };
      }

      setOriginalPhotoHyperlink(r.getCell(8), {
        httpUrl,
        fotoSheetRow: row,
      });
      r.getCell(8).border = thinBorder();
      fotoRowById.set(kh.id, row);
      row += 1;
    }
  }

  // Haftalik Kasa «FİŞ» linklerini yaz (https veya sayfa içi büyük foto)
  for (const pending of pendingOriginalLinks) {
    setOriginalPhotoHyperlink(pending.cell, {
      httpUrl: httpUrlById.get(pending.hareketId) || '',
      fotoSheetRow: fotoRowById.get(pending.hareketId),
    });
    pending.cell.border = thinBorder();
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer | Uint8Array,
    `${KASA_REPORT_FORMAT.excel.filePrefix}_${startDate}_${endDate}.xlsx`
  );
}
