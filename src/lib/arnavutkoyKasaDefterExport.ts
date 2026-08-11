/**
 * Arnavutköy kasa defteri:
 * Gerçek `public/arnavutkoy-kasa-yeni.xls` dosyasının ÜZERİNE program kayıtlarını ekler.
 * Taklit üretmez. Ekstra yalnızca ÖZET sayfası.
 */
import type { KasaHareketi, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY } from './kibritciBrand';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';
import { computeKasaOdemeBazliOzet } from './kasaLedgerUtils';
import seed from '../data/arnavutkoyKasaDefterSeed.json';

/** Orijinal ARNAVUTKÖY KASA YENİ.xls renkleri (xlrd colour_map) */
const XLS_RED = 'FFFF0000'; // satır 1 özet
const XLS_CYAN = 'FF00CCFF'; // satır 2 başlık
const XLS_GREEN = 'FF008000'; // GİREN satırları
const XLS_WHITE = 'FFFFFFFF';
const XLS_FONT = 'Calibri';
const XLS_FONT_SIZE = 9;

function thinBorderBlack() {
  const edge = { style: 'thin' as const, color: { argb: 'FF000000' } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function solidFill(argb: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } };
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

/** Masaüstündeki ARNAVUTKÖY KASA YENİ.xls — public’e kopyalandı */
export const ARNAVUTKOY_KASA_XLS_URL = '/arnavutkoy-kasa-yeni.xls';

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

function pickArnavutSheetName(names: string[]): string {
  const hit = names.find((n) => /arnavut/i.test(n));
  return hit || names[0] || 'ARNAVUTKÖY';
}

function findLastDataRowIndex(aoa: unknown[][]): number {
  let last = 1; // header row
  for (let i = 2; i < aoa.length; i++) {
    const aciklama = String(aoa[i]?.[3] ?? '').trim();
    if (aciklama) last = i;
  }
  return last;
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
 * Gerçek ARNAVUTKÖY KASA YENİ.xls dosyasını açar, son satırdan sonra program
 * kayıtlarını ekler, üst satır toplamlarını günceller, ÖZET sayfası ekler.
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
      'ARNAVUTKÖY KASA YENİ.xls yüklenemedi. public/arnavutkoy-kasa-yeni.xls dosyasını kontrol edin.'
    );
  }
  const buffer = await res.arrayBuffer();
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = pickArnavutSheetName(wb.SheetNames);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Excel içinde ARNAVUTKÖY sayfası bulunamadı.');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: true,
  });

  // Boş kuyruk satırlarını at (orijinal dosyada binlerce boş satır var)
  const lastData = findLastDataRowIndex(aoa);
  const trimmed = aoa.slice(0, lastData + 1).map((r) => {
    const row = [...(r || [])];
    while (row.length < 7) row.push('');
    return row.slice(0, 7);
  });

  // Mevcut satırlardan dedupe anahtarları
  const seen = new Set<string>();
  let runningBakiye = 0;
  let excelKalem = 0;
  for (let i = 2; i < trimmed.length; i++) {
    const row = trimmed[i];
    const tarih = cellToIsoDate(row[0]);
    const aciklama = String(row[3] || '').trim();
    const giren = round2(cellToNumber(row[4]));
    const cikan = round2(cellToNumber(row[5]));
    const bakiyeCell = round2(cellToNumber(row[6]));
    if (aciklama) {
      seen.add(rowDedupeKey(tarih, aciklama, giren, cikan));
      runningBakiye = bakiyeCell || round2(runningBakiye + giren - cikan);
      excelKalem += 1;
    }
  }
  const excelSonBakiye = round2(runningBakiye);

  // Program kayıtları — dosyanın sonuna ekle
  const erpRows = built.rows.filter((r) => r.kaynak === 'ERP');
  let erpKalem = 0;
  let bakiye = excelSonBakiye;
  for (const r of erpRows) {
    const key = rowDedupeKey(r.tarih, r.aciklama, r.giren, r.cikan);
    if (seen.has(key)) continue;
    seen.add(key);
    bakiye = round2(bakiye + r.giren - r.cikan);
    trimmed.push([
      isoToExcelDate(r.tarih),
      r.ay,
      r.yil,
      r.aciklama,
      r.giren ? r.giren : '',
      r.cikan ? r.cikan : '',
      bakiye,
    ]);
    erpKalem += 1;
  }

  // Üst satır toplamları (orijinal satır 0)
  let toplamGiren = 0;
  let toplamCikan = 0;
  for (let i = 2; i < trimmed.length; i++) {
    toplamGiren = round2(toplamGiren + cellToNumber(trimmed[i][4]));
    toplamCikan = round2(toplamCikan + cellToNumber(trimmed[i][5]));
  }
  const sonBakiye = trimmed.length > 2 ? round2(cellToNumber(trimmed[trimmed.length - 1][6])) : excelSonBakiye;

  if (!trimmed[0]) trimmed[0] = ['', 'PROJE MÜDÜRÜ', '', 'ARNAVUTKÖY', 0, 0, 0];
  while (trimmed[0].length < 7) trimmed[0].push('');
  // Orijinal etiketleri koru; yalnızca E/F/G güncelle
  trimmed[0][4] = toplamGiren;
  trimmed[0][5] = toplamCikan;
  trimmed[0][6] = sonBakiye;
  // D sütunu orijinalde bozuk "P" olabiliyor — ARNAVUTKÖY yaz
  if (String(trimmed[0][3] || '').trim().length <= 1) {
    trimmed[0][3] = 'ARNAVUTKÖY';
  }
  if (!String(trimmed[0][1] || '').trim()) {
    trimmed[0][1] = 'PROJE MÜDÜRÜ';
  }

  // ExcelJS ile orijinal renkleri uygula (SheetJS stilleri siler)
  const excelWb = await createExcelWorkbook();
  excelWb.creator = 'Kibritçi ERP';
  excelWb.created = new Date();
  const excelWs = excelWb.addWorksheet(sheetName || 'ARNAVUTKÖY', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  // Orijinal col width ≈ xlrd width/256
  excelWs.columns = [
    { width: 12.7 },
    { width: 8.5 },
    { width: 5.4 },
    { width: 56.7 },
    { width: 8.6 },
    { width: 9.7 },
    { width: 8.4 },
  ];

  const border = thinBorderBlack();
  const fontBase = { name: XLS_FONT, size: XLS_FONT_SIZE, color: { argb: 'FF000000' } };

  for (let r = 0; r < trimmed.length; r++) {
    const raw = trimmed[r];
    const rowNum = r + 1;
    const giren = cellToNumber(raw[4]);
    const cikan = cellToNumber(raw[5]);

    let fillArgb = XLS_WHITE;
    if (r === 0) fillArgb = XLS_RED;
    else if (r === 1) fillArgb = XLS_CYAN;
    else if (giren > 0) fillArgb = XLS_GREEN;

    const isTop = r === 0;
    const isColHeader = r === 1;
    const fill = solidFill(fillArgb);

    for (let c = 0; c < 7; c++) {
      const cell = excelWs.getCell(rowNum, c + 1);
      let val: unknown = raw[c];
      if (val === '' || val == null) {
        cell.value = null;
      } else if (c === 0 && r >= 2) {
        const iso = cellToIsoDate(val);
        cell.value = iso ? isoToExcelDate(iso) : val;
        cell.numFmt = 'yyyy-mm-dd';
      } else if (c >= 4 && (typeof val === 'number' || (typeof val === 'string' && val !== ''))) {
        const num = typeof val === 'number' ? val : cellToNumber(val);
        cell.value = num;
        cell.numFmt = '#,##0.00';
      } else if (c === 2 && r >= 2) {
        cell.value = Number(val) || val;
      } else {
        cell.value = val as string | number;
      }

      cell.font = {
        ...fontBase,
        bold: isTop || isColHeader || (r >= 2 && giren > 0 && (c === 0 || c === 3 || c === 4)),
      };
      cell.fill = fill;
      cell.border = border;
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 3 ? 'left' : c >= 4 ? 'right' : 'center',
        wrapText: c === 3,
      };
    }
    excelWs.getRow(rowNum).height = r === 1 ? 26 : 12;
  }

  // ÖZET sayfası
  const ozetAoa = buildOzetAoa(
    {
      ...built,
      sonBakiye,
      excelKalem,
      erpKalem,
      toplamGiren,
      toplamCikan,
      excelSonBakiye,
    },
    kasaHareketleri,
    personeller
  );
  const ozetWs = excelWb.addWorksheet('ÖZET');
  ozetWs.columns = [
    { width: 28 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
  ];
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

  // Diğer orijinal sayfalar (değer olarak)
  for (const name of wb.SheetNames) {
    if (name === sheetName) continue;
    const src = wb.Sheets[name];
    if (!src) continue;
    const copyAoa = XLSX.utils.sheet_to_json<unknown[]>(src, {
      header: 1,
      defval: '',
      raw: true,
    });
    if (!copyAoa.length) continue;
    const extra = excelWb.addWorksheet(String(name).slice(0, 31));
    copyAoa.forEach((line, idx) => {
      const row = extra.getRow(idx + 1);
      (line as unknown[]).forEach((v, ci) => {
        row.getCell(ci + 1).value = (v as string | number | Date) ?? null;
      });
    });
  }

  const outBuffer = await excelWb.xlsx.writeBuffer();
  downloadBuffer(
    outBuffer as ArrayBuffer,
    `ARNAVUTKOY_KASA_YENI_devam_${new Date().toISOString().slice(0, 10)}.xlsx`
  );

  return {
    acilisBakiye: excelSonBakiye,
    sonBakiye,
    excelKalem,
    erpKalem,
    excelSonBakiye,
  };
}
