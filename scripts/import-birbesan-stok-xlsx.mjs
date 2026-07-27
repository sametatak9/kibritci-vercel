#!/usr/bin/env node
/**
 * BİRBESAN (veya belirtilen tedarikçi) Excel cari hesap dosyalarından stok kartı + arşiv fatura aktarımı.
 *
 * Excel dosyalarını data/birbesan/ klasörüne koyun veya --dir ile yol verin.
 *
 *   node scripts/import-birbesan-stok-xlsx.mjs --dir data/birbesan --inspect
 *   node scripts/import-birbesan-stok-xlsx.mjs --dir data/birbesan --dry-run
 *   node scripts/import-birbesan-stok-xlsx.mjs --dir data/birbesan --execute
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, setDoc, writeBatch } from 'firebase/firestore';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return '';
  return args[i + 1] || '';
};
const hasArg = (name) => args.includes(name);

const inputDirRaw = getArg('--dir') || 'data/birbesan';
const execute = hasArg('--execute');
const dryRun = hasArg('--dry-run') || hasArg('--inspect') || !execute;
const inspectOnly = hasArg('--inspect');
const cariUnvan = getArg('--cari') || 'BİRBESAN';

const inputDir = resolve(inputDirRaw);
if (!existsSync(inputDir)) {
  console.error(`Klasör bulunamadı: ${inputDir}`);
  console.error('Excel dosyalarını bu klasöre koyun veya --dir ile tam yolu verin.');
  process.exit(1);
}

const configPath = resolve('firebase-target.config.json');
if (!inspectOnly && !existsSync(configPath)) {
  console.error(`firebase-target.config.json bulunamadı: ${configPath}`);
  process.exit(1);
}

const normalizeText = (raw) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim();

const toIsoDate = (raw) => {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (raw instanceof Date && !Number.isNaN(raw.valueOf())) return raw.toISOString().slice(0, 10);
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const n = Number(text);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(n));
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

const parseNumber = (raw) => {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const n = Number(String(raw).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const getCellText = (ws, row, col) => {
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
      return value.richText.map((x) => String(x?.text || '')).join('').trim();
    }
  }
  try {
    return String(cell.text || '').trim();
  } catch {
    return '';
  }
};

const HEADER_HINTS = {
  tarih: ['tarih', 'fatura tarihi', 'islem tarihi', 'evrak tarihi'],
  belgeNo: ['belge no', 'fatura no', 'evrak no', 'irsaliye no', 'siparis no'],
  urunAdi: ['stok adi', 'stok adı', 'malzeme', 'urun', 'ürün', 'aciklama', 'açıklama', 'cinsi', 'stok'],
  birim: ['birim', 'olcu', 'ölçü', 'br'],
  miktar: ['miktar', 'adet', 'tonaj'],
  birimFiyat: ['birim fiyat', 'birimfiyat', 'bf', 'fiyat'],
  toplam: ['tutar', 'toplam', 'net tutar'],
};

const scoreHeaderCell = (cellText, hints) => {
  const norm = normalizeText(cellText);
  if (!norm) return 0;
  let best = 0;
  for (const hint of hints) {
    if (norm === hint) best = Math.max(best, 10);
    else if (norm.includes(hint)) best = Math.max(best, 7);
  }
  return best;
};

const detectHeaderRow = (ws) => {
  let best = null;
  const colCount = Math.min(ws.columnCount || 30, 30);
  for (let row = 1; row <= 25; row++) {
    const columns = {};
    for (let col = 1; col <= colCount; col++) {
      const text = getCellText(ws, row, col);
      for (const [key, hints] of Object.entries(HEADER_HINTS)) {
        if (scoreHeaderCell(text, hints) > 0) columns[key] = col;
      }
    }
    const mapped = Object.keys(columns).length;
    const score = mapped * 3 + (columns.urunAdi ? 5 : 0);
    if (mapped >= 2 && score > (best?.score || 0)) best = { headerRow: row, columns, score };
  }
  return best;
};

const parseWorksheet = (ws, sourceFile) => {
  const detected = detectHeaderRow(ws);
  if (!detected?.columns.urunAdi) return { lines: [], meta: detected };
  const { headerRow, columns } = detected;
  const lines = [];
  let emptyStreak = 0;
  for (let row = headerRow + 1; row <= headerRow + 800; row++) {
    const urunAdi = columns.urunAdi ? getCellText(ws, row, columns.urunAdi) : '';
    if (!urunAdi) {
      emptyStreak += 1;
      if (emptyStreak >= 8) break;
      continue;
    }
    emptyStreak = 0;
    if (normalizeText(urunAdi) === 'toplam') continue;
    const miktar = parseNumber(columns.miktar ? ws.getRow(row).getCell(columns.miktar).value : 0) || 1;
    let birimFiyat = parseNumber(columns.birimFiyat ? ws.getRow(row).getCell(columns.birimFiyat).value : 0);
    let toplam = parseNumber(columns.toplam ? ws.getRow(row).getCell(columns.toplam).value : 0);
    if (!birimFiyat && toplam && miktar) birimFiyat = toplam / miktar;
    if (!toplam && birimFiyat) toplam = birimFiyat * miktar;
    lines.push({
      sourceFile,
      rowNo: row,
      tarih: toIsoDate(columns.tarih ? ws.getRow(row).getCell(columns.tarih).value : ''),
      belgeNo: columns.belgeNo ? getCellText(ws, row, columns.belgeNo) : '',
      urunAdi: urunAdi.trim(),
      birim: (columns.birim ? getCellText(ws, row, columns.birim) : 'ADET').toUpperCase() || 'ADET',
      miktar,
      birimFiyat,
      toplam,
    });
  }
  return { lines, meta: detected };
};

const canonicalStokKey = (raw) =>
  normalizeText(raw)
    .replace(/\s*\.\s*/g, '.')
    .replace(/(\d)\s+mm\b/g, '$1mm')
    .replace(/\(\s*n\s*\)/g, '(n)')
    .replace(/\s+/g, ' ')
    .trim();

