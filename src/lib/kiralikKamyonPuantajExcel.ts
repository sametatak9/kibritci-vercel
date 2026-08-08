import type { Worksheet, Workbook } from 'exceljs';
import type { AracBakim, KiralikKamyonPuantajKaydi, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { buildKiralikKamyonAyOzeti } from './kiralikKamyonPuantajReport';
import { isDayActiveForPersonel } from './yoklamaUtils';

const AY_ADLARI = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

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

function dayAbbr(year: number, month: number, day: number): string {
  return ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][
    new Date(year, month - 1, day).getDay()
  ];
}

function isSunday(year: number, month: number, day: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}

function parsePeriod(periodYm: string): { year: number; month: number; label: string; prefix: string } {
  const prefix = String(periodYm || '').slice(0, 7);
  const [ys, ms] = prefix.split('-');
  const year = Number(ys) || new Date().getFullYear();
  const month = Number(ms) || new Date().getMonth() + 1;
  return {
    year,
    month,
    prefix: `${year}-${String(month).padStart(2, '0')}`,
    label: `${AY_ADLARI[month - 1] || month} ${year}`,
  };
}

function soforOf(arac: AracBakim | undefined, personeller: Personel[], fallback?: string): string {
  if (fallback) return fallback;
  if (!arac?.sorumluPersonelId) return '—';
  const p = personeller.find((x) => x.id === arac.sorumluPersonelId);
  return p ? `${p.ad} ${p.soyad}`.trim() : '—';
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(4, opts.colCount);
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
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, metaStart, 2, colCount);
  ws.getCell(2, metaStart).value = opts.subtitle;
  ws.getCell(2, metaStart).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(2, metaStart).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, metaStart, 3, colCount);
  ws.getCell(3, metaStart).value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  ws.getCell(3, metaStart).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, metaStart).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  return 7;
}

function isKiralikKamyonArac(a?: AracBakim | null): boolean {
  if (!a) return false;
  if (a.kiralikKamyon === true) return true;
  return a.mulkiyet === 'KIRALIK';
}

/**
 * Kiralık kamyon aylık puantaj Excel — Kibritçi antetli.
 * Sayfalar: Özet · Matris (G/Y) · Mesai · Günlük Detay
 */
