/**
 * Puantaj — tarih aralığında aktif Kibritçi personel listesi ve yoklama Excel’i.
 * Taşeron yok; grup ve göreve göre antetli.
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { displayPersonelGorev } from './guvenlikHelpers';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import {
  KIBRITCI_COMPANY,
  loadKibritciAntetDataUrl,
  loadKibritciLogoDataUrl,
} from './kibritciBrand';
import {
  PERSONEL_GOREV_GRUP_ORDER,
  personelGorevGrupLabel,
  resolvePersonelGorevGrubu,
  type PersonelGorevGrup,
} from './personelGorevGrupUtils';
import {
  CANONICAL_ANA_FIRMA_ADI,
  getYoklamaDay,
  isDayActiveForPersonel,
  isIdariPersonel,
  isGorevsizPersonel,
  isPersonelActiveInDateRange,
  isSeramikEkibiPersonel,
  isTaseronPersonel,
} from './yoklamaUtils';

function pngBase64(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  const stripped = dataUrl.replace(/^data:image\/png;base64,/i, '');
  return stripped || null;
}

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  };
}

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
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

function isAktifPersonel(p: Personel): boolean {
  if (p.durum === false) return false;
  const durum = String(p.durum ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  if (durum === 'PASIF' || durum === 'FALSE' || durum === '0') return false;
  const onay = String(p.onayDurumu || '').toLocaleUpperCase('tr-TR');
  if (onay.includes('BEKLIYOR') || onay.includes('RED')) return false;
  return p.durum === true || durum === 'TRUE' || durum === 'AKTIF' || durum === '';
}

function sortByName(a: Personel, b: Personel): number {
  return `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' });
}

function firmaEtiketi(p: Personel): string {
  const ad = String(p.firmaAdi || '').trim();
  return ad || CANONICAL_ANA_FIRMA_ADI;
}

export function collectAktifAnaFirmaPersonelForRange(
  personeller: Personel[],
  startDate: string,
  endDate: string
): Personel[] {
  const start = normalizeDateKey(startDate);
  const end = normalizeDateKey(endDate);
  return (personeller || [])
    .filter((p) => !isTaseronPersonel(p))
    .filter((p) => isAktifPersonel(p))
    .filter((p) => isPersonelActiveInDateRange(p, start, end))
    .slice()
    .sort(sortByName);
}

/** Bugün kadroda görünen aktif Kibritçi personeli (taşeron yok). */
export function collectAktifAnaFirmaPersonelNow(personeller: Personel[]): Personel[] {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return collectAktifAnaFirmaPersonelForRange(personeller, today, today);
}

/** Aralık yoklama raporu: Kibritçi saha (idari / taşeron / seramik ekibi yok). */
export function isAralikYoklamaSahaPersonel(p: Personel): boolean {
  return !isTaseronPersonel(p) && !isIdariPersonel(p) && !isGorevsizPersonel(p) && !isSeramikEkibiPersonel(p);
}

export function collectAralikYoklamaSahaPersonel(
  personeller: Personel[],
  startDate: string,
  endDate: string
): Personel[] {
  return collectAktifAnaFirmaPersonelForRange(personeller, startDate, endDate).filter(
    isAralikYoklamaSahaPersonel
  );
}

/** Personel ekle araması — pasif kayıtlar da bulunur, idari/taşeron gelmez. */
export function collectAralikYoklamaSahaHavuz(personeller: Personel[]): Personel[] {
  return (personeller || []).filter(isAralikYoklamaSahaPersonel).slice().sort(sortByName);
}

type GorevBucket = { gorev: string; personeller: Personel[] };
type GrupBucket = { grup: PersonelGorevGrup; label: string; gorevler: GorevBucket[]; kisi: number };

