/**
 * SADECE «Alacak Maaş Excel» butonu (Yoklama ekranı).
 * Formül: (Kart Maaş÷30) × Çalıştığı Gün(Geldi) + Mesai Hakediş.
 * Modern Excel / yoklama yevmiye / maaş kartı hesaplarına DOKUNMAZ.
 */
import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import type { Workbook, Worksheet } from 'exceljs';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { displayPersonelGorev } from './guvenlikHelpers';
import {
  CANONICAL_ANA_FIRMA_ADI,
  getYoklamaDay,
  isDayActiveForPersonel,
  isTaseronPersonel,
} from './yoklamaUtils';

function normalizeIbanLocal(value: string | undefined | null): string {
  return String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

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
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  };
}

function isAktif(p: Personel): boolean {
  return p.durum !== false && String(p.durum).toLowerCase() !== 'pasif';
}

function isIdari(p: Personel): boolean {
  return p.personelGrubu === 'IDARI' || String(p.departman || '').toLocaleUpperCase('tr-TR') === 'İDARİ';
}

function dayOfWeekAbbreviation(year: number, month: number, day: number): string {
  return ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][new Date(year, month - 1, day).getDay()];
}

function toStatusSymbol(durum: YoklamaDurum): string {
  if (durum === 'Geldi') return 'G';
  if (durum === 'Yok') return 'Y';
  if (durum === 'İzinli') return 'İ';
  if (durum === 'Raporlu') return 'R';
  if (durum === 'Pazar') return 'P';
  if (durum === 'Tatil') return 'T';
  return '-';
}

async function applyWorkbookAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; metaLine: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(4, opts.colCount);
  ws.getRow(1).height = 52;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 14;
  ws.mergeCells(1, 1, 3, 2);

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.05, row: 0.08 }, ext: { width: 150, height: 58 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF1E4E78' } };
  }

  ws.mergeCells(1, 3, 1, colCount);
  ws.getCell(1, 3).value = opts.title;
  ws.getCell(1, 3).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  ws.getCell(1, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, 3, 2, colCount);
  ws.getCell(2, 3).value = opts.subtitle;
  ws.getCell(2, 3).font = { size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(2, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, 3, 3, colCount);
  ws.getCell(3, 3).value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  ws.getCell(3, 3).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF99F6E4' },
  };
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value = opts.metaLine;
  ws.getCell(6, 1).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(6, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  ws.getRow(6).height = 22;

  return 8;
}

