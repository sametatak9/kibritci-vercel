/**
 * Personel Yönetimi — aktif çalışanlar için aylık maaş / geldi gün / mesai Excel.
 * Kibritçi logo + antet; Yoklama ile aynı yevmiye ve mesai (×1.5) hesabı.
 */
import type { AylikYoklamaMap, Personel, YoklamaDurum } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { KIBRITCI_COMPANY, loadKibritciLogoDataUrl } from './kibritciBrand';
import { displayPersonelGorev } from './guvenlikHelpers';
import {
  CANONICAL_ANA_FIRMA_ADI,
  getYoklamaDay,
  isDayActiveForPersonel,
  isTaseronPersonel,
} from './yoklamaUtils';

function normalizeIbanLocal(value: string | undefined | null): string {
  return String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

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
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  };
}

function isAktif(p: Personel): boolean {
  return p.durum !== false && String(p.durum).toLowerCase() !== 'pasif';
}

function isIdari(p: Personel): boolean {
  return p.personelGrubu === 'IDARI' || String(p.departman || '').toLocaleUpperCase('tr-TR') === 'İDARİ';
}

/** YoklamaScreen / modernPuantaj ile aynı yevmiye kuralı */
function resolveYevmiye(p: Personel, daysInMonth: number): number {
  const maas = Number(p.maas || 0);
  if (!Number.isFinite(maas) || maas <= 0) return 0;

  const tip = String(p.ucretTipi || 'Aylık')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const gunSayisi = Math.max(daysInMonth, 1);

  if (tip === 'saatlik') return maas * 7.5;
  if (tip === 'gunluk') {
    if (maas > 7500) return maas / gunSayisi;
    return maas;
  }
  return maas / gunSayisi;
}

export type MaasMesaiRow = {
  personel: Personel;
  geldiGun: number;
  yokGun: number;
  hakedisGun: number;
  mesaiSaat: number;
  yevmiye: number;
  aylikMaasKart: number;
  gunHakedis: number;
  mesaiHakedis: number;
  toplam: number;
};

