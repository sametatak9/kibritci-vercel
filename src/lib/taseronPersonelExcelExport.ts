import type { KampKaydi, KampOdasi, Personel } from '../types/erp';
import type { Workbook, Worksheet } from 'exceljs';
import {
  flattenGorevGroups,
  groupPersonelByGorev,
} from './anaFirmaGorevPersonelRapor';
import { displayPersonelGorev } from './guvenlikHelpers';
import { formatPersonelKampYerlesim } from './taseronUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  canonicalizeAnaFirmaAdi,
  isTaseronPersonel,
  parseFlexibleDateParts,
} from './yoklamaUtils';
import { formatPersonelMissingDocs } from './personelMissingDocs';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import {
  buildKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';

/**
 * Taşeron / yoklamasız kadro: işe giriş → çıkış (yoksa bugün) arası takvim günü (iki uç dahil).
 * Örn. 10.08–10.08 = 1 gün, 11.08–12.08 = 2 gün.
 */
export function countPersonelKadroGun(p: Personel, asOf: Date = new Date()): number | '' {
  const hire = parseFlexibleDateParts(p.iseGirisTarihi);
  if (!hire) return '';
  const exit = parseFlexibleDateParts(p.istenCikisTarihi);
  const end = exit || {
    year: asOf.getFullYear(),
    month: asOf.getMonth() + 1,
    day: asOf.getDate(),
  };
  const startMs = Date.UTC(hire.year, hire.month - 1, hire.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  if (endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function formatMaasValue(p: Personel): number {
  const n = Number(p.maas);
  return Number.isFinite(n) ? n : 0;
}

function formatUcretTipi(p: Personel): string {
  return String(p.ucretTipi || '').trim() || '—';
}

export type PersonelExcelScope = 'taseron' | 'all' | 'ana_firma' | 'custom';

const LIGHT = {
  title: 'FF1C1917',
  meta: 'FF78716C',
  accent: 'FFD97706',
  accentBar: 'FFFBBF24',
  accentSoft: 'FFFFF7ED',
  tableHeadBg: 'FF292524',
  tableHeadText: 'FFFFFBEB',
  firmaBannerBg: 'FFFFF7ED',
  firmaBannerText: 'FF9A3412',
  gorevBannerBg: 'FFFAFAF9',
  gorevBannerText: 'FF44403C',
  aktifBannerBg: 'FFECFDF5',
  aktifBannerText: 'FF065F46',
  pasifBannerBg: 'FFFAf5F5',
  pasifBannerText: 'FF9F1239',
  aktifCellBg: 'FFD1FAE5',
  aktifCellText: 'FF065F46',
  pasifCellBg: 'FFFEE2E2',
  pasifCellText: 'FF9F1239',
  rowAlt: 'FFFAFAF9',
  rowBase: 'FFFFFFFF',
  border: 'FFE7E5E4',
  borderStrong: 'FFD6D3D1',
  metaStrip: 'FFFFFBEB',
  footerBg: 'FFFAFAF9',
} as const;

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: LIGHT.border } },
    left: { style: 'thin' as const, color: { argb: LIGHT.border } },
    bottom: { style: 'thin' as const, color: { argb: LIGHT.border } },
    right: { style: 'thin' as const, color: { argb: LIGHT.border } },
  };
}

function mediumBottomBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: LIGHT.border } },
    left: { style: 'thin' as const, color: { argb: LIGHT.border } },
    bottom: { style: 'medium' as const, color: { argb: LIGHT.borderStrong } },
    right: { style: 'thin' as const, color: { argb: LIGHT.border } },
  };
}

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function safeFilePrefix(name: string): string {
  return (
    String(name || '')
      .replace(/[^\w.\-ğüşıöçĞÜŞİÖÇ ]+/gi, '_')
      .replace(/\s+/g, '_')
      .slice(0, 48) || 'Personel'
  );
}

async function applyKibritciPersonelExcelAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; metaLine: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(4, opts.colCount);
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 18;
  ws.mergeCells(1, 1, 3, Math.min(2, colCount));

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.15 }, ext: { width: 132, height: 52 } });
  } else {
    const logoCell = ws.getCell(1, 1);
    logoCell.value = KIBRITCI_COMPANY.shortName;
    logoCell.font = { bold: true, size: 14, color: { argb: 'FF9A3412' }, name: 'Calibri' };
    logoCell.alignment = { vertical: 'middle' };
  }

  const metaStart = Math.min(3, colCount);
  ws.mergeCells(1, metaStart, 1, colCount);
  const titleCell = ws.getCell(1, metaStart);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 14, color: { argb: LIGHT.title }, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'right', vertical: 'bottom' };

  ws.mergeCells(2, metaStart, 2, colCount);
  const subCell = ws.getCell(2, metaStart);
  subCell.value = opts.subtitle;
  subCell.font = { size: 10, color: { argb: LIGHT.meta }, name: 'Calibri' };
  subCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, metaStart, 3, colCount);
  const companyCell = ws.getCell(3, metaStart);
  companyCell.value = `${KIBRITCI_COMPANY.legalName}  ·  ${KIBRITCI_COMPANY.phone}`;
  companyCell.font = { size: 8, color: { argb: LIGHT.meta }, name: 'Calibri' };
  companyCell.alignment = { horizontal: 'right', vertical: 'top' };

  ws.mergeCells(4, 1, 4, colCount);
  setFill(ws.getCell(4, 1), LIGHT.accentBar);
  ws.getRow(4).height = 5;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, color: { argb: LIGHT.meta }, name: 'Calibri' };
  ws.getCell(5, 1).alignment = { wrapText: true, vertical: 'middle' };
  setFill(ws.getCell(5, 1), LIGHT.accentSoft);
  ws.getRow(5).height = 18;

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value = opts.metaLine;
  ws.getCell(6, 1).font = { size: 9, bold: true, color: { argb: 'FF57534E' }, name: 'Calibri' };
  ws.getCell(6, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  setFill(ws.getCell(6, 1), LIGHT.metaStrip);
  ws.getRow(6).height = 22;

  ws.getRow(7).height = 8;

  return 8;
}

