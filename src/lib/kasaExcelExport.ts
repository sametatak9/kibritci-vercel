import type { Worksheet, Workbook } from 'exceljs';
import type { KasaHareketi, KasaOdemeDurumu, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { resolvePersonelUnvan } from './personelUnvanUtils';
import { resolveKasaOdemeDurumu, isSoforKaynakliKasaHareketi } from './yolHarcamaUtils';

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

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isOpenablePhotoUrl(url: string): boolean {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u);
}

/** Excel hücresine tıklanınca orijinal fiş fotoğrafını tarayıcıda açan link */
function setOriginalPhotoHyperlink(
  cell: { value: unknown; font?: unknown; alignment?: unknown },
  url: string | undefined | null
): void {
  const raw = String(url || '').trim();
  if (isOpenablePhotoUrl(raw)) {
    cell.value = {
      text: 'Orijinali aç →',
      hyperlink: raw,
      tooltip: 'Orijinal fiş / fatura fotoğrafını tarayıcıda tam boyutta açar',
    };
    cell.font = {
      color: { argb: 'FF1D4ED8' },
      underline: true,
      bold: true,
      size: 9,
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    return;
  }
  if (raw.startsWith('data:image/')) {
    cell.value = 'Gömülü (Excel)';
    cell.font = { italic: true, size: 8, color: { argb: 'FF64748B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    return;
  }
  cell.value = 'Yok';
  cell.font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

/** Excel'e gömmek için görseli JPEG base64'e çevirir */
async function loadImageAsJpegBase64(url: string, maxW = 640): Promise<string | null> {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const fromCanvas = (src: string): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
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
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          resolve(dataUrl.replace(/^data:image\/jpeg;base64,/i, '') || null);
        } catch {
          resolve(null);
        }
      };
      img.onload = finish;
      img.onerror = () => resolve(null);
      img.src = src;
    });

  try {
    if (raw.startsWith('data:image/')) {
      if (/^data:image\/jpeg/i.test(raw) || /^data:image\/jpg/i.test(raw)) {
        return raw.replace(/^data:image\/[^;]+;base64,/i, '');
      }
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
    { width: 42 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
  ];
  row = await applyKasaAntet(workbook, kalem, {
    title: 'HAFTALIK KASA — KALEM KALEM HARCAMA DÖKÜMÜ',
    subtitle: `Dönem: ${startDate} — ${endDate} · Kim yaptıysa ayrı satır · «Orijinali aç» ile tam boyut fotoğraf`,
    colCount: 8,
  });

  const kalemHeaders = [
    'TARİH',
    'PERSONEL / ŞOFÖR',
    'ÖDEME DURUMU',
    'FİŞ NO',
    'AÇIKLAMA',
    'TUTAR',
    'FİŞ GÖRSELİ',
    'ORİJİNAL FOTO',
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

  for (const b of buckets) {
    // Grup başlığı
    kalem.mergeCells(row, 1, row, 8);
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
      const odeme = resolveKasaOdemeDurumu(kh);
      const r = kalem.getRow(row);
      r.height = kh.fisEvrakUrl ? 72 : 18;
      const vals: (string | number)[] = [
        kh.tarih,
        b.label,
        kh.hareketTipi === 'ÇIKIŞ' ? odemeLabel(odeme) || 'KASA ÖDEDİ' : '—',
        kh.fisNo || '—',
        kh.aciklama || '—',
        Number(kh.tutar) || 0,
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
      });

      const fotoUrl = String(kh.fisEvrakUrl || '').trim();
      if (fotoUrl) {
        const b64 = await loadImageAsJpegBase64(fotoUrl, 280);
        if (b64) {
          const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
          kalem.addImage(imageId, {
            tl: { col: 6, row: row - 1 },
            ext: { width: 110, height: 64 },
            editAs: 'oneCell',
          });
          r.getCell(7).value = '';
        } else {
          r.getCell(7).value = 'Önizleme yok';
          r.getCell(7).font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
        }
        setOriginalPhotoHyperlink(r.getCell(8), fotoUrl);
        r.getCell(8).border = thinBorder();
      } else {
        r.getCell(7).value = 'Yok';
        r.getCell(7).font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
        r.getCell(8).value = '—';
        r.getCell(8).border = thinBorder();
      }
      row += 1;
    }
    row += 1;
  }

  // Girişler (varsa)
  if (girisler.length > 0) {
    kalem.mergeCells(row, 1, row, 8);
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

  // ─── Sayfa 3: Fiş Fotoğrafları (büyük + orijinal link) ───
  const withFoto = cikislar.filter((k) => String(k.fisEvrakUrl || '').trim());
  const fotoSheet = workbook.addWorksheet('Fiş Fotoğrafları', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  fotoSheet.columns = [
    { width: 14 },
    { width: 26 },
    { width: 14 },
    { width: 36 },
    { width: 36 },
    { width: 18 },
  ];
  row = await applyKasaAntet(workbook, fotoSheet, {
    title: 'HAFTALIK KASA — FİŞ / FATURA GÖRSELLERİ',
    subtitle: `Dönem: ${startDate} — ${endDate} · ${withFoto.length} görsel · «Orijinali aç» ile tam boyut`,
    colCount: 6,
  });

  const fh = fotoSheet.getRow(row);
  ['TARİH', 'PERSONEL', 'TUTAR', 'AÇIKLAMA', 'FİŞ FOTOĞRAFI', 'ORİJİNAL FOTO'].forEach((h, i) => {
    const cell = fh.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  row += 1;

  if (withFoto.length === 0) {
    fotoSheet.mergeCells(row, 1, row, 6);
    fotoSheet.getCell(row, 1).value = 'Bu aralıkta fiş görseli olan çıkış kaydı yok.';
    fotoSheet.getCell(row, 1).font = { italic: true, color: { argb: 'FF94A3B8' } };
  } else {
    for (const kh of withFoto.sort((a, c) => String(a.tarih).localeCompare(String(c.tarih)))) {
      const unvan = resolvePersonelUnvan(
        {
          personelId: kh.personelId,
          personelAdi: kh.personelAdi,
          surucu: kh.surucu,
        },
        personeller
      );
      const r = fotoSheet.getRow(row);
      r.height = 160;
      [
        kh.tarih,
        unvan.label,
        Number(kh.tutar) || 0,
        kh.aciklama || '—',
        '',
        '',
      ].forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.border = thinBorder();
        cell.alignment = { vertical: 'top', wrapText: true };
        if (i === 2) {
          cell.numFmt = '#,##0.00 "₺"';
          cell.font = { bold: true, color: { argb: 'FFB91C1C' } };
        }
      });

      const fotoUrl = String(kh.fisEvrakUrl || '').trim();
      // Önizleme gömülü; orijinal tam boyut için yan sütundaki link
      const b64 = await loadImageAsJpegBase64(fotoUrl, 960);
      if (b64) {
        const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
        fotoSheet.addImage(imageId, {
          tl: { col: 4, row: row - 1 },
          ext: { width: 240, height: 148 },
          editAs: 'oneCell',
        });
      } else {
        r.getCell(5).value = 'Görsel yüklenemedi';
        r.getCell(5).font = { italic: true, color: { argb: 'FF94A3B8' }, size: 8 };
      }
      setOriginalPhotoHyperlink(r.getCell(6), fotoUrl);
      r.getCell(6).border = thinBorder();
      row += 1;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Haftalik_Kasa_${startDate}_${endDate}.xlsx`
  );
}
