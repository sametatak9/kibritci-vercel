/**
 * Etiket grubu (ZER YAPI vb.) aylık hakediş Excel’i.
 * Antet + logo, meslek grupları, puantaj cetveli — ödeme kaynağı.
 */
import type { Workbook, Worksheet } from 'exceljs';
import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { displayPersonelGorev } from './guvenlikHelpers';
import {
  KIBRITCI_COMPANY,
  loadKibritciAntetDataUrl,
  loadKibritciLogoDataUrl,
} from './kibritciBrand';
import { classifyFaaliyetKategori, kategoriSirasi } from './faaliyetKategoriUtils';
import { normalizeYoklamaEtiketi, YOKLAMA_ETIKETSIZ } from './yoklamaEtiketUtils';
import { getYoklamaDay, isDayActiveForPersonel } from './yoklamaUtils';
import { personelGorevGrupLabel, resolvePersonelGorevGrubu } from './personelGorevGrupUtils';

const WEEKDAY_TR = ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const AY_TR = [
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

type DayCol = { d: number; wd: string; sunday: boolean };

type PersonHakedis = {
  p: Personel;
  adSoyad: string;
  tc: string;
  kadro: string;
  kadroGrup: string;
  geldi: number;
  yok: number;
  izin: number;
  rapor: number;
  girilmedi: number;
  mesai: number;
  anaMeslek: string;
  meslekGun: Map<string, number>;
  meslekMesai: Map<string, number>;
};

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

function personelAd(p: Personel): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

function daysInMonth(year: number, month: number): DayCol[] {
  const n = new Date(year, month, 0).getDate();
  const out: DayCol[] = [];
  for (let d = 1; d <= n; d++) {
    const dt = new Date(year, month - 1, d);
    out.push({ d, wd: WEEKDAY_TR[dt.getDay()], sunday: dt.getDay() === 0 });
  }
  return out;
}

function toSymbol(durum?: YoklamaDurum | string): string {
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
  if (durum === 'Raporlu') return 'FFEDE9FE';
  if (durum === 'Pazar' || durum === 'Tatil') return 'FFFED7AA';
  return 'FFF8FAFC';
}

/** Geldi gününün meslek grubu — etiket + açıklama (usta yardımcılığı / temizlik). */
export function meslekForGeldiDay(isEtiketi?: string, aciklama?: string): string {
  const inferred = classifyFaaliyetKategori({ isEtiketi, aciklama });
  if (inferred && inferred !== 'DİĞER') return inferred;
  return normalizeYoklamaEtiketi(isEtiketi) || YOKLAMA_ETIKETSIZ;
}

function bump(map: Map<string, number>, key: string, n: number) {
  map.set(key, (map.get(key) || 0) + n);
}

function dominantMeslek(gun: Map<string, number>): string {
  let best = YOKLAMA_ETIKETSIZ;
  let max = -1;
  for (const [k, v] of gun) {
    if (v > max || (v === max && kategoriSirasi(k, best) < 0)) {
      max = v;
      best = k;
    }
  }
  return best;
}

function buildHakedis(
  people: Personel[],
  yoklamalar: AylikYoklamaMap,
  year: number,
  month: number,
  days: DayCol[]
): PersonHakedis[] {
  return people
    .slice()
    .sort((a, b) => personelAd(a).localeCompare(personelAd(b), 'tr'))
    .map((p) => {
      const map = yoklamalar[p.id];
      const meslekGun = new Map<string, number>();
      const meslekMesai = new Map<string, number>();
      let geldi = 0;
      let yok = 0;
      let izin = 0;
      let rapor = 0;
      let girilmedi = 0;
      let mesai = 0;
      for (const day of days) {
        if (!isDayActiveForPersonel(p, year, month, day.d, map)) continue;
        const rec = getYoklamaDay(map, year, month, day.d);
        const durum = rec?.durum;
        const saat = Number(rec?.mesaiSaati || 0);
        if (durum === 'Geldi') {
          geldi += 1;
          mesai += saat;
          const meslek = meslekForGeldiDay(rec?.isEtiketi, rec?.aciklama);
          bump(meslekGun, meslek, 1);
          bump(meslekMesai, meslek, saat);
        } else if (durum === 'Yok') yok += 1;
        else if (durum === 'İzinli') izin += 1;
        else if (durum === 'Raporlu') rapor += 1;
        else girilmedi += 1;
      }
      return {
        p,
        adSoyad: personelAd(p),
        tc: String(p.tcNo || '').trim() || '—',
        kadro: displayPersonelGorev(p) || 'BELİRTİLMEDİ',
        kadroGrup: personelGorevGrupLabel(resolvePersonelGorevGrubu(p)),
        geldi,
        yok,
        izin,
        rapor,
        girilmedi,
        mesai: Number(mesai.toFixed(1)),
        anaMeslek: dominantMeslek(meslekGun),
        meslekGun,
        meslekMesai,
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
  }

  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).value =
    `${KIBRITCI_COMPANY.legalName}  ·  ${KIBRITCI_COMPANY.phone}  ·  ${KIBRITCI_COMPANY.email}`;
  ws.getCell(3, 1).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(4, 1, 4, colCount);
  setFill(ws.getCell(4, 1), 'FF1E4E78');
  ws.getRow(4).height = 5;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
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
  ws.getCell(7, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(8, 1, 8, colCount);
  ws.getCell(8, 1).value = opts.metaLine;
  ws.getCell(8, 1).font = { size: 8, color: { argb: 'FF64748B' } };

  ws.headerFooter = {
    oddHeader: `&L${KIBRITCI_COMPANY.shortName}&CGrup Hakediş&R&D`,
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

function writeHeaderRow(ws: Worksheet, headers: string[], bg = 'FF1E4E78') {
  const row = ws.addRow(headers);
  row.height = 20;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setFill(cell, bg);
    cell.border = thinBorder();
  });
}

function writeBanner(ws: Worksheet, text: string, bg: string, fg: string, colCount: number) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  const cell = row.getCell(1);
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: fg } };
  setFill(cell, bg);
  cell.alignment = { vertical: 'middle' };
  cell.border = thinBorder();
  row.height = 18;
}