const mergeLinesByStokName = (lines) => {
  const bucket = new Map();
  for (const line of lines) {
    const key = canonicalStokKey(line.urunAdi);
    if (!key) continue;
    const prev = bucket.get(key);
    if (!prev) {
      bucket.set(key, { ...line, urunAdi: line.urunAdi.trim() });
      continue;
    }
    prev.miktar += line.miktar || 0;
    if (line.urunAdi.trim().length > prev.urunAdi.length) prev.urunAdi = line.urunAdi.trim();
    if (line.birim) prev.birim = line.birim;
  }
  return [...bucket.values()];
};

const findExistingTedarikciStok = (urunAdi, stoklar, cariId) => {
  const pool = stoklar.filter(
    (s) =>
      s.tedarikciCariId === cariId ||
      s.arsivde ||
      normalizeText(s.tedarikciUnvan || '').includes('birbesan')
  );
  return findExistingStok(urunAdi, pool);
};

const findCari = (unvan, cariler) => {
  const norm = normalizeText(unvan);
  return (
    cariler.find((c) => normalizeText(c.unvan) === norm) ||
    cariler.find((c) => normalizeText(c.unvan).includes(norm)) ||
    null
  );
};

const files = readdirSync(inputDir)
  .filter((f) => /\.xlsx?$/i.test(f))
  .map((f) => resolve(inputDir, f));

if (!files.length) {
  console.error(`Klasörde xlsx bulunamadı: ${inputDir}`);
  process.exit(1);
}

