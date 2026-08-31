/**
 * Arnavutköy kasa defteri:
 * Excel ile dönüştürülmüş gerçek `public/arnavutkoy-kasa-yeni.xlsx` şablonunu açar,
 * mevcut satırları/stilleri HİÇ yeniden yazmaz; yalnızca program kayıtlarını ekler.
 * Taklit üretmez. Ekstra yalnızca ÖZET sayfası.
 */
import type { Cell, Worksheet } from 'exceljs';
import type { KasaHareketi, Personel } from '../types/erp';
import { loadExcelJS } from './exceljsLoader';
import { KIBRITCI_COMPANY } from './kibritciBrand';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';
import { computeKasaOdemeBazliOzet } from './kasaLedgerUtils';
import seed from '../data/arnavutkoyKasaDefterSeed.json';

/** Excel’de görünen gerçek renkler (Office tema → ARGB; xlrd palette yanılır) */
const XLS_RED = 'FFFF0000';
const XLS_CYAN = 'FF00B0F0';
const XLS_GREEN = 'FF00B050';
const XLS_FONT = 'Calibri';

function solidFill(argb: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } };
}

function thinBorderBlack() {
  const edge = { style: 'thin' as const, color: { argb: 'FF000000' } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function copyCellStyle(from: Cell, to: Cell) {
  to.style = JSON.parse(JSON.stringify(from.style || {}));
  if (from.numFmt) to.numFmt = from.numFmt;
}

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

/** Masaüstü XLS → Excel COM ile stilleri korunarak XLSX’e çevrildi */
export const ARNAVUTKOY_KASA_XLS_URL = '/arnavutkoy-kasa-yeni.xlsx';

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

function isoToExcelDate(iso: string): Date {
  const [y, m, d] = String(iso || '')
    .slice(0, 10)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y || 2000, (m || 1) - 1, d || 1));
}

function cellToNumber(v: unknown): number {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && v && 'result' in (v as object)) {
    return cellToNumber((v as { result?: unknown }).result);
  }
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function cellToIsoDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
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

/** Açıklama = program kaydı metni (+ ödeme etiketi) */
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
 * UI / bakıye hesabı — seed (dosya ile aynı içerik) + program devamı.
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

  const excelPart = merged.filter((r) => r.kaynak === 'EXCEL');
  const erpPart = merged
    .filter((r) => r.kaynak === 'ERP')
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.aciklama.localeCompare(b.aciklama, 'tr'));
  const orderedChrono = [...excelPart, ...erpPart];

  let bakiye = acilisBakiye;
  let toplamGiren = 0;
  let toplamCikan = 0;
  let excelKalem = 0;
  let erpKalem = 0;
  const rows: ArnavutkoyDefterRow[] = orderedChrono.map((r) => {
    bakiye = round2(bakiye + r.giren - r.cikan);
    toplamGiren = round2(toplamGiren + r.giren);
    toplamCikan = round2(toplamCikan + r.cikan);
    if (r.kaynak === 'EXCEL') excelKalem += 1;
    else erpKalem += 1;
    return { ...r, bakiye };
  });
  const sonBakiye = rows.length ? rows[rows.length - 1].bakiye : acilisBakiye;

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

function pickArnavutSheet(wb: { worksheets: Worksheet[] }): Worksheet {
  const hit = wb.worksheets.find((w) => /arnavut/i.test(w.name));
  return hit || wb.worksheets[0];
}

function cellPlain(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v && 'result' in (v as object)) {
    return String((v as { result?: unknown }).result ?? '');
  }
  if (typeof v === 'object' && v && 'richText' in (v as object)) {
    return ((v as { richText: Array<{ text: string }> }).richText || []).map((t) => t.text).join('');
  }
  return String(v);
}

function findLastDataRow(ws: Worksheet): number {
  let last = 2;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 3) return;
    const aciklama = cellPlain(row.getCell(4).value).trim();
    const giren = cellToNumber(row.getCell(5).value);
    const cikan = cellToNumber(row.getCell(6).value);
    if (aciklama || giren || cikan) last = rowNumber;
  });
  return last;
}

