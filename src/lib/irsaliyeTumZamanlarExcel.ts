/**
 * Cari kart — tüm zamanlar gelen irsaliye Excel’i (Kibritçi antet + logo).
 */
import type { Worksheet, Workbook } from 'exceljs';
import type { CariKart, Fatura, Irsaliye } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { findFaturalarForIrsaliye, irsaliyeHizmetMiktari, isGercekFaturaGirisi, isTaslakMaliBagFatura } from './evrakDonusum';
import { firmaEslesir } from './taseronUtils';
import {
  malzemeTipiLabel,
  micirMalzemeTipiSortKey,
  resolveMicirMalzemeTipiFromIrsaliye,
  type MicirMalzemeTipi,
} from './micirUtils';

const COLS = 16;
const AY = [
  '',
  'OCAK',
  'ŞUBAT',
  'MART',
  'NİSAN',
  'MAYIS',
  'HAZİRAN',
  'TEMMUZ',
  'AĞUSTOS',
  'EYLÜL',
  'EKİM',
  'KASIM',
  'ARALIK',
];

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

function monthTitle(ym: string): string {
  const [y, m] = ym.split('-');
  const ay = AY[Number(m)] || m;
  return y && m ? `${ay} ${y}` : 'Tarihsiz';
}

function kaynakLabel(ir: Irsaliye): string {
  const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
  if (ir.kaynak === 'VIDANJOR_FIS') return 'Vidanjör';
  if (ir.kaynak === 'YILDIRIM_TANKER_FIS') return 'Yıldırım tanker';
  if (ir.kaynak === 'MICIR_STABILIZE_FIS' || ir.kaynak === 'KAPI_EVRAK') {
    return tip ? malzemeTipiLabel(tip) : 'Kapı evrak';
  }
  return String(ir.kaynak || 'İrsaliye');
}

function faturaDurumu(ir: Irsaliye, faturalar: Fatura[]): string {
  const linked = findFaturalarForIrsaliye(ir, faturalar);
  const gercek = linked.find((ft) => isGercekFaturaGirisi(ft));
  if (gercek) return `Fatura: ${gercek.faturaNo}`;
  const taslak = linked.find((ft) => isTaslakMaliBagFatura(ft));
  if (taslak) return `Taslak bağ: ${taslak.faturaNo}`;
  if (ir.faturaNo) return `Fatura: ${ir.faturaNo}`;
  return 'Fatura bekliyor';
}

export function irsaliyelerForCariKart(irsaliyeler: Irsaliye[], cari: CariKart): Irsaliye[] {
  return irsaliyeler.filter(
    (ir) =>
      (ir.cariKartId && ir.cariKartId === cari.id) || firmaEslesir(String(ir.firma || ''), cari.unvan)
  );
}

function sortIrs(irs: Irsaliye[]): Irsaliye[] {
  return [...irs].sort((a, b) => {
    const da = String(normalizeDateKey(a.tarih) || a.tarih || '');
    const db = String(normalizeDateKey(b.tarih) || b.tarih || '');
    if (da !== db) return da.localeCompare(db);
    const aTip = resolveMicirMalzemeTipiFromIrsaliye(a);
    const bTip = resolveMicirMalzemeTipiFromIrsaliye(b);
    const ak = aTip != null ? micirMalzemeTipiSortKey(aTip) : 99;
    const bk = bTip != null ? micirMalzemeTipiSortKey(bTip) : 99;
    if (ak !== bk) return ak - bk;
    return String(a.irsaliyeNo || a.id).localeCompare(String(b.irsaliyeNo || b.id), 'tr');
  });
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

function writeFooter(ws: Worksheet, startRow: number) {
  let row = startRow + 1;
  ws.mergeCells(row, 1, row, COLS);
  setFill(ws.getCell(row, 1), 'FFF1F5F9');
  ws.getRow(row).height = 6;
  row += 1;
  ws.mergeCells(row, 1, row, COLS);
  ws.getCell(row, 1).value =
    `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.web} · Tüm zamanlar gelen irsaliye raporu`;
  ws.getCell(row, 1).font = { size: 7, color: { argb: 'FF64748B' } };
}

function writeHeaderRow(ws: Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    setFill(c, 'FF1E3A8A');
    setBorder(c);
  });
}

export type TumZamanlarHistoryRow = {
  date: string;
  type: string;
  title: string;
  desc: string;
  irsaliyeNo?: string;
  plaka?: string;
  miktar?: number;
  birim?: string;
  faturaNo?: string;
};