function groupRowsByFirma(rows: Personel[]): Array<{ firma: string; personeller: Personel[] }> {
  const map = new Map<string, Personel[]>();
  for (const p of rows) {
    const key = firmaAdiLabel(p);
    const group = map.get(key) || [];
    group.push(p);
    map.set(key, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
    .map(([firma, personeller]) => ({
      firma,
      personeller: [...personeller].sort((a, b) =>
        `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' })
      ),
    }));
}

function isAktif(p: Personel): boolean {
  return p.durum === true || String(p.durum).toLowerCase() === 'true';
}

function firmaTipiLabel(p: Personel): string {
  if (p.firmaTipi === 'TASERON' || isTaseronPersonel(p)) return 'Taşeron';
  return 'Ana Firma';
}

function firmaAdiLabel(p: Personel): string {
  if (isTaseronPersonel(p)) {
    const ad = String(p.firmaAdi || '').trim();
    return ad || '—';
  }
  return canonicalizeAnaFirmaAdi(p.firmaAdi);
}

function sortByFirmaThenName(a: Personel, b: Personel): number {
  const firma = firmaAdiLabel(a).localeCompare(firmaAdiLabel(b), 'tr');
  if (firma !== 0) return firma;
  return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr');
}

function isAnaFirmaPersonel(p: Personel): boolean {
  return !isTaseronPersonel(p);
}

const esc = (value: string | number | boolean | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Taşeron firma personeli. */
export function collectTaseronPersoneller(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): Personel[] {
  return personeller
    .filter((p) => isTaseronPersonel(p))
    .filter((p) => (options?.onlyActive ? isAktif(p) : true))
    .sort(sortByFirmaThenName);
}

/** Ana firma dahil tüm firmaların personeli. */
export function collectTumFirmalarPersoneller(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): Personel[] {
  return personeller
    .filter((p) => (options?.onlyActive ? isAktif(p) : true))
    .sort(sortByFirmaThenName);
}

/** Yalnızca ana firma (Kibritçi İnşaat) personeli — göreve göre gruplu sıra. */
export function collectAnaFirmaPersoneller(
  personeller: Personel[],
  options?: { onlyActive?: boolean }
): Personel[] {
  const pool = personeller
    .filter((p) => isAnaFirmaPersonel(p))
    .filter((p) => (options?.onlyActive ? isAktif(p) : true));
  return flattenGorevGroups(groupPersonelByGorev(pool));
}

export async function exportPersonelExcel(options: {
  personeller: Personel[];
  scope?: PersonelExcelScope;
  /** scope=custom iken doğrudan bu liste kullanılır */
  rows?: Personel[];
  title?: string;
  subtitle?: string;
  sheetName?: string;
  onlyActive?: boolean;
  splitByDurum?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  fileNamePrefix?: string;
  /** all/taseron için firma bazlı bölüm başlıkları */
  groupByFirma?: boolean;
}): Promise<number> {
  const scope: PersonelExcelScope = options.scope || 'taseron';
  let rows: Personel[];
  if (scope === 'custom' && options.rows) {
    rows = [...options.rows];
  } else if (scope === 'all') {
    rows = collectTumFirmalarPersoneller(options.personeller, { onlyActive: options.onlyActive });
  } else if (scope === 'ana_firma') {
    rows = collectAnaFirmaPersoneller(options.personeller, { onlyActive: options.onlyActive });
  } else {
    rows = collectTaseronPersoneller(options.personeller, { onlyActive: options.onlyActive });
  }

  if (rows.length === 0) {
    throw new Error(
      scope === 'all'
        ? 'Dışa aktarılacak personel bulunamadı.'
        : scope === 'ana_firma'
          ? 'Dışa aktarılacak ana firma personeli bulunamadı.'
          : scope === 'custom'
            ? 'Seçili filtrede dışa aktarılacak personel yok.'
            : 'Dışa aktarılacak taşeron personeli bulunamadı.'
    );
  }

  const includeKamp = Boolean(options.kampKayitlari?.length || options.kampOdalari?.length);
  const workbook = await createExcelWorkbook();
  workbook.creator = KIBRITCI_COMPANY.shortName;
  const sheetName =
    options.sheetName ||
    (scope === 'all'
      ? 'Tüm Firmalar'
      : scope === 'ana_firma'
        ? 'Ana Firma'
        : scope === 'custom'
          ? 'Seçili Taşeron'
          : 'Taşeron Personel');
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 16 },
  });

  const headers = [
    '#',
    'Firma Adı',
    'Firma Tipi',
    'Ad Soyad',
    'TC No',
    'Görev',
    'Departman',
    'Telefon',
    'İşe Giriş',
    'İşten Çıkış',
    'SGK Durumu',
    'Durum',
    'Maaş',
    'Ücret Tipi',
    'Çalışılan Gün',
  ];
  if (includeKamp) headers.push('Kamp Yerleşimi');
  headers.push('Eksik Evrak');
  const colCount = headers.length;

  const reportTitle =
    options.title ||
    (scope === 'all'
      ? `${CANONICAL_ANA_FIRMA_ADI} — Tüm Firmalar Personel Listesi`
      : scope === 'ana_firma'
        ? `${CANONICAL_ANA_FIRMA_ADI} — Ana Firma Personel Listesi`
        : scope === 'custom'
          ? `${CANONICAL_ANA_FIRMA_ADI} — Seçili Taşeron Personel Listesi`
          : `${CANONICAL_ANA_FIRMA_ADI} — Tüm Taşeron Personel Listesi`);

  const reportSubtitle =
    options.subtitle ||
    (scope === 'custom'
      ? 'Seçili taşeron firma personel raporu'
      : scope === 'all'
        ? 'Ana firma dahil tüm firmalar · firma bazlı gruplu'
        : scope === 'taseron'
          ? 'Tüm taşeron firmalar · firma bazlı gruplu'
          : 'Göreve göre gruplu personel raporu');

  const stamp = new Date().toLocaleString('tr-TR');
  const activeCount = rows.filter(isAktif).length;
  const passiveCount = rows.length - activeCount;
  const splitByDurum = options.splitByDurum ?? !options.onlyActive;
  const metaLine = `Oluşturma: ${stamp} · Toplam: ${rows.length} · Aktif: ${activeCount} · Pasif: ${passiveCount}${
    options.onlyActive ? ' · Filtre: yalnız aktif' : ' · Filtre: aktif ve pasif ayrı listelenir'
  } · Çalışılan gün = giriş–çıkış (çıkış yoksa bugün, uçlar dahil)`;

  const headerRowIndex = await applyKibritciPersonelExcelAntet(workbook, sheet, {
    title: reportTitle,
    subtitle: reportSubtitle,
    metaLine,
    colCount,
  });

  sheet.columns = [
    { width: 5 },
    { width: 26 },
    { width: 11 },
    { width: 24 },
    { width: 14 },
    { width: 20 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 10 },
    { width: 12 },
    { width: 11 },
    { width: 12 },
    ...(includeKamp ? [{ width: 26 }] : []),
    { width: 28 },
  ];

  const headerRow = sheet.getRow(headerRowIndex);
  headers.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, name: 'Calibri', size: 10, color: { argb: LIGHT.tableHeadText } };
    setFill(cell, LIGHT.tableHeadBg);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = mediumBottomBorder();
  });
  headerRow.height = 26;

  const statusCol = 12;
  const maasCol = 13;
  const ucretCol = 14;
  const kadroGunCol = 15;
  const centerCols = new Set([1, 9, 10, statusCol, maasCol, kadroGunCol]);

  let rowIndex = 0;
  const writePersonelRow = (p: Personel) => {
    rowIndex += 1;
    const kadroGun = countPersonelKadroGun(p);
    const values: (string | number)[] = [
      rowIndex,
      firmaAdiLabel(p),
      firmaTipiLabel(p),
      `${p.ad || ''} ${p.soyad || ''}`.trim(),
      p.tcNo || '',
      displayPersonelGorev(p),
      p.departman || '',
      p.telefonNo || '',
      p.iseGirisTarihi || '',
      isAktif(p) ? '' : p.istenCikisTarihi || '',
      p.sgkDurumu || '',
      isAktif(p) ? 'Aktif' : 'Pasif',
      formatMaasValue(p),
      formatUcretTipi(p),
      kadroGun === '' ? '—' : kadroGun,
    ];
    if (includeKamp) {
      values.push(
        formatPersonelKampYerlesim(p, options.kampKayitlari || [], options.kampOdalari || []) || '—'
      );
    }
    values.push(formatPersonelMissingDocs(p) || '—');

    const row = sheet.addRow(values);
    const alt = rowIndex % 2 === 0;
    const aktif = isAktif(p);
    row.height = 18;
    row.eachCell((cell, colNumber) => {
      const isStatus = colNumber === statusCol;
      const isName = colNumber === 4;
      const isMaas = colNumber === maasCol;
      cell.font = {
        name: 'Calibri',
        size: isName ? 10 : 9,
        color: {
          argb: isStatus
            ? aktif
              ? LIGHT.aktifCellText
              : LIGHT.pasifCellText
            : isName
              ? LIGHT.title
              : 'FF44403C',
        },
        bold: isName || isStatus,
      };
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: centerCols.has(colNumber) ? 'center' : 'left',
        wrapText: colNumber === headers.length || colNumber === 8 || colNumber === ucretCol,
      };
      setFill(cell, alt ? LIGHT.rowAlt : LIGHT.rowBase);
      if (isStatus) {
        setFill(cell, aktif ? LIGHT.aktifCellBg : LIGHT.pasifCellBg);
      }
      if (isMaas) {
        cell.numFmt = '#,##0';
      }
    });
  };

  const writeFirmaBanner = (firma: string, count: number) => {
    const bannerRow = sheet.addRow([`${firma}   ·   ${count} personel`]);
    sheet.mergeCells(bannerRow.number, 1, bannerRow.number, colCount);
    const cell = bannerRow.getCell(1);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: LIGHT.firmaBannerText } };
    setFill(cell, LIGHT.firmaBannerBg);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = thinBorder();
    bannerRow.height = 20;
  };

  const writeGorevBanner = (gorev: string, count: number) => {
    const bannerRow = sheet.addRow([`${gorev}   ·   ${count} kişi`]);
    sheet.mergeCells(bannerRow.number, 1, bannerRow.number, colCount);
    const cell = bannerRow.getCell(1);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: LIGHT.gorevBannerText } };
    setFill(cell, LIGHT.gorevBannerBg);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = thinBorder();
    bannerRow.height = 20;
  };

  const writeDurumBanner = (label: string, count: number, kind: 'aktif' | 'pasif') => {
    const bannerRow = sheet.addRow([`${label}  —  ${count} kişi`]);
    sheet.mergeCells(bannerRow.number, 1, bannerRow.number, colCount);
    const cell = bannerRow.getCell(1);
    const isPasif = kind === 'pasif';
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: isPasif ? LIGHT.pasifBannerText : LIGHT.aktifBannerText },
    };
    setFill(cell, isPasif ? LIGHT.pasifBannerBg : LIGHT.aktifBannerBg);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = thinBorder();
    bannerRow.height = 26;
  };

  const writeGrouped = (list: Personel[]) => {
    if (scope === 'ana_firma') {
      for (const g of groupPersonelByGorev(list)) {
        writeGorevBanner(g.gorev, g.personeller.length);
        g.personeller.forEach(writePersonelRow);
      }
    } else if (groupByFirma && scope !== 'custom') {
      for (const group of groupRowsByFirma(list)) {
        writeFirmaBanner(group.firma, group.personeller.length);
        group.personeller.forEach(writePersonelRow);
      }
    } else if (groupByFirma && scope === 'custom' && groupRowsByFirma(list).length > 1) {
      for (const group of groupRowsByFirma(list)) {
        writeFirmaBanner(group.firma, group.personeller.length);
        group.personeller.forEach(writePersonelRow);
      }
    } else {
      list.forEach(writePersonelRow);
    }
  };

  const groupByFirma =
    options.groupByFirma ?? (scope === 'all' || scope === 'taseron');

  const aktifler = rows.filter(isAktif);
  const pasifler = rows.filter((p) => !isAktif(p));
  if (splitByDurum) {
    if (aktifler.length > 0) {
      writeDurumBanner('AKTİFLER', aktifler.length, 'aktif');
      rowIndex = 0;
      writeGrouped(aktifler);
    }
    if (pasifler.length > 0) {
      writeDurumBanner('PASİFLER', pasifler.length, 'pasif');
      rowIndex = 0;
      writeGrouped(pasifler);
    }
  } else {
    writeGrouped(rows);
  }

  const footerRow = sheet.addRow([
    `${KIBRITCI_COMPANY.shortName}  ·  ${KIBRITCI_COMPANY.web}  ·  ${KIBRITCI_COMPANY.email}`,
  ]);
  sheet.mergeCells(footerRow.number, 1, footerRow.number, colCount);
  const footerCell = footerRow.getCell(1);
  footerCell.font = { size: 8, color: { argb: LIGHT.meta }, name: 'Calibri' };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(footerCell, LIGHT.footerBg);
  footerRow.height = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const day = new Date().toISOString().slice(0, 10);
  const prefix =
    options.fileNamePrefix ||
    (scope === 'all'
      ? 'Tum_Firmalar_Personel'
      : scope === 'ana_firma'
        ? 'Ana_Firma_Personel'
        : scope === 'custom'
          ? 'Secili_Taseron_Personel'
          : 'Taseron_Firma_Personel');
  const activeSuffix = options.onlyActive ? '_Aktif' : '';
  a.download = `${safeFilePrefix(prefix)}${activeSuffix}_${day}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

export function buildPersonelListeRaporHtml(options: {
  rows: Personel[];
  title?: string;
  subtitle?: string;
  onlyActive?: boolean;
  splitByDurum?: boolean;
}): string {
  const rows = [...options.rows].sort((a, b) => {
    const firma = firmaAdiLabel(a).localeCompare(firmaAdiLabel(b), 'tr', { sensitivity: 'base' });
    if (firma !== 0) return firma;
    const gorev = displayPersonelGorev(a).localeCompare(displayPersonelGorev(b), 'tr', { sensitivity: 'base' });
    if (gorev !== 0) return gorev;
    return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' });
  });

  const total = rows.length;
  const activeCount = rows.filter(isAktif).length;
  const passiveCount = total - activeCount;
  const taseronCount = rows.filter((p) => p.firmaTipi === 'TASERON' || isTaseronPersonel(p)).length;
  const missingDocsCount = rows.filter((p) => Boolean(formatPersonelMissingDocs(p))).length;
  const splitByDurum = options.splitByDurum ?? !options.onlyActive;

  const summaryCard = (label: string, value: string | number, tone: string) => `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${tone};border-radius:8px;padding:8px 10px;background:#fff">
      <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.04em">${esc(label)}</div>
      <div style="font-size:18px;color:#0f172a;font-weight:900;line-height:1.15">${esc(value)}</div>
    </div>
  `;

  const cell = 'padding:5px 6px;border:1px solid #e2e8f0;vertical-align:top;line-height:1.25';
  const th =
    'padding:6px;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.03em';

  const firmaSectionsHtml = (list: Personel[]) => {
    const firmaGroups = new Map<string, Personel[]>();
    for (const p of list) {
      const key = firmaAdiLabel(p);
      const group = firmaGroups.get(key) || [];
      group.push(p);
      firmaGroups.set(key, group);
    }
    return Array.from(firmaGroups.entries())
      .map(([firma, group]) => {
        const bodyRows = group
          .map((p, index) => {
            const missingDocs = formatPersonelMissingDocs(p);
            const active = isAktif(p);
            const kadroGun = countPersonelKadroGun(p);
            const maas = formatMaasValue(p);
            return `<tr>
            <td style="${cell};text-align:center;color:#64748b;width:28px">${index + 1}</td>
            <td style="${cell};font-weight:800;color:#0f172a">${esc(p.ad)} ${esc(p.soyad)}<br/><span style="font-weight:600;color:#64748b;font-size:10px">${esc(firmaTipiLabel(p))}</span></td>
            <td style="${cell};font-family:ui-monospace,Consolas,monospace;font-size:10px">${esc(p.tcNo || '-')}</td>
            <td style="${cell}">${esc(displayPersonelGorev(p) || '-')}<br/><span style="color:#64748b;font-size:10px">${esc(p.departman || '-')}</span></td>
            <td style="${cell}">${esc(p.telefonNo || '-')}</td>
            <td style="${cell}">${esc(p.iseGirisTarihi || '-')}${p.istenCikisTarihi ? `<br/><span style="color:#9f1239;font-size:10px">Çıkış: ${esc(p.istenCikisTarihi)}</span>` : `<br/><span style="color:#64748b;font-size:10px">${esc(p.sgkDurumu || '-')}</span>`}</td>
            <td style="${cell};text-align:center;font-weight:800">${kadroGun === '' ? '—' : esc(kadroGun)}</td>
            <td style="${cell};text-align:right;font-variant-numeric:tabular-nums">${esc(maas.toLocaleString('tr-TR'))}<br/><span style="color:#64748b;font-size:10px">${esc(formatUcretTipi(p))}</span></td>
            <td style="${cell};text-align:center">
              <span style="display:inline-block;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;background:${active ? '#dcfce7' : '#fee2e2'};color:${active ? '#166534' : '#991b1b'}">${active ? 'Aktif' : 'Pasif'}</span>
            </td>
            <td style="${cell};font-size:10px;color:${missingDocs ? '#9f1239' : '#166534'}">${esc(missingDocs || 'Tam')}</td>
          </tr>`;
          })
          .join('');
        return `
        <section style="break-inside:avoid;margin-top:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:8px 8px 0 0;padding:7px 10px">
            <strong style="font-size:12px;letter-spacing:.02em">${esc(firma)}</strong>
            <span style="font-size:10px;font-weight:800;background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:2px 8px">${group.length} kişi</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr>
                <th style="${th};text-align:center">#</th>
                <th style="${th}">Personel</th>
                <th style="${th}">TC</th>
                <th style="${th}">Görev / Departman</th>
                <th style="${th}">Telefon</th>
                <th style="${th}">İşe Giriş / Çıkış</th>
                <th style="${th};text-align:center">Çalışılan Gün</th>
                <th style="${th};text-align:right">Maaş</th>
                <th style="${th};text-align:center">Durum</th>
                <th style="${th}">Evrak</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </section>
      `;
      })
      .join('');
  };

  const durumBlok = (title: string, bg: string, fg: string, border: string, list: Personel[]) => {
    if (!list.length) return '';
    return `
      <div style="margin-top:16px">
        <div style="background:${bg};color:${fg};border:1px solid ${border};border-radius:8px;padding:8px 12px;font-size:13px;font-weight:900;letter-spacing:.04em;text-transform:uppercase">
          ${esc(title)} — ${list.length} kişi
        </div>
        ${firmaSectionsHtml(list)}
      </div>`;
  };

  const aktifler = rows.filter(isAktif);
  const pasifler = rows.filter((p) => !isAktif(p));
  const sections = splitByDurum
    ? `${durumBlok('Aktifler', '#dcfce7', '#14532d', '#86efac', aktifler)}${durumBlok('Pasifler', '#fee2e2', '#9f1239', '#fecaca', pasifler)}`
    : firmaSectionsHtml(rows);

  const bodyHtml = `
    <style>
      .personel-liste-rapor thead { display: table-header-group; }
      .personel-liste-rapor tr { break-inside: avoid; page-break-inside: avoid; }
      @media print {
        .personel-liste-rapor .summary-grid { grid-template-columns: repeat(4, 1fr) !important; }
      }
    </style>
    <div class="personel-liste-rapor">
      <div class="summary-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px">
        ${summaryCard('Toplam Personel', total, '#1e4e78')}
        ${summaryCard('Aktif', activeCount, '#16a34a')}
        ${summaryCard('Pasif', passiveCount, '#e11d48')}
        ${summaryCard(splitByDurum ? 'Eksik Evrak' : 'Taşeron', splitByDurum ? missingDocsCount : taseronCount, splitByDurum ? '#be123c' : '#d97706')}
      </div>
      <p style="margin:0 0 8px;color:#475569;font-size:11px;line-height:1.35">
        ${
          splitByDurum
            ? 'Aktif ve pasif personel ayrı bölümlerde listelenmiştir. Pasif kayıtlar işten ayrılmış kadrodur; aktif kadro ile karıştırılmaz.'
            : 'Liste firma bazında gruplanmış, her firma içinde görev ve ada göre sıralanmıştır.'
        }
      </p>
      ${sections}
    </div>
  `;

  return buildKibritciReportHtml({
    title: options.title || `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi`,
    subtitle: options.subtitle || 'Firma bazlı personel raporu',
    meta: [
      `Toplam personel: ${total}`,
      `Aktif: ${activeCount}`,
      `Pasif: ${passiveCount}`,
      options.onlyActive ? 'Filtre: Yalnız aktif' : 'Filtre: Aktif ve pasif ayrı listelenir',
      'Çalışılan gün: işe giriş–çıkış (çıkış yoksa bugün, uçlar dahil)',
      `Rapor tarihi: ${new Date().toLocaleString('tr-TR')}`,
    ],
    bodyHtml,
  });
}

export function openPersonelListeRaporu(options: {
  rows: Personel[];
  title?: string;
  subtitle?: string;
  onlyActive?: boolean;
  splitByDurum?: boolean;
}): number {
  if (options.rows.length === 0) {
    throw new Error('Rapor oluşturulacak personel bulunamadı. Filtreleri kontrol edin.');
  }
  const html = buildPersonelListeRaporHtml(options);
  openKibritciReportPrint(html, options.title || 'Personel Listesi Raporu');
  return options.rows.length;
}

/** Geriye dönük uyumluluk — yalnızca taşeron. */
export async function exportTaseronPersonelExcel(options: {
  personeller: Personel[];
  onlyActive?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  fileNamePrefix?: string;
}): Promise<number> {
  return exportPersonelExcel({ ...options, scope: 'taseron' });
}

/** Ana firma dahil tüm firmalar. */
export async function exportTumFirmalarPersonelExcel(options: {
  personeller: Personel[];
  onlyActive?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  fileNamePrefix?: string;
}): Promise<number> {
  return exportPersonelExcel({ ...options, scope: 'all' });
}

/** Yalnızca ana firma personeli. */
export async function exportAnaFirmaPersonelExcel(options: {
  personeller: Personel[];
  onlyActive?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  fileNamePrefix?: string;
}): Promise<number> {
  return exportPersonelExcel({ ...options, scope: 'ana_firma' });
}

/** Ekrandaki seçili / filtrelenmiş listeyi Excel olarak indir. */
export async function exportSeciliPersonelExcel(options: {
  rows: Personel[];
  title?: string;
  subtitle?: string;
  fileNamePrefix?: string;
  onlyActive?: boolean;
  splitByDurum?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  groupByFirma?: boolean;
}): Promise<number> {
  return exportPersonelExcel({
    personeller: options.rows,
    rows: options.rows,
    scope: 'custom',
    title: options.title,
    subtitle: options.subtitle,
    fileNamePrefix: options.fileNamePrefix,
    onlyActive: options.onlyActive,
    splitByDurum: options.splitByDurum ?? !options.onlyActive,
    kampKayitlari: options.kampKayitlari,
    kampOdalari: options.kampOdalari,
    groupByFirma: options.groupByFirma ?? false,
  });
}
