import type { Worksheet } from 'exceljs';
import {
  KampKaydi,
  KampKat,
  KampOdasi,
  KampYerleske,
  Personel,
} from '../types/erp';
import { katsForYerleske } from './kampYapisi';
import { loadKibritciLogoDataUrl } from './kibritciBrand';

export interface KampYerlesimExportInput {
  yerleskeler: KampYerleske[];
  katlar: KampKat[];
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
  personeller?: Personel[];
}

const ANA_FIRMA_LABEL = 'KİBRİTÇİ İNŞAAT';
const ROOMS_PER_ROW = 4;
const ROOM_BLOCK_ROWS = 4;

function safeSheetName(name: string, used: Set<string>): string {
  let s = name.replace(/[\\/?*[\]]/g, ' ').trim().slice(0, 31);
  if (!s) s = 'Yerleske';
  let base = s;
  let i = 2;
  while (used.has(s.toLowerCase())) {
    s = `${base.slice(0, 27)} ${i}`.slice(0, 31);
    i += 1;
  }
  used.add(s.toLowerCase());
  return s;
}

function personelById(personeller: Personel[]): Map<string, Personel> {
  const map = new Map<string, Personel>();
  for (const p of personeller) map.set(p.id, p);
  return map;
}

function resolveFirma(
  kayit: KampKaydi,
  personelMap: Map<string, Personel>,
  room: KampOdasi
): string {
  if (kayit.calistigiFirma?.trim()) {
    const val = kayit.calistigiFirma.trim();
    const upper = val.toLocaleUpperCase('tr-TR');
    if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') {
      return ANA_FIRMA_LABEL;
    }
    return val;
  }
  const p = kayit.personelId ? personelMap.get(kayit.personelId) : undefined;
  if (p?.firmaAdi?.trim()) {
    const val = p.firmaAdi.trim();
    const upper = val.toLocaleUpperCase('tr-TR');
    if (upper === 'ANA FİRMA' || upper === 'ANA FIRMA') {
      return ANA_FIRMA_LABEL;
    }
    return val;
  }
  if (kayit.firmaTipi === 'TASERON' || room.firmaTipi === 'TASERON' || p?.firmaTipi === 'TASERON') {
    return 'Taşeron (Belirtilmemiş)';
  }
  return ANA_FIRMA_LABEL;
}

function activeOccupants(room: KampOdasi, kayitlar: KampKaydi[]): KampKaydi[] {
  return kayitlar.filter(
    (k) => (k.odaId === room.id || k.roomId === room.id) && k.durum === 'AKTIF'
  );
}

