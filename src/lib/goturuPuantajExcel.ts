import type { Worksheet, Workbook } from 'exceljs';
import type { Personel, SeramikFaaliyet } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { isSeramikEkibiPersonel } from './yoklamaUtils';
import { normalizeDateKey } from './dateKeyUtils';
import type { GoturuYoklamaGunKaydi } from './goturuYoklamaPersistence';

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

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
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
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function applyAntet(
  wb: Workbook,
  ws: Worksheet,
  opts: { title: string; subtitle: string; colCount: number }
): Promise<number> {
  const colCount = Math.max(6, opts.colCount);
  ws.getRow(1).height = 52;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 14;
  ws.mergeCells(1, 1, 3, 2);

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/i, '') || null;
  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.05, row: 0.08 }, ext: { width: 150, height: 58 } });
  } else {
    ws.getCell(1, 1).value = KIBRITCI_COMPANY.shortName;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF1E4E78' } };
  }

  ws.mergeCells(1, 3, 1, colCount);
  const titleCell = ws.getCell(1, 3);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, 3, 2, colCount);
  ws.getCell(2, 3).value = opts.subtitle;
  ws.getCell(2, 3).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(2, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, 3, 3, colCount);
  ws.getCell(3, 3).value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  ws.getCell(3, 3).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEA580C' },
  };
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  return 7;
}

function dayAbbr(year: number, month: number, day: number): string {
  return ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][new Date(year, month - 1, day).getDay()];
}

function isSunday(year: number, month: number, day: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}

function personelName(p: Personel | undefined, fallback: string): string {
  if (!p) return fallback;
  return `${p.ad || ''} ${p.soyad || ''}`.trim() || fallback;
}

/**
 * Götürü / seramik ekibi aylık faaliyetli puantaj — Kibritçi antetli Excel.
 * Sayfalar: Puantaj · Faaliyet
 */
