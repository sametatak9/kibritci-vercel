import type { KampKaydi, KampOdasi, Personel } from '../types/erp';
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
} from './yoklamaUtils';
import { formatPersonelMissingDocs } from './personelMissingDocs';
import { createExcelWorkbook } from './exceljsLoader';

export type PersonelExcelScope = 'taseron' | 'all' | 'ana_firma' | 'custom';

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
  sheetName?: string;
  onlyActive?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
  fileNamePrefix?: string;
}): Promise<number> {
  const scope: PersonelExcelScope = options.scope || 'taseron';
  let rows: Personel[];
  if (scope === 'custom' && options.rows) {
    // custom scope: çağıranın verdiği sırayı koru (örn. göreve göre sıralama / gruplama)
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
  workbook.creator = 'Kibritçi ERP';
  const sheetName =
    options.sheetName ||
    (scope === 'all'
      ? 'Tüm Firmalar'
      : scope === 'ana_firma'
        ? 'Ana Firma'
        : scope === 'custom'
          ? 'Seçili Personel'
          : 'Taşeron Personel');
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  const colCount = (includeKamp ? 13 : 12) + 1;
  sheet.mergeCells(1, 1, 1, colCount);
  const title = sheet.getCell(1, 1);
  title.value =
    options.title ||
    (scope === 'all'
      ? `${CANONICAL_ANA_FIRMA_ADI} — Tüm Firmalar Personel Listesi (Ana Firma Dahil)`
      : scope === 'ana_firma'
        ? `${CANONICAL_ANA_FIRMA_ADI} — Ana Firma Personel Listesi (Göreve Göre)`
        : scope === 'custom'
          ? `${CANONICAL_ANA_FIRMA_ADI} — Seçili Firma Personel Listesi`
          : `${CANONICAL_ANA_FIRMA_ADI} — Tüm Taşeron Firma Personeli`);
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, colCount);
  const meta = sheet.getCell(2, 1);
  const stamp = new Date().toLocaleString('tr-TR');
  meta.value = `Oluşturma: ${stamp} · Kayıt: ${rows.length}${options.onlyActive ? ' (yalnız aktif)' : ''}`;
  meta.font = { name: 'Arial', size: 10, italic: true };
  meta.alignment = { horizontal: 'center', vertical: 'middle' };

  const headers = [
    'Firma Adı',
    'Firma Tipi',
    'Ad',
    'Soyad',
    'TC No',
    'Görev',
    'Departman',
    'Telefon',
    'İşe Giriş',
    'İşten Çıkış',
    'SGK Durumu',
    'Durum',
  ];
  if (includeKamp) headers.push('Kamp Yerleşimi');
  headers.push('Eksik Evrak');

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  sheet.columns = [
    { width: 28 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    ...(includeKamp ? [{ width: 28 }] : []),
    { width: 36 },
  ];

  const writePersonelRow = (p: Personel) => {
    const values: (string | number)[] = [
      firmaAdiLabel(p),
      firmaTipiLabel(p),
      p.ad || '',
      p.soyad || '',
      p.tcNo || '',
      displayPersonelGorev(p),
      p.departman || '',
      p.telefonNo || '',
      p.iseGirisTarihi || '',
      p.istenCikisTarihi || '',
      p.sgkDurumu || '',
      isAktif(p) ? 'Aktif' : 'Pasif',
    ];
    if (includeKamp) {
      values.push(
        formatPersonelKampYerlesim(p, options.kampKayitlari || [], options.kampOdalari || []) || '—'
      );
    }
    values.push(formatPersonelMissingDocs(p) || '—');
    const row = sheet.addRow(values);
    row.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { vertical: 'middle' };
    });
  };

  if (scope === 'ana_firma') {
    const groups = groupPersonelByGorev(rows);
    for (const g of groups) {
      const banner = sheet.addRow([`${g.gorev} — ${g.personeller.length} kişi`]);
      sheet.mergeCells(banner.number, 1, banner.number, colCount);
      const cell = banner.getCell(1);
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      g.personeller.forEach(writePersonelRow);
    }
  } else {
    rows.forEach(writePersonelRow);
  }

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
          ? 'Secili_Firma_Personel'
          : 'Taseron_Firma_Personel');
  const activeSuffix = options.onlyActive ? '_Aktif' : '';
  a.download = `${prefix}${activeSuffix}_${day}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
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
  fileNamePrefix?: string;
  onlyActive?: boolean;
  kampKayitlari?: KampKaydi[];
  kampOdalari?: KampOdasi[];
}): Promise<number> {
  return exportPersonelExcel({
    personeller: options.rows,
    rows: options.rows,
    scope: 'custom',
    title: options.title,
    fileNamePrefix: options.fileNamePrefix,
    onlyActive: options.onlyActive,
    kampKayitlari: options.kampKayitlari,
    kampOdalari: options.kampOdalari,
  });
}
