import type { Worksheet, Workbook } from 'exceljs';
import type { KasaHareketi, KasaOdemeDurumu, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { resolvePersonelUnvan } from './personelUnvanUtils';
import { resolveKasaOdemeDurumu, isSoforKaynakliKasaHareketi } from './yolHarcamaUtils';
import { ensureKasaFisFotoPersisted } from './sahaFaaliyetFotoStorage';

function odemeLabel(d: KasaOdemeDurumu | null): string {
  if (d === 'BORC') return 'BORÇ';
  if (d === 'PERSONEL_ODEDI') return 'PERSONEL ÖDEDİ';
  if (d === 'KASA_ODEDI') return 'KASA ÖDEDİ';
  return '';
}

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

/** Fiş hangi kasa kaydına ait — raporda net görünsün */
function buildFisKayitEtiketi(
  kh: KasaHareketi,
  unvanLabel: string,
  sira: number
): string {
  const fisNo = kh.fisNo ? `Fiş No: ${kh.fisNo}` : 'Fiş No: —';
  const tutar = `${(Number(kh.tutar) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
  const aciklama = String(kh.aciklama || '').trim() || '—';
  return `#${sira} · ${kh.tarih} · ${unvanLabel} · ${fisNo} · ${tutar} · ${aciklama}`;
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

  // ─── Sayfa 1: Kişi Özeti ───
  const ozet = workbook.addWorksheet('Kişi Özeti', {
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
  let row = await applyKasaAntet(workbook, ozet, {
    title: 'HAFTALIK KASA — KİŞİ BAZLI MASRAF ÖZETİ',
    subtitle: `Dönem: ${startDate} — ${endDate} · Baskı: ${new Date().toLocaleString('tr-TR')}`,
    colCount: 7,
  });

  ozet.mergeCells(row, 1, row, 7);
  ozet.getCell(row, 1).value =
    'Kim ne kadar masraf yapmış — çıkışlar personele / şoföre göre gruplanır';
  ozet.getCell(row, 1).font = { size: 9, italic: true, color: { argb: 'FF475569' } };
  row += 2;

  // Şoför / Kasa kaynak özeti
  let soforSum = 0;
  let kasaDigerSum = 0;
  let soforN = 0;
  let kasaN = 0;
  for (const kh of cikislar) {
    const t = Number(kh.tutar) || 0;
    if (isSoforKaynakliKasaHareketi(kh)) {
      soforSum += t;
      soforN += 1;
    } else {
      kasaDigerSum += t;
      kasaN += 1;
    }
  }
  ozet.mergeCells(row, 1, row, 7);
  ozet.getCell(row, 1).value = 'KAYNAK ÖZETİ — Şoför / Kasa ayrı + toplam';
  ozet.getCell(row, 1).font = { bold: true, size: 10, color: { argb: 'FF1E4E78' } };
  row += 1;
  const kaynakRows: Array<[string, number, number]> = [
    ['ŞOFÖR HARCAMALARI', soforN, soforSum],
    ['KASA HARCAMALARI (diğer)', kasaN, kasaDigerSum],
    ['GENEL TOPLAM', soforN + kasaN, soforSum + kasaDigerSum],
  ];
  for (const [label, n, sum] of kaynakRows) {
    ozet.mergeCells(row, 1, row, 5);
    ozet.getCell(row, 1).value = `${label} · ${n} kalem`;
    ozet.getCell(row, 1).font = { bold: true, size: 10 };
    ozet.getCell(row, 7).value = sum;
    ozet.getCell(row, 7).numFmt = '#,##0.00 "₺"';
    ozet.getCell(row, 7).font = { bold: true, color: { argb: 'FFB91C1C' } };
    row += 1;
  }
  row += 1;

  const ozetHeaders = ['#', 'PERSONEL / ŞOFÖR', 'KALEM', 'BORÇ', 'PERSONEL ÖDEDİ', 'KASA ÖDEDİ', 'TOPLAM'];
  const oh = ozet.getRow(row);
  ozetHeaders.forEach((h, i) => {
    const cell = oh.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });
  oh.height = 20;
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
    const vals: (string | number)[] = [idx + 1, b.label, b.kalemler.length, bBorc, bPers, bKasa, b.toplam];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
      if (i >= 3) {
        cell.numFmt = '#,##0.00 "₺"';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      if (i === 1) cell.font = { bold: true, size: 10 };
      if (i === 6) cell.font = { bold: true, color: { argb: 'FFB91C1C' } };
    });
    row += 1;
  });

  row += 1;
  const totalsBlock: Array<[string, number, string]> = [
    ['BORÇ TOPLAM', borc, 'FFB45309'],
    ['PERSONEL ÖDEDİ TOPLAM', personelOdedi, 'FF6D28D9'],
    ['KASA ÖDEDİ TOPLAM', kasaOdedi, 'FF1D4ED8'],
    ['TOPLAM ÇIKIŞ', totalOut, 'FFB91C1C'],
    ['TOPLAM GİRİŞ', totalIn, 'FF047857'],
    ['NET DURUM', totalIn - totalOut, 'FF1E4E78'],
  ];
  for (const [label, value, color] of totalsBlock) {
    ozet.mergeCells(row, 1, row, 5);
    ozet.getCell(row, 1).value = label;
    ozet.getCell(row, 1).font = { bold: true, size: 10, color: { argb: color } };
    ozet.getCell(row, 1).alignment = { horizontal: 'right', vertical: 'middle' };
    ozet.getCell(row, 7).value = value;
    ozet.getCell(row, 7).numFmt = '#,##0.00 "₺"';
    ozet.getCell(row, 7).font = { bold: true, size: 10, color: { argb: color } };
    row += 1;
  }

  // ─── Sayfa 2: Kalem Kalem (kişi gruplu) ───
  const kalem = workbook.addWorksheet('Kalem Kalem', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  kalem.columns = [
    { width: 14 },
    { width: 24 },
    { width: 16 },
    { width: 12 },
    { width: 32 },
    { width: 14 },
    { width: 38 },
    { width: 18 },
    { width: 16 },
  ];
  row = await applyKasaAntet(workbook, kalem, {
    title: 'HAFTALIK KASA — KALEM KALEM HARCAMA DÖKÜMÜ',
    subtitle: `Dönem: ${startDate} — ${endDate} · Fiş görselleri yüksek çözünürlük · «Fiş Fotograflari» sayfasında büyük boy`,
    colCount: 9,
  });

  const kalemHeaders = [
    'TARİH',
    'PERSONEL / ŞOFÖR',
    'ÖDEME DURUMU',
    'FİŞ NO',
    'AÇIKLAMA',
    'TUTAR',
    'FİŞ KAYDI (HANGİ HAREKET)',
    'FİŞ ÖNİZLEME',
    'BÜYÜK FOTO',
  ];
  const khRow = kalem.getRow(row);
  kalemHeaders.forEach((h, i) => {
    const cell = khRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });
  row += 1;

  const pendingOriginalLinks: Array<{
    hareketId: string;
    cell: { value: unknown; font?: unknown; alignment?: unknown; border?: unknown };
    rawUrl: string;
  }> = [];

  let kalemSira = 0;

  for (const b of buckets) {
    // Grup başlığı
    kalem.mergeCells(row, 1, row, 9);
    const groupCell = kalem.getCell(row, 1);
    groupCell.value = `${b.label}  ·  ${b.kalemler.length} kalem  ·  −${b.toplam.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
    })} ₺`;
    groupCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
    groupCell.alignment = { vertical: 'middle', horizontal: 'left' };
    kalem.getRow(row).height = 22;
    row += 1;

    const sorted = [...b.kalemler].sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)));
    for (const kh of sorted) {
      kalemSira += 1;
      const odeme = resolveKasaOdemeDurumu(kh);
      const kayitEtiketi = buildFisKayitEtiketi(kh, b.label, kalemSira);
      const r = kalem.getRow(row);
      r.height = kh.fisEvrakUrl ? 96 : 18;
      const vals: (string | number)[] = [
        kh.tarih,
        b.label,
        kh.hareketTipi === 'ÇIKIŞ' ? odemeLabel(odeme) || 'KASA ÖDEDİ' : '—',
        kh.fisNo || '—',
        kh.aciklama || '—',
        Number(kh.tutar) || 0,
        kayitEtiketi,
        '',
        '',
      ];
      vals.forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.border = thinBorder();
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (i === 5) {
          cell.numFmt = '#,##0.00 "₺"';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { bold: true, color: { argb: 'FFB91C1C' } };
        }
        if (i === 6) {
          cell.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });

      const fotoUrl = String(kh.fisEvrakUrl || '').trim();
      if (fotoUrl) {
        const b64 = await loadImageAsJpegBase64(fotoUrl, 640, 0.9);
        if (b64) {
          const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
          kalem.addImage(imageId, {
            tl: { col: 7, row: row - 1 },
            ext: { width: 150, height: 88 },
            editAs: 'oneCell',
          });
          r.getCell(8).value = '';
        } else {
          r.getCell(8).value = 'Önizleme yok';
          r.getCell(8).font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
        }
        r.getCell(9).value = '→ Büyük foto';
        r.getCell(9).border = thinBorder();
        pendingOriginalLinks.push({ hareketId: kh.id, cell: r.getCell(9), rawUrl: fotoUrl });
      } else {
        r.getCell(8).value = 'Yok';
        r.getCell(8).font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
        r.getCell(9).value = '—';
        r.getCell(9).border = thinBorder();
      }
      row += 1;
    }
    row += 1;
  }

  // Girişler (varsa)
  if (girisler.length > 0) {
    kalem.mergeCells(row, 1, row, 9);
    kalem.getCell(row, 1).value = 'GİRİŞLER';
    kalem.getCell(row, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    kalem.getCell(row, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF047857' },
    };
    row += 1;
    for (const kh of girisler.sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)))) {
      const r = kalem.getRow(row);
      [
        kh.tarih,
        kh.personelAdi || kh.surucu || '—',
        'GİRİŞ',
        kh.fisNo || '—',
        kh.aciklama || '—',
        Number(kh.tutar) || 0,
        '',
        '',
      ].forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.border = thinBorder();
        if (i === 5) {
          cell.numFmt = '#,##0.00 "₺"';
          cell.font = { bold: true, color: { argb: 'FF047857' } };
        }
      });
      row += 1;
    }
  }

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
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
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
          cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
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

  // Kalem Kalem «ORİJİNAL FOTO» linklerini şimdi yaz (https HYPERLINK veya sayfa içi)
  for (const pending of pendingOriginalLinks) {
    setOriginalPhotoHyperlink(pending.cell, {
      httpUrl: httpUrlById.get(pending.hareketId) || '',
      fotoSheetRow: fotoRowById.get(pending.hareketId),
    });
    pending.cell.border = thinBorder();
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer | Uint8Array, `Kibritci_Haftalik_Kasa_${startDate}_${endDate}.xlsx`);
}
