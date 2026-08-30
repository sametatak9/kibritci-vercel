import type { Worksheet, Workbook } from 'exceljs';
import type { SatinAlmaTalebi } from '../types/erp';
import { CORPORATE_COMPANY } from './corporateReportHtml';
import { loadKibritciLogoDataUrl } from './kibritciBrand';

const SIG_ROLES = [
  'Talep Eden',
  'Muhasebe',
  'Satın Alma Md.',
  'Şantiye Şefi',
  'Proje Müdürü',
] as const;

const PO_COLS = 7;

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function setBorder(cell: { border?: unknown }) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { docCode: string; title: string; subtitle?: string; colCount?: number }
): Promise<number> {
  const colCount = opts.colCount || PO_COLS;
  ws.getRow(1).height = 58;
  ws.getRow(2).height = 18;
  ws.mergeCells(1, 1, 2, Math.min(3, colCount));

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 168, height: 64 } });
  } else {
    ws.getCell(1, 1).value = 'KİBRİTÇİ İNŞAAT';
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  }

  const metaStart = Math.min(4, colCount);
  ws.mergeCells(1, metaStart, 1, colCount);
  const titleCell = ws.getCell(1, metaStart);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, metaStart, 2, colCount);
  const metaCell = ws.getCell(2, metaStart);
  metaCell.value = `${opts.docCode}  ·  Baskı: ${new Date().toLocaleDateString('tr-TR')}${
    opts.subtitle ? `  ·  ${opts.subtitle}` : ''
  }`;
  metaCell.font = { size: 9, color: { argb: 'FF64748B' } };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, 1, 3, colCount);
  const line = ws.getCell(3, 1);
  line.value = '';
  setFill(line, 'FF1E3A8A');
  ws.getRow(3).height = 4;

  return 5;
}

function writeFooter(ws: Worksheet, startRow: number, colCount = PO_COLS): number {
  let row = startRow + 1;
  ws.mergeCells(row, 1, row, colCount);
  setFill(ws.getCell(row, 1), 'FFF1F5F9');
  ws.getRow(row).height = 6;
  row += 1;

  ws.mergeCells(row, 1, row, colCount);
  ws.getCell(row, 1).value = CORPORATE_COMPANY.legalName;
  ws.getCell(row, 1).font = { bold: true, size: 8, color: { argb: 'FF334155' } };
  row += 1;

  ws.mergeCells(row, 1, row, colCount);
  ws.getCell(row, 1).value = CORPORATE_COMPANY.address;
  ws.getCell(row, 1).font = { size: 7, color: { argb: 'FF64748B' } };
  row += 1;

  ws.mergeCells(row, 1, row, colCount);
  ws.getCell(row, 1).value = `${CORPORATE_COMPANY.phone}  ·  ${CORPORATE_COMPANY.email}  ·  ${CORPORATE_COMPANY.website}`;
  ws.getCell(row, 1).font = { size: 7, color: { argb: 'FF475569' } };
  return row + 1;
}

function writeSignatureBar(
  ws: Worksheet,
  startRow: number,
  eImzalar?: string[],
  colCount = PO_COLS
): number {
  let row = startRow;
  ws.mergeCells(row, 1, row, colCount);
  const title = ws.getCell(row, 1);
  title.value = 'ONAY VE İMZA KANALLARI';
  title.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  title.alignment = { vertical: 'middle' };
  ws.getRow(row).height = 22;
  row += 1;

  const roleCols =
    colCount >= 7
      ? ([[1, 1], [2, 2], [3, 3], [4, 5], [6, 7]] as const)
      : ([[1, 1], [2, 2], [3, 3], [4, 4], [5, Math.max(5, colCount)]] as const);

  const headerRow = row;
  const bodyRow = row + 1;
  ws.getRow(headerRow).height = 18;
  ws.getRow(bodyRow).height = 64;

  SIG_ROLES.forEach((role, i) => {
    const pair = roleCols[i] || [i + 1, i + 1];
    const c1 = Math.min(pair[0], colCount);
    const c2 = Math.min(pair[1], colCount);
    if (c1 !== c2) {
      ws.mergeCells(headerRow, c1, headerRow, c2);
      ws.mergeCells(bodyRow, c1, bodyRow, c2);
    }
    const h = ws.getCell(headerRow, c1);
    h.value = role;
    h.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    h.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(h, 'FFF8FAFC');
    setBorder(h);

    const b = ws.getCell(bodyRow, c1);
    b.value = 'İmza Bekleniyor';
    b.font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };
    b.alignment = { horizontal: 'center', vertical: 'middle' };
    setBorder(b);
  });

  row = bodyRow + 2;

  if (eImzalar && eImzalar.length > 0) {
    ws.mergeCells(row, 1, row, colCount);
    const eCell = ws.getCell(row, 1);
    eCell.value = `DİJİTAL E-İMZA KANIT ZİNCİRİ:\n${eImzalar.map((im) => `• ${im}`).join('\n')}`;
    eCell.font = { bold: true, size: 8, color: { argb: 'FF059669' } };
    eCell.alignment = { wrapText: true, vertical: 'top' };
    setFill(eCell, 'FFECFDF5');
    setBorder(eCell);
    ws.getRow(row).height = Math.max(28, 14 + eImzalar.length * 12);
    row += 2;
  }

  return row;
}

