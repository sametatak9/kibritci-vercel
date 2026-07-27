import {
  CariKart,
  CariKartIslem,
  Fatura,
  FaturaItem,
  StokKart,
  StokKartIslem,
} from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { saveDocument } from './firebase';

export const BIRBESAN_CARI_UNVAN = 'BİRBESAN';

export type CariStokExcelLine = {
  sourceFile: string;
  rowNo: number;
  tarih: string;
  belgeNo: string;
  urunAdi: string;
  birim: string;
  miktar: number;
  birimFiyat: number;
  toplam: number;
};

export type CariStokExcelParseResult = {
  lines: CariStokExcelLine[];
  warnings: string[];
};

export type CariStokImportSummary = {
  createdStok: number;
  updatedStok: number;
  createdFatura: number;
  createdCariIslem: number;
  createdStokIslem: number;
  lineCount: number;
  uniqueStokCount: number;
};

const HEADER_HINTS: Record<keyof Omit<CariStokExcelLine, 'sourceFile' | 'rowNo'>, string[]> = {
  tarih: ['tarih', 'fatura tarihi', 'islem tarihi', 'işlem tarihi', 'evrak tarihi'],
  belgeNo: ['belge no', 'belge', 'fatura no', 'fatura', 'evrak no', 'irsaliye no', 'siparis no', 'sipariş no'],
  urunAdi: [
    'stok adi',
    'stok adı',
    'malzeme',
    'urun',
    'ürün',
    'aciklama',
    'açıklama',
    'mal hizmet',
    'mal/hizmet',
    'cinsi',
    'tanim',
    'tanım',
    'stok',
  ],
  birim: ['birim', 'olcu', 'ölçü', 'br'],
  miktar: ['miktar', 'adet', 'tonaj', 'kg', 'lt', 'metre', 'miktarı'],
  birimFiyat: ['birim fiyat', 'birimfiyat', 'bf', 'net fiyat', 'fiyat', 'birim tutar'],
  toplam: ['tutar', 'toplam', 'genel toplam', 'net tutar', 'kdv haric', 'kdv hariç'],
};

export const normalizeImportText = (raw: unknown): string =>
  String(raw ?? '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim();

const levenshteinDistance = (a: string, b: string): number => {
  const s = normalizeImportText(a);
  const t = normalizeImportText(b);
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[rows - 1][cols - 1];
};

export const toIsoDate = (raw: unknown): string => {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (raw instanceof Date && !Number.isNaN(raw.valueOf())) return raw.toISOString().slice(0, 10);
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const n = Number(text);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(n));
    return excelEpoch.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

const parseNumber = (raw: unknown): number => {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
};

const getCellText = (ws: any, row: number, col: number): string => {
  const cell = ws.getRow(row).getCell(col);
  if (!cell) return '';
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) return String(value.result).trim();
    if ('text' in value && value.text != null) return String(value.text).trim();
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((x: any) => String(x?.text || '')).join('').trim();
    }
  }
  try {
    return String(cell.text || '').trim();
  } catch {
    return '';
  }
};

const scoreHeaderCell = (cellText: string, hints: string[]): number => {
  const norm = normalizeImportText(cellText);
  if (!norm) return 0;
  let best = 0;
  for (const hint of hints) {
    if (norm === hint) best = Math.max(best, 10);
    else if (norm.includes(hint)) best = Math.max(best, 7);
    else if (hint.includes(norm) && norm.length >= 3) best = Math.max(best, 4);
  }
  return best;
};

type ColumnMap = Partial<Record<keyof Omit<CariStokExcelLine, 'sourceFile' | 'rowNo'>, number>>;

const detectHeaderRow = (ws: any, maxScanRow = 25): { headerRow: number; columns: ColumnMap } | null => {
  let best: { headerRow: number; columns: ColumnMap; score: number } | null = null;
  const colCount = Math.min(ws.columnCount || 30, 30);

  for (let row = 1; row <= maxScanRow; row++) {
    const columns: ColumnMap = {};
    let score = 0;
    for (let col = 1; col <= colCount; col++) {
      const text = getCellText(ws, row, col);
      (Object.keys(HEADER_HINTS) as Array<keyof typeof HEADER_HINTS>).forEach((key) => {
        const s = scoreHeaderCell(text, HEADER_HINTS[key]);
        if (s > 0 && (!columns[key] || s > scoreHeaderCell(getCellText(ws, row, columns[key]!), HEADER_HINTS[key]))) {
          columns[key] = col;
        }
      });
    }
    const mapped = Object.keys(columns).length;
    const rowScore = mapped * 3 + (columns.urunAdi ? 5 : 0) + (columns.birimFiyat || columns.toplam ? 3 : 0);
    if (mapped >= 2 && rowScore > (best?.score || 0)) {
      best = { headerRow: row, columns, score: rowScore };
    }
  }
  return best ? { headerRow: best.headerRow, columns: best.columns } : null;
};