export async function exportKiralikKamyonPuantajExcel(
  kayitlar: KiralikKamyonPuantajKaydi[],
  araclar: AracBakim[],
  periodYm: string,
  personeller: Personel[] = []
): Promise<void> {
  const { year, month, label, prefix } = parsePeriod(periodYm);
  const gunSayisi = new Date(year, month, 0).getDate();
  const days = Array.from({ length: gunSayisi }, (_, i) => i + 1);
  const ozet = buildKiralikKamyonAyOzeti(kayitlar, araclar, prefix, personeller);

  // Özet zaten şoförü olan + ayda görünen araçlar
  const aracIds = new Set(ozet.map((o) => o.aracId));
  const kamyonlar = araclar
    .filter((a) => aracIds.has(a.id))
    .sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'));

  const kayitMap = new Map<string, KiralikKamyonPuantajKaydi>();
  for (const k of kayitlar) {
    if (!String(k.tarih || '').startsWith(prefix)) continue;
    kayitMap.set(`${k.aracId}|${k.tarih}`, k);
  }

  const workbook = await createExcelWorkbook();
  workbook.creator = 'Kibritçi ERP';
  workbook.created = new Date();

  // ─── Özet ───
  const ozetWs = workbook.addWorksheet('Ozet', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  ozetWs.columns = [
    { width: 6 },
    { width: 14 },
    { width: 22 },
    { width: 22 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
  ];
  let row = await applyAntet(workbook, ozetWs, {
    title: 'KİRALIK KAMYON AYLIK PUANTAJ — ÖZET',
    subtitle: `Dönem: ${label} · Belge: KBR-KKP-XLS-${year}${String(month).padStart(2, '0')}`,
    colCount: 8,
  });

  const ozetHeaders = [
    '#',
    'PLAKA',
    'MARKA / MODEL',
    'ŞOFÖR',
    'GELDİ',
    'YOK',
    'GİRİLMEDİ',
    'TOP. MESAİ',
  ];
  const oh = ozetWs.getRow(row);
  ozetHeaders.forEach((h, i) => {
    const c = oh.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    c.border = thinBorder();
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  row += 1;

  let sumGeldi = 0;
  let sumYok = 0;
  let sumMesai = 0;

  ozet.forEach((r, idx) => {
    const arac = araclar.find((a) => a.id === r.aracId);
    const sofor = soforOf(arac, personeller, r.soforler[0]);
    const excelRow = ozetWs.getRow(row);
    const vals: (string | number)[] = [
      idx + 1,
      r.plaka,
      r.markaModel,
      sofor,
      r.geldi,
      r.yok,
      r.girilmedi,
      r.toplamMesai,
    ];
    vals.forEach((v, i) => {
      const c = excelRow.getCell(i + 1);
      c.value = v;
      c.border = thinBorder();
      c.alignment = { vertical: 'middle', horizontal: i <= 3 ? 'left' : 'center' };
      if (i === 1) c.font = { bold: true, name: 'Consolas' };
      if (i === 4) c.font = { bold: true, color: { argb: 'FF047857' } };
      if (i === 5) c.font = { bold: true, color: { argb: 'FFBE123C' } };
      if (i === 7) {
        c.numFmt = '0.0" sa"';
        c.font = { bold: true, color: { argb: 'FF1D4ED8' } };
      }
    });
    sumGeldi += r.geldi;
    sumYok += r.yok;
    sumMesai += r.toplamMesai;
    row += 1;
  });

  row += 1;
  ozetWs.mergeCells(row, 1, row, 4);
  ozetWs.getCell(row, 1).value = 'TOPLAM';
  ozetWs.getCell(row, 1).font = { bold: true, size: 10 };
  ozetWs.getCell(row, 5).value = sumGeldi;
  ozetWs.getCell(row, 5).font = { bold: true, color: { argb: 'FF047857' } };
  ozetWs.getCell(row, 6).value = sumYok;
  ozetWs.getCell(row, 6).font = { bold: true, color: { argb: 'FFBE123C' } };
  ozetWs.getCell(row, 8).value = sumMesai;
  ozetWs.getCell(row, 8).numFmt = '0.0" sa"';
  ozetWs.getCell(row, 8).font = { bold: true, color: { argb: 'FF1D4ED8' } };

  // ─── Matris (durum G/Y/-) ───
  const matrisColCount = 2 + gunSayisi + 2;
  const matris = workbook.addWorksheet('Matris Durum', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
    },
  });
  matris.getColumn(1).width = 14;
  matris.getColumn(2).width = 18;
  for (let d = 1; d <= gunSayisi; d++) matris.getColumn(2 + d).width = 3.6;
  matris.getColumn(3 + gunSayisi).width = 8;
  matris.getColumn(4 + gunSayisi).width = 10;

  row = await applyAntet(workbook, matris, {
    title: 'KİRALIK KAMYON PUANTAJ MATRİSİ (G / Y / -)',
    subtitle: `${label} · G=Geldi · Y=Yok · -=Girilmedi`,
    colCount: matrisColCount,
  });

  // Day number header
  const hdr1 = matris.getRow(row);
  hdr1.getCell(1).value = 'PLAKA';
  hdr1.getCell(2).value = 'ŞOFÖR';
  days.forEach((d) => {
    const c = hdr1.getCell(2 + d);
    c.value = String(d).padStart(2, '0');
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    if (isSunday(year, month, d)) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
    }
  });
  hdr1.getCell(3 + gunSayisi).value = 'GELEN';
  hdr1.getCell(4 + gunSayisi).value = 'MESAİ';
  for (let i = 1; i <= matrisColCount; i++) {
    const c = hdr1.getCell(i);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
    if (!c.fill) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
    } else {
      c.font = { bold: true, size: 8, color: { argb: 'FF9A3412' } };
    }
    c.border = thinBorder();
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  // Fix sunday header fonts that got overwritten - re-apply teal for non-sunday
  for (let i = 1; i <= 2; i++) {
    hdr1.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
    hdr1.getCell(i).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
  }
  days.forEach((d) => {
    const c = hdr1.getCell(2 + d);
    if (isSunday(year, month, d)) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDBA74' } };
      c.font = { bold: true, size: 8, color: { argb: 'FF9A3412' } };
    } else {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
    }
  });
  hdr1.getCell(3 + gunSayisi).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF047857' },
  };
  hdr1.getCell(3 + gunSayisi).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
  hdr1.getCell(4 + gunSayisi).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  hdr1.getCell(4 + gunSayisi).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
  row += 1;

  // Weekday abbr row
  const hdr2 = matris.getRow(row);
  hdr2.getCell(1).value = '';
  hdr2.getCell(2).value = '';
  days.forEach((d) => {
    const c = hdr2.getCell(2 + d);
    c.value = dayAbbr(year, month, d);
    c.font = { size: 7, bold: true, color: { argb: 'FF64748B' } };
    c.alignment = { horizontal: 'center' };
    c.border = thinBorder();
    if (isSunday(year, month, d)) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
    }
  });
  row += 1;

  const orderedIds = [...aracIds].sort((a, b) => {
    const pa = araclar.find((x) => x.id === a)?.plaka || ozet.find((o) => o.aracId === a)?.plaka || a;
    const pb = araclar.find((x) => x.id === b)?.plaka || ozet.find((o) => o.aracId === b)?.plaka || b;
    return String(pa).localeCompare(String(pb), 'tr');
  });

  for (const aracId of orderedIds) {
    const arac = araclar.find((a) => a.id === aracId);
    const o = ozet.find((x) => x.aracId === aracId);
    const plaka = arac?.plaka || o?.plaka || aracId;
    const sofor = soforOf(arac, personeller, o?.soforler[0]);
    const excelRow = matris.getRow(row);
    excelRow.getCell(1).value = plaka;
    excelRow.getCell(1).font = { bold: true, name: 'Consolas', size: 9 };
    excelRow.getCell(2).value = sofor;
    excelRow.getCell(2).font = { size: 8 };

    let geldi = 0;
    let mesai = 0;
    const soforPersonel = personeller.find((p) => p.id === arac?.sorumluPersonelId);
    days.forEach((d) => {
      const tarih = `${prefix}-${String(d).padStart(2, '0')}`;
      const k = kayitMap.get(`${aracId}|${tarih}`);
      const c = excelRow.getCell(2 + d);
      c.border = thinBorder();
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.font = { bold: true, size: 9 };
      const dayOk = soforPersonel
        ? isDayActiveForPersonel(soforPersonel, year, month, d)
        : false;
      if (!dayOk) {
        c.value = '·';
        c.font = { size: 8, color: { argb: 'FFCBD5E1' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        return;
      }
      if (k?.durum === 'Geldi') {
        c.value = 'G';
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        c.font = { bold: true, size: 9, color: { argb: 'FF047857' } };
        geldi += 1;
        mesai += Number(k.mesaiSaati) || 0;
      } else if (k?.durum === 'Yok') {
        c.value = 'Y';
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
        c.font = { bold: true, size: 9, color: { argb: 'FFBE123C' } };
      } else {
        c.value = '-';
        c.font = { size: 8, color: { argb: 'FF94A3B8' } };
        if (isSunday(year, month, d)) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
        }
      }
    });

    excelRow.getCell(3 + gunSayisi).value = geldi;
    excelRow.getCell(3 + gunSayisi).font = { bold: true, color: { argb: 'FF047857' } };
    excelRow.getCell(3 + gunSayisi).alignment = { horizontal: 'center' };
    excelRow.getCell(3 + gunSayisi).border = thinBorder();
    excelRow.getCell(4 + gunSayisi).value = mesai;
    excelRow.getCell(4 + gunSayisi).numFmt = '0.0';
    excelRow.getCell(4 + gunSayisi).font = { bold: true, color: { argb: 'FF1D4ED8' } };
    excelRow.getCell(4 + gunSayisi).alignment = { horizontal: 'center' };
    excelRow.getCell(4 + gunSayisi).border = thinBorder();
    excelRow.getCell(1).border = thinBorder();
    excelRow.getCell(2).border = thinBorder();
    row += 1;
  }

  // ─── Mesai matrisi ───
  const mesaiWs = workbook.addWorksheet('Matris Mesai', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
    },
  });
  mesaiWs.getColumn(1).width = 14;
  mesaiWs.getColumn(2).width = 18;
  for (let d = 1; d <= gunSayisi; d++) mesaiWs.getColumn(2 + d).width = 4;
  mesaiWs.getColumn(3 + gunSayisi).width = 10;

  row = await applyAntet(workbook, mesaiWs, {
    title: 'KİRALIK KAMYON MESAİ MATRİSİ (saat)',
    subtitle: `${label} · Günlük mesai saatleri`,
    colCount: 3 + gunSayisi,
  });

  const mh = mesaiWs.getRow(row);
  mh.getCell(1).value = 'PLAKA';
  mh.getCell(2).value = 'ŞOFÖR';
  days.forEach((d) => {
    mh.getCell(2 + d).value = String(d).padStart(2, '0');
  });
  mh.getCell(3 + gunSayisi).value = 'TOPLAM';
  for (let i = 1; i <= 3 + gunSayisi; i++) {
    const c = mh.getCell(i);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    c.border = thinBorder();
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  row += 1;

  for (const aracId of orderedIds) {
    const arac = araclar.find((a) => a.id === aracId);
    const o = ozet.find((x) => x.aracId === aracId);
    const plaka = arac?.plaka || o?.plaka || aracId;
    const sofor = soforOf(arac, personeller, o?.soforler[0]);
    const excelRow = mesaiWs.getRow(row);
    excelRow.getCell(1).value = plaka;
    excelRow.getCell(1).font = { bold: true, name: 'Consolas', size: 9 };
    excelRow.getCell(1).border = thinBorder();
    excelRow.getCell(2).value = sofor;
    excelRow.getCell(2).border = thinBorder();
    excelRow.getCell(2).font = { size: 8 };

    let total = 0;
    const soforPersonel = personeller.find((p) => p.id === arac?.sorumluPersonelId);
    days.forEach((d) => {
      const tarih = `${prefix}-${String(d).padStart(2, '0')}`;
      const dayOk = soforPersonel
        ? isDayActiveForPersonel(soforPersonel, year, month, d)
        : false;
      const c = excelRow.getCell(2 + d);
      c.border = thinBorder();
      c.alignment = { horizontal: 'center' };
      if (!dayOk) {
        c.value = '';
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        return;
      }
      const k = kayitMap.get(`${aracId}|${tarih}`);
      const hrs = k?.durum === 'Geldi' ? Number(k.mesaiSaati) || 0 : 0;
      total += hrs;
      c.value = hrs > 0 ? hrs : '';
      c.numFmt = '0.0';
      if (hrs > 0) {
        c.font = { bold: true, size: 8, color: { argb: 'FF1E3A8A' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      }
    });
    excelRow.getCell(3 + gunSayisi).value = total;
    excelRow.getCell(3 + gunSayisi).numFmt = '0.0" sa"';
    excelRow.getCell(3 + gunSayisi).font = { bold: true };
    excelRow.getCell(3 + gunSayisi).border = thinBorder();
    row += 1;
  }

  // ─── Günlük detay ───
  const detay = workbook.addWorksheet('Gunluk Detay', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  detay.columns = [
    { width: 12 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
    { width: 10 },
    { width: 10 },
    { width: 28 },
  ];
  row = await applyAntet(workbook, detay, {
    title: 'KİRALIK KAMYON GÜNLÜK DETAY',
    subtitle: `${label} · Geldi / Yok kayıtları`,
    colCount: 7,
  });

  const dh = detay.getRow(row);
  ['TARİH', 'PLAKA', 'MODEL', 'ŞOFÖR', 'DURUM', 'MESAİ', 'NOT'].forEach((h, i) => {
    const c = dh.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    c.border = thinBorder();
    c.alignment = { horizontal: 'center' };
  });
  row += 1;

  const detayList = [...kayitMap.values()]
    .filter((k) => {
      if (k.durum !== 'Geldi' && k.durum !== 'Yok') return false;
      const arac = araclar.find((a) => a.id === k.aracId);
      const soforPersonel = personeller.find((p) => p.id === arac?.sorumluPersonelId);
      if (!soforPersonel) return false;
      const day = Number(String(k.tarih).slice(8, 10));
      if (!day) return false;
      return isDayActiveForPersonel(soforPersonel, year, month, day);
    })
    .sort((a, b) => {
      const t = String(a.tarih).localeCompare(String(b.tarih));
      if (t !== 0) return t;
      return String(a.plaka).localeCompare(String(b.plaka), 'tr');
    });

  for (const k of detayList) {
    const arac = araclar.find((a) => a.id === k.aracId);
    const sofor = soforOf(arac, personeller, k.soforAdi);
    const excelRow = detay.getRow(row);
    const vals: (string | number)[] = [
      k.tarih,
      k.plaka,
      k.markaModel || arac?.markaModel || '—',
      sofor,
      k.durum,
      k.durum === 'Geldi' ? Number(k.mesaiSaati) || 0 : '',
      k.notlar || '',
    ];
    vals.forEach((v, i) => {
      const c = excelRow.getCell(i + 1);
      c.value = v;
      c.border = thinBorder();
      if (i === 1) c.font = { bold: true, name: 'Consolas', size: 9 };
      if (i === 4) {
        c.font = {
          bold: true,
          color: { argb: k.durum === 'Geldi' ? 'FF047857' : 'FFBE123C' },
        };
        c.alignment = { horizontal: 'center' };
      }
      if (i === 5 && typeof v === 'number') c.numFmt = '0.0" sa"';
    });
    row += 1;
  }

  if (detayList.length === 0) {
    detay.mergeCells(row, 1, row, 7);
    detay.getCell(row, 1).value = 'Bu dönem için geldi/yok kaydı yok.';
    detay.getCell(row, 1).font = { italic: true, color: { argb: 'FF94A3B8' } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Kiralik_Kamyon_Puantaj_${prefix}.xlsx`
  );
}