function writePoSheet(ws: Worksheet, sa: SatinAlmaTalebi, startRow: number): number {
  let row = startRow;

  ws.mergeCells(row, 1, row, PO_COLS);
  ws.getCell(row, 1).value = 'SATIN ALMA SİPARİŞİ / PO FORMU';
  ws.getCell(row, 1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  row += 2;

  ws.mergeCells(row, 1, row, 3);
  ws.getCell(row, 1).value = 'SİPARİŞ BİLGİLERİ';
  ws.getCell(row, 1).font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
  setFill(ws.getCell(row, 1), 'FFF1F5F9');
  ws.mergeCells(row, 4, row, PO_COLS);
  ws.getCell(row, 4).value = 'TEDARİKÇİ / ŞANTİYE';
  ws.getCell(row, 4).font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
  setFill(ws.getCell(row, 4), 'FFF1F5F9');
  row += 1;

  const infoLeft = [
    `Belge Tarihi: ${sa.tarih || '-'}`,
    `Onay Durumu: ${sa.onayDurumu || '-'}`,
    `Talep Eden: ${sa.talepEden || '-'}`,
    `SA ID: ${sa.saId || '-'}`,
  ];
  const infoRight = [
    `Firma: ${sa.cariFirma || '-'}`,
    `Açıklama: ${sa.aciklama || 'Belirtilmemiş'}`,
    `Arşiv: ${sa.arsivde ? 'EVET' : 'HAYIR'}`,
    `İmzalı Evrak: ${sa.imzaliEvrakUrl ? 'VAR' : 'YOK'}`,
  ];
  for (let i = 0; i < 4; i += 1) {
    ws.mergeCells(row, 1, row, 3);
    ws.getCell(row, 1).value = infoLeft[i];
    ws.getCell(row, 1).font = { size: 9 };
    setBorder(ws.getCell(row, 1));
    ws.mergeCells(row, 4, row, PO_COLS);
    ws.getCell(row, 4).value = infoRight[i];
    ws.getCell(row, 4).font = { size: 9 };
    setBorder(ws.getCell(row, 4));
    row += 1;
  }

  row += 1;
  const header = ['#', 'Malzeme / Ürün Adı', 'Miktar', 'Birim', 'Marka / Üretici', 'Kullanılacak Yer', 'Kalem Notu'];
  header.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    setFill(cell, 'FF1E3A8A');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setBorder(cell);
  });
  ws.getRow(row).height = 20;
  row += 1;

  const kalemler = sa.kalemler || [];
  if (kalemler.length === 0) {
    ws.mergeCells(row, 1, row, PO_COLS);
    ws.getCell(row, 1).value = 'Kalem bulunmuyor.';
    ws.getCell(row, 1).font = { italic: true, color: { argb: 'FF64748B' } };
    row += 1;
  } else {
    kalemler.forEach((k, idx) => {
      const vals = [
        idx + 1,
        k.urunAdi || '',
        k.miktar ?? '',
        k.birim || '',
        k.marka || 'Belirtilmemiş',
        k.kullanilacakYer || 'Genel Şantiye',
        k.aciklama || '',
      ];
      vals.forEach((v, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = v as string | number;
        cell.font = { size: 9 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        setBorder(cell);
        if (idx % 2 === 1) setFill(cell, 'FFF8FAFC');
      });
      row += 1;
    });
  }

  row += 1;
  row = writeSignatureBar(ws, row, sa.eImzalar, PO_COLS);
  row = writeFooter(ws, row, PO_COLS);
  return row;
}