console.log(`Mod: ${inspectOnly ? 'INSPECT' : dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
console.log(`Klasör: ${inputDir}`);
console.log(`Cari: ${cariUnvan}`);
console.log(`Dosya: ${files.length}`);

const allLines = [];
for (const filePath of files) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  wb.worksheets.forEach((ws, idx) => {
    const label = wb.worksheets.length > 1 ? `${basename(filePath)}#${idx + 1}` : basename(filePath);
    const { lines, meta } = parseWorksheet(ws, label);
    if (inspectOnly) {
      console.log(`\n--- ${label} ---`);
      console.log('Başlık satırı:', meta?.headerRow || '?', 'Sütunlar:', meta?.columns || {});
      console.log('Örnek satır:', lines[0] || '(yok)');
    }
    allLines.push(...lines);
  });
}

console.log(`\nToplam kalem satırı: ${allLines.length}`);
const unique = new Set(allLines.map((l) => normalizeText(l.urunAdi)));
console.log(`Benzersiz stok adı: ${unique.size}`);

if (inspectOnly || dryRun) {
  allLines.slice(0, 8).forEach((l) => console.log(`  ${l.tarih} | ${l.urunAdi} | ${l.miktar} ${l.birim} | ₺${l.birimFiyat}`));
  if (dryRun && !inspectOnly) console.log('\nDRY-RUN tamamlandı; Firestore yazımı yapılmadı.');
  process.exit(0);
}

const firebaseCfg = JSON.parse(readFileSync(configPath, 'utf8'));
const app = initializeApp(
  {
    apiKey: firebaseCfg.apiKey,
    authDomain: firebaseCfg.authDomain,
    projectId: firebaseCfg.projectId,
    storageBucket: firebaseCfg.storageBucket,
    messagingSenderId: firebaseCfg.messagingSenderId,
    appId: firebaseCfg.appId,
  },
  `BIRBESAN_XLSX_${Date.now()}`
);
const db = getFirestore(app);

const [stokSnap, cariSnap] = await Promise.all([
  getDocs(collection(db, 'stokKartlar')),
  getDocs(collection(db, 'cariKartlar')),
]);
const stoklar = stokSnap.docs.map((d) => d.data());
let cari = findCari(cariUnvan, cariSnap.docs.map((d) => d.data()));
if (!cari) {
  cari = {
    id: `c_${Date.now()}`,
    kartTipi: 'TEDARIKCI',
    kod: `CARI-${Math.floor(100 + Math.random() * 900)}`,
    unvan: cariUnvan,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: '',
    iban: '',
    durum: 'AKTIF',
    notlar: 'BİRBESAN Excel aktarımı ile oluşturuldu.',
  };
  await setDoc(doc(db, 'cariKartlar', cari.id), cari);
  console.log('Cari kart oluşturuldu:', cari.id);
}

const importTag = `[BirbesanXLSX:${cari.unvan}]`;
const mergedLines = mergeLinesByStokName(allLines);
console.log(`Birleştirilmiş benzersiz stok: ${mergedLines.length} (ham satır: ${allLines.length})`);

let createdStok = 0;
let updatedStok = 0;
const stokIdByNorm = new Map();
const mutableStoklar = [...stoklar];

for (const line of mergedLines) {
  const norm = canonicalStokKey(line.urunAdi);
  let stok = findExistingTedarikciStok(line.urunAdi, mutableStoklar, cari.id);
  if (!stok) {
    stok = {
      id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      stokKodu: `STK-${Math.floor(1000 + Math.random() * 9000)}`,
      stokAdi: line.urunAdi,
      kategori: 'BİRBESAN Arşiv',
      birim: line.birim,
      miktar: line.miktar,
      kritikSeviye: 0,
      durum: 'AKTIF',
      aciklama: `${importTag} Toplam miktar: ${line.miktar} ${line.birim}.`,
      sonBirimFiyat: line.birimFiyat || undefined,
      sonFiyatTarihi: line.tarih,
      tedarikciCariId: cari.id,
      tedarikciUnvan: cari.unvan,
      arsivde: true,
      stokKaynak: 'BIRBESAN_EXCEL',
    };
    mutableStoklar.push(stok);
    await setDoc(doc(db, 'stokKartlar', stok.id), stok);
    createdStok += 1;
  } else {
    const next = {
      ...stok,
      stokAdi: line.urunAdi.length >= stok.stokAdi.length ? line.urunAdi : stok.stokAdi,
      birim: line.birim || stok.birim,
      miktar: line.miktar,
      sonBirimFiyat: line.birimFiyat || stok.sonBirimFiyat,
      sonFiyatTarihi: line.tarih,
      tedarikciCariId: cari.id,
      tedarikciUnvan: cari.unvan,
      arsivde: true,
      stokKaynak: 'BIRBESAN_EXCEL',
      kategori: 'BİRBESAN Arşiv',
      aciklama: `${importTag} Güncel toplam: ${line.miktar} ${line.birim}.`,
    };
    await setDoc(doc(db, 'stokKartlar', stok.id), next);
    updatedStok += 1;
    stok = next;
  }
  stokIdByNorm.set(norm, stok.id);
}

