/**
 * Evrak Zinciri — Kibritçi antetli Excel (logo + SA + irsaliye + toplam ağırlık).
 */
import type { Worksheet, Workbook } from 'exceljs';
import type { Fatura, Irsaliye, SatinAlmaTalebi } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import {
  findFaturalarForIrsaliye,
  findIrsaliyelerForSa,
  irsaliyeHizmetMiktari,
  isGercekFaturaGirisi,
  isTaslakMaliBagFatura,
} from './evrakDonusum';
import {
  irsaliyeNoChainSortKey,
  malzemeTipiLabel,
  micirMalzemeTipiSortKey,
  resolveMicirMalzemeTipiFromIrsaliye,
  type MicirMalzemeTipi,
} from './micirUtils';
import type { EvrakZincirRaporInput } from './evrakZincirRapor';

const COLS = 10;

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

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { docCode: string; title: string; subtitle?: string }
): Promise<number> {
  ws.getRow(1).height = 58;
  ws.getRow(2).height = 18;
  ws.mergeCells(1, 1, 2, 3);

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 168, height: 64 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  }

  ws.mergeCells(1, 4, 1, COLS);
  const titleCell = ws.getCell(1, 4);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, 4, 2, COLS);
  const metaCell = ws.getCell(2, 4);
  metaCell.value = `${opts.docCode}  ·  ${new Date().toLocaleString('tr-TR')}${
    opts.subtitle ? `  ·  ${opts.subtitle}` : ''
  }`;
  metaCell.font = { size: 9, color: { argb: 'FF64748B' } };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, 1, 3, COLS);
  setFill(ws.getCell(3, 1), 'FF1E3A8A');
  ws.getRow(3).height = 4;

  ws.mergeCells(4, 1, 4, COLS);
  ws.getCell(4, 1).value = KIBRITCI_COMPANY.legalName;
  ws.getCell(4, 1).font = { bold: true, size: 8, color: { argb: 'FF334155' } };

  ws.mergeCells(5, 1, 5, COLS);
  ws.getCell(5, 1).value =
    `${KIBRITCI_COMPANY.address}  ·  ${KIBRITCI_COMPANY.phone}  ·  ${KIBRITCI_COMPANY.email}`;
  ws.getCell(5, 1).font = { size: 7, color: { argb: 'FF64748B' } };

  return 7;
}

function writeFooter(ws: Worksheet, startRow: number): number {
  let row = startRow + 1;
  ws.mergeCells(row, 1, row, COLS);
  setFill(ws.getCell(row, 1), 'FFF1F5F9');
  ws.getRow(row).height = 6;
  row += 1;
  ws.mergeCells(row, 1, row, COLS);
  ws.getCell(row, 1).value =
    `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.web} · Antetli evrak zinciri raporu`;
  ws.getCell(row, 1).font = { size: 7, color: { argb: 'FF64748B' } };
  return row + 1;
}

function resolveChain(input: EvrakZincirRaporInput): {
  sa?: SatinAlmaTalebi;
  irs: Irsaliye[];
  fts: Fatura[];
} {
  const { sa, irsaliyeler, faturalar, focusIrsaliyeIds } = input;
  let irs: Irsaliye[] = [];
  if (sa) irs = findIrsaliyelerForSa(sa, irsaliyeler);
  if (focusIrsaliyeIds?.length) {
    const focus = new Set(focusIrsaliyeIds);
    const focused = irsaliyeler.filter((ir) => focus.has(ir.id) || focus.has(ir.irsaliyeNo));
    if (focused.length) {
      const byId = new Map(irs.map((ir) => [ir.id, ir]));
      for (const ir of focused) byId.set(ir.id, ir);
      irs = [...byId.values()];
    }
  }
  if (!irs.length && focusIrsaliyeIds?.length) {
    const focus = new Set(focusIrsaliyeIds);
    irs = irsaliyeler.filter((ir) => focus.has(ir.id) || focus.has(ir.irsaliyeNo));
  }
  const ftMap = new Map<string, Fatura>();
  for (const ir of irs) {
    for (const ft of findFaturalarForIrsaliye(ir, faturalar)) ftMap.set(ft.id, ft);
  }
  if (sa?.saId) {
    const sid = String(sa.saId).trim();
    for (const ft of faturalar) {
      if (String(ft.saId || '').trim() === sid) ftMap.set(ft.id, ft);
    }
  }
  return { sa: sa || undefined, irs, fts: [...ftMap.values()] };
}

