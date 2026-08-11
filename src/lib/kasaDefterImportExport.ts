import type { KasaHareketi } from '../types/erp';

export interface ParsedKasaDefterRow {
  rowIndex: number;
  tarih: string;
  aciklama: string;
  giren: number;
  cikan: number;
  bakiye?: number;
}

export interface KasaDefterParseResult {
  sheetName: string;
  rows: ParsedKasaDefterRow[];
  skippedMeta: number;
  skippedEmpty: number;
}

export interface KasaDefterImportPlan {
  toImport: KasaHareketi[];
  duplicateIds: number;
  duplicateContent: number;
  skippedMeta: number;
  skippedEmpty: number;
  totalParsed: number;
}

const SKIP_ACIKLAMA =
  /^(HESAP\s+AÇILIŞI|DEVİR\s*EDİLEN|GEÇEN\s+HAFTADAN\s+DEVREDEN|DEVREDEN|AÇILIŞ)$/i;

function normalizeAciklama(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

function parseMoney(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw).trim().replace(/\s/g, '');
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFromParts(y: number, m: number, d: number): string {
  if (!y || !m || !d) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function excelSerialToIso(serial: number): string {
  // Excel 1900 date system (compatible with legacy .xls exports)
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return '';
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseTarihCell(raw: unknown, yilHint?: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 60000) {
    return excelSerialToIso(raw);
  }
  if (raw instanceof Date && !Number.isNaN(raw.valueOf())) {
    return isoFromParts(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  const text = String(raw).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) return isoFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
    return excelSerialToIso(serial);
  }
  const y = Number(yilHint);
  if (y >= 1990 && y <= 2100) {
    const dm = text.match(/^(\d{1,2})[./-](\d{1,2})$/);
    if (dm) return isoFromParts(y, Number(dm[2]), Number(dm[1]));
  }
  return '';
}

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function legacyKasaId(row: ParsedKasaDefterRow): string {
  const key = `${row.tarih}|${row.aciklama}|${row.giren}|${row.cikan}|${row.rowIndex}`;
  return `kh_legacy_xls_${simpleHash(key)}`;
}

function contentFingerprint(kh: Pick<KasaHareketi, 'tarih' | 'aciklama' | 'tutar' | 'hareketTipi'>): string {
  const ac = normalizeAciklama(kh.aciklama);
  const tutar = Number(kh.tutar) || 0;
  return `${kh.tarih}|${ac}|${tutar.toFixed(2)}|${kh.hareketTipi}`;
}

function findHeaderRow(rows: unknown[][]): { headerRow: number; dataStart: number } {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i] || [];
    const c0 = String(r[0] || '').toLocaleUpperCase('tr-TR');
    const c3 = String(r[3] || '').toLocaleUpperCase('tr-TR');
    if (c0.includes('TARİH') && c3.includes('AÇIKLAMA')) {
      return { headerRow: i, dataStart: i + 1 };
    }
  }
  return { headerRow: 1, dataStart: 2 };
}

function pickDefterSheet(sheetNames: string[]): string {
  const preferred = sheetNames.find((n) => /arnavut/i.test(n));
  if (preferred) return preferred;
  return sheetNames[0] || 'Sheet1';
}

/**
 * ARNAVUTKÖY tarzı Excel defterini satır listesine çevirir.
 */
export async function parseKasaDefterWorkbook(buffer: ArrayBuffer): Promise<KasaDefterParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = pickDefterSheet(wb.SheetNames);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error('Excel dosyasında okunabilir sayfa bulunamadı.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const { dataStart } = findHeaderRow(rows);
  const parsed: ParsedKasaDefterRow[] = [];
  let skippedMeta = 0;
  let skippedEmpty = 0;

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    const hasAny = r.some((c) => c !== '' && c != null);
    if (!hasAny) {
      skippedEmpty += 1;
      continue;
    }

    const aciklamaRaw = String(r[3] ?? '').trim();
    if (!aciklamaRaw) {
      skippedEmpty += 1;
      continue;
    }

    const aciklama = normalizeAciklama(aciklamaRaw);
    if (SKIP_ACIKLAMA.test(aciklama)) {
      skippedMeta += 1;
      continue;
    }

    const tarih = parseTarihCell(r[0], r[2]);
    if (!tarih) {
      skippedMeta += 1;
      continue;
    }

    const giren = parseMoney(r[4]);
    const cikan = parseMoney(r[5]);
    const bakiyeRaw = r[6];
    const bakiye = bakiyeRaw !== '' && bakiyeRaw != null ? parseMoney(bakiyeRaw) : undefined;

    if (giren <= 0 && cikan <= 0) {
      skippedMeta += 1;
      continue;
    }

    parsed.push({
      rowIndex: i + 1,
      tarih,
      aciklama: aciklamaRaw.trim(),
      giren,
      cikan,
      bakiye,
    });
  }

  if (parsed.length === 0) {
    throw new Error(
      'Excel dosyasında aktarılabilir kasa satırı bulunamadı. TARİH / AÇIKLAMA / GİREN / ÇIKAN sütunlarını kontrol edin.'
    );
  }

  return { sheetName, rows: parsed, skippedMeta, skippedEmpty };
}

