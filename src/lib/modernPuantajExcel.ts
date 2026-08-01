import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { loadKibritciLogoDataUrl } from './kibritciBrand';
import {
  getBoundaryDayInMonth,
  getYoklamaDay,
  isDayActiveForPersonel,
  isFormenGorev,
  isKampciGorev,
  isMermerciGorev,
  isOperatorGorev,
  isSoforGorev,
  isTesisatciGorev,
} from './yoklamaUtils';

export type PuantajPersonelGrup =
  | 'FORMEN'
  | 'DUZ_ISCI'
  | 'KAMPCI'
  | 'TESISATCI'
  | 'MERMERCI'
  | 'SOFOR'
  | 'OPERATOR'
  | 'DIGER';

export const PUANTAJ_GRUP_ORDER: PuantajPersonelGrup[] = [
  'FORMEN',
  'DUZ_ISCI',
  'KAMPCI',
  'TESISATCI',
  'MERMERCI',
  'SOFOR',
  'OPERATOR',
  'DIGER',
];

export function resolvePuantajPersonelGrup(p: Personel): PuantajPersonelGrup {
  if (isFormenGorev(p.gorev)) return 'FORMEN';
  if (isKampciGorev(p.gorev)) return 'KAMPCI';
  if (isTesisatciGorev(p.gorev)) return 'TESISATCI';
  if (isMermerciGorev(p.gorev)) return 'MERMERCI';
  if (isSoforGorev(p.gorev)) return 'SOFOR';
  if (isOperatorGorev(p.gorev)) return 'OPERATOR';
  return 'DUZ_ISCI';
}

export function puantajGrupLabel(grup: PuantajPersonelGrup): string {
  switch (grup) {
    case 'FORMEN':
      return 'FORMEN GRUBU';
    case 'DUZ_ISCI':
      return 'DÜZ İŞÇİ GRUBU';
    case 'KAMPCI':
      return 'KAMPÇI GRUBU';
    case 'TESISATCI':
      return 'TESİSATÇI GRUBU';
    case 'MERMERCI':
      return 'MERMERCİ GRUBU';
    case 'SOFOR':
      return 'ŞÖFÖR GRUBU';
    case 'OPERATOR':
      return 'OPERATÖR GRUBU';
    default:
      return 'DİĞER PERSONEL';
  }
}

function sheetNameForGrup(grup: PuantajPersonelGrup): string {
  switch (grup) {
    case 'FORMEN':
      return 'Formen';
    case 'DUZ_ISCI':
      return 'Duz Isci';
    case 'KAMPCI':
      return 'Kampci';
    case 'TESISATCI':
      return 'Tesisatci';
    case 'MERMERCI':
      return 'Mermerci';
    case 'SOFOR':
      return 'Sofor';
    case 'OPERATOR':
      return 'Operator';
    default:
      return 'Diger';
  }
}

function groupColor(grup: PuantajPersonelGrup): string {
  switch (grup) {
    case 'FORMEN':
      return 'FF7C3AED';
    case 'DUZ_ISCI':
      return 'FF1D4ED8';
    case 'KAMPCI':
      return 'FF0F766E';
    case 'TESISATCI':
      return 'FFC2410C';
    case 'MERMERCI':
      return 'FFBE185D';
    case 'SOFOR':
      return 'FF0369A1';
    case 'OPERATOR':
      return 'FFB45309';
    default:
      return 'FF475569';
  }
}

function dayOfWeekAbbreviation(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][d.getDay()];
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

/**
 * Günlük yevmiye.
 * Yoklama ekranı ile aynı kural: aylık maaş → ay gününe böl.
 * "Günlük" seçili ama tutar aylık gibi yüksekse (yaygın veri hatası) yine aylık sayılır —
 * aksi halde 30.000 × 3 gün = 90.000 gibi şişirme oluşur.
 */