function countByFirma(
  occupants: Array<{ firma: string }>
): Array<{ firma: string; count: number }> {
  const map = new Map<string, number>();
  for (const o of occupants) {
    map.set(o.firma, (map.get(o.firma) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([firma, count]) => ({ firma, count }))
    .sort((a, b) => b.count - a.count || a.firma.localeCompare(b.firma, 'tr'));
}

function setFill(cell: { fill?: unknown }, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function writeFloorFirmSummary(
  ws: Worksheet,
  row: number,
  counts: Array<{ firma: string; count: number }>,
  colSpan: number
): number {
  const parts = counts.map((c) => `${c.firma}: ${c.count} personel`);
  const text =
    parts.length > 0
      ? `Firma dağılımı — ${parts.join('  |  ')}`
      : 'Firma dağılımı — bu katta aktif personel yok';
  ws.mergeCells(row, 1, row, colSpan);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  setFill(cell, 'FFEFF6FF');
  ws.getRow(row).height = 22;
  return row + 1;
}

function writeRoomBlock(
  ws: Worksheet,
  startRow: number,
  col: number,
  room: KampOdasi,
  occupants: KampKaydi[],
  personelMap: Map<string, Personel>
) {
  const lines: string[] = [
    `ODA ${room.odaNo}`,
    `Kapasite ${occupants.length}/${room.kapasite} · ${room.firmaTipi === 'ANA_FIRMA' ? 'KİBRİTÇİ İNŞAAT' : 'Taşeron'}`,
  ];

  if (occupants.length === 0) {
    lines.push('— Boş oda —');
  } else {
    for (const oc of occupants) {
      const firma = resolveFirma(oc, personelMap, room);
      lines.push(`${oc.personelIsim} (${firma})`);
    }
  }
  while (lines.length < ROOM_BLOCK_ROWS) {
    lines.push('');
  }

  for (let i = 0; i < ROOM_BLOCK_ROWS; i += 1) {
    const cell = ws.getCell(startRow + i, col);
    cell.value = lines[i];
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    if (i === 0) {
      cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
      setFill(cell, 'FFFDE68A');
    } else if (i === 1) {
      cell.font = { size: 8, color: { argb: 'FF475569' } };
      setFill(cell, 'FFF8FAFC');
    } else {
      cell.font = { size: 9, color: { argb: 'FF1E293B' } };
      setFill(cell, occupants.length > 0 ? 'FFFFFFFF' : 'FFF1F5F9');
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  }
}

async function buildYerleskeSheet(
  ws: Worksheet,
  yerleske: KampYerleske,
  katlar: KampKat[],
  odalar: KampOdasi[],
  kayitlar: KampKaydi[],
  personelMap: Map<string, Personel>,
  logoBase64: string | null
) {
  const totalCols = ROOMS_PER_ROW * 2 - 1;
  const basim = new Date().toLocaleString('tr-TR');
  const reportNo = `KBR-KAMP-${Date.now().toString().slice(-6)}`;

  for (let c = 1; c <= totalCols; c += 1) {
    if (c % 2 === 1) {
      ws.getColumn(c).width = 24;
    } else {
      ws.getColumn(c).width = 4;
    }
  }

  if (logoBase64) {
    const wb = ws.workbook;
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.15, row: 0.05 }, ext: { width: 180, height: 70 } });
  }

  ws.mergeCells(1, 1, 1, totalCols);
  ws.getCell(1, 1).value = 'KİBRİTÇİ İNŞAAT — KAMP YERLEŞİM PLANI';
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(ws.getCell(1, 1), 'FF1E4E78');
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, totalCols);
  ws.getCell(2, 1).value = `Yerleşke: ${yerleske.ad}`;
  ws.getCell(2, 1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
  ws.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(ws.getCell(2, 1), 'FFE2E8F0');

  ws.mergeCells(3, 1, 3, totalCols);
  ws.getCell(3, 1).value = `Rapor No: ${reportNo}  |  Basım: ${basim}  |  Kuş bakışı oda yerleşimi ve firma dağılımı`;
  ws.getCell(3, 1).font = { size: 9, color: { argb: 'FF475569' } };
  ws.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  let row = 5;
  const yerleskeKatlar = katsForYerleske(katlar, yerleske.id);
  const yerleskeOdalar = odalar.filter(
    (o) => o.yerleskeId === yerleske.id || o.yerleskeAdi === yerleske.ad
  );

  const katNamesFromRooms = [...new Set(yerleskeOdalar.map((o) => o.kogusNo).filter(Boolean))];
  const orderedKatNames =
    yerleskeKatlar.length > 0
      ? yerleskeKatlar.map((k) => k.ad)
      : katNamesFromRooms.sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

  const allYerleskeOccupants: Array<{ firma: string }> = [];

  for (const katAd of orderedKatNames) {
    const floorRooms = yerleskeOdalar
      .filter((o) => o.kogusNo === katAd)
      .sort((a, b) =>
        (a.odaNo || '').localeCompare(b.odaNo || '', 'tr', { numeric: true, sensitivity: 'base' })
      );

    ws.mergeCells(row, 1, row, totalCols);
    const floorTitle = ws.getCell(row, 1);
    floorTitle.value = `📍 ${yerleske.ad}  ·  ${katAd}`;
    floorTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    floorTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    setFill(floorTitle, 'FF2563EB');
    ws.getRow(row).height = 24;
    row += 1;

    const floorOccupants = floorRooms.flatMap((room) => {
      const occ = activeOccupants(room, kayitlar);
      return occ.map((k) => ({
        firma: resolveFirma(k, personelMap, room),
      }));
    });
    allYerleskeOccupants.push(...floorOccupants);

    row = writeFloorFirmSummary(ws, row, countByFirma(floorOccupants), totalCols);

    if (floorRooms.length === 0) {
      ws.mergeCells(row, 1, row, totalCols);
      ws.getCell(row, 1).value = 'Bu katta tanımlı oda bulunmuyor.';
      ws.getCell(row, 1).font = { italic: true, color: { argb: 'FF64748B' } };
      row += 2;
      continue;
    }

    for (let i = 0; i < floorRooms.length; i += ROOMS_PER_ROW) {
      const chunk = floorRooms.slice(i, i + ROOMS_PER_ROW);
      chunk.forEach((room, idx) => {
        const col = idx * 2 + 1;
        const occ = activeOccupants(room, kayitlar);
        writeRoomBlock(ws, row, col, room, occ, personelMap);
      });
      row += ROOM_BLOCK_ROWS + 1;
    }

    row += 1;
  }

  ws.mergeCells(row, 1, row, totalCols);
  ws.getCell(row, 1).value = `📊 ${yerleske.ad} — TOPLAM FİRMA BAZLI PERSONEL SAYILARI`;
  ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  setFill(ws.getCell(row, 1), 'FF0F172A');
  row += 1;

  ws.getCell(row, 1).value = 'Firma / İşveren';
  ws.getCell(row, 3).value = 'Personel Sayısı';
  ws.getCell(row, 5).value = 'Oran (%)';
  const summaryCols = [1, 3, 5];
  for (const c of summaryCols) {
    const cell = ws.getCell(row, c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    setFill(cell, 'FF334155');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  row += 1;

  const yerleskeCounts = countByFirma(allYerleskeOccupants);
  const yerleskeTotal = allYerleskeOccupants.length || 1;

  if (yerleskeCounts.length === 0) {
    ws.mergeCells(row, 1, row, 5);
    ws.getCell(row, 1).value = 'Bu yerleşkede aktif konaklayan personel yok.';
    row += 2;
  } else {
    for (const item of yerleskeCounts) {
      ws.getCell(row, 1).value = item.firma;
      ws.getCell(row, 3).value = item.count;
      ws.getCell(row, 5).value = `${Math.round((item.count / yerleskeTotal) * 100)}%`;
      ws.getCell(row, 3).alignment = { horizontal: 'center' };
      ws.getCell(row, 5).alignment = { horizontal: 'center' };
      if (row % 2 === 0) {
        setFill(ws.getCell(row, 1), 'FFF8FAFC');
        setFill(ws.getCell(row, 3), 'FFF8FAFC');
        setFill(ws.getCell(row, 5), 'FFF8FAFC');
      }
      row += 1;
    }
    ws.getCell(row, 1).value = 'TOPLAM';
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 3).value = allYerleskeOccupants.length;
    ws.getCell(row, 3).font = { bold: true };
    ws.getCell(row, 5).value = '100%';
    ws.getCell(row, 5).font = { bold: true };
    setFill(ws.getCell(row, 1), 'FFE2E8F0');
    setFill(ws.getCell(row, 3), 'FFE2E8F0');
    setFill(ws.getCell(row, 5), 'FFE2E8F0');
  }
}

export async function exportKampYerlesimExcel(input: KampYerlesimExportInput): Promise<void> {
  const { createExcelWorkbook } = await import('./exceljsLoader');
  const wb = await createExcelWorkbook();
  wb.creator = 'Kibritçi ERP';
  wb.created = new Date();

  const personelMap = personelById(input.personeller || []);
  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/, '') || null;

  const yerleskeList =
    input.yerleskeler.length > 0
      ? [...input.yerleskeler].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
      : [...new Set(input.kampOdalari.map((o) => o.yerleskeAdi).filter(Boolean))].map((ad, i) => ({
          id: `derived_${i}`,
          ad: ad!,
          olusturmaTarihi: '',
        }));

  if (yerleskeList.length === 0) {
    throw new Error('Dışa aktarılacak kamp yerleşkesi bulunamadı. Önce yerleşke ve oda oluşturun.');
  }

  const usedNames = new Set<string>();

  for (const yerleske of yerleskeList) {
    const sheetName = safeSheetName(yerleske.ad, usedNames);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    await buildYerleskeSheet(
      ws,
      yerleske,
      input.katlar,
      input.kampOdalari,
      input.kampKayitlari,
      personelMap,
      logoBase64
    );
  }

  const ozet = wb.addWorksheet('GENEL OZET', { views: [{ state: 'frozen', ySplit: 3 }] });
  ozet.getColumn(1).width = 28;
  ozet.getColumn(2).width = 22;
  ozet.getColumn(3).width = 14;
  ozet.getColumn(4).width = 14;
  ozet.getColumn(5).width = 14;
  ozet.getColumn(6).width = 50;

  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ozet.addImage(logoId, { tl: { col: 0.1, row: 0.05 }, ext: { width: 160, height: 62 } });
  }

  ozet.mergeCells(1, 1, 1, 6);
  ozet.getCell(1, 1).value = 'KİBRİTÇİ İNŞAAT — TÜM YERLEŞKELER ÖZET';
  ozet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ozet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  setFill(ozet.getCell(1, 1), 'FF1E4E78');

  const headers = ['Yerleşke', 'Kat / Blok', 'Oda', 'Dolu', 'Kapasite', 'Firma Özeti'];
  headers.forEach((h, i) => {
    const cell = ozet.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    setFill(cell, 'FF334155');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let r = 4;
  for (const yerleske of yerleskeList) {
    const yerleskeOdalar = input.kampOdalari.filter(
      (o) => o.yerleskeId === yerleske.id || o.yerleskeAdi === yerleske.ad
    );
    const katNames = [...new Set(yerleskeOdalar.map((o) => o.kogusNo))].sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true })
    );
    for (const kat of katNames) {
      const katOdalar = yerleskeOdalar.filter((o) => o.kogusNo === kat);
      const occAll = katOdalar.flatMap((room) =>
        activeOccupants(room, input.kampKayitlari).map((k) => ({
          firma: resolveFirma(k, personelMap, room),
        }))
      );
      const summary = countByFirma(occAll)
        .map((x) => `${x.firma}: ${x.count}`)
        .join(' · ');
      const kapasite = katOdalar.reduce((s, o) => s + o.kapasite, 0);
      ozet.getCell(r, 1).value = yerleske.ad;
      ozet.getCell(r, 2).value = kat;
      ozet.getCell(r, 3).value = katOdalar.length;
      ozet.getCell(r, 4).value = occAll.length;
      ozet.getCell(r, 5).value = kapasite;
      ozet.getCell(r, 6).value = summary || '—';
      r += 1;
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kibritci_Kamp_Yerlesim_Plani_${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
