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
import {
  buildKibritciReportHtml,
  openKibritciReportPrint,
} from './kibritciReportTemplate';

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

export function buildPersonelListeRaporHtml(options: {
  rows: Personel[];
  title?: string;
  subtitle?: string;
  onlyActive?: boolean;
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
  const taseronCount = rows.filter((p) => p.firmaTipi === 'TASERON' || isTaseronPersonel(p)).length;
  const missingDocsCount = rows.filter((p) => Boolean(formatPersonelMissingDocs(p))).length;

  const firmaGroups = new Map<string, Personel[]>();
  for (const p of rows) {
    const key = firmaAdiLabel(p);
    const group = firmaGroups.get(key) || [];
    group.push(p);
    firmaGroups.set(key, group);
  }

  const summaryCard = (label: string, value: string | number, tone: string) => `
    <div style="border:1px solid #e2e8f0;border-left:4px solid ${tone};border-radius:8px;padding:8px 10px;background:#fff">
      <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.04em">${esc(label)}</div>
      <div style="font-size:18px;color:#0f172a;font-weight:900;line-height:1.15">${esc(value)}</div>
    </div>
  `;

  const cell = 'padding:5px 6px;border:1px solid #e2e8f0;vertical-align:top;line-height:1.25';
  const th =
    'padding:6px;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.03em';

  const sections = Array.from(firmaGroups.entries())
    .map(([firma, group]) => {
      const bodyRows = group
        .map((p, index) => {
          const missingDocs = formatPersonelMissingDocs(p);
          const active = isAktif(p);
          return `<tr>
            <td style="${cell};text-align:center;color:#64748b;width:28px">${index + 1}</td>
            <td style="${cell};font-weight:800;color:#0f172a">${esc(p.ad)} ${esc(p.soyad)}<br/><span style="font-weight:600;color:#64748b;font-size:10px">${esc(firmaTipiLabel(p))}</span></td>
            <td style="${cell};font-family:ui-monospace,Consolas,monospace;font-size:10px">${esc(p.tcNo || '-')}</td>
            <td style="${cell}">${esc(displayPersonelGorev(p) || '-')}<br/><span style="color:#64748b;font-size:10px">${esc(p.departman || '-')}</span></td>
            <td style="${cell}">${esc(p.telefonNo || '-')}</td>
            <td style="${cell}">${esc(p.iseGirisTarihi || '-')}<br/><span style="color:#64748b;font-size:10px">${esc(p.sgkDurumu || '-')}</span></td>
            <td style="${cell};text-align:center">
              <span style="display:inline-block;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;background:${active ? '#dcfce7' : '#fee2e2'};color:${active ? '#166534' : '#991b1b'}">${active ? 'Aktif' : 'Pasif'}</span>
            </td>
            <td style="${cell};font-size:10px;color:${missingDocs ? '#9f1239' : '#166534'}">${esc(missingDocs || 'Tam')}</td>
          </tr>`;
        })
        .join('');

      return `
        <section style="break-inside:avoid;margin-top:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;background:#1e3a5f;color:#fff;border-radius:8px 8px 0 0;padding:7px 10px">
            <strong style="font-size:12px;letter-spacing:.02em">${esc(firma)}</strong>
            <span style="font-size:10px;font-weight:800;background:rgba(255,255,255,.16);border-radius:999px;padding:2px 8px">${group.length} kişi</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr>
                <th style="${th};text-align:center">#</th>
                <th style="${th}">Personel</th>
                <th style="${th}">TC</th>
                <th style="${th}">Görev / Departman</th>
                <th style="${th}">Telefon</th>
                <th style="${th}">İşe Giriş / SGK</th>
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
        ${summaryCard('Taşeron', taseronCount, '#d97706')}
        ${summaryCard('Eksik Evrak', missingDocsCount, '#e11d48')}
      </div>
      <p style="margin:0 0 8px;color:#475569;font-size:11px;line-height:1.35">
        Liste firma bazında gruplanmış, her firma içinde görev ve ada göre sıralanmıştır.
      </p>
      ${sections}
    </div>
  `;

  return buildKibritciReportHtml({
    title: options.title || `${CANONICAL_ANA_FIRMA_ADI} — Personel Listesi`,
    subtitle: options.subtitle || 'Firma bazlı personel raporu',
    meta: [
      `Toplam personel: ${total}`,
      `Aktif personel: ${activeCount}`,
      `Firma sayısı: ${firmaGroups.size}`,
      options.onlyActive ? 'Filtre: Yalnız aktif' : 'Filtre: Aktif + pasif',
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