export function buildAktifPersonelMaasMesaiRows(opts: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  year: number;
  month: number;
}): MaasMesaiRow[] {
  const { personeller, yoklamalar, year, month } = opts;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayIndexes = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const aktif = personeller
    .filter(isAktif)
    .filter((p) => !isIdari(p))
    .slice()
    .sort((a, b) =>
      `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr', { sensitivity: 'base' })
    );

  return aktif.map((p) => {
    const map = yoklamalar[p.id] || {};
    let geldiGun = 0;
    let yokGun = 0;
    let hakedisGun = 0;
    let mesaiSaat = 0;

    for (const day of dayIndexes) {
      if (!isDayActiveForPersonel(p, year, month, day, map)) continue;
      const d =
        getYoklamaDay(map, year, month, day) ||
        ({ durum: 'Girilmedi' as YoklamaDurum, mesaiSaati: 0 });
      if (d.durum === 'Geldi') geldiGun++;
      if (d.durum === 'Yok') yokGun++;
      if (
        d.durum === 'Geldi' ||
        d.durum === 'İzinli' ||
        d.durum === 'Pazar' ||
        d.durum === 'Tatil'
      ) {
        hakedisGun++;
      }
      mesaiSaat += Number(d.mesaiSaati || 0);
    }

    const yevmiye = resolveYevmiye(p, daysInMonth);
    const aylikMaasKart = Number(p.maas || 0) || 0;
    const gunHakedis = yevmiye * hakedisGun;
    const mesaiHakedis = mesaiSaat * (yevmiye / 7.5) * 1.5;
    const toplam = gunHakedis + mesaiHakedis;

    return {
      personel: p,
      geldiGun,
      yokGun,
      hakedisGun,
      mesaiSaat: Number(mesaiSaat.toFixed(2)),
      yevmiye: Number(yevmiye.toFixed(2)),
      aylikMaasKart,
      gunHakedis: Number(gunHakedis.toFixed(2)),
      mesaiHakedis: Number(mesaiHakedis.toFixed(2)),
      toplam: Number(toplam.toFixed(2)),
    };
  });
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

export async function exportAktifPersonelMaasMesaiExcel(opts: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  year: number;
  month: number;
  scopeLabel?: string;
}): Promise<number> {
  const { personeller, yoklamalar, year, month } = opts;
  const rows = buildAktifPersonelMaasMesaiRows({ personeller, yoklamalar, year, month });
  if (rows.length === 0) {
    throw new Error('Aktif personel bulunamadı.');
  }

  const monthLabel = `${AY_ADLARI[month - 1] || month} ${year}`;
  const scopeLabel = opts.scopeLabel || CANONICAL_ANA_FIRMA_ADI;
  const wb = await createExcelWorkbook();
  const ws = wb.addWorksheet('Maas Mesai');

  // Artık idari satır üretilmez; Not sütunu boş kalabilir (eski şablon uyumu)
  const headers = [
    'Sıra',
    'Ad Soyad',
    'TC',
    'IBAN',
    'Görev',
    'Firma',
    'Ücret Tipi',
    'Kart Maaş',
    'Geldiği Gün',
    'Hakediş Gün',
    'Mesai Saat',
    'Yevmiye',
    'Gün Hakediş',
    'Mesai Hakediş',
    'Toplam',
  ];
  const colCount = headers.length;

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
  ws.getCell(1, 3).value = 'AKTİF PERSONEL AYLIK MAAŞ & MESAİ RAPORU';
  ws.getCell(1, 3).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  ws.getCell(1, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(2, 3, 2, colCount);
  ws.getCell(2, 3).value = `${scopeLabel} · ${monthLabel}`;
  ws.getCell(2, 3).font = { size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(2, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(3, 3, 3, colCount);
  ws.getCell(3, 3).value = `${KIBRITCI_COMPANY.legalName} · ${KIBRITCI_COMPANY.phone}`;
  ws.getCell(3, 3).font = { size: 8, color: { argb: 'FF64748B' } };
  ws.getCell(3, 3).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF99F6E4' },
  };
  ws.getRow(4).height = 4;

  ws.mergeCells(5, 1, 5, colCount);
  ws.getCell(5, 1).value = KIBRITCI_COMPANY.address;
  ws.getCell(5, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  ws.mergeCells(6, 1, 6, colCount);
  ws.getCell(6, 1).value =
    `Dönem: ${monthLabel} · Basım: ${new Date().toLocaleString('tr-TR')} · ` +
    `Aktif (idari hariç): ${rows.length} kişi · Hesap: gün hakediş + mesai×1,5`;
  ws.getCell(6, 1).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(6, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  ws.getRow(6).height = 22;

  const headRow = 8;
  headers.forEach((h, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  ws.getRow(headRow).height = 28;

  let r = headRow + 1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = row.personel;
    const iban = normalizeIbanLocal(p.ibanNo || (p as { iban?: string }).iban || '');
    const firma = isTaseronPersonel(p)
      ? p.firmaAdi || 'Taşeron'
      : p.firmaAdi || CANONICAL_ANA_FIRMA_ADI;
    const values: (string | number)[] = [
      i + 1,
      `${p.ad} ${p.soyad}`.trim(),
      p.tcNo || '—',
      iban && iban !== 'TR' ? iban : '—',
      displayPersonelGorev(p) || p.gorev || '—',
      firma,
      p.ucretTipi || 'Aylık',
      row.aylikMaasKart,
      row.geldiGun,
      row.hakedisGun,
      row.mesaiSaat,
      row.yevmiye,
      row.gunHakedis,
      row.mesaiHakedis,
      row.toplam,
    ];
    values.forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = v;
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 0 || c >= 7 ? 'center' : 'left',
        wrapText: true,
      };
      cell.font = { size: 9 };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
    for (const moneyCol of [8, 12, 13, 14, 15]) {
      ws.getCell(r, moneyCol).numFmt = '#,##0.00';
    }
    r++;
  }

  // Toplam satırı
  const sumGeldi = rows.reduce((s, x) => s + x.geldiGun, 0);
  const sumMesai = rows.reduce((s, x) => s + x.mesaiSaat, 0);
  const sumGunHak = rows.reduce((s, x) => s + x.gunHakedis, 0);
  const sumMesaiHak = rows.reduce((s, x) => s + x.mesaiHakedis, 0);
  const sumToplam = rows.reduce((s, x) => s + x.toplam, 0);
  const totalValues: (string | number)[] = [
    '',
    'TOPLAM',
    '',
    '',
    '',
    '',
    '',
    '',
    sumGeldi,
    '',
    Number(sumMesai.toFixed(2)),
    '',
    Number(sumGunHak.toFixed(2)),
    Number(sumMesaiHak.toFixed(2)),
    Number(sumToplam.toFixed(2)),
  ];
  totalValues.forEach((v, c) => {
    const cell = ws.getCell(r, c + 1);
    cell.value = v;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
    cell.border = thinBorder();
  });
  for (const moneyCol of [13, 14, 15]) {
    ws.getCell(r, moneyCol).numFmt = '#,##0.00';
  }
  r += 2;

  ws.mergeCells(r, 1, r, colCount);
  ws.getCell(r, 1).value =
    'Not: İdari kadro bu rapora dahil edilmez. Gün hakediş = yevmiye × (Geldi+İzinli+Pazar+Tatil). Mesai hakediş = mesai saat × (yevmiye/7,5) × 1,5.';
  ws.getCell(r, 1).font = { size: 8, italic: true, color: { argb: 'FF64748B' } };

  const widths = [6, 22, 13, 28, 18, 16, 10, 11, 10, 10, 10, 10, 12, 12, 12];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `Kibritci_Aktif_Maas_Mesai_${year}-${String(month).padStart(2, '0')}.xlsx`;
  downloadBuffer(buffer as ArrayBuffer, fileName);
  return rows.length;
}

/** YYYY-MM seçimi — varsayılan içinde bulunulan ay */
export function promptMaasMesaiDonemi(defaultYm?: string): { year: number; month: number } | null {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const raw = window.prompt(
    'Maaş / mesai dönemi (YYYY-AA):\nÖrn: 2026-08',
    defaultYm || fallback
  );
  if (raw == null) return null;
  const m = String(raw).trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) {
    alert('Geçersiz dönem. Örnek: 2026-08');
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    alert('Ay 1–12 arasında olmalı.');
    return null;
  }
  return { year, month };
}