function findStylePrototypeRows(ws: Worksheet): { green: number; exit: number } {
  let green = 0;
  let exit = 0;
  const maxScan = Math.min(ws.rowCount, 80);
  for (let r = 3; r <= maxScan; r++) {
    const giren = cellToNumber(ws.getCell(r, 5).value);
    const fill = ws.getCell(r, 4).fill as { fgColor?: { argb?: string } } | undefined;
    const argb = String(fill?.fgColor?.argb || '').toUpperCase();
    if (!green && giren > 0 && (argb === XLS_GREEN || argb.endsWith('00B050') || argb.endsWith('008000'))) {
      green = r;
    }
    if (!exit && giren <= 0 && cellToNumber(ws.getCell(r, 6).value) > 0) {
      exit = r;
    }
    if (green && exit) break;
  }
  return { green: green || 4, exit: exit || 6 };
}

function appendDefterRow(
  ws: Worksheet,
  rowNum: number,
  protoRow: number,
  data: { tarih: string; ay: string; yil: number; aciklama: string; giren: number; cikan: number }
) {
  const proto = ws.getRow(protoRow);
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= 7; c++) {
    copyCellStyle(proto.getCell(c), row.getCell(c));
  }
  row.getCell(1).value = isoToExcelDate(data.tarih);
  row.getCell(2).value = data.ay;
  row.getCell(3).value = data.yil;
  row.getCell(4).value = data.aciklama;
  row.getCell(5).value = data.giren > 0 ? data.giren : null;
  row.getCell(6).value = data.cikan > 0 ? data.cikan : null;
  // Orijinal defter: bakıye formülü
  row.getCell(7).value = { formula: `G${rowNum - 1}+E${rowNum}-F${rowNum}` };
  if (proto.height) row.height = proto.height;
}

function buildOzetAoa(
  built: ReturnType<typeof buildArnavutkoyDefterRows>,
  kasaHareketleri: KasaHareketi[],
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>>
): unknown[][] {
  const out: unknown[][] = [];
  out.push([KIBRITCI_COMPANY.legalName, '', '', '', '', '']);
  out.push(['KASA BAKİYESİ', built.sonBakiye, '', '', '', '']);
  out.push([]);
  out.push(['KİŞİ / KASA', 'BORÇ', 'PERSONEL ÖDEDİ', 'KASA ÖDEDİ', 'TOPLAM', 'KALEM']);

  const erpOnly = (kasaHareketleri || []).filter(
    (kh) =>
      String(kh.kaynak || '') !== 'LEGACY_XLS' &&
      !String(kh.id || '').startsWith('kh_legacy_xls_')
  );
  const ozet = computeKasaOdemeBazliOzet(erpOnly, personeller, {
    donemBazAktif: false,
    totalOut: built.toplamCikan,
  });

  for (const s of [...ozet.satirlar].sort((a, b) => b.tutar - a.tutar)) {
    out.push([s.label, s.borc || '', s.personel || '', s.kasa || '', s.tutar, s.kalem]);
  }
  out.push([
    'TOPLAM',
    ozet.totals.BORC,
    ozet.totals.PERSONEL_ODEDI,
    ozet.totals.KASA_ODEDI,
    ozet.genelToplam,
    '',
  ]);
  out.push([]);
  out.push(['DETAY — program çıkışları (yeni → eski)']);
  out.push(['TARİH', 'KİŞİ', 'ÖDEME', 'AÇIKLAMA', 'TUTAR']);

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
      odeme === 'BORC'
        ? 'BORÇ'
        : odeme === 'PERSONEL_ODEDI'
          ? 'PERSONEL ÖDEDİ'
          : odeme === 'KASA_ODEDI'
            ? 'KASA ÖDEDİ'
            : '—';
    const kisi = String(kh.personelAdi || kh.surucu || 'KASA').trim() || 'KASA';
    out.push([
      String(kh.tarih).slice(0, 10),
      kisi,
      odemeLabel,
      String(kh.aciklama || ''),
      round2(kh.tutar),
    ]);
  }
  return out;
}