/** Günlük tarih cetveli: her personel için DURUM + MESAİ satırı */
function writeTarihCetveliSheet(
  ws: Worksheet,
  rows: MaasMesaiRow[],
  opts: {
    year: number;
    month: number;
    yoklamalar: AylikYoklamaMap;
    startRow: number;
  }
) {
  const { year, month, yoklamalar, startRow } = opts;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayIndexes = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const baseCols = 5;

  const dayHeaderRow = startRow;
  const dowHeaderRow = startRow + 1;
  ws.getCell(dayHeaderRow, 1).value = 'Sıra';
  ws.getCell(dayHeaderRow, 2).value = 'Ad Soyad';
  ws.getCell(dayHeaderRow, 3).value = 'TC';
  ws.getCell(dayHeaderRow, 4).value = 'Görev';
  ws.getCell(dayHeaderRow, 5).value = 'Satır';
  for (let c = 1; c <= baseCols; c++) {
    for (const rr of [dayHeaderRow, dowHeaderRow]) {
      const cell = ws.getCell(rr, c);
      cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }
  ws.mergeCells(dayHeaderRow, 1, dowHeaderRow, 1);
  ws.mergeCells(dayHeaderRow, 2, dowHeaderRow, 2);
  ws.mergeCells(dayHeaderRow, 3, dowHeaderRow, 3);
  ws.mergeCells(dayHeaderRow, 4, dowHeaderRow, 4);
  ws.mergeCells(dayHeaderRow, 5, dowHeaderRow, 5);

  dayIndexes.forEach((day, idx) => {
    const col = baseCols + idx + 1;
    const dayCell = ws.getCell(dayHeaderRow, col);
    dayCell.value = day;
    dayCell.font = { bold: true, size: 8, color: { argb: 'FF1E3A8A' } };
    dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dayCell.border = thinBorder();

    const dowCell = ws.getCell(dowHeaderRow, col);
    dowCell.value = dayOfWeekAbbreviation(year, month, day);
    dowCell.font = { bold: true, size: 7, color: { argb: 'FF4338CA' } };
    dowCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    dowCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dowCell.border = thinBorder();
    if (new Date(year, month - 1, day).getDay() === 0) {
      dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      dowCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
    }
  });

  const summaryLabels = ['G', 'Y', 'Mesai', 'Hak.Gün'];
  const summaryStart = baseCols + daysInMonth + 1;
  summaryLabels.forEach((label, i) => {
    const col = summaryStart + i;
    ws.mergeCells(dayHeaderRow, col, dowHeaderRow, col);
    const cell = ws.getCell(dayHeaderRow, col);
    cell.value = label;
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });

  ws.getRow(dayHeaderRow).height = 18;
  ws.getRow(dowHeaderRow).height = 16;

  let r = startRow + 2;
  rows.forEach((row, i) => {
    const p = row.personel;
    const map = yoklamalar[p.id] || {};
    const statusRow = r;
    const mesaiRow = r + 1;

    for (let c = 1; c <= 4; c++) {
      ws.mergeCells(statusRow, c, mesaiRow, c);
    }
    ws.getCell(statusRow, 1).value = i + 1;
    ws.getCell(statusRow, 2).value = `${p.ad} ${p.soyad}`.trim();
    ws.getCell(statusRow, 3).value = p.tcNo || '—';
    ws.getCell(statusRow, 4).value = displayPersonelGorev(p) || p.gorev || '—';
    for (let c = 1; c <= 4; c++) {
      const cell = ws.getCell(statusRow, c);
      cell.font = { size: 8 };
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 1 ? 'center' : 'left',
        wrapText: true,
      };
    }

    ws.getCell(statusRow, 5).value = 'DURUM';
    ws.getCell(mesaiRow, 5).value = 'MESAİ';
    for (const rr of [statusRow, mesaiRow]) {
      const tip = ws.getCell(rr, 5);
      tip.font = { bold: true, size: 7 };
      tip.alignment = { horizontal: 'center', vertical: 'middle' };
      tip.border = thinBorder();
      tip.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rr === statusRow ? 'FFECFDF5' : 'FFFFF7ED' },
      };
    }

    dayIndexes.forEach((day, idx) => {
      const col = baseCols + idx + 1;
      const active = isDayActiveForPersonel(p, year, month, day, map);
      const d =
        getYoklamaDay(map, year, month, day) ||
        ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
      const mesai = Number(d.mesaiSaati || 0);
      const statusCell = ws.getCell(statusRow, col);
      const mesaiCell = ws.getCell(mesaiRow, col);
      statusCell.border = thinBorder();
      mesaiCell.border = thinBorder();
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
      mesaiCell.alignment = { horizontal: 'center', vertical: 'middle' };
      statusCell.font = { bold: true, size: 8 };
      mesaiCell.font = { size: 7 };

      if (!active) {
        statusCell.value = '·';
        mesaiCell.value = '·';
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        mesaiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        return;
      }

      statusCell.value = toStatusSymbol(d.durum);
      if (d.durum === 'Geldi') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      } else if (d.durum === 'Yok') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else if (d.durum === 'İzinli' || d.durum === 'Raporlu') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      } else if (d.durum === 'Pazar' || d.durum === 'Tatil') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }

      if (mesai > 0) {
        mesaiCell.value = mesai;
        mesaiCell.numFmt = '0.0';
        mesaiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
      } else {
        mesaiCell.value = '';
      }
    });

    const ozet = [row.geldiGun, row.yokGun, row.mesaiSaat, row.hakedisGun];
    ozet.forEach((v, oi) => {
      const col = summaryStart + oi;
      ws.mergeCells(statusRow, col, mesaiRow, col);
      const cell = ws.getCell(statusRow, col);
      cell.value = v;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder();
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
      if (oi === 2) cell.numFmt = '0.0';
    });

    ws.getRow(statusRow).height = 15;
    ws.getRow(mesaiRow).height = 14;
    r += 2;
  });

  r += 1;
  const legendCols = baseCols + daysInMonth + summaryLabels.length;
  ws.mergeCells(r, 1, r, legendCols);
  ws.getCell(r, 1).value =
    'Lejant: G=Geldi · Y=Yok · İ=İzinli · R=Raporlu · P=Pazar · T=Tatil · -=Girilmedi · ·=işe giriş/çıkış dışı. Alt satır = fazla mesai saati.';
  ws.getCell(r, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 7;
  for (let d = 1; d <= daysInMonth; d++) {
    ws.getColumn(baseCols + d).width = 3.2;
  }
  for (let i = 0; i < summaryLabels.length; i++) {
    ws.getColumn(summaryStart + i).width = 7;
  }

  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 8,
  };
  ws.views = [{ state: 'frozen', xSplit: baseCols, ySplit: startRow + 1 }];
}

/** Bu rapor formülü: günlük ücret = kart maaşı / 30 */
function resolveGunlukUcret(p: Personel): number {
  const maas = Number(p.maas || 0);
  if (!Number.isFinite(maas) || maas <= 0) return 0;
  return maas / 30;
}