function sortIrsaliyelerZincir(irs: Irsaliye[]): Irsaliye[] {
  return [...irs].sort((a, b) => {
    const aTip = resolveMicirMalzemeTipiFromIrsaliye(a);
    const bTip = resolveMicirMalzemeTipiFromIrsaliye(b);
    if (aTip || bTip) {
      const ak = aTip != null ? micirMalzemeTipiSortKey(aTip) : 99;
      const bk = bTip != null ? micirMalzemeTipiSortKey(bTip) : 99;
      if (ak !== bk) return ak - bk;
    }
    const d = String(normalizeDateKey(a.tarih) || a.tarih || '').localeCompare(
      String(normalizeDateKey(b.tarih) || b.tarih || '')
    );
    if (d !== 0) return d;
    const na = irsaliyeNoChainSortKey(a.irsaliyeNo);
    const nb = irsaliyeNoChainSortKey(b.irsaliyeNo);
    if (na !== nb) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function irFaturaLabel(ir: Irsaliye, faturalar: Fatura[]): string {
  const linked = findFaturalarForIrsaliye(ir, faturalar);
  const gercek = linked.find((ft) => isGercekFaturaGirisi(ft));
  if (gercek) return `Faturaya bağlandı: ${gercek.faturaNo}`;
  const taslak = linked.find((ft) => isTaslakMaliBagFatura(ft));
  if (taslak) return `Taslak bağ: ${taslak.faturaNo}`;
  if (ir.faturaNo) return `Faturaya bağlandı: ${ir.faturaNo}`;
  return 'Fatura bekliyor';
}

function tipTonMap(irs: Irsaliye[]): Partial<Record<MicirMalzemeTipi | 'DIGER', number>> {
  const map: Partial<Record<MicirMalzemeTipi | 'DIGER', number>> = {};
  for (const ir of irs) {
    const tip = resolveMicirMalzemeTipiFromIrsaliye(ir) || 'DIGER';
    const m = irsaliyeHizmetMiktari(ir).miktar || 0;
    map[tip] = (map[tip] || 0) + m;
  }
  return map;
}

export async function exportEvrakZincirExcel(input: EvrakZincirRaporInput): Promise<{
  sevk: number;
  toplamAgirlik: number;
  fileName: string;
}> {
  const { sa, irs: rawIrs, fts } = resolveChain(input);
  const irs = sortIrsaliyelerZincir(rawIrs);
  const toplamAgirlik = irs.reduce((s, ir) => s + irsaliyeHizmetMiktari(ir).miktar, 0);
  const tipTons = tipTonMap(irs);
  const hizmetEtiket =
    irs.map((ir) => irsaliyeHizmetMiktari(ir).etiket).find((e) => e === 'ton') ||
    irs.map((ir) => irsaliyeHizmetMiktari(ir).etiket).find(Boolean) ||
    'ton';

  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.created = new Date();

  // —— ÖZET ——
  const ozet = wb.addWorksheet('ÖZET', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  ozet.columns = Array.from({ length: COLS }, (_, i) => ({
    width: [6, 16, 14, 14, 12, 14, 14, 14, 18, 22][i] || 12,
  }));

  let row = await applyAntet(wb, ozet, {
    docCode: 'EVR-ZINCIR',
    title: sa ? `Evrak Zinciri — ${sa.saId}` : `Evrak Zinciri — ${irs.length} irsaliye`,
    subtitle: 'Satın Alma → İrsaliye → Fatura',
  });

  ozet.mergeCells(row, 1, row, COLS);
  ozet.getCell(row, 1).value = 'TOPLAM AĞIRLIK / ÖZET';
  ozet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  const summaryRows: Array<[string, string | number]> = [
    ['İrsaliye adedi', irs.length],
    ['Toplam ağırlık', `${toplamAgirlik.toLocaleString('tr-TR')} ${hizmetEtiket}`],
    ['Mıcır', `${(tipTons.MICIR || 0).toLocaleString('tr-TR')} ${hizmetEtiket}`],
    ['Taş Tozu', `${(tipTons.TAS_TOZU || 0).toLocaleString('tr-TR')} ${hizmetEtiket}`],
    ['Stabilize', `${(tipTons.STABILIZE || 0).toLocaleString('tr-TR')} ${hizmetEtiket}`],
    [
      'Gerçek fatura',
      fts.filter((ft) => isGercekFaturaGirisi(ft)).length,
    ],
    [
      'Taslak bağ',
      fts.filter((ft) => isTaslakMaliBagFatura(ft)).length,
    ],
  ];
  for (const [label, val] of summaryRows) {
    ozet.getCell(row, 1).value = label;
    ozet.getCell(row, 1).font = { bold: true, size: 10 };
    ozet.mergeCells(row, 2, row, 4);
    ozet.getCell(row, 2).value = val;
    ozet.getCell(row, 2).font = { size: 10, bold: label === 'Toplam ağırlık' };
    if (label === 'Toplam ağırlık') setFill(ozet.getCell(row, 2), 'FFDBEAFE');
    row += 1;
  }
  row += 1;

  // Satın alma bloğu
  ozet.mergeCells(row, 1, row, COLS);
  ozet.getCell(row, 1).value = '1 · SATIN ALMA';
  ozet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  if (sa) {
    const saMeta: Array<[string, string]> = [
      ['SA No', sa.saId || '—'],
      ['Tarih', formatDateLabelTr(sa.tarih)],
      ['Firma', sa.cariFirma || '—'],
      ['Onay', String(sa.onayDurumu || '—')],
      ['Açıklama', String(sa.aciklama || '—')],
    ];
    for (const [k, v] of saMeta) {
      ozet.getCell(row, 1).value = k;
      ozet.getCell(row, 1).font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
      ozet.mergeCells(row, 2, row, COLS);
      ozet.getCell(row, 2).value = v;
      ozet.getCell(row, 2).font = { size: 10 };
      row += 1;
    }
    row += 1;
    const saHeaders = ['#', 'Ürün', 'Miktar', 'Birim'];
    saHeaders.forEach((h, i) => {
      const c = ozet.getCell(row, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      setFill(c, 'FF1E3A8A');
      setBorder(c);
    });
    row += 1;
    (sa.kalemler || []).forEach((k, idx) => {
      const vals = [idx + 1, k.urunAdi || '—', Number(k.miktar) || 0, k.birim || ''];
      vals.forEach((v, i) => {
        const c = ozet.getCell(row, i + 1);
        c.value = v as string | number;
        c.font = { size: 9 };
        setBorder(c);
      });
      row += 1;
    });
  } else {
    ozet.mergeCells(row, 1, row, COLS);
    ozet.getCell(row, 1).value = 'Bu seçimde bağlı satın alma yok (veya henüz eşleşmedi).';
    ozet.getCell(row, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    row += 1;
  }

  writeFooter(ozet, row + 1);

  // —— İRSALİYELER ——
  const irWs = wb.addWorksheet('İRSALİYELER', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  irWs.columns = [
    { width: 5 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 14 },
    { width: 22 },
    { width: 36 },
  ];
  let r = await applyAntet(wb, irWs, {
    docCode: 'EVR-ZINCIR-IR',
    title: 'Sevk İrsaliyeleri',
    subtitle: `Toplam ağırlık: ${toplamAgirlik.toLocaleString('tr-TR')} ${hizmetEtiket}`,
  });

  irWs.mergeCells(r, 1, r, COLS);
  irWs.getCell(r, 1).value =
    `Satın alma: ${sa?.saId || '—'} · Firma: ${sa?.cariFirma || irs[0]?.firma || '—'} · ${irs.length} irsaliye · Toplam ağırlık ${toplamAgirlik.toLocaleString('tr-TR')} ${hizmetEtiket}`;
  irWs.getCell(r, 1).font = { bold: true, size: 10 };
  setFill(irWs.getCell(r, 1), 'FFDBEAFE');
  r += 2;

  const headers = [
    '#',
    'Tarih',
    'İrsaliye No',
    'Malzeme',
    'Ağırlık',
    'Birim',
    'Plaka',
    'SA No',
    'Fatura durumu',
    'Kalem / açıklama',
  ];
  headers.forEach((h, i) => {
    const c = irWs.getCell(r, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    setFill(c, 'FF1E3A8A');
    setBorder(c);
  });
  r += 1;

  irs.forEach((ir, idx) => {
    const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
    const h = irsaliyeHizmetMiktari(ir);
    const kalem = (ir.kalemler || [])
      .map((k) => `${k.urunAdi || ''}: ${k.miktar ?? ''} ${k.birim || ''}`.trim())
      .join(' · ');
    const vals: Array<string | number> = [
      idx + 1,
      formatDateLabelTr(ir.tarih),
      ir.irsaliyeNo || '—',
      tip ? malzemeTipiLabel(tip) : ir.kaynak || '—',
      h.miktar || 0,
      h.etiket || h.birim || '',
      ir.plaka || '',
      ir.saId || sa?.saId || '',
      irFaturaLabel(ir, input.faturalar),
      kalem || '—',
    ];
    vals.forEach((v, i) => {
      const c = irWs.getCell(r, i + 1);
      c.value = v;
      c.font = { size: 9 };
      setBorder(c);
      if (i === 4 && typeof v === 'number') c.numFmt = '#,##0.00';
    });
    if (tip === 'MICIR') setFill(irWs.getCell(r, 4), 'FFD1FAE5');
    else if (tip === 'TAS_TOZU') setFill(irWs.getCell(r, 4), 'FFE7E5E4');
    else if (tip === 'STABILIZE') setFill(irWs.getCell(r, 4), 'FFFEF3C7');
    r += 1;
  });

  r += 1;
  irWs.mergeCells(r, 1, r, 3);
  irWs.getCell(r, 1).value = 'TOPLAM AĞIRLIK';
  irWs.getCell(r, 1).font = { bold: true, size: 11 };
  irWs.getCell(r, 4).value = '';
  irWs.getCell(r, 5).value = toplamAgirlik;
  irWs.getCell(r, 5).numFmt = '#,##0.00';
  irWs.getCell(r, 5).font = { bold: true, size: 11 };
  irWs.getCell(r, 6).value = hizmetEtiket;
  setFill(irWs.getCell(r, 5), 'FFDBEAFE');
  writeFooter(irWs, r + 1);

  // —— FATURALAR (varsa) ——
  if (fts.length) {
    const ftWs = wb.addWorksheet('FATURALAR');
    ftWs.columns = [
      { width: 6 },
      { width: 18 },
      { width: 12 },
      { width: 28 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 40 },
    ];
    let fr = await applyAntet(wb, ftWs, {
      docCode: 'EVR-ZINCIR-FAT',
      title: 'Mali bağ / Faturalar',
      subtitle: sa?.saId || '',
    });
    const fh = ['#', 'Fatura No', 'Tarih', 'Firma', 'Tür', 'Tutar', 'SA', 'Bağlı irsaliyeler'];
    fh.forEach((h, i) => {
      const c = ftWs.getCell(fr, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      setFill(c, 'FF1E3A8A');
      setBorder(c);
    });
    fr += 1;
    fts.forEach((ft, idx) => {
      const taslak = isTaslakMaliBagFatura(ft);
      const bagli = (ft.bagliIrsaliyeler || []).join(', ');
      const vals: Array<string | number> = [
        idx + 1,
        ft.faturaNo || '—',
        formatDateLabelTr(ft.tarih),
        ft.cariUnvan || '—',
        taslak ? 'Taslak bağ' : 'Gerçek fatura',
        Number(ft.genelToplam || ft.toplamTutar || 0),
        ft.saId || sa?.saId || '',
        bagli || '—',
      ];
      vals.forEach((v, i) => {
        const c = ftWs.getCell(fr, i + 1);
        c.value = v;
        c.font = { size: 9 };
        setBorder(c);
        if (i === 5 && typeof v === 'number') c.numFmt = '#,##0.00';
      });
      fr += 1;
    });
    writeFooter(ftWs, fr + 1);
  }

  const fileName = `Kibritci_Evrak_Zincir_${sa?.saId || 'secim'}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, fileName);
  return { sevk: irs.length, toplamAgirlik, fileName };
}
