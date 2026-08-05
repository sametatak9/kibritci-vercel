import { KasaHareketi, KasaOdemeDurumu } from '../types/erp';
import { createExcelWorkbook } from './exceljsLoader';
import { resolveKasaOdemeDurumu } from './yolHarcamaUtils';

function odemeLabel(d: KasaOdemeDurumu | null): string {
  if (d === 'BORC') return 'BORÇ';
  if (d === 'PERSONEL_ODEDI') return 'PERSONEL ÖDEDİ';
  if (d === 'KASA_ODEDI') return 'KASA ÖDEDİ';
  return '';
}

export async function exportKasaExcel(kasaHareketleri: KasaHareketi[], startDate: string, endDate: string): Promise<void> {
  const workbook = await createExcelWorkbook();
  const sheet = workbook.addWorksheet('Haftalık Kasa', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
  });

  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Haftalık Kasa Raporu';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:F2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Dönem: ${startDate} - ${endDate}`;
  dateCell.font = { name: 'Arial', size: 11, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const headers = ['TARİH', 'HAREKET TİPİ', 'ÖDEME DURUMU', 'AÇIKLAMA', 'PERSONEL', 'TUTAR'];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  sheet.columns = [
    { key: 'tarih', width: 14 },
    { key: 'hareketTipi', width: 14 },
    { key: 'odemeDurumu', width: 18 },
    { key: 'aciklama', width: 42 },
    { key: 'personel', width: 22 },
    { key: 'tutar', width: 14 }
  ];

  let totalIn = 0;
  let totalOut = 0;
  let borc = 0;
  let personel = 0;
  let kasaOdedi = 0;

  kasaHareketleri.forEach(kh => {
    const odeme = resolveKasaOdemeDurumu(kh);
    const row = sheet.addRow([
      kh.tarih,
      kh.hareketTipi,
      kh.hareketTipi === 'ÇIKIŞ' ? odemeLabel(odeme) || 'KASA ÖDEDİ' : '—',
      kh.aciklama,
      kh.personelAdi || kh.surucu || '',
      kh.tutar
    ]);

    if (kh.hareketTipi === 'GİRİŞ') totalIn += kh.tutar;
    else {
      totalOut += kh.tutar;
      const d = odeme || 'KASA_ODEDI';
      if (d === 'BORC') borc += kh.tutar;
      else if (d === 'PERSONEL_ODEDI') personel += kh.tutar;
      else kasaOdedi += kh.tutar;
    }

    row.getCell(6).numFmt = '#,##0.00 "₺"';

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle' };
    });
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  sheet.addRow([]);
  const addTotal = (label: string, value: number, boldColor?: string) => {
    const r = sheet.addRow(['', '', '', '', label, value]);
    r.getCell(5).font = { bold: true, ...(boldColor ? { color: { argb: boldColor } } : {}) };
    r.getCell(6).font = { bold: true, ...(boldColor ? { color: { argb: boldColor } } : {}) };
    r.getCell(6).numFmt = '#,##0.00 "₺"';
  };

  addTotal('BORÇ:', borc);
  addTotal('PERSONEL ÖDEDİ:', personel);
  addTotal('KASA ÖDEDİ:', kasaOdedi);
  addTotal('TOPLAM ÇIKIŞ (3’ü):', borc + personel + kasaOdedi, 'FFB91C1C');
  addTotal('TOPLAM GİRİŞ:', totalIn);
  addTotal('NET DURUM:', totalIn - totalOut, 'FF1E4E78');

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Haftalik_Kasa_${startDate}_${endDate}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