function paintRow(
  row: {
    eachCell: (
      cb: (cell: { border?: unknown; font?: unknown; alignment?: unknown }, col: number) => void
    ) => void;
  },
  centerFrom = 4
) {
  row.eachCell((cell, col) => {
    cell.border = thinBorder();
    cell.font = { name: 'Arial', size: 10, bold: col === 2 };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col >= centerFrom ? 'center' : 'left',
      wrapText: true,
    };
  });
}

/**
 * Seçili etiket grubunun aylık antetli hakediş Excel’ini indirir.
 */
export async function exportGrupYoklamaHakedisExcel(options: {
  grupEtiket: string;
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  year: number;
  month: number;
}): Promise<number> {
  const grup = String(options.grupEtiket || '').trim() || 'GRUP';
  const people = (options.personeller || []).filter((p) => p?.id);
  if (people.length === 0) {
    throw new Error(
      `«${grup}» grubunda raporlanacak personel yok. Önce kadroyu işaretleyip kaydedin.`
    );
  }
  const year = options.year;
  const month = options.month;
  if (!year || !month) throw new Error('Ay ve yıl seçin.');

  const days = daysInMonth(year, month);
  const donem = `${AY_TR[month - 1] || month} ${year}`;
  const stamp = new Date().toLocaleString('tr-TR');
  const rows = buildHakedis(people, options.yoklamalar || {}, year, month, days);

  const totGeldi = rows.reduce((n, r) => n + r.geldi, 0);
  const totYok = rows.reduce((n, r) => n + r.yok, 0);
  const totMesai = Number(rows.reduce((n, r) => n + r.mesai, 0).toFixed(1));

  const meslekToplam = new Map<string, { kisi: number; geldi: number; mesai: number }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const [meslek, gun] of r.meslekGun) {
      const cur = meslekToplam.get(meslek) || { kisi: 0, geldi: 0, mesai: 0 };
      if (!seen.has(meslek)) {
        cur.kisi += 1;
        seen.add(meslek);
      }
      cur.geldi += gun;
      cur.mesai += r.meslekMesai.get(meslek) || 0;
      meslekToplam.set(meslek, cur);
    }
  }
  const meslekList = [...meslekToplam.entries()].sort(([a], [b]) => kategoriSirasi(a, b));

  const kadroToplam = new Map<string, { kisi: number; geldi: number; mesai: number }>();
  for (const r of rows) {
    const cur = kadroToplam.get(r.kadro) || { kisi: 0, geldi: 0, mesai: 0 };
    cur.kisi += 1;
    cur.geldi += r.geldi;
    cur.mesai += r.mesai;
    kadroToplam.set(r.kadro, cur);
  }

  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.title = `${grup} Hakediş — ${donem}`;

  const ozetCols = 11;
  const ozet = wb.addWorksheet('Hakediş Özeti', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  ozet.columns = [
    { width: 5 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 28 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
  ];
  await applyAntet(wb, ozet, {
    title: `${grup} — AYLIK HAKEDİŞ / YOKLAMA RAPORU`,
    subtitle: `${KIBRITCI_COMPANY.shortName}  ·  ${donem}  ·  meslek grupları (usta yardımcılığı, temizlik vb.) ayrı`,
    metaLine: `Kadro: ${rows.length} kişi  ·  Geldi gün: ${totGeldi}  ·  Yok: ${totYok}  ·  Mesai: ${totMesai} sa  ·  Düzenleme: ${stamp}`,
    colCount: ozetCols,
  });
  ozet.pageSetup.orientation = 'landscape';
  ozet.pageSetup.fitToWidth = 1;

  writeBanner(
    ozet,
    `Bu cetvel «${grup}» grubunun dönem hakediş kaynağıdır. Ödeme, meslek grubu ve geldi gün / mesai sütunlarına göre hesaplanır.`,
    'FFFEF3C7',
    'FF92400E',
    ozetCols
  );

  writeBanner(ozet, '1) Meslek grubu özeti (o gün yapılan iş)', 'FF6D28D9', 'FFFFFFFF', ozetCols);
  writeHeaderRow(
    ozet,
    ['Meslek grubu', 'Kişi', 'Geldi gün', 'Mesai (sa)'],
    'FF6D28D9'
  );
  for (const [meslek, t] of meslekList) {
    const r = ozet.addRow([meslek, t.kisi, t.geldi, Number(t.mesai.toFixed(1))]);
    paintRow(r, 2);
    if (meslek === 'USTA YARDIMCILIĞI') r.eachCell((c) => setFill(c, 'FFEDE9FE'));
    if (meslek === 'TEMİZLİK') r.eachCell((c) => setFill(c, 'FFCCFBF1'));
  }
  if (meslekList.length === 0) {
    ozet.addRow(['Bu dönemde Geldi + meslek kaydı yok', '', '', '']);
  }

  writeBanner(ozet, '2) Kadro görevi özeti (personel kartındaki unvan)', 'FF1E4E78', 'FFFFFFFF', ozetCols);
  writeHeaderRow(ozet, ['Kadro görevi', 'Kişi', 'Geldi gün', 'Mesai (sa)']);
  for (const [kadro, t] of [...kadroToplam.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr'))) {
    const r = ozet.addRow([kadro, t.kisi, t.geldi, Number(t.mesai.toFixed(1))]);
    paintRow(r, 2);
  }

  writeBanner(ozet, '3) Personel hakediş listesi', 'FF0F2744', 'FFF4EAD5', ozetCols);
  writeHeaderRow(ozet, [
    '#',
    'Ad Soyad',
    'T.C.',
    'Kadro grubu',
    'Kadro görevi',
    'Ana meslek (en çok geldiği iş)',
    'Geldi',
    'Yok',
    'İzin',
    'Rapor',
    'Mesai (sa)',
  ]);
  rows.forEach((r, i) => {
    const excelRow = ozet.addRow([
      i + 1,
      r.adSoyad,
      r.tc,
      r.kadroGrup,
      r.kadro,
      r.anaMeslek,
      r.geldi,
      r.yok,
      r.izin,
      r.rapor,
      r.mesai,
    ]);
    paintRow(excelRow, 7);
    excelRow.getCell(3).numFmt = '@';
    if (r.anaMeslek === 'USTA YARDIMCILIĞI') setFill(excelRow.getCell(6), 'FFEDE9FE');
    if (r.anaMeslek === 'TEMİZLİK') setFill(excelRow.getCell(6), 'FFCCFBF1');
    if (i % 2 === 1) {
      for (const c of [1, 2, 4, 5]) setFill(excelRow.getCell(c), 'FFF8FAFC');
    }
  });
  const totRow = ozet.addRow(['', 'TOPLAM', '', '', '', '', totGeldi, totYok, '', '', totMesai]);
  totRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    setFill(cell, 'FFE2E8F0');
    cell.border = thinBorder();
  });

  ozet.addRow([]);
  writeBanner(
    ozet,
    `Düzenleyen: ${KIBRITCI_COMPANY.shortName}     Tarih: ${stamp}     ${grup} onay: ____________________     Kibritçi onay: ____________________`,
    'FFF8FAFC',
    'FF334155',
    ozetCols
  );

  const meslekWs = wb.addWorksheet('Meslek Grupları', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  meslekWs.columns = [
    { width: 5 },
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
  ];
  await applyAntet(wb, meslekWs, {
    title: `${grup} — MESLEK GRUPLARI`,
    subtitle: `${donem} · her meslek için o işte geldiği gün sayısı (bir kişi birden fazla grupta olabilir)`,
    metaLine: `Usta yardımcılığı ve temizlik ayrı bloklardadır. Etiketsiz Geldi günleri «${YOKLAMA_ETIKETSIZ}» altındadır.`,
    colCount: 6,
  });
  writeHeaderRow(meslekWs, ['#', 'Ad Soyad', 'T.C.', 'Kadro görevi', 'Geldi gün', 'Mesai (sa)']);

  for (const [meslek] of meslekList) {
    const members = rows
      .filter((r) => (r.meslekGun.get(meslek) || 0) > 0)
      .sort((a, b) => (b.meslekGun.get(meslek) || 0) - (a.meslekGun.get(meslek) || 0));
    const t = meslekToplam.get(meslek)!;
    const bg =
      meslek === 'USTA YARDIMCILIĞI'
        ? 'FF6D28D9'
        : meslek === 'TEMİZLİK'
          ? 'FF0F766E'
          : 'FF1E4E78';
    writeBanner(
      meslekWs,
      `${meslek}  ·  ${members.length} kişi  ·  ${t.geldi} geldi gün  ·  ${Number(t.mesai.toFixed(1))} sa mesai`,
      bg,
      'FFFFFFFF',
      6
    );
    members.forEach((r, i) => {
      const excelRow = meslekWs.addRow([
        i + 1,
        r.adSoyad,
        r.tc,
        r.kadro,
        r.meslekGun.get(meslek) || 0,
        Number((r.meslekMesai.get(meslek) || 0).toFixed(1)),
      ]);
      paintRow(excelRow, 5);
      excelRow.getCell(3).numFmt = '@';
    });
  }

  const ident = 6;
  const totalCols = ident + days.length + 2;
  const puantaj = wb.addWorksheet('Puantaj', {
    views: [{ state: 'frozen', ySplit: 12, xSplit: ident, showGridLines: false }],
  });
  puantaj.columns = [
    { width: 5 },
    { width: 24 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
    ...days.map(() => ({ width: 4.6 })),
    { width: 8 },
    { width: 9 },
  ];
  const headStart = await applyAntet(wb, puantaj, {
    title: `${grup} — PUANTAJ CETVELİ`,
    subtitle: `${donem} · G Geldi · Y Yok · İ İzinli · R Raporlu · P Pazar · T Tatil  ·  meslek sütunu ana iş grubudur`,
    metaLine: `${rows.length} kişi · ${days.length} gün · ${stamp}`,
    colCount: totalCols,
  });
  puantaj.pageSetup.orientation = 'landscape';
  puantaj.pageSetup.fitToWidth = 1;
  puantaj.pageSetup.fitToHeight = 0;

  const h1 = headStart;
  const h2 = headStart + 1;
  ['#', 'Ad Soyad', 'T.C.', 'Kadro grubu', 'Kadro görevi', 'Ana meslek'].forEach((h, i) => {
    puantaj.mergeCells(h1, i + 1, h2, i + 1);
    const cell = puantaj.getCell(h1, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setFill(cell, 'FF1E4E78');
    cell.border = thinBorder();
  });
  days.forEach((day, idx) => {
    const col = ident + idx + 1;
    const c1 = puantaj.getCell(h1, col);
    c1.value = day.d;
    c1.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    c1.alignment = { horizontal: 'center' };
    setFill(c1, day.sunday ? 'FF9A3412' : 'FF1E4E78');
    c1.border = thinBorder();
    const c2 = puantaj.getCell(h2, col);
    c2.value = day.wd;
    c2.font = { bold: true, size: 7, color: { argb: 'FFF4EAD5' } };
    c2.alignment = { horizontal: 'center' };
    setFill(c2, day.sunday ? 'FF7C2D12' : 'FF0F2744');
    c2.border = thinBorder();
  });
  ['Geldi', 'Mesai'].forEach((h, i) => {
    const col = ident + days.length + i + 1;
    puantaj.mergeCells(h1, col, h2, col);
    const cell = puantaj.getCell(h1, col);
    cell.value = h;
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setFill(cell, 'FF0F2744');
    cell.border = thinBorder();
  });
  puantaj.getRow(h1).height = 16;
  puantaj.getRow(h2).height = 14;

  const byKadro = new Map<string, PersonHakedis[]>();
  for (const r of rows) {
    const list = byKadro.get(r.kadro) || [];
    list.push(r);
    byKadro.set(r.kadro, list);
  }
  let sira = 0;
  for (const [kadro, list] of [...byKadro.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr'))) {
    writeBanner(puantaj, `${kadro}  ·  ${list.length} kişi`, 'FF1E4E78', 'FFFFFFFF', totalCols);
    for (const r of list) {
      sira += 1;
      const excelRow = puantaj.addRow([]);
      const rn = excelRow.number;
      puantaj.getCell(rn, 1).value = sira;
      puantaj.getCell(rn, 2).value = r.adSoyad;
      puantaj.getCell(rn, 3).value = r.tc;
      puantaj.getCell(rn, 3).numFmt = '@';
      puantaj.getCell(rn, 4).value = r.kadroGrup;
      puantaj.getCell(rn, 5).value = r.kadro;
      puantaj.getCell(rn, 6).value = r.anaMeslek;
      const map = options.yoklamalar[r.p.id];
      days.forEach((day, idx) => {
        const col = ident + idx + 1;
        const cell = puantaj.getCell(rn, col);
        cell.border = thinBorder();
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (!isDayActiveForPersonel(r.p, year, month, day.d, map)) {
          cell.value = '—';
          setFill(cell, 'FFF1F5F9');
          cell.font = { name: 'Arial', size: 7, color: { argb: 'FF94A3B8' } };
          return;
        }
        const rec = getYoklamaDay(map, year, month, day.d);
        const durum = rec?.durum;
        const saat = Number(rec?.mesaiSaati || 0);
        cell.value = saat > 0 ? `${toSymbol(durum)}\n${saat}` : toSymbol(durum);
        cell.font = { name: 'Arial', size: 8, bold: true };
        setFill(cell, statusFill(durum));
      });
      const gCell = puantaj.getCell(rn, ident + days.length + 1);
      gCell.value = r.geldi;
      gCell.font = { bold: true, size: 9 };
      gCell.alignment = { horizontal: 'center' };
      gCell.border = thinBorder();
      setFill(gCell, 'FFDCFCE7');
      const mCell = puantaj.getCell(rn, ident + days.length + 2);
      mCell.value = r.mesai;
      mCell.font = { bold: true, size: 9 };
      mCell.alignment = { horizontal: 'center' };
      mCell.border = thinBorder();
      setFill(mCell, r.mesai > 0 ? 'FFFEF3C7' : 'FFF8FAFC');
      for (let c = 1; c <= ident; c++) {
        const cell = puantaj.getCell(rn, c);
        cell.border = thinBorder();
        cell.font = { name: 'Arial', size: 9, bold: c === 2 };
        cell.alignment = { vertical: 'middle', horizontal: c === 1 || c === 3 ? 'center' : 'left' };
      }
      excelRow.height = 22;
    }
  }

  const dokum = wb.addWorksheet('Günlük Döküm', {
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  dokum.columns = [
    { width: 12 },
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 24 },
    { width: 10 },
    { width: 10 },
    { width: 36 },
  ];
  await applyAntet(wb, dokum, {
    title: `${grup} — GÜNLÜK MESLEK DÖKÜMÜ`,
    subtitle: `${donem} · yalnızca Geldi günleri · meslek + açıklama (denetim / ödeme kanıtı)`,
    metaLine: stamp,
    colCount: 8,
  });
  writeHeaderRow(dokum, [
    'Tarih',
    'Ad Soyad',
    'T.C.',
    'Kadro görevi',
    'Meslek grubu',
    'Durum',
    'Mesai',
    'Açıklama',
  ]);
  for (const day of days) {
    const tarih = `${String(day.d).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
    for (const r of rows) {
      const map = options.yoklamalar[r.p.id];
      if (!isDayActiveForPersonel(r.p, year, month, day.d, map)) continue;
      const rec = getYoklamaDay(map, year, month, day.d);
      if (rec?.durum !== 'Geldi') continue;
      const meslek = meslekForGeldiDay(rec.isEtiketi, rec.aciklama);
      const excelRow = dokum.addRow([
        tarih,
        r.adSoyad,
        r.tc,
        r.kadro,
        meslek,
        'Geldi',
        Number(rec.mesaiSaati || 0),
        rec.aciklama || '',
      ]);
      paintRow(excelRow, 6);
      excelRow.getCell(3).numFmt = '@';
      if (meslek === 'USTA YARDIMCILIĞI') setFill(excelRow.getCell(5), 'FFEDE9FE');
      if (meslek === 'TEMİZLİK') setFill(excelRow.getCell(5), 'FFCCFBF1');
    }
  }

  const safeGrup = grup.replace(/[^\wÇĞİÖŞÜçğıöşü]+/g, '_');
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(
    buffer as ArrayBuffer,
    `Kibritci_${safeGrup}_Hakedis_${year}${String(month).padStart(2, '0')}.xlsx`
  );
  return rows.length;
}
