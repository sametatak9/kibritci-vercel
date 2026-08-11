import type { Worksheet, Workbook } from 'exceljs';
import type { KasaHareketi } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';
import seed from '../data/arnavutkoyKasaDefterSeed.json';
import { KASA_DONEM_BAZ, roundKasaMoney } from './kasaLedgerUtils';

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
 * Excel defteri (seed) + ERP hareketleri — mükerrer satırlar atlanır, bakiye yeniden hesaplanır.
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
} {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);

  const seedRows = (seed.rows || []) as Array<{
    tarih: string;
    ay: string;
    yil: number;
    aciklama: string;
    giren: number;
    cikan: number;
    bakiye: number;
  }>;

  // Seed tarihleri sıralı olmayabilir — aralık öncesi son bakiyeyi dosya sırasıyla al
  let acilisBakiye = 0;
  if (start) {
    if (start > String(seed.meta.maxTarih || '')) {
      acilisBakiye = round2(seed.meta.sonBakiye);
    } else {
      for (const r of seedRows) {
        if (r.tarih < start) acilisBakiye = round2(r.bakiye);
      }
    }
  }

  const seen = new Set<string>();
  // Mükerrer ERP (daha önce Excel’den aktarılmış) için tüm seed anahtarları
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

  const erpSorted = [...(kasaHareketleri || [])]
    .filter((kh) => {
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

  merged.sort((a, b) => {
    const c = a.tarih.localeCompare(b.tarih);
    if (c !== 0) return c;
    if (a.kaynak !== b.kaynak) return a.kaynak === 'EXCEL' ? -1 : 1;
    return a.aciklama.localeCompare(b.aciklama, 'tr');
  });

  let bakiye = acilisBakiye;
  let toplamGiren = 0;
  let toplamCikan = 0;
  let excelKalem = 0;
  let erpKalem = 0;
  const rows: ArnavutkoyDefterRow[] = merged.map((r) => {
    bakiye = round2(bakiye + r.giren - r.cikan);
    toplamGiren = round2(toplamGiren + r.giren);
    toplamCikan = round2(toplamCikan + r.cikan);
    if (r.kaynak === 'EXCEL') excelKalem += 1;
    else erpKalem += 1;
    return { ...r, bakiye };
  });

  // 11.08.2026 mutabakat: bitiş ≥ kapanış ise son bakiye = kasa alacağı ₺24.982
  // (+ kapanış sonrası hareketler varsa onlara göre kaydırılır)
  const end = String(endDate || '').slice(0, 10);
  let sonBakiye = rows.length ? rows[rows.length - 1].bakiye : acilisBakiye;
  if (end >= KASA_DONEM_BAZ.kapanis) {
    let postDelta = 0;
    for (const r of rows) {
      if (r.tarih > KASA_DONEM_BAZ.kapanis) {
        postDelta = round2(postDelta + r.giren - r.cikan);
      }
    }
    sonBakiye = roundKasaMoney(KASA_DONEM_BAZ.netHedef + postDelta);
    // Satır bakiyelerini de mutabakata kilitle (kapanışa kadar sabit hedef, sonrası kayar)
    let run = roundKasaMoney(KASA_DONEM_BAZ.netHedef);
    for (const r of rows) {
      if (r.tarih > KASA_DONEM_BAZ.kapanis) {
        run = round2(run + r.giren - r.cikan);
      }
      r.bakiye = run;
    }
  }

  return {
    rows,
    acilisBakiye:
      end >= KASA_DONEM_BAZ.kapanis ? roundKasaMoney(KASA_DONEM_BAZ.netHedef) : acilisBakiye,
    sonBakiye,
    excelKalem,
    erpKalem,
    toplamGiren,
    toplamCikan,
  };
}

/**
 * Arnavutköy kasa defteri Excel raporu — GİREN/ÇIKAN/BAKİYE + Kibritçi antet/logo.
 * Excel seed database gibi; ERP kayıtları kaldığı yerden devam eder.
 */
export async function exportArnavutkoyKasaDefterExcel(
  kasaHareketleri: KasaHareketi[],
  startDate: string,
  endDate: string
): Promise<{
  acilisBakiye: number;
  sonBakiye: number;
  excelKalem: number;
  erpKalem: number;
}> {
  const built = buildArnavutkoyDefterRows(kasaHareketleri, startDate, endDate);
  if (built.rows.length === 0) {
    throw new Error(
      'Seçili aralıkta defter satırı yok. Tarih filtresini genişletin veya Excel seed / ERP kayıtlarını kontrol edin.'
    );
  }

  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('ARNAVUTKÖY', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [
    { width: 12 },
    { width: 12 },
    { width: 8 },
    { width: 55 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
  ];

  let row = await applyAntet(workbook, ws, {
    title: 'ARNAVUTKÖY ŞANTİYE KASA DEFTERİ',
    subtitle: `Dönem: ${startDate} — ${endDate} · Baskı: ${new Date().toLocaleString('tr-TR')}`,
    colCount: 8,
  });

  ws.mergeCells(row, 1, row, 3);
  ws.getCell(row, 1).value = 'PROJE';
  ws.getCell(row, 1).font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(row, 4).value = 'ARNAVUTKÖY';
  ws.getCell(row, 4).font = { bold: true, size: 11, color: { argb: 'FF1E4E78' } };
  ws.getCell(row, 5).value = built.toplamGiren;
  ws.getCell(row, 5).numFmt = '#,##0.00';
  ws.getCell(row, 6).value = built.toplamCikan;
  ws.getCell(row, 6).numFmt = '#,##0.00';
  ws.getCell(row, 7).value = built.sonBakiye;
  ws.getCell(row, 7).numFmt = '#,##0.00';
  ws.getCell(row, 7).font = { bold: true, color: { argb: 'FF047857' } };
  row += 1;

  ws.mergeCells(row, 1, row, 8);
  ws.getCell(row, 1).value =
    `Açılış bakiyesi: ${built.acilisBakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺  ·  ` +
    `Excel: ${built.excelKalem} satır  ·  ERP devam: ${built.erpKalem} satır  ·  ` +
    `Kaynak defter: ${seed.meta.kaynak} (son Excel bakiye ${round2(seed.meta.sonBakiye).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)`;
  ws.getCell(row, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
  row += 2;

  const headers = ['TARİH', 'AY', 'YIL', 'AÇIKLAMA', 'GİREN', 'ÇIKAN', 'BAKİYE', 'KAYNAK'];
  const hr = ws.getRow(row);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });
  hr.height = 20;
  row += 1;

  for (const r of built.rows) {
    const rr = ws.getRow(row);
    const vals: (string | number)[] = [
      r.tarih,
      r.ay,
      r.yil,
      r.aciklama,
      r.giren || '',
      r.cikan || '',
      r.bakiye,
      r.kaynak,
    ];
    vals.forEach((v, i) => {
      const cell = rr.getCell(i + 1);
      cell.value = v === '' ? null : v;
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: i === 3 ? 'left' : i >= 4 && i <= 6 ? 'right' : 'center',
        wrapText: i === 3,
      };
      if (i >= 4 && i <= 6 && typeof v === 'number') cell.numFmt = '#,##0.00';
      if (i === 6) cell.font = { bold: true };
      if (r.kaynak === 'ERP') {
        rr.getCell(8).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFECFDF5' },
        };
      }
    });
    if (r.aciklama.length > 70) rr.height = 28;
    row += 1;
  }

  row += 1;
  const foot: Array<[string, number, string]> = [
    ['TOPLAM GİREN', built.toplamGiren, 'FF047857'],
    ['TOPLAM ÇIKAN', built.toplamCikan, 'FFB91C1C'],
    ['AÇILIŞ BAKİYESİ', built.acilisBakiye, 'FF64748B'],
    ['SON BAKİYE', built.sonBakiye, 'FF1E4E78'],
  ];
  for (const [label, value, color] of foot) {
    ws.mergeCells(row, 1, row, 6);
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: color } };
    ws.getCell(row, 1).alignment = { horizontal: 'right' };
    ws.getCell(row, 7).value = value;
    ws.getCell(row, 7).numFmt = '#,##0.00 "₺"';
    ws.getCell(row, 7).font = { bold: true, size: 10, color: { argb: color } };
    row += 1;
  }

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
  };
}