const groups = new Map();
for (const line of allLines) {
  const key = `${line.tarih}::${line.belgeNo || `${line.sourceFile}-${line.rowNo}`}`;
  const bucket = groups.get(key) || [];
  bucket.push(line);
  groups.set(key, bucket);
}

let createdFatura = 0;
for (const [, groupLines] of groups.entries()) {
  const tarih = groupLines[0].tarih;
  const belgeNo = groupLines[0].belgeNo || `EXC-${tarih.replace(/-/g, '')}`;
  const faturaId = `fat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const kalemler = groupLines.map((line, idx) => ({
    id: `fi_${faturaId}_${idx}`,
    urunAdi: line.urunAdi,
    miktar: line.miktar,
    birim: line.birim,
    birimFiyat: line.birimFiyat,
    kdvOran: 20,
    toplam: line.toplam || line.birimFiyat * line.miktar,
    stokKartId: stokIdByNorm.get(normalizeText(line.urunAdi)),
  }));
  const toplamTutar = kalemler.reduce((s, k) => s + (k.toplam || 0), 0);
  const kdvTutar = Math.round(toplamTutar * 0.2 * 100) / 100;
  const fatura = {
    id: faturaId,
    faturaNo: belgeNo,
    tarih,
    cariKartId: cari.id,
    cariUnvan: cari.unvan,
    toplamTutar,
    kdvTutar,
    genelToplam: toplamTutar + kdvTutar,
    durum: 'ONAYLANDI',
    rapor: importTag,
    kalemler,
    bagliIrsaliyeler: [],
    eImzalar: [],
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'faturalar', faturaId), fatura);
  batch.set(doc(db, 'cariIslemGecmisi', `cari_islem_${faturaId}`), {
    id: `cari_islem_${faturaId}`,
    cariKartId: cari.id,
    islemTipi: 'FATURA',
    islemId: faturaId,
    islemBaslik: `Fatura ${belgeNo}`,
    islemDetay: `${kalemler.length} kalem ${importTag}`,
    tutar: fatura.genelToplam,
    tarih,
    belgeNo,
  });
  for (const line of groupLines) {
    const stokId = stokIdByNorm.get(normalizeText(line.urunAdi));
    if (!stokId) continue;
    const sid = `stk_islem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, 'stokIslemGecmisi', sid), {
      id: sid,
      stokKartId: stokId,
      islemTipi: 'GIRIS',
      islemId: faturaId,
      islemBaslik: `Excel fatura ${belgeNo}`,
      islemDetay: `${line.urunAdi} · ${line.miktar} ${line.birim}`,
      miktarDegisimi: line.miktar,
      tarih,
      belgeNo,
    });
  }
  await batch.commit();
  createdFatura += 1;
}

console.log('--- IMPORT ÖZET ---');
console.log(`Oluşturulan stok: ${createdStok}`);
console.log(`Güncellenen stok: ${updatedStok}`);
console.log(`Arşiv fatura: ${createdFatura}`);
console.log(`Cari: ${cari.unvan} (${cari.id})`);