const parseWorksheet = (ws: any, sourceFile: string): CariStokExcelParseResult => {
  const warnings: string[] = [];
  const detected = detectHeaderRow(ws);
  if (!detected?.columns.urunAdi) {
    warnings.push(`${sourceFile}: ürün/stok sütunu bulunamadı`);
    return { lines: [], warnings };
  }

  const { headerRow, columns } = detected;
  const lines: CariStokExcelLine[] = [];
  let emptyStreak = 0;
  const maxRow = Math.max(ws.rowCount || 0, headerRow + 500);

  for (let row = headerRow + 1; row <= maxRow; row++) {
    const urunAdi = columns.urunAdi ? getCellText(ws, row, columns.urunAdi) : '';
    const birim = columns.birim ? getCellText(ws, row, columns.birim) : '';
    const miktarRaw = columns.miktar ? ws.getRow(row).getCell(columns.miktar).value : '';
    const fiyatRaw = columns.birimFiyat ? ws.getRow(row).getCell(columns.birimFiyat).value : '';
    const toplamRaw = columns.toplam ? ws.getRow(row).getCell(columns.toplam).value : '';
    const tarihRaw = columns.tarih ? ws.getRow(row).getCell(columns.tarih).value : '';
    const belgeNo = columns.belgeNo ? getCellText(ws, row, columns.belgeNo) : '';

    if (!urunAdi && !birim && !miktarRaw && !fiyatRaw) {
      emptyStreak += 1;
      if (emptyStreak >= 8) break;
      continue;
    }
    emptyStreak = 0;
    if (!urunAdi || normalizeImportText(urunAdi) === 'toplam') continue;

    const miktar = parseNumber(miktarRaw) || 1;
    let birimFiyat = parseNumber(fiyatRaw);
    let toplam = parseNumber(toplamRaw);
    if (!birimFiyat && toplam && miktar) birimFiyat = toplam / miktar;
    if (!toplam && birimFiyat && miktar) toplam = birimFiyat * miktar;

    lines.push({
      sourceFile,
      rowNo: row,
      tarih: toIsoDate(tarihRaw),
      belgeNo: belgeNo || '',
      urunAdi: urunAdi.trim(),
      birim: (birim || 'ADET').toUpperCase(),
      miktar,
      birimFiyat,
      toplam,
    });
  }

  if (!lines.length) warnings.push(`${sourceFile}: veri satırı okunamadı (başlık satırı: ${headerRow})`);
  return { lines, warnings };
};

export const parseCariStokExcelFiles = async (files: File[]): Promise<CariStokExcelParseResult> => {
  const allLines: CariStokExcelLine[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const workbook = await createExcelWorkbook();
    await workbook.xlsx.load(buffer);
    workbook.worksheets.forEach((ws, idx) => {
      const label = workbook.worksheets.length > 1 ? `${file.name}#${idx + 1}` : file.name;
      const parsed = parseWorksheet(ws, label);
      allLines.push(...parsed.lines);
      warnings.push(...parsed.warnings);
    });
  }

  return { lines: allLines, warnings };
};