function resolveYevmiye(p: Personel, daysInMonth: number): number {
  const maas = Number(p.maas || 0);
  if (!Number.isFinite(maas) || maas <= 0) return 0;

  const tip = String(p.ucretTipi || 'Aylık')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const gunSayisi = Math.max(daysInMonth, 1);

  if (tip === 'saatlik') {
    return maas * 7.5;
  }

  if (tip === 'gunluk') {
    // Gerçek günlük yevmiye bandı; üzeri → kartta "Günlük" ama maaş aylık girilmiş
    const GUNLUK_UST_SINIR = 7500;
    if (maas > GUNLUK_UST_SINIR) {
      return maas / gunSayisi;
    }
    return maas;
  }

  // Aylık (varsayılan) — YoklamaScreen ile birebir
  return maas / gunSayisi;
}

export type ModernPuantajExportOpts = {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  year: number;
  month: number;
  /** true = boş şablon; event nesnesi vb. truthy değerler boş sayılmaz */
  emptyMode?: boolean;
  filledDayCountInMonth?: number;
  /** UI zaten dönem onayı aldıysa tekrar sorma */
  skipEmptyConfirm?: boolean;
};

type SheetCtx = {
  year: number;
  month: number;
  daysInMonth: number;
  dayIndexes: number[];
  emptyMode: boolean;
  yoklamalar: AylikYoklamaMap;
  reportTitle: string;
  reportNo: string;
  basimTarihi: string;
  monthLabel: string;
  logoId: number | null;
};

const SUMMARY_LABELS = [
  'Top. Gün',
  'Yok Gün',
  'Top. Mesai',
  'Aylık Maaş',
  'Yevmiye',
  'Gün Hak.',
  'Mesai Hak.',
  'Toplam',
] as const;

function applyPageSetup(ws: any) {
  ws.pageSetup = {
    paperSize: 8, // A3
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.2,
      footer: 0.2,
    },
  };
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 8 }];
  ws.properties = { defaultRowHeight: 18 };
}