export async function exportGoturuFaaliyetliPuantajExcel(opts: {
  year: number;
  month: number;
  gunler: GoturuYoklamaGunKaydi[];
  faaliyetler: SeramikFaaliyet[];
  personeller: Personel[];
}): Promise<void> {
  const { year, month, gunler, faaliyetler, personeller } = opts;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const label = `${AY_ADLARI[month - 1] || month} ${year}`;
  const gunSayisi = new Date(year, month, 0).getDate();
  const days = Array.from({ length: gunSayisi }, (_, i) => i + 1);
  const monthGunler = gunler.filter((g) => g.tarih.startsWith(prefix));
  const monthFaaliyet = faaliyetler.filter((f) => (normalizeDateKey(f.tarih) || '').startsWith(prefix));

  const byId = new Map(personeller.map((p) => [p.id, p]));
  const personIds = new Set<string>();
  for (const g of monthGunler) {
    for (const s of g.satirlar || []) personIds.add(s.personelId);
  }
  for (const f of monthFaaliyet) {
    for (const id of f.aktifPersonelListesi || []) personIds.add(id);
  }
  const rows = (
    personIds.size > 0
      ? [...personIds].map((id) => byId.get(id) || ({ id, ad: id, soyad: '', gorev: '' } as Personel))
      : personeller.filter(isSeramikEkibiPersonel)
  ).sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr'));

  const cellByPersonDay = new Map<string, { durum: string; mesai: number }>();
  for (const g of monthGunler) {
    const day = Number(g.tarih.slice(8, 10));
    for (const s of g.satirlar || []) {
      cellByPersonDay.set(`${s.personelId}|${day}`, {
        durum: s.durum,
        mesai: Number(s.mesaiSaati) || 0,
      });
    }
  }

  const faaliyetByPersonDay = new Map<string, string[]>();
  for (const f of monthFaaliyet) {
    const dk = normalizeDateKey(f.tarih);
    if (!dk) continue;
    const day = Number(dk.slice(8, 10));
    const tag = f.isNiteligi || 'Faaliyet';
    for (const pid of f.aktifPersonelListesi || []) {
      const key = `${pid}|${day}`;
      const list = faaliyetByPersonDay.get(key) || [];
      list.push(tag);
      faaliyetByPersonDay.set(key, list);
    }
  }

  const wb = await createExcelWorkbook();
  wb.creator = KIBRITCI_COMPANY.shortName;
  wb.created = new Date();

  const puantaj = wb.addWorksheet('Puantaj', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      paperSize: 9,
      horizontalCentered: true,
    },
    headerFooter: {
      oddHeader: '&C&K1E4E78KİBRİTÇİ İNŞAAT — Götürü / Seramik Puantaj',
      oddFooter: '&LKibritçi İnşaat&CGötürü Faaliyetli Puantaj&RSayfa &P / &N',
    },
  });
  const colCount = 4 + gunSayisi + 4;
  const start = await applyAntet(wb, puantaj, {
    title: 'GÖTÜRÜ / SERAMİK — AYLIK FAALİYETLİ PUANTAJ',
    subtitle: `${label} · Yoklama bu ekranda ayrı tutulur · F = o gün faaliyet kaydı`,
    colCount,
  });

  const headerRow = puantaj.getRow(start);
  const headers = ['#', 'Ad Soyad', 'Görev', 'Firma', ...days.map(String), 'Geldi', 'Yok', 'Mesai', 'Faaliyet gün'];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 22;

  const dowRow = puantaj.getRow(start + 1);
  days.forEach((d, i) => {
    const cell = dowRow.getCell(5 + i);
    cell.value = dayAbbr(year, month, d);
    cell.font = { size: 7, color: { argb: isSunday(year, month, d) ? 'FFBE123C' : 'FF64748B' } };
    cell.alignment = { horizontal: 'center' };
    if (isSunday(year, month, d)) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    }
  });

  puantaj.getColumn(1).width = 5;
  puantaj.getColumn(2).width = 22;
  puantaj.getColumn(3).width = 16;
  puantaj.getColumn(4).width = 16;
  for (let i = 0; i < gunSayisi; i++) puantaj.getColumn(5 + i).width = 4.2;
  puantaj.getColumn(5 + gunSayisi).width = 8;
  puantaj.getColumn(6 + gunSayisi).width = 7;
  puantaj.getColumn(7 + gunSayisi).width = 8;
  puantaj.getColumn(8 + gunSayisi).width = 12;

  rows.forEach((p, idx) => {
    const r = puantaj.getRow(start + 2 + idx);
    r.getCell(1).value = idx + 1;
    r.getCell(2).value = personelName(p, p.id);
    r.getCell(3).value = p.gorev || '—';
    r.getCell(4).value = p.firmaAdi || (p.firmaTipi === 'TASERON' ? 'Taşeron' : 'Ana firma');
    let geldi = 0;
    let yok = 0;
    let mesai = 0;
    let faaliyetGun = 0;
    days.forEach((d, i) => {
      const cell = r.getCell(5 + i);
      const rec = cellByPersonDay.get(`${p.id}|${d}`);
      const faal = faaliyetByPersonDay.get(`${p.id}|${d}`);
      let text = '';
      if (rec?.durum === 'Geldi') {
        text = rec.mesai > 0 ? `G+${rec.mesai}` : 'G';
        geldi += 1;
        mesai += rec.mesai;
        cell.font = { bold: true, size: 7, color: { argb: 'FF047857' } };
      } else if (rec?.durum === 'Yok') {
        text = 'Y';
        yok += 1;
        cell.font = { bold: true, size: 7, color: { argb: 'FFBE123C' } };
      }
      if (faal?.length) {
        text = text ? `${text}/F` : 'F';
        faaliyetGun += 1;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
      } else if (isSunday(year, month, d)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      cell.value = text || (isSunday(year, month, d) ? 'P' : '');
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder();
    });
    r.getCell(5 + gunSayisi).value = geldi;
    r.getCell(6 + gunSayisi).value = yok;
    r.getCell(7 + gunSayisi).value = mesai || '';
    r.getCell(8 + gunSayisi).value = faaliyetGun || '';
    for (let c = 1; c <= 4; c++) {
      r.getCell(c).border = thinBorder();
      r.getCell(c).font = { size: 8 };
    }
    for (let c = 5 + gunSayisi; c <= 8 + gunSayisi; c++) {
      r.getCell(c).border = thinBorder();
      r.getCell(c).alignment = { horizontal: 'center' };
      r.getCell(c).font = { bold: true, size: 8 };
    }
  });

  const faaliyetSheet = wb.addWorksheet('Faaliyet', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      paperSize: 9,
      horizontalCentered: true,
    },
    headerFooter: {
      oddHeader: '&C&K1E4E78KİBRİTÇİ İNŞAAT — Götürü / Seramik Faaliyet',
      oddFooter: '&LKibritçi İnşaat&CGötürü Faaliyet Dökümü&RSayfa &P / &N',
    },
  });
  const fCols = 8;
  const fStart = await applyAntet(wb, faaliyetSheet, {
    title: 'GÖTÜRÜ / SERAMİK — AYLIK FAALİYET DÖKÜMÜ',
    subtitle: label,
    colCount: fCols,
  });
  const fHeaders = ['Tarih', 'Tür', 'İş niteliği', 'Parsel', 'Blok', 'Personel', 'Mesai', 'Açıklama'];
  const fHeader = faaliyetSheet.getRow(fStart);
  fHeaders.forEach((h, i) => {
    const cell = fHeader.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A3412' } };
    cell.border = thinBorder();
  });
  [14, 10, 22, 16, 14, 36, 10, 40].forEach((w, i) => {
    faaliyetSheet.getColumn(i + 1).width = w;
  });

  const sortedFaal = [...monthFaaliyet].sort((a, b) =>
    (normalizeDateKey(a.tarih) || '').localeCompare(normalizeDateKey(b.tarih) || '')
  );
  sortedFaal.forEach((f, i) => {
    const r = faaliyetSheet.getRow(fStart + 1 + i);
    const names = (f.aktifPersonelListesi || [])
      .map((id) => personelName(byId.get(id), id))
      .join(', ');
    const mesai =
      f.personelMesaiSaatleri && Object.keys(f.personelMesaiSaatleri).length
        ? Object.values(f.personelMesaiSaatleri).reduce((s, h) => s + Number(h || 0), 0)
        : 0;
    r.getCell(1).value = normalizeDateKey(f.tarih) || f.tarih;
    r.getCell(2).value = f.faaliyetGrubu === 'MESAI' ? 'MESAİ' : 'NORMAL';
    r.getCell(3).value = f.isNiteligi || '';
    r.getCell(4).value = f.parsel || '';
    r.getCell(5).value = f.blok || '';
    r.getCell(6).value = names || '—';
    r.getCell(7).value = mesai || '';
    r.getCell(8).value = f.aciklama || '';
    for (let c = 1; c <= 8; c++) {
      r.getCell(c).border = thinBorder();
      r.getCell(c).font = { size: 8 };
      r.getCell(c).alignment = { wrapText: true, vertical: 'top' };
    }
    if (f.faaliyetGrubu === 'MESAI') {
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `Goturu_Faaliyetli_Puantaj_${prefix}.xlsx`);
}