export const findExistingStok = (urunAdi: string, stoklar: StokKart[]): StokKart | null => {
  const norm = normalizeImportText(urunAdi);
  if (!norm) return null;
  const exact = stoklar.find((s) => normalizeImportText(s.stokAdi) === norm);
  if (exact) return exact;
  let best: StokKart | null = null;
  let bestDist = 999;
  for (const s of stoklar) {
    const dist = levenshteinDistance(norm, s.stokAdi);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return bestDist <= 2 ? best : null;
};

/** Tedarikçi arşiv stoklarında eşleştir — aktif şantiye stoklarıyla karışmasın */
export const findExistingTedarikciStok = (
  urunAdi: string,
  stoklar: StokKart[],
  cariId: string
): StokKart | null => {
  const pool = stoklar.filter(
    (s) =>
      s.tedarikciCariId === cariId ||
      s.arsivde ||
      normalizeImportText(s.tedarikciUnvan || '').includes('birbesan')
  );
  return findExistingStok(urunAdi, pool);
};

export const isBirbesanStokArsiv = (stok: StokKart): boolean =>
  Boolean(stok.arsivde) &&
  (stok.stokKaynak === 'BIRBESAN_EXCEL' ||
    normalizeImportText(stok.tedarikciUnvan || '').includes('birbesan'));

export const findCariByUnvan = (unvan: string, cariler: CariKart[]): CariKart | null => {
  const norm = normalizeImportText(unvan);
  return (
    cariler.find((c) => normalizeImportText(c.unvan) === norm) ||
    cariler.find((c) => normalizeImportText(c.unvan).includes(norm) || norm.includes(normalizeImportText(c.unvan))) ||
    null
  );
};

const buildFaturaGroups = (lines: CariStokExcelLine[]) => {
  const groups = new Map<string, CariStokExcelLine[]>();
  for (const line of lines) {
    const key = `${line.tarih}::${line.belgeNo || line.sourceFile}-${line.rowNo}`;
    const bucket = groups.get(key) || [];
    bucket.push(line);
    groups.set(key, bucket);
  }
  return groups;
};

export const applyCariStokExcelImport = async (options: {
  lines: CariStokExcelLine[];
  cari: CariKart;
  stokKartlar: StokKart[];
  setStokKartlar: (updater: StokKart[] | ((prev: StokKart[]) => StokKart[])) => void;
  importTag?: string;
  /** Tedarikçi Excel arşivi — stok kartları Stok sekmesinde Arşiv'de listelenir */
  archiveAsTedarikci?: boolean;
  stokKaynak?: StokKart['stokKaynak'];
}): Promise<CariStokImportSummary> => {
  const { lines, cari, stokKartlar, setStokKartlar } = options;
  const importTag = options.importTag || `[ExcelImport:${cari.unvan}]`;
  const archiveAsTedarikci = Boolean(options.archiveAsTedarikci);
  const stokKaynak = options.stokKaynak || (archiveAsTedarikci ? 'BIRBESAN_EXCEL' : undefined);
  const mutableStoklar = [...stokKartlar];
  const summary: CariStokImportSummary = {
    createdStok: 0,
    updatedStok: 0,
    createdFatura: 0,
    createdCariIslem: 0,
    createdStokIslem: 0,
    lineCount: lines.length,
    uniqueStokCount: 0,
  };

  const latestByStok = new Map<string, { birim: string; birimFiyat: number; tarih: string }>();
  for (const line of lines) {
    const norm = normalizeImportText(line.urunAdi);
    const prev = latestByStok.get(norm);
    if (!prev || line.tarih >= prev.tarih) {
      latestByStok.set(norm, { birim: line.birim, birimFiyat: line.birimFiyat, tarih: line.tarih });
    }
  }
  summary.uniqueStokCount = latestByStok.size;

  const stokIdByNorm = new Map<string, string>();

  for (const [norm, meta] of latestByStok.entries()) {
    const sampleName = lines.find((l) => normalizeImportText(l.urunAdi) === norm)?.urunAdi || norm;
    let stok = archiveAsTedarikci
      ? findExistingTedarikciStok(sampleName, mutableStoklar, cari.id)
      : findExistingStok(sampleName, mutableStoklar);
    if (!stok) {
      stok = {
        id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
        stokAdi: sampleName,
        kategori: archiveAsTedarikci ? 'BİRBESAN Arşiv' : 'Kaba İnşaat İmalatı',
        birim: meta.birim || 'ADET',
        kritikSeviye: 0,
        durum: 'AKTIF',
        aciklama: `${importTag} Excel aktarımından oluşturuldu.`,
        sonBirimFiyat: meta.birimFiyat || undefined,
        sonFiyatTarihi: meta.tarih,
        tedarikciCariId: cari.id,
        tedarikciUnvan: cari.unvan,
        arsivde: archiveAsTedarikci || undefined,
        stokKaynak,
      };
      mutableStoklar.unshift(stok);
      await saveDocument('stokKartlar', stok);
      summary.createdStok += 1;
    } else {
      const next: StokKart = {
        ...stok,
        birim: meta.birim || stok.birim,
        sonBirimFiyat: meta.birimFiyat || stok.sonBirimFiyat,
        sonFiyatTarihi: meta.tarih,
        tedarikciCariId: cari.id,
        tedarikciUnvan: cari.unvan,
        arsivde: archiveAsTedarikci ? true : stok.arsivde,
        stokKaynak: stokKaynak || stok.stokKaynak,
        kategori: archiveAsTedarikci ? 'BİRBESAN Arşiv' : stok.kategori,
        aciklama: String(stok.aciklama || '').includes(importTag)
          ? stok.aciklama
          : `${String(stok.aciklama || '').trim()}\n${importTag}`.trim(),
      };
      const idx = mutableStoklar.findIndex((x) => x.id === stok!.id);
      if (idx >= 0) mutableStoklar[idx] = next;
      stok = next;
      await saveDocument('stokKartlar', next);
      summary.updatedStok += 1;
    }
    stokIdByNorm.set(norm, stok.id);
  }

  setStokKartlar(mutableStoklar);

  const groups = buildFaturaGroups(lines);
  for (const [groupKey, groupLines] of groups.entries()) {
    const tarih = groupLines[0]?.tarih || new Date().toISOString().slice(0, 10);
    const belgeNo = groupLines[0]?.belgeNo || `EXC-${tarih.replace(/-/g, '')}`;
    const faturaId = `fat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const kalemler: FaturaItem[] = groupLines.map((line, idx) => {
      const stokId = stokIdByNorm.get(normalizeImportText(line.urunAdi));
      const toplam = line.toplam || line.birimFiyat * line.miktar;
      return {
        id: `fi_${faturaId}_${idx}`,
        urunAdi: line.urunAdi,
        miktar: line.miktar,
        birim: line.birim,
        birimFiyat: line.birimFiyat,
        kdvOran: 20,
        toplam,
        stokKartId: stokId,
      };
    });

    const toplamTutar = kalemler.reduce((s, k) => s + (k.toplam || 0), 0);
    const kdvTutar = Math.round(toplamTutar * 0.2 * 100) / 100;
    const fatura: Fatura = {
      id: faturaId,
      faturaNo: belgeNo,
      tarih,
      cariKartId: cari.id,
      cariUnvan: cari.unvan,
      toplamTutar,
      kdvTutar,
      genelToplam: toplamTutar + kdvTutar,
      durum: 'ONAYLANDI',
      rapor: `${importTag} ${groupKey}`,
      kalemler,
      bagliIrsaliyeler: [],
      eImzalar: [],
    };
    await saveDocument('faturalar', fatura);
    summary.createdFatura += 1;

    const cariIslem: CariKartIslem = {
      id: `cari_islem_${faturaId}`,
      cariKartId: cari.id,
      islemTipi: 'FATURA',
      islemId: faturaId,
      islemBaslik: `Fatura ${belgeNo}`,
      islemDetay: `${kalemler.length} kalem · ₺${fatura.genelToplam.toLocaleString('tr-TR')} ${importTag}`,
      tutar: fatura.genelToplam,
      tarih,
      belgeNo,
    };
    await saveDocument('cariIslemGecmisi', cariIslem);
    summary.createdCariIslem += 1;

    for (const line of groupLines) {
      const stokId = stokIdByNorm.get(normalizeImportText(line.urunAdi));
      if (!stokId) continue;
      const stokIslem: StokKartIslem = {
        id: `stk_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        stokKartId: stokId,
        islemTipi: 'GIRIS',
        islemId: faturaId,
        islemBaslik: `Excel fatura ${belgeNo}`,
        islemDetay: `${line.urunAdi} · ${line.miktar} ${line.birim} · ₺${line.birimFiyat}`,
        miktarDegisimi: line.miktar,
        tarih,
        belgeNo,
      };
      await saveDocument('stokIslemGecmisi', stokIslem);
      summary.createdStokIslem += 1;
    }
  }

  return summary;
};

export const ensureBirbesanCari = (
  cariKartlar: CariKart[],
  setCariKartlar: (updater: CariKart[] | ((prev: CariKart[]) => CariKart[])) => void
): CariKart => {
  const existing = findCariByUnvan(BIRBESAN_CARI_UNVAN, cariKartlar);
  if (existing) return existing;
  const created: CariKart = {
    id: `c_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CARI-${Math.floor(100 + Math.random() * 900)}`,
    unvan: BIRBESAN_CARI_UNVAN,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: '',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Excel cari hesap aktarımı ile oluşturuldu.',
  };
  setCariKartlar((prev) => [...prev, created]);
  void saveDocument('cariKartlar', created);
  return created;
};