/**
 * Parse edilen satırlardan Firestore’a yazılacak geçmiş kasa hareketlerini üretir.
 * Mevcut kayıtlara dokunmaz; yalnızca yeni id’leri döndürür.
 */
export function buildLegacyKasaHareketleri(
  parsed: ParsedKasaDefterRow[],
  existing: KasaHareketi[]
): KasaDefterImportPlan {
  const existingIds = new Set(existing.map((k) => k.id));
  const existingFingerprints = new Set(
    existing.map((k) =>
      contentFingerprint({
        tarih: k.tarih,
        aciklama: k.aciklama,
        tutar: k.tutar,
        hareketTipi: k.hareketTipi,
      })
    )
  );

  const toImport: KasaHareketi[] = [];
  let duplicateIds = 0;
  let duplicateContent = 0;
  const seenImportFingerprints = new Set<string>();

  for (const row of parsed) {
    const id = legacyKasaId(row);
    if (existingIds.has(id)) {
      duplicateIds += 1;
      continue;
    }

    const isGiris = row.giren > 0;
    const tutar = isGiris ? row.giren : row.cikan;
    const hareket: KasaHareketi = {
      id,
      tarih: row.tarih,
      hareketTipi: isGiris ? 'GİRİŞ' : 'ÇIKIŞ',
      tutar,
      aciklama: row.aciklama,
      referansTipi: 'DİĞER',
      odemeDurumu: 'KASA_ODEDI',
      kaynak: 'LEGACY_XLS',
    };

    const fp = contentFingerprint(hareket);
    if (existingFingerprints.has(fp) || seenImportFingerprints.has(fp)) {
      duplicateContent += 1;
      continue;
    }
    seenImportFingerprints.add(fp);
    toImport.push(hareket);
  }

  return {
    toImport,
    duplicateIds,
    duplicateContent,
    skippedMeta: 0,
    skippedEmpty: 0,
    totalParsed: parsed.length,
  };
}

export function formatKasaDefterImportSummary(
  parse: KasaDefterParseResult,
  plan: KasaDefterImportPlan
): string {
  return [
    `Sayfa: ${parse.sheetName}`,
    `Okunan satır: ${parse.rows.length}`,
    `Atlanan (açılış/devir/boş): ${parse.skippedMeta}`,
    `Yeni aktarılacak: ${plan.toImport.length}`,
    `Zaten kayıtlı (id): ${plan.duplicateIds}`,
    `Zaten kayıtlı (içerik): ${plan.duplicateContent}`,
  ].join('\n');
}

/**
 * Excel dosyasını okuyup geçmiş kasa hareketlerini Firestore’a yazar.
 */
export async function importKasaDefterFromBuffer(
  buffer: ArrayBuffer,
  existing: KasaHareketi[],
  onProgress?: (saved: number, total: number) => void
): Promise<{ plan: KasaDefterImportPlan; parse: KasaDefterParseResult; saved: number }> {
  const parse = await parseKasaDefterWorkbook(buffer);
  const plan = buildLegacyKasaHareketleri(parse.rows, existing);
  plan.skippedMeta = parse.skippedMeta;
  plan.skippedEmpty = parse.skippedEmpty;

  if (plan.toImport.length === 0) {
    return { plan, parse, saved: 0 };
  }

  const { saveDocumentsBatch } = await import('./firebase');
  const saved = await saveDocumentsBatch('kasaHareketleri', plan.toImport, onProgress);
  return { plan, parse, saved };
}