export async function exportIrsaliyeTumZamanlarExcel(opts: {
  cari: CariKart;
  irsaliyeler: Irsaliye[];
  faturalar?: Fatura[];
  historyLogs?: TumZamanlarHistoryRow[];
}): Promise<{ adet: number; toplamTon: number; kayit: number; fileName: string }> {
  const irs = sortIrs(irsaliyelerForCariKart(opts.irsaliyeler, opts.cari));
  const historyLogs = opts.historyLogs || [];
  if (!irs.length && !historyLogs.length) {
    throw new Error('Bu cari için raporlanacak kayıt bulunamadı.');
  }
  const faturalar = opts.faturalar || [];

  let toplamTon = 0;
  const tipMap: Partial<Record<MicirMalzemeTipi | 'DIGER', number>> = {};
  const ayMap = new Map<string, { adet: number; ton: number }>();
  for (const ir of irs) {
    const h = irsaliyeHizmetMiktari(ir);
    const miktar = h.miktar || 0;
    if (h.etiket === 'ton' || h.birim === 'TON') toplamTon += miktar;
    const tip = resolveMicirMalzemeTipiFromIrsaliye(ir) || 'DIGER';
    tipMap[tip] = (tipMap[tip] || 0) + (h.etiket === 'ton' || h.birim === 'TON' ? miktar : 0);
    const ym = (normalizeDateKey(ir.tarih) || String(ir.tarih || '')).slice(0, 7) || '0000-00';
    const cur = ayMap.get(ym) || { adet: 0, ton: 0 };
    cur.adet += 1;
    if (h.etiket === 'ton' || h.birim === 'TON') cur.ton += miktar;
    ayMap.set(ym, cur);
  }

  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.created = new Date();

  const ozet = wb.addWorksheet('ÖZET', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ozet.columns = Array.from({ length: COLS }, (_, i) => ({
    width: [18, 16, 14, 14, 14, 14, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12][i] || 12,
  }));

  let row = await applyAntet(wb, ozet, {
    docCode: 'IRS-TUMZMN',
    title: 'Tüm Zamanlar — Gelen İrsaliyeler',
    subtitle: opts.cari.unvan,
  });

  ozet.mergeCells(row, 1, row, COLS);
  ozet.getCell(row, 1).value = `Cari: ${opts.cari.unvan}  ·  Kod: ${opts.cari.kod || '—'}`;
  ozet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;

  const summary: Array<[string, string | number]> = [
    ['Toplam geçmiş kayıt', historyLogs.length || irs.length],
    ['İrsaliye adedi', irs.length],
    ['Toplam ağırlık (ton)', Number(toplamTon.toFixed(3))],
    ['Mıcır (ton)', Number((tipMap.MICIR || 0).toFixed(3))],
    ['Taş tozu (ton)', Number((tipMap.TAS_TOZU || 0).toFixed(3))],
    ['Stabilize (ton)', Number((tipMap.STABILIZE || 0).toFixed(3))],
    ['Diğer (ton)', Number((tipMap.DIGER || 0).toFixed(3))],
  ];
  for (const [label, val] of summary) {
    ozet.getCell(row, 1).value = label;
    ozet.getCell(row, 1).font = { bold: true, size: 10 };
    ozet.mergeCells(row, 2, row, 4);
    ozet.getCell(row, 2).value = val;
    ozet.getCell(row, 2).font = { size: 10, bold: label.startsWith('Toplam') };
    if (label.startsWith('Toplam')) setFill(ozet.getCell(row, 2), 'FFDBEAFE');
    row += 1;
  }
  row += 1;

  ozet.mergeCells(row, 1, row, 4);
  ozet.getCell(row, 1).value = 'AYLIK DÖKÜM';
  ozet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  row += 1;
  writeHeaderRow(ozet, row, ['Ay', 'Adet', 'Ton']);
  row += 1;
  [...ayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([ym, v]) => {
      const vals = [monthTitle(ym), v.adet, Number(v.ton.toFixed(3))];
      vals.forEach((val, i) => {
        const c = ozet.getCell(row, i + 1);
        c.value = val;
        c.font = { size: 9 };
        setBorder(c);
      });
      row += 1;
    });
  writeFooter(ozet, row + 1);

  const detay = wb.addWorksheet('İRSALİYELER', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  detay.columns = [
    { width: 5 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
    { width: 14 },
    { width: 22 },
    { width: 16 },
    { width: 36 },
  ];
  let r = await applyAntet(wb, detay, {
    docCode: 'IRS-TUMZMN-DET',
    title: 'Gelen irsaliye dökümü',
    subtitle: `${opts.cari.unvan} · ${irs.length} irsaliye`,
  });
  detay.mergeCells(r, 1, r, COLS);
  detay.getCell(r, 1).value =
    `Tüm zamanlar · Toplam ${irs.length} irsaliye · ${toplamTon.toLocaleString('tr-TR')} ton`;
  detay.getCell(r, 1).font = { bold: true, size: 10 };
  setFill(detay.getCell(r, 1), 'FFDBEAFE');
  r += 2;

  const headers = [
    '#',
    'Tarih',
    'İrsaliye No',
    'Fiş No',
    'Malzeme',
    'Miktar',
    'Birim',
    'Tonaj',
    'Kg',
    'Plaka',
    'Çekim',
    'Durum',
    'SA No',
    'Fatura',
    'Kaynak',
    'Kalemler',
  ];
  writeHeaderRow(detay, r, headers);
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
      ir.irsaliyeNo || ir.irsaliyeId || '—',
      ir.fisNo || '',
      tip ? malzemeTipiLabel(tip) : kaynakLabel(ir),
      h.miktar || 0,
      h.etiket || h.birim || '',
      Number(ir.tonaj) || 0,
      Number(ir.kiloKg) || 0,
      ir.plaka || '',
      Number(ir.cekimAdedi) || '',
      String(ir.onayDurumu || '—'),
      ir.saId || '',
      faturaDurumu(ir, faturalar),
      kaynakLabel(ir),
      kalem || '',
    ];
    vals.forEach((v, i) => {
      const c = detay.getCell(r, i + 1);
      c.value = v;
      c.font = { size: 8 };
      setBorder(c);
      if (idx % 2 === 1) setFill(c, 'FFF8FAFC');
    });
    r += 1;
  });
  writeFooter(detay, r + 1);
  detay.autoFilter = {
    from: { row: 9, column: 1 },
    to: { row: Math.max(9, r - 1), column: headers.length },
  };
  detay.views = [{ state: 'frozen', ySplit: 9 }];

  const kalemWs = wb.addWorksheet('KALEMLER', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  kalemWs.columns = [
    { width: 5 },
    { width: 12 },
    { width: 14 },
    { width: 36 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
  ];
  let kr = await applyAntet(wb, kalemWs, {
    docCode: 'IRS-TUMZMN-KLM',
    title: 'İrsaliye kalemleri',
    subtitle: opts.cari.unvan,
  });
  writeHeaderRow(kalemWs, kr, ['#', 'Tarih', 'İrsaliye No', 'Ürün', 'Miktar', 'Birim', 'Plaka']);
  kr += 1;
  let kn = 0;
  for (const ir of irs) {
    const kalemler = ir.kalemler?.length
      ? ir.kalemler
      : [{ id: '', urunAdi: kaynakLabel(ir), miktar: irsaliyeHizmetMiktari(ir).miktar, birim: irsaliyeHizmetMiktari(ir).birim }];
    for (const k of kalemler) {
      kn += 1;
      const vals: Array<string | number> = [
        kn,
        formatDateLabelTr(ir.tarih),
        ir.irsaliyeNo || '—',
        k.urunAdi || '—',
        Number(k.miktar) || 0,
        k.birim || '',
        ir.plaka || '',
      ];
      vals.forEach((v, i) => {
        const c = kalemWs.getCell(kr, i + 1);
        c.value = v;
        c.font = { size: 8 };
        setBorder(c);
      });
      kr += 1;
    }
  }
  writeFooter(kalemWs, kr + 1);

  if (historyLogs.length) {
    const kayitWs = wb.addWorksheet('TÜM KAYITLAR', {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
    });
    kayitWs.columns = [
      { width: 5 },
      { width: 14 },
      { width: 18 },
      { width: 36 },
      { width: 48 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 10 },
      { width: 18 },
    ];
    let hr = await applyAntet(wb, kayitWs, {
      docCode: 'IRS-TUMZMN-KAY',
      title: 'Tüm geçmiş kayıtlar',
      subtitle: `${opts.cari.unvan} · ${historyLogs.length} kayıt`,
    });
    writeHeaderRow(kayitWs, hr, [
      '#',
      'Tarih',
      'Tip',
      'Belge / Başlık',
      'Açıklama',
      'İrsaliye No',
      'Plaka',
      'Miktar',
      'Birim',
      'Fatura',
    ]);
    hr += 1;
    historyLogs.forEach((log, idx) => {
      const vals: Array<string | number> = [
        idx + 1,
        log.date,
        log.type,
        log.title,
        log.desc,
        log.irsaliyeNo || '',
        log.plaka || '',
        log.miktar || '',
        log.birim || '',
        log.faturaNo || '',
      ];
      vals.forEach((v, i) => {
        const c = kayitWs.getCell(hr, i + 1);
        c.value = v;
        c.font = { size: 8 };
        setBorder(c);
        if (idx % 2 === 1) setFill(c, 'FFF8FAFC');
      });
      hr += 1;
    });
    writeFooter(kayitWs, hr + 1);
    kayitWs.autoFilter = {
      from: { row: 7, column: 1 },
      to: { row: Math.max(7, hr - 1), column: 10 },
    };
    kayitWs.views = [{ state: 'frozen', ySplit: 7 }];
  }

  const safeKod = String(opts.cari.kod || opts.cari.unvan || 'cari')
    .replace(/[^\wğüşıöçĞÜŞİÖÇ-]+/gi, '_')
    .slice(0, 40);
  const fileName = `Kibritci_Tum_Zamanlar_Irsaliye_${safeKod}_${normalizeDateKey(new Date().toISOString()) || 'rapor'}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, fileName);
  return { adet: irs.length, toplamTon, kayit: historyLogs.length, fileName };
}
