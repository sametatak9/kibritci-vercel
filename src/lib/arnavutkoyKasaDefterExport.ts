import type { Worksheet, Workbook } from 'exceljs';
import type { KasaHareketi, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';
import { computeKasaOdemeBazliOzet } from './kasaLedgerUtils';
import seed from '../data/arnavutkoyKasaDefterSeed.json';

export type ArnavutkoyDefterRow = {
  tarih: string;
  ay: string;
  yil: number;
  aciklama: string;
  giren: number;
  cikan: number;
  bakiye: number;
  kaynak: 'EXCEL' | 'ERP';
};

const AYLAR = [
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

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
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

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeKeyPart(s: string): string {
  return String(s || '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, ' ');
}

function rowDedupeKey(tarih: string, aciklama: string, giren: number, cikan: number): string {
  return `${tarih}|${normalizeKeyPart(aciklama)}|${round2(giren)}|${round2(cikan)}`;
}

function ayYilFromTarih(tarih: string): { ay: string; yil: number } {
  const d = new Date(`${tarih}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { ay: '', yil: Number(String(tarih).slice(0, 4)) || 0 };
  }
  return { ay: AYLAR[d.getMonth()], yil: d.getFullYear() };
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; colCount: number }
): Promise<number> {
  const colCount = opts.colCount;
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
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF1E4E78' } };
  }

  const metaStart = Math.min(3, colCount);
  ws.mergeCells(1, metaStart, 1, colCount);
  const titleCell = ws.getCell(1, metaStart);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, metaStart, 2, colCount);
  const sub = ws.getCell(2, metaStart);
  sub.value = opts.subtitle;
  sub.font = { size: 9, color: { argb: 'FF475569' } };
  sub.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, metaStart, 3, colCount);
  const company = ws.getCell(3, metaStart);
  company.value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  company.font = { size: 8, color: { argb: 'FF64748B' } };
  company.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E4E78' },
  };
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
  ws.getRow(5).height = 16;

  return 7;
}

/** Açıklama = program kaydı metni (+ isteğe bağlı ödeme etiketi) */
function erpToDefterParts(kh: KasaHareketi): { giren: number; cikan: number; aciklama: string } {
  const tutar = round2(kh.tutar);
  const odeme = resolveKasaOdemeDurumu(kh);
  const odemeEtiket =
    odeme === 'BORC'
      ? ' · BORÇ'
      : odeme === 'PERSONEL_ODEDI'
        ? ' · PERSONEL ÖDEDİ'
        : odeme === 'KASA_ODEDI'
          ? ' · KASA ÖDEDİ'
          : '';
  const who = String(kh.personelAdi || kh.surucu || '').trim();
  const base = String(kh.aciklama || '').trim() || 'Kasa hareketi';
  const aciklama = `${base}${who ? ` (${who})` : ''}${kh.hareketTipi === 'ÇIKIŞ' ? odemeEtiket : ''}`;
  if (kh.hareketTipi === 'GİRİŞ') return { giren: tutar, cikan: 0, aciklama };
  return { giren: 0, cikan: tutar, aciklama };
}

export function getArnavutkoyDefterMeta() {
  return {
    ...seed.meta,
    sonBakiye: round2(seed.meta.sonBakiye),
  };
}

/**
 * ARNAVUTKÖY KASA YENİ seed + program kayıtları.
 * Bakiye Excel’in kaldığı yerden (~₺905) devam eder; LEGACY_XLS mükerrerleri atlanır.
 */
export function buildArnavutkoyDefterRows(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string
): {
  rows: ArnavutkoyDefterRow[];
  acilisBakiye: number;
  sonBakiye: number;
  excelKalem: number;
  erpKalem: number;
  toplamGiren: number;
  toplamCikan: number;
  excelSonBakiye: number;
} {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  const excelSonBakiye = round2(seed.meta.sonBakiye);

  const seedRows = (seed.rows || []) as Array<{
    tarih: string;
    ay: string;
    yil: number;
    aciklama: string;
    giren: number;
    cikan: number;
    bakiye: number;
  }>;

  // Aralık öncesi Excel bakiyesi (dosya sırası)
  let acilisBakiye = 0;
  if (start) {
    if (start > String(seed.meta.maxTarih || '')) {
      acilisBakiye = excelSonBakiye;
    } else {
      for (const r of seedRows) {
        if (r.tarih < start) acilisBakiye = round2(r.bakiye);
      }
    }
  }

  const seen = new Set<string>();
  for (const r of seedRows) {
    seen.add(rowDedupeKey(r.tarih, r.aciklama, r.giren, r.cikan));
  }

  const merged: Array<Omit<ArnavutkoyDefterRow, 'bakiye'>> = [];

  for (const r of seedRows) {
    if (start && r.tarih < start) continue;
    if (end && r.tarih > end) continue;
    merged.push({
      tarih: r.tarih,
      ay: r.ay,
      yil: r.yil,
      aciklama: r.aciklama,
      giren: round2(r.giren),
      cikan: round2(r.cikan),
      kaynak: 'EXCEL',
    });
  }

  // Program kayıtları — Excel’den içeri aktarılmış LEGACY_XLS zaten seed’de
  const erpSorted = [...(kasaHareketleri || [])]
    .filter((kh) => {
      if (String(kh.kaynak || '') === 'LEGACY_XLS') return false;
      if (String(kh.id || '').startsWith('kh_legacy_xls_')) return false;
      const t = String(kh.tarih || '').slice(0, 10);
      if (!t) return false;
      if (start && t < start) return false;
      if (end && t > end) return false;
      return true;
    })
    .sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));

  for (const kh of erpSorted) {
    const tarih = String(kh.tarih).slice(0, 10);
    const parts = erpToDefterParts(kh);
    const key = rowDedupeKey(tarih, parts.aciklama, parts.giren, parts.cikan);
    const keyRaw = rowDedupeKey(tarih, String(kh.aciklama || ''), parts.giren, parts.cikan);
    if (seen.has(key) || seen.has(keyRaw)) continue;
    seen.add(key);
    const { ay, yil } = ayYilFromTarih(tarih);
    merged.push({
      tarih,
      ay,
      yil,
      aciklama: parts.aciklama,
      giren: parts.giren,
      cikan: parts.cikan,
      kaynak: 'ERP',
    });
  }

  // Excel satırları dosya sırasını korusun; ERP tarih sırasıyla arkaya
  const excelPart = merged.filter((r) => r.kaynak === 'EXCEL');
  const erpPart = merged
    .filter((r) => r.kaynak === 'ERP')
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.aciklama.localeCompare(b.aciklama, 'tr'));
  // Bakiye hesabı eski → yeni; listeleme yeni → eski
  const orderedChrono = [...excelPart, ...erpPart];

  let bakiye = acilisBakiye;
  let toplamGiren = 0;
  let toplamCikan = 0;
  let excelKalem = 0;
  let erpKalem = 0;
  const rowsChrono: ArnavutkoyDefterRow[] = orderedChrono.map((r) => {
    bakiye = round2(bakiye + r.giren - r.cikan);
    toplamGiren = round2(toplamGiren + r.giren);
    toplamCikan = round2(toplamCikan + r.cikan);
    if (r.kaynak === 'EXCEL') excelKalem += 1;
    else erpKalem += 1;
    return { ...r, bakiye };
  });
  const sonBakiye = rowsChrono.length ? rowsChrono[rowsChrono.length - 1].bakiye : acilisBakiye;
  // Yeniden → eskiye (bakiyeler kronolojik hesaplandıktan sonra)
  const rows = [...rowsChrono].reverse();

  return {
    rows,
    acilisBakiye,
    sonBakiye,
    excelKalem,
    erpKalem,
    toplamGiren,
    toplamCikan,
    excelSonBakiye,
  };
}

/**
 * Arnavutköy defter Excel — orijinal tablo (TARİH/AY/YIL/AÇIKLAMA/GİREN/ÇIKAN/BAKİYE)
 * + Kibritçi logo. Liste yeni→eski. SON BAKİYE sayısal yazılır.
 * Ek sayfa: ÖZET (kimlere ne harcandı).
 */
export async function exportArnavutkoyKasaDefterExcel(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = []
): Promise<{
  acilisBakiye: number;
  sonBakiye: number;
  excelKalem: number;
  erpKalem: number;
  excelSonBakiye: number;
}> {
  const built = buildArnavutkoyDefterRows(kasaHareketleri, startDate, endDate);
  if (built.rows.length === 0) {
    throw new Error(
      'Seçili aralıkta defter satırı yok. Tarih filtresini genişletin (Excel + program kayıtları).'
    );
  }

  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();

  const COLS = 7;
  const ws = workbook.addWorksheet('ARNAVUTKÖY', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [
    { width: 12 },
    { width: 11 },
    { width: 7 },
    { width: 58 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
  ];

  let row = await applyAntet(workbook, ws, {
    title: 'ARNAVUTKÖY ŞANTİYE KASA DEFTERİ',
    subtitle: `Excel son bakiye ₺${built.excelSonBakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} + program · liste yeni→eski`,
    colCount: COLS,
  });

  // Üst özet — PROJE MÜDÜRÜ / ARNAVUTKÖY / GİREN / ÇIKAN / KASA BAKİYESİ
  ws.getCell(row, 2).value = 'PROJE MÜDÜRÜ';
  ws.getCell(row, 2).font = { bold: true, size: 11 };
  ws.getCell(row, 4).value = 'ARNAVUTKÖY';
  ws.getCell(row, 4).font = { bold: true, size: 12, color: { argb: 'FF1E4E78' } };
  ws.getCell(row, 5).value = built.toplamGiren;
  ws.getCell(row, 5).numFmt = '#,##0.00';
  ws.getCell(row, 6).value = built.toplamCikan;
  ws.getCell(row, 6).numFmt = '#,##0.00';
  ws.getCell(row, 7).value = built.sonBakiye;
  ws.getCell(row, 7).numFmt = '#,##0.00';
  ws.getCell(row, 7).font = {
    bold: true,
    size: 12,
    color: { argb: built.sonBakiye < 0 ? 'FFB91C1C' : 'FF047857' },
  };
  row += 1;

  // Vurgulu KASA BAKİYESİ bandı (eski 24.982 yerine geçen net sonuç)
  ws.mergeCells(row, 1, row, 6);
  ws.getCell(row, 1).value =
    `KASA BAKİYESİ (güncel)  ·  Excel ₺${built.excelSonBakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} + program fişleri  ·  Excel satır ${built.excelKalem} · Program satır ${built.erpKalem}`;
  ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  ws.getCell(row, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: built.sonBakiye < 0 ? 'FFB91C1C' : 'FF047857' },
  };
  ws.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getCell(row, 7).value = built.sonBakiye;
  ws.getCell(row, 7).numFmt = '#,##0.00" ₺"';
  ws.getCell(row, 7).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell(row, 7).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: built.sonBakiye < 0 ? 'FFB91C1C' : 'FF047857' },
  };
  ws.getCell(row, 7).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(row).height = 26;
  row += 2;

  const headers = ['TARİH', 'AY', 'YIL', 'AÇIKLAMA', 'GİREN', 'ÇIKAN', 'BAKİYE'];
  const hr = ws.getRow(row);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });
  hr.height = 20;
  row += 1;

  const firstDataRow = row;
  built.rows.forEach((r) => {
    const rr = ws.getRow(row);
    rr.getCell(1).value = r.tarih;
    rr.getCell(2).value = r.ay;
    rr.getCell(3).value = r.yil;
    rr.getCell(4).value = r.aciklama;
    rr.getCell(5).value = r.giren || null;
    rr.getCell(6).value = r.cikan || null;
    // Sayısal bakiye (yeni→eski listede formül satır bağı kopar)
    rr.getCell(7).value = r.bakiye;

    for (let c = 1; c <= COLS; c++) {
      const cell = rr.getCell(c);
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 4 ? 'left' : c >= 5 ? 'right' : 'center',
        wrapText: c === 4,
      };
      cell.font = { size: 10, ...(c === 7 ? { bold: true } : {}) };
      if (c >= 5) cell.numFmt = '#,##0.00';
    }
    if (r.aciklama.length > 70) rr.height = 28;
    row += 1;
  });
  const lastDataRow = row - 1;

  row += 1;
  const footRows: Array<{ label: string; value: number; color: string; emphasize?: boolean }> = [
    { label: 'TOPLAM GİREN', value: built.toplamGiren, color: 'FF047857' },
    { label: 'TOPLAM ÇIKAN', value: built.toplamCikan, color: 'FFB91C1C' },
    {
      label: 'EXCEL SON BAKİYE (referans)',
      value: built.excelSonBakiye,
      color: 'FF64748B',
    },
    {
      label: 'KASA BAKİYESİ (güncel)',
      value: built.sonBakiye,
      color: built.sonBakiye < 0 ? 'FFB91C1C' : 'FF047857',
      emphasize: true,
    },
  ];
  for (const f of footRows) {
    // Etiket F, değer G — orijinal defter alt özeti
    ws.getCell(row, 6).value = f.label;
    ws.getCell(row, 6).font = {
      bold: true,
      size: f.emphasize ? 12 : 10,
      color: { argb: f.color },
    };
    ws.getCell(row, 6).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(row, 7).value = f.value;
    ws.getCell(row, 7).numFmt = '#,##0.00" ₺"';
    ws.getCell(row, 7).font = {
      bold: true,
      size: f.emphasize ? 14 : 11,
      color: { argb: f.color },
    };
    ws.getCell(row, 7).border = thinBorder();
    if (f.emphasize) {
      ws.getCell(row, 6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE4E6' },
      };
      ws.getCell(row, 7).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE4E6' },
      };
      ws.getRow(row).height = 24;
    }
    row += 1;
  }

  // —— ÖZET sayfa: kimlere ne harcandı ——
  const ozetWs = workbook.addWorksheet('ÖZET', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  ozetWs.columns = [
    { width: 28 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
  ];
  let orow = await applyAntet(workbook, ozetWs, {
    title: 'KASA HARCAMA ÖZETİ',
    subtitle: `Kimlere ne harcandı · KASA BAKİYESİ ₺${built.sonBakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
    colCount: 6,
  });

  // Vurgulu kasa bakiyesi
  ozetWs.mergeCells(orow, 1, orow, 5);
  ozetWs.getCell(orow, 1).value = 'KASA BAKİYESİ (Excel ~905 + program fişleri — eski 24.982 yerine)';
  ozetWs.getCell(orow, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ozetWs.getCell(orow, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: built.sonBakiye < 0 ? 'FFB91C1C' : 'FF047857' },
  };
  ozetWs.getCell(orow, 6).value = built.sonBakiye;
  ozetWs.getCell(orow, 6).numFmt = '#,##0.00" ₺"';
  ozetWs.getCell(orow, 6).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ozetWs.getCell(orow, 6).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: built.sonBakiye < 0 ? 'FFB91C1C' : 'FF047857' },
  };
  ozetWs.getRow(orow).height = 26;
  orow += 2;

  ozetWs.getCell(orow, 1).value = 'Excel son bakiye';
  ozetWs.getCell(orow, 2).value = built.excelSonBakiye;
  ozetWs.getCell(orow, 2).numFmt = '#,##0.00" ₺"';
  ozetWs.getCell(orow, 3).value = 'Kasa borç (|bakiye|)';
  ozetWs.getCell(orow, 4).value = built.sonBakiye < 0 ? round2(Math.abs(built.sonBakiye)) : 0;
  ozetWs.getCell(orow, 4).numFmt = '#,##0.00" ₺"';
  ozetWs.getCell(orow, 5).value = 'Program satır';
  ozetWs.getCell(orow, 6).value = built.erpKalem;
  orow += 2;

  const erpOnly = (kasaHareketleri || []).filter(
    (kh) =>
      String(kh.kaynak || '') !== 'LEGACY_XLS' &&
      !String(kh.id || '').startsWith('kh_legacy_xls_')
  );
  const ozet = computeKasaOdemeBazliOzet(erpOnly, personeller, {
    donemBazAktif: false,
    totalOut: built.toplamCikan,
  });

  const ozetHeaders = ['KİŞİ / KASA', 'BORÇ', 'PERSONEL ÖDEDİ', 'KASA ÖDEDİ', 'TOPLAM', 'KALEM'];
  const ohr = ozetWs.getRow(orow);
  ozetHeaders.forEach((h, i) => {
    const cell = ohr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center' };
  });
  orow += 1;

  const kisiRows = [...ozet.satirlar].sort((a, b) => b.tutar - a.tutar);
  for (const s of kisiRows) {
    const rr = ozetWs.getRow(orow);
    rr.getCell(1).value = s.label;
    rr.getCell(2).value = s.borc || null;
    rr.getCell(3).value = s.personel || null;
    rr.getCell(4).value = s.kasa || null;
    rr.getCell(5).value = s.tutar;
    rr.getCell(6).value = s.kalem;
    for (let c = 1; c <= 6; c++) {
      const cell = rr.getCell(c);
      cell.border = thinBorder();
      if (c >= 2 && c <= 5) cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    }
    orow += 1;
  }

  orow += 1;
  ozetWs.getCell(orow, 1).value = 'TOPLAM';
  ozetWs.getCell(orow, 1).font = { bold: true };
  ozetWs.getCell(orow, 2).value = ozet.totals.BORC;
  ozetWs.getCell(orow, 3).value = ozet.totals.PERSONEL_ODEDI;
  ozetWs.getCell(orow, 4).value = ozet.totals.KASA_ODEDI;
  ozetWs.getCell(orow, 5).value = ozet.genelToplam;
  for (let c = 2; c <= 5; c++) {
    ozetWs.getCell(orow, c).numFmt = '#,##0.00" ₺"';
    ozetWs.getCell(orow, c).font = { bold: true };
  }
  orow += 2;

  // Detay satırları — kişi bazlı açıklamalar
  ozetWs.getCell(orow, 1).value = 'DETAY — program çıkış kayıtları (yeni → eski)';
  ozetWs.getCell(orow, 1).font = { bold: true, size: 11, color: { argb: 'FF9A3412' } };
  ozetWs.mergeCells(orow, 1, orow, 6);
  orow += 1;

  const detayHeaders = ['TARİH', 'KİŞİ', 'ÖDEME', 'AÇIKLAMA', 'TUTAR', ''];
  const dhr = ozetWs.getRow(orow);
  detayHeaders.forEach((h, i) => {
    const cell = dhr.getCell(i + 1);
    cell.value = h || null;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
    cell.border = thinBorder();
  });
  orow += 1;

  const erpCikis = erpOnly
    .filter((kh) => kh.hareketTipi === 'ÇIKIŞ')
    .sort((a, b) => {
      const dc = String(b.tarih).localeCompare(String(a.tarih));
      if (dc !== 0) return dc;
      return String(b.id).localeCompare(String(a.id));
    });

  for (const kh of erpCikis) {
    const odeme = resolveKasaOdemeDurumu(kh);
    const odemeLabel =
      odeme === 'BORC' ? 'BORÇ' : odeme === 'PERSONEL_ODEDI' ? 'PERSONEL ÖDEDİ' : odeme === 'KASA_ODEDI' ? 'KASA ÖDEDİ' : '—';
    const kisi = String(kh.personelAdi || kh.surucu || 'KASA').trim() || 'KASA';
    const rr = ozetWs.getRow(orow);
    rr.getCell(1).value = String(kh.tarih).slice(0, 10);
    rr.getCell(2).value = kisi;
    rr.getCell(3).value = odemeLabel;
    rr.getCell(4).value = String(kh.aciklama || '');
    rr.getCell(5).value = round2(kh.tutar);
    rr.getCell(5).numFmt = '#,##0.00';
    for (let c = 1; c <= 5; c++) {
      rr.getCell(c).border = thinBorder();
      rr.getCell(c).font = { size: 9 };
    }
    if (String(kh.aciklama || '').length > 60) rr.height = 26;
    orow += 1;
  }

  void firstDataRow;
  void lastDataRow;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Arnavutkoy_Kasa_Defteri_${startDate}_${endDate}.xlsx`
  );

  return {
    acilisBakiye: built.acilisBakiye,
    sonBakiye: built.sonBakiye,
    excelKalem: built.excelKalem,
    erpKalem: built.erpKalem,
    excelSonBakiye: built.excelSonBakiye,
  };
}