function groupAktifPersonel(rows: Personel[]): GrupBucket[] {
  const byGrup = new Map<PersonelGorevGrup, Personel[]>();
  for (const p of rows) {
    const grup = resolvePersonelGorevGrubu(p);
    const list = byGrup.get(grup) || [];
    list.push(p);
    byGrup.set(grup, list);
  }
  return PERSONEL_GOREV_GRUP_ORDER.filter((g) => byGrup.has(g)).map((grup) => {
    const people = (byGrup.get(grup) || []).slice().sort(sortByName);
    const byGorev = new Map<string, Personel[]>();
    for (const p of people) {
      const gorev = displayPersonelGorev(p) || 'BELİRTİLMEDİ';
      const list = byGorev.get(gorev) || [];
      list.push(p);
      byGorev.set(gorev, list);
    }
    const gorevler: GorevBucket[] = Array.from(byGorev.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'tr', { sensitivity: 'base' }))
      .map(([gorev, personeller]) => ({ gorev, personeller }));
    return {
      grup,
      label: personelGorevGrupLabel(grup),
      gorevler,
      kisi: people.length,
    };
  });
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; metaLine: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(3, opts.colCount);
  const [antetDataUrl, logoDataUrl] = await Promise.all([
    loadKibritciAntetDataUrl(),
    loadKibritciLogoDataUrl(),
  ]);
  const antetB64 = pngBase64(antetDataUrl);
  const logoB64 = pngBase64(logoDataUrl);

  ws.getRow(1).height = 28;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 16;

  if (antetB64) {
    const antetId = wb.addImage({ base64: antetB64, extension: 'png' });
    ws.addImage(antetId, {
      tl: { col: 0.05, row: 0.06 },
      ext: { width: 380, height: 56 },
    });
  }
  if (logoB64) {
    const logoId = wb.addImage({ base64: logoB64, extension: 'png' });
    ws.addImage(logoId, {
      tl: { col: Math.max(colCount - 1.85, 2.8), row: 0.08 },
      ext: { width: 112, height: 44 },
    });
  }
  if (!antetB64 && !logoB64) {
    ws.mergeCells(1, 1, 2, 3);
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E4E78' } };
    ws.getCell(1, 1).alignment = { vertical: 'middle' };
  }

  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).value =
    `${KIBRITCI_COMPANY.legalName}  ·  ${KIBRITCI_COMPANY.phone}  ·  ${KIBRITCI_COMPANY.email}`;
  ws.getCell(3, 1).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  setFill(ws.getCell(4, 1), 'FF1E4E78');
  ws.getRow(4).height = 5;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
  ws.getCell(5, 1).alignment = { wrapText: true };
  ws.getRow(5).height = 18;

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value = opts.title;
  ws.getCell(6, 1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  ws.getCell(6, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(ws.getCell(6, 1), 'FFF1F5F9');
  ws.getRow(6).height = 22;

  ws.mergeCells(7, 1, 7, colCount);
  ws.getCell(7, 1).value = opts.subtitle;
  ws.getCell(7, 1).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(7, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(8, 1, 8, colCount);
  ws.getCell(8, 1).value = opts.metaLine;
  ws.getCell(8, 1).font = { size: 8, color: { argb: 'FF64748B' } };

  ws.headerFooter = {
    oddHeader: `&L${KIBRITCI_COMPANY.shortName}&CAktif Personel Listesi&R&D`,
    oddFooter: `&L${KIBRITCI_COMPANY.web}&C&P / &N&R${KIBRITCI_COMPANY.email}`,
  };
  ws.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.45, right: 0.45, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  return 10;
}

function writeTableHeader(ws: Worksheet, row: number) {
  const headers = ['#', 'Ad Soyad', 'T.C. Kimlik No', 'Görev', 'Firma', 'İşe Giriş'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  ws.getRow(row).height = 20;
}

function writeBanner(
  ws: Worksheet,
  text: string,
  bg: string,
  fg: string,
  size: number,
  colCount: number
) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  const cell = row.getCell(1);
  cell.font = { name: 'Arial', size, bold: true, color: { argb: fg } };
  setFill(cell, bg);
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = thinBorder();
  row.height = size >= 12 ? 22 : 18;
}

/**
 * Seçili tarih aralığındaki aktif Kibritçi (ana firma) personelini
 * grup + göreve göre antetli Excel olarak indirir. Taşeron dahil edilmez.
 */
export async function exportAktifPersonelListeExcel(options: {
  personeller: Personel[];
  startDate: string;
  endDate: string;
}): Promise<number> {
  let start = normalizeDateKey(options.startDate);
  let end = normalizeDateKey(options.endDate);
  if (!start || !end) {
    throw new Error('Başlangıç ve bitiş tarihi seçin.');
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const rows = collectAktifAnaFirmaPersonelForRange(options.personeller, start, end);
  if (rows.length === 0) {
    throw new Error('Bu tarih aralığında listelenecek aktif Kibritçi personeli bulunamadı.');
  }

  const donem =
    start === end
      ? formatDateLabelTr(start)
      : `${formatDateLabelTr(start)} — ${formatDateLabelTr(end)}`;
  const groups = groupAktifPersonel(rows);
  const stamp = new Date().toLocaleString('tr-TR');

  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.title = `Aktif Personel Listesi — ${donem}`;

  const ws = wb.addWorksheet('Aktif Personel', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  ws.columns = [
    { width: 6 },
    { width: 28 },
    { width: 16 },
    { width: 22 },
    { width: 24 },
    { width: 14 },
  ];

  const headerRow = await applyAntet(wb, ws, {
    title: `AKTİF ANA FİRMA PERSONELİ — ${donem}`,
    subtitle: `${CANONICAL_ANA_FIRMA_ADI} · taşeron hariç · grup ve göreve göre · T.C. kimlik no`,
    metaLine: `Dönem: ${donem} · Toplam: ${rows.length} kişi · Oluşturma: ${stamp}`,
    colCount: 6,
  });

  writeTableHeader(ws, headerRow);

  let sira = 0;
  writeBanner(
    ws,
    `${CANONICAL_ANA_FIRMA_ADI}  ·  ${rows.length} kişi`,
    'FF0F2744',
    'FFF4EAD5',
    12,
    6
  );
  for (const grup of groups) {
    writeBanner(
      ws,
      `Grup: ${grup.label}  ·  ${grup.kisi} kişi`,
      'FF1E4E78',
      'FFFFFFFF',
      11,
      6
    );
    for (const gorev of grup.gorevler) {
      writeBanner(
        ws,
        `Görev: ${gorev.gorev}  ·  ${gorev.personeller.length} kişi`,
        'FFECFDF5',
        'FF065F46',
        10,
        6
      );
      for (const p of gorev.personeller) {
        sira += 1;
        const excelRow = ws.addRow([
          sira,
          `${p.ad || ''} ${p.soyad || ''}`.trim(),
          String(p.tcNo || '').trim() || '—',
          displayPersonelGorev(p),
          firmaEtiketi(p),
          p.iseGirisTarihi || '—',
        ]);
        excelRow.height = 18;
        excelRow.eachCell((cell, col) => {
          cell.font = {
            name: 'Arial',
            size: 10,
            bold: col === 2,
            color: { argb: 'FF0F172A' },
          };
          cell.border = thinBorder();
          cell.alignment = {
            vertical: 'middle',
            horizontal: col === 1 || col === 3 || col === 6 ? 'center' : 'left',
          };
          if (sira % 2 === 0) setFill(cell, 'FFF8FAFC');
          if (col === 3) cell.numFmt = '@';
        });
      }
    }
  }

  const ozet = wb.addWorksheet('Özet', {
    views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
  });
  ozet.columns = [{ width: 18 }, { width: 28 }, { width: 10 }];
  await applyAntet(wb, ozet, {
    title: `AKTİF ANA FİRMA ÖZETİ — ${donem}`,
    subtitle: `${CANONICAL_ANA_FIRMA_ADI} · grup · görev kırılımı (taşeron yok)`,
    metaLine: `Dönem: ${donem} · Toplam: ${rows.length} kişi · Oluşturma: ${stamp}`,
    colCount: 3,
  });
  const ozetHeaders = ['Grup', 'Görev', 'Kişi'];
  ozetHeaders.forEach((h, i) => {
    const cell = ozet.getCell(10, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  for (const grup of groups) {
    for (const gorev of grup.gorevler) {
      const r = ozet.addRow([grup.label, gorev.gorev, gorev.personeller.length]);
      r.eachCell((cell, col) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = thinBorder();
        cell.alignment = { vertical: 'middle', horizontal: col === 3 ? 'center' : 'left' };
      });
    }
  }
  const tot = ozet.addRow(['TOPLAM', '', rows.length]);
  tot.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    setFill(cell, 'FFE2E8F0');
    cell.border = thinBorder();
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Aktif_Personel_${start.replace(/-/g, '')}_${end.replace(/-/g, '')}.xlsx`
  );
  return rows.length;
}

const WEEKDAY_TR = ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
export const MAX_ARALIK_YOKLAMA_GUN = 62;

type RangeDay = { key: string; y: number; m: number; d: number; label: string; wd: string };

function listDaysInRange(start: string, end: string): RangeDay[] {
  const days: RangeDay[] = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cursor.getTime() <= last.getTime()) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const d = cursor.getDate();
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({
      key,
      y,
      m,
      d,
      label: `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`,
      wd: WEEKDAY_TR[cursor.getDay()],
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function toStatusSymbol(durum?: YoklamaDurum | string): string {
  if (durum === 'Geldi') return 'G';
  if (durum === 'Yok') return 'Y';
  if (durum === 'İzinli') return 'İ';
  if (durum === 'Raporlu') return 'R';
  if (durum === 'Pazar') return 'P';
  if (durum === 'Tatil') return 'T';
  return '-';
}

function statusFill(durum?: YoklamaDurum | string): string {
  if (durum === 'Geldi') return 'FFDCFCE7';
  if (durum === 'Yok') return 'FFFEE2E2';
  if (durum === 'İzinli') return 'FFDBEAFE';
  if (durum === 'Raporlu') return 'FFFEF9C3';
  if (durum === 'Pazar' || durum === 'Tatil') return 'FFFED7AA';
  return 'FFF8FAFC';
}

function normalizeRange(startDate: string, endDate: string): { start: string; end: string } {
  let start = normalizeDateKey(startDate);
  let end = normalizeDateKey(endDate);
  if (!start || !end) {
    throw new Error('Başlangıç ve bitiş tarihi seçin.');
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { start, end };
}

function resolveAralikYoklamaRows(
  personeller: Personel[],
  start: string,
  end: string,
  selectedIds?: string[]
): Personel[] {
  if (!selectedIds) {
    return collectAralikYoklamaSahaPersonel(personeller, start, end);
  }
  const byId = new Map((personeller || []).map((p) => [p.id, p]));
  const seen = new Set<string>();
  const rows: Personel[] = [];
  for (const id of selectedIds) {
    if (!id || seen.has(id)) continue;
    const p = byId.get(id);
    if (!p || !isAralikYoklamaSahaPersonel(p)) continue;
    seen.add(id);
    rows.push(p);
  }
  return rows;
}

/**
 * Seçili aralığın saha yoklamasını antetli Excel’e döker.
 * İdari / taşeron yok; personel listesi seçimle daraltılabilir.
 */
export async function exportAralikYoklamaExcel(options: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  startDate: string;
  endDate: string;
  selectedIds?: string[];
}): Promise<number> {
  const { start, end } = normalizeRange(options.startDate, options.endDate);
  const days = listDaysInRange(start, end);
  if (days.length === 0) {
    throw new Error('Geçerli bir tarih aralığı seçin.');
  }
  if (days.length > MAX_ARALIK_YOKLAMA_GUN) {
    throw new Error(`En fazla ${MAX_ARALIK_YOKLAMA_GUN} günlük yoklama dökülebilir. Aralığı kısaltın.`);
  }

  const rows = resolveAralikYoklamaRows(
    options.personeller,
    start,
    end,
    options.selectedIds
  );
  if (rows.length === 0) {
    throw new Error(
      options.selectedIds
        ? 'Excel için en az bir saha personeli seçin.'
        : 'Bu tarih aralığında dökülecek aktif Kibritçi saha kadrosu bulunamadı.'
    );
  }

  const donem =
    start === end
      ? formatDateLabelTr(start)
      : `${formatDateLabelTr(start)} — ${formatDateLabelTr(end)}`;
  const groups = groupAktifPersonel(rows);
  const stamp = new Date().toLocaleString('tr-TR');
  const identCols = 5;
  const totalCols = identCols + days.length + 2;

  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.title = `Yoklama Puantaj — ${donem}`;

  const ws = wb.addWorksheet('Yoklama', {
    views: [{ state: 'frozen', ySplit: 11, xSplit: identCols, showGridLines: false }],
  });
  ws.columns = [
    { width: 5 },
    { width: 26 },
    { width: 14 },
    { width: 20 },
    { width: 12 },
    ...days.map(() => ({ width: 5.2 })),
    { width: 8 },
    { width: 8 },
  ];

  const headerRow = await applyAntet(wb, ws, {
    title: `YOKLAMA / PUANTAJ — ${donem}`,
    subtitle: `${CANONICAL_ANA_FIRMA_ADI} · saha kadrosu · görev/nitelik grubu · T.C. · G Geldi · Y Yok · İ İzinli · R Raporlu · P Pazar · T Tatil`,
    metaLine: `Dönem: ${donem} · ${days.length} gün · ${rows.length} seçili saha personeli · Oluşturma: ${stamp}`,
    colCount: totalCols,
  });
  ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow + 1}`;
  ws.headerFooter = {
    oddHeader: `&L${KIBRITCI_COMPANY.shortName}&CYoklama / Puantaj&R&D`,
    oddFooter: `&L${KIBRITCI_COMPANY.web}&C&P / &N&R${KIBRITCI_COMPANY.email}`,
  };

  const head1 = headerRow;
  const head2 = headerRow + 1;
  const identHeaders = ['#', 'Ad Soyad', 'T.C. Kimlik No', 'Görev', 'Grup'];
  identHeaders.forEach((h, i) => {
    ws.mergeCells(head1, i + 1, head2, i + 1);
    const cell = ws.getCell(head1, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  days.forEach((day, idx) => {
    const col = identCols + idx + 1;
    const c1 = ws.getCell(head1, col);
    c1.value = day.label;
    c1.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(c1, day.wd === 'Pa' ? 'FF9A3412' : 'FF1E4E78');
    c1.border = thinBorder();
    const c2 = ws.getCell(head2, col);
    c2.value = day.wd;
    c2.font = { bold: true, size: 7, color: { argb: 'FFF4EAD5' } };
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(c2, day.wd === 'Pa' ? 'FF7C2D12' : 'FF0F2744');
    c2.border = thinBorder();
  });
  ['Gelen', 'Mesai'].forEach((h, i) => {
    const col = identCols + days.length + i + 1;
    ws.mergeCells(head1, col, head2, col);
    const cell = ws.getCell(head1, col);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(cell, 'FF0F2744');
    cell.border = thinBorder();
  });
  ws.getRow(head1).height = 16;
  ws.getRow(head2).height = 14;

  let sira = 0;
  writeBanner(
    ws,
    `${CANONICAL_ANA_FIRMA_ADI}  ·  ${rows.length} kişi  ·  ${days.length} gün`,
    'FF0F2744',
    'FFF4EAD5',
    12,
    totalCols
  );

  for (const grup of groups) {
    writeBanner(
      ws,
      `Grup: ${grup.label}  ·  ${grup.kisi} kişi`,
      'FF1E4E78',
      'FFFFFFFF',
      11,
      totalCols
    );
    for (const gorev of grup.gorevler) {
      writeBanner(
        ws,
        `Görev: ${gorev.gorev}  ·  ${gorev.personeller.length} kişi`,
        'FFECFDF5',
        'FF065F46',
        10,
        totalCols
      );
      for (const p of gorev.personeller) {
        sira += 1;
        const map = options.yoklamalar[p.id];
        const excelRow = ws.addRow([]);
        const r = excelRow.number;
        ws.getCell(r, 1).value = sira;
        ws.getCell(r, 2).value = `${p.ad || ''} ${p.soyad || ''}`.trim();
        ws.getCell(r, 3).value = String(p.tcNo || '').trim() || '—';
        ws.getCell(r, 3).numFmt = '@';
        ws.getCell(r, 4).value = displayPersonelGorev(p);
        ws.getCell(r, 5).value = personelGorevGrupLabel(resolvePersonelGorevGrubu(p));

        let geldi = 0;
        let mesaiToplam = 0;
        days.forEach((day, idx) => {
          const col = identCols + idx + 1;
          const cell = ws.getCell(r, col);
          const active = isDayActiveForPersonel(p, day.y, day.m, day.d, map);
          const rec =
            getYoklamaDay(map, day.y, day.m, day.d) ||
            (map as Record<string, { durum?: YoklamaDurum; mesaiSaati?: number }> | undefined)?.[
              String(day.d)
            ];
          const durum = rec?.durum;
          const mesai = Number(rec?.mesaiSaati || 0);
          cell.border = thinBorder();
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.font = { name: 'Arial', size: 8, bold: true };
          if (!active) {
            cell.value = '—';
            setFill(cell, 'FFF1F5F9');
            cell.font = { name: 'Arial', size: 8, color: { argb: 'FF94A3B8' } };
            return;
          }
          const symbol = toStatusSymbol(durum);
          cell.value = mesai > 0 ? `${symbol}\n${mesai}` : symbol;
          setFill(cell, statusFill(durum));
          if (durum === 'Geldi') geldi += 1;
          mesaiToplam += mesai;
        });

        const geldiCell = ws.getCell(r, identCols + days.length + 1);
        geldiCell.value = geldi;
        geldiCell.font = { name: 'Arial', size: 9, bold: true };
        geldiCell.alignment = { horizontal: 'center', vertical: 'middle' };
        geldiCell.border = thinBorder();
        setFill(geldiCell, 'FFDCFCE7');

        const mesaiCell = ws.getCell(r, identCols + days.length + 2);
        mesaiCell.value = mesaiToplam > 0 ? Number(mesaiToplam.toFixed(1)) : 0;
        mesaiCell.font = { name: 'Arial', size: 9, bold: true };
        mesaiCell.alignment = { horizontal: 'center', vertical: 'middle' };
        mesaiCell.border = thinBorder();
        setFill(mesaiCell, mesaiToplam > 0 ? 'FFFEF3C7' : 'FFF8FAFC');

        for (let c = 1; c <= identCols; c++) {
          const cell = ws.getCell(r, c);
          cell.border = thinBorder();
          cell.font = {
            name: 'Arial',
            size: 9,
            bold: c === 2,
            color: { argb: 'FF0F172A' },
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal: c === 1 || c === 3 ? 'center' : 'left',
          };
          if (sira % 2 === 0 && c !== 3) setFill(cell, 'FFF8FAFC');
        }
        excelRow.height = 24;
      }
    }
  }

  const ozet = wb.addWorksheet('Görev Özeti', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  ozet.columns = [
    { width: 16 },
    { width: 24 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
  ];
  await applyAntet(wb, ozet, {
    title: `SAHA YOKLAMA ÖZETİ — ${donem}`,
    subtitle: `${CANONICAL_ANA_FIRMA_ADI} · seçili kadro · görev / nitelik kırılımı`,
    metaLine: `Dönem: ${donem} · ${rows.length} kişi · Oluşturma: ${stamp}`,
    colCount: 5,
  });
  ['Grup', 'Görev', 'Kişi', 'Gelen gün', 'Mesai saat'].forEach((h, i) => {
    const cell = ozet.getCell(10, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });

  let ozetGeldi = 0;
  let ozetMesai = 0;
  for (const grup of groups) {
    for (const gorev of grup.gorevler) {
      let geldiToplam = 0;
      let mesaiToplam = 0;
      for (const p of gorev.personeller) {
        const map = options.yoklamalar[p.id];
        days.forEach((day) => {
          if (!isDayActiveForPersonel(p, day.y, day.m, day.d, map)) return;
          const rec =
            getYoklamaDay(map, day.y, day.m, day.d) ||
            (map as Record<string, { durum?: YoklamaDurum; mesaiSaati?: number }> | undefined)?.[
              String(day.d)
            ];
          if (rec?.durum === 'Geldi') geldiToplam += 1;
          mesaiToplam += Number(rec?.mesaiSaati || 0);
        });
      }
      ozetGeldi += geldiToplam;
      ozetMesai += mesaiToplam;
      const r = ozet.addRow([
        grup.label,
        gorev.gorev,
        gorev.personeller.length,
        geldiToplam,
        Number(mesaiToplam.toFixed(1)),
      ]);
      r.eachCell((cell, col) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = thinBorder();
        cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'center' : 'left' };
      });
    }
  }
  const tot = ozet.addRow(['TOPLAM', '', rows.length, ozetGeldi, Number(ozetMesai.toFixed(1))]);
  tot.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    setFill(cell, 'FFE2E8F0');
    cell.border = thinBorder();
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Aralik_Yoklama_${start.replace(/-/g, '')}_${end.replace(/-/g, '')}.xlsx`
  );
  return rows.length;
}