function writeSheetChrome(
  ws: any,
  ctx: SheetCtx,
  subtitle: string,
  headerNote: string
): { baseCols: number; summaryStart: number; totalCols: number } {
  const { year, month, dayIndexes, reportTitle, reportNo, basimTarihi, monthLabel } = ctx;
  const baseCols = 8;
  const summaryStart = baseCols + dayIndexes.length + 1;
  const totalCols = summaryStart + SUMMARY_LABELS.length - 1;

  applyPageSetup(ws);
  ws.headerFooter = {
    oddHeader: `&C&B${reportTitle} — ${subtitle}`,
    oddFooter: `&L${reportNo}&CKibritçi İnşaat — A3 Maaş / Puantaj&RSayfa &P / &N`,
  };

  ws.getCell(1, 1).value = reportTitle;
  ws.mergeCells(1, 1, 1, totalCols);
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  ws.getRow(1).height = 28;

  ws.getCell(2, 1).value =
    `RAPOR DÖNEMİ: ${monthLabel.toLocaleUpperCase('tr-TR')} (${year}-${String(month).padStart(2, '0')})  ·  ${headerNote}  ·  A3 Yatay`;
  ws.mergeCells(2, 1, 2, totalCols);
  ws.getCell(2, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ws.getCell(2, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };

  ws.getCell(3, 1).value =
    `G=Geldi Y=Yok İ=İzin R=Rapor P=Pazar T=Tatil  ·  Yeşil=İşe giriş  Kırmızı=İşten çıkış  ·  Rapor No: ${reportNo}  ·  Yazdırma anı (dönem değil): ${basimTarihi}`;
  ws.mergeCells(3, 1, 3, totalCols);
  ws.getCell(3, 1).font = { bold: true, size: 8, color: { argb: 'FF334155' } };
  ws.getCell(3, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  if (ctx.logoId != null) {
    ws.addImage(ctx.logoId, { tl: { col: 0.1, row: 0.08 }, ext: { width: 200, height: 78 } });
  }

  const headerTop = ['Sıra', 'Ad Soyad', 'TC Kimlik', 'IBAN', 'Görevi', 'Aylık Maaş', 'Yevmiye', 'Satır'];
  headerTop.forEach((h, i) => {
    const col = i + 1;
    ws.getCell(4, col).value = h;
    ws.getCell(4, col).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(4, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    ws.getCell(4, col).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(4, col, 5, col);
  });

  dayIndexes.forEach((d, idx) => {
    const col = baseCols + idx + 1;
    ws.getCell(4, col).value = d;
    ws.getCell(5, col).value = dayOfWeekAbbreviation(year, month, d);
    [4, 5].forEach((r) => {
      ws.getCell(r, col).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell(r, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      ws.getCell(r, col).alignment = { horizontal: 'center', vertical: 'middle' };
    });
  });

  SUMMARY_LABELS.forEach((label, i) => {
    const col = summaryStart + i;
    ws.getCell(4, col).value = label;
    ws.mergeCells(4, col, 5, col);
    ws.getCell(4, col).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(4, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
    ws.getCell(4, col).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  return { baseCols, summaryStart, totalCols };
}

function writePersonBlock(
  ws: any,
  p: Personel,
  index: number,
  startRow: number,
  ctx: SheetCtx,
  baseCols: number,
  summaryStart: number
): number {
  const { year, month, daysInMonth, dayIndexes, emptyMode, yoklamalar } = ctx;
  let row = startRow;

  ws.mergeCells(row, 1, row, baseCols);
  ws.getCell(row, 1).value = `TARİH CETVELİ · ${p.ad} ${p.soyad}`;
  ws.getCell(row, 1).font = { bold: true, size: 9, color: { argb: 'FF1E3A8A' } };
  ws.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  dayIndexes.forEach((day, idx) => {
    const col = baseCols + idx + 1;
    const cetvelCell = ws.getCell(row, col);
    cetvelCell.value = `${String(day).padStart(2, '0')} ${dayOfWeekAbbreviation(year, month, day)}`;
    cetvelCell.font = { bold: true, size: 8, color: { argb: 'FF1E3A8A' } };
    cetvelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    cetvelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  });
  SUMMARY_LABELS.forEach((_, i) => {
    ws.getCell(row, summaryStart + i).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
  });
  ws.getRow(row).height = 16;
  row += 1;

  const map = yoklamalar[p.id] || {};
  let geldiGun = 0;
  let yokGun = 0;
  let mesaiToplam = 0;
  let hakedisGun = 0;
  const hireDay = getBoundaryDayInMonth(p.iseGirisTarihi, year, month);
  const exitDay = getBoundaryDayInMonth(p.istenCikisTarihi, year, month);
  const yevmiye = resolveYevmiye(p, daysInMonth);
  const aylikMaas = Number(p.maas || 0);

  // 2 satır: ÇALIŞMA GÜNÜ + MESAİ — günlük yevmiye satırı yok (maaş hesabı sağ özet + alt satırda)
  for (let c = 1; c <= 7; c++) ws.mergeCells(row, c, row + 1, c);
  ws.getCell(row, 1).value = index;
  ws.getCell(row, 2).value = `${p.ad} ${p.soyad}`;
  ws.getCell(row, 3).value = p.tcNo || '-';
  ws.getCell(row, 4).value = p.ibanNo || '-';
  ws.getCell(row, 5).value = p.gorev || '-';
  ws.getCell(row, 6).value = aylikMaas;
  ws.getCell(row, 6).numFmt = '#,##0.00';
  ws.getCell(row, 7).value = Number(yevmiye.toFixed(2));
  ws.getCell(row, 7).numFmt = '#,##0.00';
  ws.getCell(row, 7).font = { bold: true, color: { argb: 'FF166534' } };
  ws.getCell(row, 8).value = 'ÇALIŞMA GÜNÜ';
  ws.getCell(row + 1, 8).value = 'MESAİ (SAAT)';

  dayIndexes.forEach((day, idx) => {
    const col = baseCols + idx + 1;
    const active = isDayActiveForPersonel(p, year, month, day, map);
    const d =
      getYoklamaDay(map, year, month, day) ||
      ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
    const mesai = Number(d.mesaiSaati || 0);
    if (active) {
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
      mesaiToplam += mesai;
    }

    const statusCell = ws.getCell(row, col);
    const mesaiCell = ws.getCell(row + 1, col);
    statusCell.value = active ? (emptyMode ? '' : toStatusSymbol(d.durum)) : '-';

    if (!active) {
      mesaiCell.value = '-';
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      mesaiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    } else if (emptyMode) {
      mesaiCell.value = '';
    } else {
      mesaiCell.value = mesai > 0 ? mesai : '-';
      if (mesai > 0) mesaiCell.numFmt = '0.0';
      if (d.durum === 'Geldi') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      } else if (d.durum === 'Yok') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else if (d.durum === 'Pazar' || d.durum === 'Tatil') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    }

    if (hireDay === day) {
      const b = {
        top: { style: 'medium' as const, color: { argb: 'FF22C55E' } },
        left: { style: 'medium' as const, color: { argb: 'FF22C55E' } },
        right: { style: 'medium' as const, color: { argb: 'FF22C55E' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF22C55E' } },
      };
      statusCell.border = b;
      mesaiCell.border = b;
    }
    if (exitDay === day) {
      const b = {
        top: { style: 'medium' as const, color: { argb: 'FFDC2626' } },
        left: { style: 'medium' as const, color: { argb: 'FFDC2626' } },
        right: { style: 'medium' as const, color: { argb: 'FFDC2626' } },
        bottom: { style: 'medium' as const, color: { argb: 'FFDC2626' } },
      };
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: emptyMode ? 'FFFFFFFF' : 'FFFEE2E2' },
      };
      statusCell.border = b;
      mesaiCell.border = b;
    }
  });

  const tahminiMaas = yevmiye * hakedisGun;
  const tahminiMesai = mesaiToplam * (yevmiye / 7.5) * 1.5;
  const tahminiToplam = tahminiMaas + tahminiMesai;
  const summaryValues = emptyMode
    ? ['', '', '', '', '', '', '', '']
    : [
        geldiGun,
        yokGun,
        Number(mesaiToplam.toFixed(1)),
        aylikMaas,
        Number(yevmiye.toFixed(2)),
        tahminiMaas,
        tahminiMesai,
        tahminiToplam,
      ];
  summaryValues.forEach((v, i) => {
    const cell = ws.getCell(row, summaryStart + i);
    cell.value = v;
    if (i >= 2 && !emptyMode) cell.numFmt = '#,##0.00';
  });

  ws.mergeCells(row + 1, summaryStart, row + 1, summaryStart + SUMMARY_LABELS.length - 1);
  ws.getCell(row + 1, summaryStart).value = emptyMode
    ? ''
    : `Gün Hak ${tahminiMaas.toFixed(2)} · Mesai Hak ${tahminiMesai.toFixed(2)} · Toplam ${tahminiToplam.toFixed(2)} TL  |  İşe Giriş: ${p.iseGirisTarihi || '-'} | İşten Çıkış: ${p.istenCikisTarihi || '-'}`;
  ws.getCell(row + 1, summaryStart).font = { size: 8, color: { argb: 'FF166534' } };
  ws.getCell(row + 1, summaryStart).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0FDF4' },
  };

  ws.getRow(row).height = 20;
  ws.getRow(row + 1).height = 16;
  return row + 2;
}

function writeSignAndPolish(
  ws: any,
  startRow: number,
  totalCols: number,
  baseCols: number,
  summaryStart: number,
  dayIndexes: number[]
) {
  const signTitleRow = startRow + 1;
  ws.mergeCells(signTitleRow, 1, signTitleRow, totalCols);
  ws.getCell(signTitleRow, 1).value = 'ONAY / İMZA BARLARI';
  ws.getCell(signTitleRow, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ws.getCell(signTitleRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(signTitleRow, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  ws.getRow(signTitleRow).height = 22;

  const signRoles = ['Hazırlayan', 'Muhasebe', 'Şantiye Şefi'] as const;
  const signStartRow = signTitleRow + 2;
  const gap = 1;
  const usable = totalCols - gap * (signRoles.length - 1);
  const barWidth = Math.max(4, Math.floor(usable / signRoles.length));

  signRoles.forEach((role, idx) => {
    const startCol = 1 + idx * (barWidth + gap);
    const endCol = Math.min(totalCols, startCol + barWidth - 1);

    // Rol başlığı
    ws.mergeCells(signStartRow, startCol, signStartRow, endCol);
    const titleCell = ws.getCell(signStartRow, startCol);
    titleCell.value = role.toLocaleUpperCase('tr-TR');
    titleCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    ws.getRow(signStartRow).height = 20;

    // İmza alanı (boş bar)
    ws.mergeCells(signStartRow + 1, startCol, signStartRow + 4, endCol);
    const signCell = ws.getCell(signStartRow + 1, startCol);
    signCell.value = '\n\n\nİmza / Kaşe\n______________________________';
    signCell.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
    signCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    signCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    signCell.border = {
      top: { style: 'medium', color: { argb: 'FF64748B' } },
      left: { style: 'medium', color: { argb: 'FF64748B' } },
      right: { style: 'medium', color: { argb: 'FF64748B' } },
      bottom: { style: 'medium', color: { argb: 'FF64748B' } },
    };
    for (let r = signStartRow + 1; r <= signStartRow + 4; r++) {
      ws.getRow(r).height = 18;
    }

    // Ad Soyad satırı
    ws.mergeCells(signStartRow + 5, startCol, signStartRow + 5, endCol);
    const nameCell = ws.getCell(signStartRow + 5, startCol);
    nameCell.value = 'Ad Soyad: __________________';
    nameCell.font = { size: 9, color: { argb: 'FF475569' } };
    nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    ws.getRow(signStartRow + 5).height = 18;
  });

  ws.eachRow((r: any) => {
    r.eachCell((cell: any) => {
      if (!cell.alignment) cell.alignment = {};
      const keepWrap = Boolean(cell.alignment.wrapText);
      cell.alignment = {
        ...cell.alignment,
        horizontal: cell.alignment.horizontal || 'center',
        vertical: 'middle',
        wrapText: keepWrap,
      };
      if (!cell.border) {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }
    });
  });

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 11;
  ws.getColumn(7).width = 10;
  ws.getColumn(8).width = 13;
  dayIndexes.forEach((_, idx) => {
    ws.getColumn(baseCols + idx + 1).width = 5.8;
  });
  SUMMARY_LABELS.forEach((_, i) => {
    ws.getColumn(summaryStart + i).width = 11;
  });
}

function writeGrupBanner(ws: any, row: number, grup: PuantajPersonelGrup, count: number, totalCols: number) {
  ws.mergeCells(row, 1, row, totalCols);
  const banner = ws.getCell(row, 1);
  banner.value = `■■■  ${puantajGrupLabel(grup)}  —  ${count} kişi  ■■■`;
  banner.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: groupColor(grup) } };
  ws.getRow(row).height = 22;
}

function fillSingleGrupSheet(ws: any, grup: PuantajPersonelGrup, list: Personel[], ctx: SheetCtx) {
  const { baseCols, summaryStart, totalCols } = writeSheetChrome(
    ws,
    ctx,
    puantajGrupLabel(grup),
    `${puantajGrupLabel(grup)} (${list.length} kişi)`
  );
  let row = 6;
  writeGrupBanner(ws, row, grup, list.length, totalCols);
  row += 1;
  list.forEach((p, i) => {
    row = writePersonBlock(ws, p, i + 1, row, ctx, baseCols, summaryStart);
  });
  writeSignAndPolish(ws, row, totalCols, baseCols, summaryStart, ctx.dayIndexes);
}

function fillTumuSheet(
  ws: any,
  allList: { grup: PuantajPersonelGrup; list: Personel[] }[],
  ctx: SheetCtx
) {
  const totalPeople = allList.reduce((n, g) => n + g.list.length, 0);
  const { baseCols, summaryStart, totalCols } = writeSheetChrome(
    ws,
    ctx,
    'TÜM GRUPLAR',
    `Formen · Düz İşçi · Kampçı · Tesisatçı  |  ${totalPeople} kişi`
  );
  let row = 6;
  let globalIndex = 0;
  for (const { grup, list } of allList) {
    writeGrupBanner(ws, row, grup, list.length, totalCols);
    row += 1;
    for (const p of list) {
      globalIndex += 1;
      row = writePersonBlock(ws, p, globalIndex, row, ctx, baseCols, summaryStart);
    }
    row += 1;
  }
  writeSignAndPolish(ws, row, totalCols, baseCols, summaryStart, ctx.dayIndexes);
}

/**
 * A3 yatay maaş/puantaj.
 * Sayfalar: Tumu + Formen / Duz Isci / Kampci / Tesisatci (+ Mermerci) + Ozet
 */
export async function exportModernPuantajExcel(opts: ModernPuantajExportOpts): Promise<void> {
  const {
    personeller,
    yoklamalar,
    year,
    month,
    filledDayCountInMonth,
    skipEmptyConfirm = false,
  } = opts;
  // React onClick event'i truthy gelir — yalnızca strict true boş şablondur.
  const emptyMode = opts.emptyMode === true;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayIndexes = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthLabelEarly = new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });

  if (
    !emptyMode &&
    !skipEmptyConfirm &&
    typeof filledDayCountInMonth === 'number' &&
    filledDayCountInMonth === 0 &&
    typeof window !== 'undefined' &&
    !window.confirm(
      `${monthLabelEarly} için sistemde dolu yevmiye/mesai kaydı görünmüyor.\n` +
        `Rapor yine de seçili ay (${month}/${year}) kolonlarıyla iner; hücreler tire (-) olabilir.\n\n` +
        `(Önce Yoklama Arşivi veya doğru dönemi kontrol edin.)`
    )
  ) {
    return;
  }

  const grouped = new Map<PuantajPersonelGrup, Personel[]>();
  for (const g of PUANTAJ_GRUP_ORDER) grouped.set(g, []);
  for (const p of personeller) {
    grouped.get(resolvePuantajPersonelGrup(p))!.push(p);
  }

  const allList = PUANTAJ_GRUP_ORDER.map((grup) => ({
    grup,
    list: grouped.get(grup) || [],
  })).filter((x) => x.list.length > 0);

  const wb = await createExcelWorkbook();
  const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
  const reportNo = `KBR-DSK-${year}${String(month).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
  const basimTarihi = new Date().toLocaleString('tr-TR');
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
  const reportTitle = `KİBRİTÇİ İNŞAAT DURSUNKÖY PROJESİ ${monthLabel.toUpperCase()} RAPORUDUR`;

  let logoId: number | null = null;
  const logoDataUrl = await loadKibritciLogoDataUrl();
  if (logoDataUrl) {
    logoId = wb.addImage({
      base64: logoDataUrl.replace(/^data:image\/png;base64,/, ''),
      extension: 'png',
    });
  }

  const ctx: SheetCtx = {
    year,
    month,
    daysInMonth,
    dayIndexes,
    emptyMode,
    yoklamalar,
    reportTitle,
    reportNo,
    basimTarihi,
    monthLabel,
    logoId,
  };

  if (allList.length > 0) {
    const wsTumu = wb.addWorksheet('Tumu');
    fillTumuSheet(wsTumu, allList, ctx);
  }

  for (const { grup, list } of allList) {
    const ws = wb.addWorksheet(sheetNameForGrup(grup));
    fillSingleGrupSheet(ws, grup, list, ctx);
  }

  const summaryWs = wb.addWorksheet('Ozet');
  summaryWs.addRow([reportTitle]);
  summaryWs.mergeCells(1, 1, 1, 10);
  summaryWs.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  summaryWs.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  summaryWs.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  summaryWs.addRow([
    `RAPOR DÖNEMİ: ${monthLabel.toLocaleUpperCase('tr-TR')} (${periodLabel})  |  Rapor No: ${reportNo}  |  Yazdırma anı: ${basimTarihi}`,
  ]);
  summaryWs.mergeCells(2, 1, 2, 10);
  summaryWs.getCell(2, 1).font = { bold: true, size: 10, color: { argb: 'FF1D4ED8' } };

  let sRow = 3;
  for (const { grup, list } of allList) {
    summaryWs.addRow([puantajGrupLabel(grup), `${list.length} kişi`]);
    summaryWs.getCell(sRow, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryWs.getCell(sRow, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: groupColor(grup) },
    };
    summaryWs.mergeCells(sRow, 1, sRow, 10);
    sRow++;

    summaryWs.addRow([
      'Sıra',
      'Ad Soyad',
      'Grup',
      'TC',
      'Görev',
      'Top. Gün',
      'Yok',
      'Mesai',
      'Yevmiye',
      'Toplam Kazanç',
    ]);
    summaryWs.getRow(sRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryWs.getRow(sRow).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    };
    sRow++;

    list.forEach((p, i) => {
      const map = yoklamalar[p.id] || {};
      let geldiGun = 0;
      let yokGun = 0;
      let mesaiToplam = 0;
      let hakedisGun = 0;
      dayIndexes.forEach((day) => {
        if (!isDayActiveForPersonel(p, year, month, day, map)) return;
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
        mesaiToplam += Number(d.mesaiSaati || 0);
      });
      const yevmiye = resolveYevmiye(p, daysInMonth);
      const toplam = yevmiye * hakedisGun + mesaiToplam * (yevmiye / 7.5) * 1.5;
      summaryWs.addRow([
        i + 1,
        `${p.ad} ${p.soyad}`,
        puantajGrupLabel(grup),
        p.tcNo || '-',
        p.gorev || '-',
        geldiGun,
        yokGun,
        Number(mesaiToplam.toFixed(2)),
        Number(yevmiye.toFixed(2)),
        Number(toplam.toFixed(2)),
      ]);
      sRow++;
    });
    sRow++;
  }

  [9, 10].forEach((col) => {
    summaryWs.getColumn(col).numFmt = '#,##0.00';
  });
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((c) => {
    summaryWs.getColumn(c).width = [6, 22, 16, 14, 12, 10, 8, 10, 10, 13][c - 1];
  });

  // Özet sayfası sonuna 3 imza barı
  const ozetSignTitle = sRow + 1;
  summaryWs.mergeCells(ozetSignTitle, 1, ozetSignTitle, 10);
  summaryWs.getCell(ozetSignTitle, 1).value = 'ONAY / İMZA BARLARI';
  summaryWs.getCell(ozetSignTitle, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  summaryWs.getCell(ozetSignTitle, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  summaryWs.getCell(ozetSignTitle, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  summaryWs.getRow(ozetSignTitle).height = 22;

  const ozetRoles = [
    { label: 'Hazırlayan', cols: [1, 3] },
    { label: 'Muhasebe', cols: [4, 6] },
    { label: 'Şantiye Şefi', cols: [7, 10] },
  ] as const;
  const ozetBarRow = ozetSignTitle + 2;
  ozetRoles.forEach(({ label, cols }) => {
    const [c1, c2] = cols;
    summaryWs.mergeCells(ozetBarRow, c1, ozetBarRow, c2);
    const t = summaryWs.getCell(ozetBarRow, c1);
    t.value = label.toLocaleUpperCase('tr-TR');
    t.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    t.alignment = { horizontal: 'center', vertical: 'middle' };

    summaryWs.mergeCells(ozetBarRow + 1, c1, ozetBarRow + 4, c2);
    const s = summaryWs.getCell(ozetBarRow + 1, c1);
    s.value = '\n\nİmza / Kaşe\n__________________';
    s.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
    s.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    s.border = {
      top: { style: 'medium', color: { argb: 'FF64748B' } },
      left: { style: 'medium', color: { argb: 'FF64748B' } },
      right: { style: 'medium', color: { argb: 'FF64748B' } },
      bottom: { style: 'medium', color: { argb: 'FF64748B' } },
    };

    summaryWs.mergeCells(ozetBarRow + 5, c1, ozetBarRow + 5, c2);
    const n = summaryWs.getCell(ozetBarRow + 5, c1);
    n.value = 'Ad Soyad: __________________';
    n.font = { size: 9, color: { argb: 'FF475569' } };
    n.alignment = { horizontal: 'center', vertical: 'middle' };
    n.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = emptyMode
    ? `Yoklama_Bos_Sablon_${periodLabel}.xlsx`
    : `Yoklama_Puantaj_${periodLabel}_Donem.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