/**
 * Gerçek ARNAVUTKÖY şablonunu (stilleri bozulmadan) açar; son satırdan sonra
 * program kayıtlarını ekler; üst satır SUM formüllerini günceller; ÖZET ekler.
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

  const res = await fetch(ARNAVUTKOY_KASA_XLS_URL);
  if (!res.ok) {
    throw new Error(
      'ARNAVUTKÖY KASA şablonu yüklenemedi. public/arnavutkoy-kasa-yeni.xlsx dosyasını kontrol edin.'
    );
  }
  const buffer = await res.arrayBuffer();
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = pickArnavutSheet(wb);
  if (!ws) throw new Error('Excel içinde ARNAVUTKÖY sayfası bulunamadı.');

  const lastData = findLastDataRow(ws);
  const protos = findStylePrototypeRows(ws);

  // Mevcut satırlardan dedupe + excel bakiyesi
  const seen = new Set<string>();
  let excelKalem = 0;
  let excelSonBakiye = 0;
  for (let r = 3; r <= lastData; r++) {
    const tarih = cellToIsoDate(ws.getCell(r, 1).value);
    const aciklama = cellPlain(ws.getCell(r, 4).value).trim();
    const giren = round2(cellToNumber(ws.getCell(r, 5).value));
    const cikan = round2(cellToNumber(ws.getCell(r, 6).value));
    const bakiyeCell = round2(cellToNumber(ws.getCell(r, 7).value));
    if (!aciklama && !giren && !cikan) continue;
    seen.add(rowDedupeKey(tarih, aciklama, giren, cikan));
    excelSonBakiye = bakiyeCell || round2(excelSonBakiye + giren - cikan);
    excelKalem += 1;
  }

  // Program kayıtları — dosyanın sonuna, orijinal satır stilini kopyalayarak
  const erpRows = built.rows.filter((r) => r.kaynak === 'ERP');
  let erpKalem = 0;
  let rowNum = lastData;
  for (const r of erpRows) {
    const key = rowDedupeKey(r.tarih, r.aciklama, r.giren, r.cikan);
    if (seen.has(key)) continue;
    seen.add(key);
    rowNum += 1;
    appendDefterRow(ws, rowNum, r.giren > 0 ? protos.green : protos.exit, {
      tarih: r.tarih,
      ay: r.ay,
      yil: r.yil,
      aciklama: r.aciklama,
      giren: r.giren,
      cikan: r.cikan,
    });
    erpKalem += 1;
  }

  const finalLast = rowNum;
  // Üst satır formülleri — orijinal yapı (değer yazma, formül güncelle)
  ws.getCell(1, 5).value = { formula: `SUM(E3:E${finalLast})` };
  ws.getCell(1, 6).value = { formula: `SUM(F3:F${finalLast})` };
  ws.getCell(1, 7).value = { formula: 'E1-F1' };

  const finalSonBakiye = built.sonBakiye;

  // ÖZET sayfası (yoksa ekle / varsa değiştir)
  const ozetAoa = buildOzetAoa(
    {
      ...built,
      sonBakiye: finalSonBakiye,
      excelKalem,
      erpKalem,
      excelSonBakiye,
    },
    kasaHareketleri,
    personeller
  );
  const existingOzet = wb.getWorksheet('ÖZET');
  if (existingOzet) wb.removeWorksheet(existingOzet.id);
  const ozetWs = wb.addWorksheet('ÖZET');
  ozetWs.columns = [
    { width: 28 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
  ];
  const border = thinBorderBlack();
  ozetAoa.forEach((line, idx) => {
    const row = ozetWs.getRow(idx + 1);
    (line as unknown[]).forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = (v as string | number) ?? null;
      cell.font = { name: XLS_FONT, size: 10 };
      if (idx === 1) {
        cell.fill = solidFill(XLS_RED);
        cell.font = { name: XLS_FONT, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      }
      if (idx === 3) {
        cell.fill = solidFill(XLS_CYAN);
        cell.font = { name: XLS_FONT, size: 9, bold: true };
        cell.border = border;
      }
    });
  });

  const outBuffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    outBuffer as ArrayBuffer,
    `ARNAVUTKOY_KASA_YENI_devam_${new Date().toISOString().slice(0, 10)}.xlsx`
  );

  return {
    acilisBakiye: excelSonBakiye,
    sonBakiye: finalSonBakiye,
    excelKalem,
    erpKalem,
    excelSonBakiye,
  };
}