export type MaasMesaiRow = {
  personel: Personel;
  geldiGun: number;
  yokGun: number;
  hakedisGun: number;
  mesaiSaat: number;
  /** Maaş / 30 */
  gunlukUcret: number;
  aylikMaasKart: number;
  /** Günlük × min(çalıştığı gün, 30) */
  gunHakedis: number;
  /** Mesai saat × (günlük/7.5) × 1.5 */
  mesaiHakedis: number;
  /** Alacak maaş */
  toplam: number;
  /** Yevmiye hesabına giren gün (max 30) */
  calismaGunHesap: number;
};

export function buildAktifPersonelMaasMesaiRows(opts: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  year: number;
  month: number;
}): MaasMesaiRow[] {
  const { personeller, yoklamalar, year, month } = opts;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayIndexes = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const aktif = personeller
    .filter(isAktif)
    .filter((p) => !isIdari(p))
    .slice()
    .sort((a, b) =>
      `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' })
    );

  return aktif.map((p) => {
    const map = yoklamalar[p.id] || {};
    let geldiGun = 0;
    let yokGun = 0;
    let hakedisGun = 0;
    let mesaiSaat = 0;

    for (const day of dayIndexes) {
      if (!isDayActiveForPersonel(p, year, month, day, map)) continue;
      const d =
        getYoklamaDay(map, year, month, day) ||
        ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
      if (d.durum === 'Geldi') geldiGun++;
      if (d.durum === 'Yok') yokGun++;
      if (
        d.durum === 'Geldi' ||
        d.durum === 'İzinli' ||
        d.durum === 'Pazar' ||
        d.durum === 'Tatil'
      ) {
        hakedisGun++;
      }
      mesaiSaat += Number(d.mesaiSaati || 0);
    }

    const aylikMaasKart = Number(p.maas || 0) || 0;
    const gunlukUcret = resolveGunlukUcret(p);
    // Ay 31 gün olsa bile yevmiye en fazla 30 gün — 30.000 maaş → en fazla 30.000 gün ücreti
    const calismaGunHesap = Math.min(geldiGun, 30);
    const gunHakedis = gunlukUcret * calismaGunHesap;
    const mesaiHakedis = mesaiSaat * (gunlukUcret / 7.5) * 1.5;
    const toplam = gunHakedis + mesaiHakedis;

    return {
      personel: p,
      geldiGun,
      yokGun,
      hakedisGun,
      mesaiSaat: Number(mesaiSaat.toFixed(2)),
      gunlukUcret: Number(gunlukUcret.toFixed(2)),
      aylikMaasKart,
      gunHakedis: Number(gunHakedis.toFixed(2)),
      mesaiHakedis: Number(mesaiHakedis.toFixed(2)),
      toplam: Number(toplam.toFixed(2)),
      /** Hesaba giren gün (max 30) */
      calismaGunHesap,
    };
  });
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

export async function exportAktifPersonelMaasMesaiExcel(opts: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  year: number;
  month: number;
  scopeLabel?: string;
}): Promise<number> {
  const { personeller, yoklamalar, year, month } = opts;
  const rows = buildAktifPersonelMaasMesaiRows({ personeller, yoklamalar, year, month });
  if (rows.length === 0) {
    throw new Error('Aktif personel bulunamadı (idari hariç).');
  }

  const monthLabel = `${AY_ADLARI[month - 1] || month} ${year}`;
  const scopeLabel = opts.scopeLabel || CANONICAL_ANA_FIRMA_ADI;
  const wb = await createExcelWorkbook();
  const metaLine =
    `Dönem: ${monthLabel} · Basım: ${new Date().toLocaleString('tr-TR')} · ` +
    `Aktif (idari hariç): ${rows.length} kişi · Formül: (Maaş/30)×min(Geldi,30) + Mesai = Alacak`;

  // ── Sayfa 1: Özet maaş / mesai ──
  const ws = wb.addWorksheet('Alacak Maas');
  const headers = [
    'Sıra',
    'Ad Soyad',
    'TC',
    'IBAN',
    'Görev',
    'Firma',
    'Kart Maaş',
    'Günlük Ücret (Maaş/30)',
    'Çalıştığı Gün',
    'Hesap Günü (max 30)',
    'Mesai Saat',
    'Gün Ücreti Hakediş',
    'Mesai Hakediş',
    'Alacak Maaş',
  ];
  const colCount = headers.length;

  const headRow = await applyWorkbookAntet(wb, ws, {
    title: 'ALACAK MAAŞ RAPORU — Maaş/30 · Max 30 Yevmiye',
    subtitle: `${scopeLabel} · ${monthLabel}`,
    metaLine,
    colCount,
  });

  headers.forEach((h, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  ws.getRow(headRow).height = 32;

  let r = headRow + 1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = row.personel;
    const iban = normalizeIbanLocal(p.ibanNo || (p as { iban?: string }).iban || '');
    const firma = isTaseronPersonel(p)
      ? p.firmaAdi || 'Taşeron'
      : p.firmaAdi || CANONICAL_ANA_FIRMA_ADI;
    const values: (string | number)[] = [
      i + 1,
      `${p.ad} ${p.soyad}`.trim(),
      p.tcNo || '—',
      iban && iban !== 'TR' ? iban : '—',
      displayPersonelGorev(p) || p.gorev || '—',
      firma,
      row.aylikMaasKart,
      row.gunlukUcret,
      row.geldiGun,
      row.calismaGunHesap,
      row.mesaiSaat,
      row.gunHakedis,
      row.mesaiHakedis,
      row.toplam,
    ];
    values.forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = v;
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 0 || c >= 6 ? 'center' : 'left',
        wrapText: true,
      };
      cell.font = { size: 9 };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
    for (const moneyCol of [7, 8, 12, 13, 14]) {
      ws.getCell(r, moneyCol).numFmt = '#,##0.00';
    }
    ws.getCell(r, 14).font = { bold: true, size: 9, color: { argb: 'FF065F46' } };
    r++;
  }

  const sumGeldi = rows.reduce((s, x) => s + x.geldiGun, 0);
  const sumHesapGun = rows.reduce((s, x) => s + x.calismaGunHesap, 0);
  const sumMesai = rows.reduce((s, x) => s + x.mesaiSaat, 0);
  const sumGunHak = rows.reduce((s, x) => s + x.gunHakedis, 0);
  const sumMesaiHak = rows.reduce((s, x) => s + x.mesaiHakedis, 0);
  const sumToplam = rows.reduce((s, x) => s + x.toplam, 0);
  const totalValues: (string | number)[] = [
    '',
    'TOPLAM',
    '',
    '',
    '',
    '',
    '',
    '',
    sumGeldi,
    sumHesapGun,
    Number(sumMesai.toFixed(2)),
    Number(sumGunHak.toFixed(2)),
    Number(sumMesaiHak.toFixed(2)),
    Number(sumToplam.toFixed(2)),
  ];
  totalValues.forEach((v, c) => {
    const cell = ws.getCell(r, c + 1);
    cell.value = v;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
    cell.border = thinBorder();
  });
  for (const moneyCol of [12, 13, 14]) {
    ws.getCell(r, moneyCol).numFmt = '#,##0.00';
  }
  r += 2;

  ws.mergeCells(r, 1, r, colCount);
  ws.getCell(r, 1).value =
    'Formül: Günlük = Kart Maaş ÷ 30 · Hesap Günü = min(Çalıştığı Gün, 30) · Gün Ücreti Hakediş = Günlük × Hesap Günü · Mesai Hakediş = Mesai Saat × (Günlük÷7,5) × 1,5 · Alacak = Gün Ücreti + Mesai. Ay 31 gün olsa bile yevmiye en fazla 30 gündür (ör. 30.000 maaş → en fazla 30.000 gün ücreti). İdari dahil değil.';
  ws.getCell(r, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  const widths = [5, 20, 13, 26, 16, 14, 11, 14, 10, 12, 10, 13, 12, 12];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  // ── Sayfa 2: Tarih cetveli (geldi/gelmedi + mesai) ──
  const cetvelWs = wb.addWorksheet('Tarih Cetveli');
  const daysInMonth = new Date(year, month, 0).getDate();
  const cetvelCols = 5 + daysInMonth + 4;
  const cetvelStart = await applyWorkbookAntet(wb, cetvelWs, {
    title: 'TARİH CETVELİ — GELDİ / GELMEDİ / MESAİ',
    subtitle: `${scopeLabel} · ${monthLabel}`,
    metaLine:
      metaLine +
      ' · Her personelde üst satır = durum (G/Y/İ/R/P/T), alt satır = mesai saati',
    colCount: Math.min(cetvelCols, 20),
  });
  writeTarihCetveliSheet(cetvelWs, rows, {
    year,
    month,
    yoklamalar,
    startRow: cetvelStart,
  });

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `Kibritci_Alacak_Maas_${year}-${String(month).padStart(2, '0')}.xlsx`;
  downloadBuffer(buffer as ArrayBuffer, fileName);
  return rows.length;
}

/** YYYY-MM seçimi — varsayılan içinde bulunulan ay */
export function promptMaasMesaiDonemi(defaultYm?: string): { year: number; month: number } | null {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const raw = window.prompt(
    'Maaş / mesai dönemi (YYYY-AA):\nÖrn: 2026-08',
    defaultYm || fallback
  );
  if (raw == null) return null;
  const m = String(raw).trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) {
    alert('Geçersiz dönem. Örnek: 2026-08');
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    alert('Ay 1–12 arasında olmalı.');
    return null;
  }
  return { year, month };
}
