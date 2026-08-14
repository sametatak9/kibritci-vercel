/**
 * Puantaj — seçili ayın aktif personel listesi (görev + T.C.).
 * Grup ve göreve göre ayrılmış Kibritçi antetli Excel.
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { AylikYoklamaMap, Personel } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { displayPersonelGorev } from './guvenlikHelpers';
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
  isPersonelVisibleInMonth,
  isTaseronPersonel,
} from './yoklamaUtils';

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
  if (isTaseronPersonel(p)) return ad || 'TAŞERON';
  return ad || CANONICAL_ANA_FIRMA_ADI;
}

export function collectAktifPersonelForMonth(
  personeller: Personel[],
  year: number,
  month: number,
  yoklamalar?: AylikYoklamaMap
): Personel[] {
  return (personeller || [])
    .filter((p) => isAktifPersonel(p))
    .filter((p) => isPersonelVisibleInMonth(p, year, month, yoklamalar?.[p.id]))
    .slice()
    .sort(sortByName);
}

type GorevBucket = { gorev: string; personeller: Personel[] };
type GrupBucket = { grup: PersonelGorevGrup; label: string; gorevler: GorevBucket[]; kisi: number };
type KadroBucket = { kadro: 'ANA_FIRMA' | 'TASERON'; label: string; gruplar: GrupBucket[]; kisi: number };

function groupAktifPersonel(rows: Personel[]): KadroBucket[] {
  const kadrolar: Array<{ kadro: 'ANA_FIRMA' | 'TASERON'; label: string; pool: Personel[] }> = [
    {
      kadro: 'ANA_FIRMA',
      label: `ANA FİRMA — ${CANONICAL_ANA_FIRMA_ADI}`,
      pool: rows.filter((p) => !isTaseronPersonel(p)),
    },
    {
      kadro: 'TASERON',
      label: 'TAŞERON KADROSU',
      pool: rows.filter((p) => isTaseronPersonel(p)),
    },
  ];

  return kadrolar
    .filter((k) => k.pool.length > 0)
    .map((k) => {
      const byGrup = new Map<PersonelGorevGrup, Personel[]>();
      for (const p of k.pool) {
        const grup = resolvePersonelGorevGrubu(p);
        const list = byGrup.get(grup) || [];
        list.push(p);
        byGrup.set(grup, list);
      }
      const gruplar: GrupBucket[] = PERSONEL_GOREV_GRUP_ORDER.filter((g) => byGrup.has(g)).map((grup) => {
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
      return { kadro: k.kadro, label: k.label, gruplar, kisi: k.pool.length };
    });
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; metaLine: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(4, opts.colCount);
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
 * Seçili ayın aktif personelini grup + göreve göre antetli Excel olarak indirir.
 * @returns kişi sayısı
 */
export async function exportAktifPersonelListeExcel(options: {
  personeller: Personel[];
  year: number;
  month: number;
  yoklamalar?: AylikYoklamaMap;
}): Promise<number> {
  const { year, month } = options;
  const rows = collectAktifPersonelForMonth(
    options.personeller,
    year,
    month,
    options.yoklamalar
  );
  if (rows.length === 0) {
    throw new Error('Bu dönemde listelenecek aktif personel bulunamadı.');
  }

  const ayAdi = AY_ADLARI[month - 1] || String(month);
  const donem = `${ayAdi} ${year}`;
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
    title: `AKTİF PERSONEL LİSTESİ — ${donem.toLocaleUpperCase('tr-TR')}`,
    subtitle: 'Yalnız aktif kadro · grup ve göreve göre ayrılmış · T.C. kimlik no ile',
    metaLine: `Dönem: ${donem} · Toplam: ${rows.length} kişi · Oluşturma: ${stamp}`,
    colCount: 6,
  });

  writeTableHeader(ws, headerRow);

  let sira = 0;
  for (const kadro of groups) {
    writeBanner(ws, `${kadro.label}  ·  ${kadro.kisi} kişi`, 'FF0F2744', 'FFF4EAD5', 12, 6);
    for (const grup of kadro.gruplar) {
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
  }

  const ozet = wb.addWorksheet('Özet', {
    views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
  });
  ozet.columns = [{ width: 28 }, { width: 18 }, { width: 28 }, { width: 10 }];
  await applyAntet(wb, ozet, {
    title: `AKTİF PERSONEL ÖZETİ — ${donem.toLocaleUpperCase('tr-TR')}`,
    subtitle: 'Kadro · grup · görev kırılımı',
    metaLine: `Dönem: ${donem} · Toplam: ${rows.length} kişi · Oluşturma: ${stamp}`,
    colCount: 4,
  });
  const ozetHeaders = ['Kadro', 'Grup', 'Görev', 'Kişi'];
  ozetHeaders.forEach((h, i) => {
    const cell = ozet.getCell(10, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  for (const kadro of groups) {
    for (const grup of kadro.gruplar) {
      for (const gorev of grup.gorevler) {
        const r = ozet.addRow([kadro.label, grup.label, gorev.gorev, gorev.personeller.length]);
        r.eachCell((cell, col) => {
          cell.font = { name: 'Arial', size: 10 };
          cell.border = thinBorder();
          cell.alignment = { vertical: 'middle', horizontal: col === 4 ? 'center' : 'left' };
        });
      }
    }
  }
  const tot = ozet.addRow(['TOPLAM', '', '', rows.length]);
  tot.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    setFill(cell, 'FFE2E8F0');
    cell.border = thinBorder();
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_Aktif_Personel_${ayAdi}_${year}.xlsx`
  );
  return rows.length;
}