function applyColumnWidths(ws: Worksheet) {
  ws.columns = [
    { width: 6 },
    { width: 34 },
    { width: 10 },
    { width: 10 },
    { width: 18 },
    { width: 18 },
    { width: 24 },
  ];
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function safeSheetName(name: string, used: Set<string>): string {
  let s = String(name || 'Sayfa')
    .replace(/[\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31);
  if (!s) s = 'Sayfa';
  let base = s;
  let i = 2;
  while (used.has(s.toLowerCase())) {
    s = `${base.slice(0, 27)} ${i}`.slice(0, 31);
    i += 1;
  }
  used.add(s.toLowerCase());
  return s;
}

/** Tek / seçili talepler — PDF ile aynı antet + imza barı düzeni */
export async function exportSatinAlmaTaleplerExcel(
  rows: SatinAlmaTalebi[],
  fileName: string
): Promise<void> {
  if (!rows.length) throw new Error('Dışa aktarılacak satın alma talebi yok.');
  const { createExcelWorkbook } = await import('./exceljsLoader');
  const wb = await createExcelWorkbook();
  wb.creator = 'Kibritçi ERP';
  wb.created = new Date();

  const used = new Set<string>();

  if (rows.length === 1) {
    const sa = rows[0];
    const ws = wb.addWorksheet(safeSheetName(sa.saId || 'PO', used));
    applyColumnWidths(ws);
    const start = await applyAntet(wb, ws, {
      docCode: `BELGE NO: ${sa.saId || '-'}`,
      title: 'SATIN ALMA SİPARİŞİ',
      subtitle: sa.cariFirma || '',
    });
    writePoSheet(ws, sa, start);
  } else {
    for (const sa of rows) {
      const ws = wb.addWorksheet(safeSheetName(sa.saId || 'PO', used));
      applyColumnWidths(ws);
      const start = await applyAntet(wb, ws, {
        docCode: `BELGE NO: ${sa.saId || '-'}`,
        title: 'SATIN ALMA SİPARİŞİ',
        subtitle: sa.cariFirma || '',
      });
      writePoSheet(ws, sa, start);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, fileName);
}

/** Toplu liste raporu — antetli özet sayfalar */
export async function exportSatinAlmaListeExcel(talepler: SatinAlmaTalebi[]): Promise<void> {
  const { createExcelWorkbook } = await import('./exceljsLoader');
  const wb = await createExcelWorkbook();
  wb.creator = 'Kibritçi ERP';
  wb.created = new Date();

  const current = talepler.filter((t) => !t.arsivde);
  const archive = talepler.filter((t) => t.arsivde);

  const buildListSheet = async (name: string, data: SatinAlmaTalebi[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [
      { width: 22 },
      { width: 14 },
      { width: 24 },
      { width: 20 },
      { width: 18 },
      { width: 10 },
      { width: 12 },
      { width: 36 },
      { width: 12 },
    ];
    const start = await applyAntet(wb, ws, {
      docCode: `LİSTE: ${name}`,
      title: 'SATIN ALMA TALEPLERİ',
      subtitle: `${data.length} kayıt`,
      colCount: 9,
    });

    let row = start;
    ws.mergeCells(row, 1, row, 9);
    ws.getCell(row, 1).value = name.toLocaleUpperCase('tr-TR');
    ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
    row += 2;

    const headers = [
      'SA ID',
      'Tarih',
      'Cari Firma',
      'Talep Eden',
      'Durum',
      'Arşiv',
      'Kalem Sayısı',
      'Açıklama',
      'İmzalı Evrak',
    ];
    headers.forEach((h, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      setFill(cell, 'FF1E3A8A');
      setBorder(cell);
    });
    row += 1;

    data.forEach((sa, idx) => {
      const vals = [
        sa.saId,
        sa.tarih,
        sa.cariFirma,
        sa.talepEden,
        sa.onayDurumu,
        sa.arsivde ? 'EVET' : 'HAYIR',
        sa.kalemler?.length || 0,
        sa.aciklama || '',
        sa.imzaliEvrakUrl ? 'VAR' : 'YOK',
      ];
      vals.forEach((v, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = v as string | number;
        cell.font = { size: 9 };
        setBorder(cell);
        if (idx % 2 === 1) setFill(cell, 'FFF8FAFC');
      });
      row += 1;
    });

    row += 1;
    row = writeSignatureBar(ws, row, undefined, 9);
    writeFooter(ws, row, 9);
  };

  await buildListSheet('Mevcut Talepler', current);
  await buildListSheet('Arşiv Talepler', archive);

  const lines = wb.addWorksheet('Kalem Dökümü');
  lines.columns = [
    { width: 22 },
    { width: 14 },
    { width: 20 },
    { width: 32 },
    { width: 12 },
    { width: 10 },
    { width: 18 },
    { width: 18 },
    { width: 28 },
    { width: 16 },
    { width: 10 },
  ];
  const lineStart = await applyAntet(wb, lines, {
    docCode: 'KALEM DÖKÜMÜ',
    title: 'SATIN ALMA KALEM RAPORU',
    colCount: 11,
  });
  let lr = lineStart;
  const lineHeaders = [
    'SA ID',
    'Tarih',
    'Cari',
    'Ürün',
    'Miktar',
    'Birim',
    'Marka',
    'Kullanım Yeri',
    'Kalem Notu',
    'Durum',
    'Arşiv',
  ];
  lineHeaders.forEach((h, i) => {
    const cell = lines.getCell(lr, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    setFill(cell, 'FF0F172A');
    setBorder(cell);
  });
  lr += 1;

  talepler.forEach((sa) => {
    (sa.kalemler || []).forEach((k) => {
      const vals = [
        sa.saId,
        sa.tarih,
        sa.cariFirma,
        k.urunAdi,
        k.miktar,
        k.birim,
        k.marka || '',
        k.kullanilacakYer || '',
        k.aciklama || '',
        sa.onayDurumu,
        sa.arsivde ? 'EVET' : 'HAYIR',
      ];
      vals.forEach((v, i) => {
        const cell = lines.getCell(lr, i + 1);
        cell.value = v as string | number;
        cell.font = { size: 9 };
        setBorder(cell);
      });
      lr += 1;
    });
  });
  lr += 1;
  lr = writeSignatureBar(lines, lr, undefined, 11);
  writeFooter(lines, lr, 11);

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `SatinAlma_Rapor_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
