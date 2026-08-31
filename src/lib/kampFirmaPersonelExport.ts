import { KampKaydi, KampOdasi, Personel } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { resolveKampYerlesimFirma } from './kampFirmaOzet';
import { loadKibritciLogoDataUrl } from './kibritciBrand';

export interface FirmaPersonelOdaItem {
  kayitId: string;
  personelId?: string;
  personelIsim: string;
  tcNo: string;
  telefon: string;
  firmaAdi: string;
  yerleskeAdi: string;
  katAdi: string;
  odaNo: string;
  odaId: string;
  girisTarihi: string;
}

export interface FirmaPersonelOdaGroup {
  firmaAdi: string;
  toplamPersonel: number;
  odaSet: Set<string>;
  odaSayisi: number;
  personeller: FirmaPersonelOdaItem[];
}

/**
 * Aktif kamp konaklama kayıtlarını firma bazında gruplar ve personel/oda detaylarını döner.
 */
export function groupKampResidentsByFirma(
  kampKayitlari: KampKaydi[],
  personeller: Personel[],
  kampOdalari: KampOdasi[]
): FirmaPersonelOdaGroup[] {
  const roomMap = new Map<string, KampOdasi>();
  for (const r of kampOdalari) roomMap.set(r.id, r);

  const personelMap = new Map<string, Personel>();
  for (const p of personeller) personelMap.set(p.id, p);

  const groupsMap = new Map<string, FirmaPersonelOdaGroup>();
  const seenDedupe = new Set<string>();

  const activeKayitlar = kampKayitlari.filter((k) => k.durum === 'AKTIF');

  for (const k of activeKayitlar) {
    // Dedupe check
    const pId = k.personelId;
    const nameKey = (k.personelIsim || '').trim().toLocaleLowerCase('tr-TR');
    const dedupeKey = pId ? `id:${pId}` : nameKey ? `name:${nameKey}` : `row:${k.id}`;

    if (seenDedupe.has(dedupeKey)) continue;
    seenDedupe.add(dedupeKey);

    const firmaAdi = resolveKampYerlesimFirma(k, personeller);
    const pObj = pId ? personelMap.get(pId) : undefined;

    const roomId = k.odaId || k.roomId || '';
    const roomObj = roomMap.get(roomId);

    const yerleske = roomObj?.yerleskeAdi || k.yerleskeAdi || 'Belirtilmemiş Yerleşke';
    const kat = roomObj?.kogusNo || k.katAdi || 'Kat';
    const odaNo = roomObj?.odaNo || k.odaNo || '—';

    const item: FirmaPersonelOdaItem = {
      kayitId: k.id,
      personelId: k.personelId,
      personelIsim: pObj ? `${pObj.ad} ${pObj.soyad}` : k.personelIsim || 'Bilinmiyor',
      tcNo: pObj?.tcNo || '—',
      telefon: pObj?.telefonNo || '—',
      firmaAdi,
      yerleskeAdi: yerleske,
      katAdi: kat,
      odaNo,
      odaId: roomId,
      girisTarihi: k.girisTarihi || '—',
    };

    let group = groupsMap.get(firmaAdi);
    if (!group) {
      group = {
        firmaAdi,
        toplamPersonel: 0,
        odaSet: new Set(),
        odaSayisi: 0,
        personeller: [],
      };
      groupsMap.set(firmaAdi, group);
    }

    group.personeller.push(item);
    group.toplamPersonel += 1;
    if (roomId) group.odaSet.add(roomId);
  }

  // Set odaSayisi & sort
  const result: FirmaPersonelOdaGroup[] = Array.from(groupsMap.values()).map((g) => {
    g.odaSayisi = g.odaSet.size;
    g.personeller.sort((a, b) => a.personelIsim.localeCompare(b.personelIsim, 'tr'));
    return g;
  });

  return result.sort(
    (a, b) =>
      b.toplamPersonel - a.toplamPersonel ||
      b.odaSayisi - a.odaSayisi ||
      a.firmaAdi.localeCompare(b.firmaAdi, 'tr')
  );
}

/**
 * Firma bazlı gruplanmış kurumsal PDF / HTML baskı raporu üretir.
 */
export function generateFirmaPersonelOdaPdfHtml(
  groups: FirmaPersonelOdaGroup[],
  selectedFirmaFilter?: string
): string {
  const filteredGroups = selectedFirmaFilter
    ? groups.filter((g) => g.firmaAdi === selectedFirmaFilter)
    : groups;

  const toplamPersonel = filteredGroups.reduce((s, g) => s + g.toplamPersonel, 0);
  const toplamFirma = filteredGroups.length;
  const stamp = new Date().toLocaleString('tr-TR');

  let bodyHtml = `
    <div style="margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:800;color:#1e4e78;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px">
        FİRMA BAZLI PERSONEL VE ODA DAĞILIM RAPORU
      </h2>
      <p style="font-size:11px;color:#64748b;margin:0">
        Rapor Tarihi: ${stamp} ${selectedFirmaFilter ? `· Filtre: ${selectedFirmaFilter}` : ''}
      </p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px">
        <div style="font-size:9px;font-weight:800;color:#047857;text-transform:uppercase">Toplam Konaklayan Personel</div>
        <div style="font-size:22px;font-weight:900;color:#065f46">${toplamPersonel} kişi</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
        <div style="font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase">Listelenen Firma Sayısı</div>
        <div style="font-size:22px;font-weight:900;color:#0f172a">${toplamFirma} firma</div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px">
        <div style="font-size:9px;font-weight:800;color:#1e40af;text-transform:uppercase">Kullanılan Oda Sayısı</div>
        <div style="font-size:22px;font-weight:900;color:#1e3a8a">
          ${filteredGroups.reduce((s, g) => s + g.odaSayisi, 0)} oda
        </div>
      </div>
    </div>
  `;

  if (filteredGroups.length === 0) {
    bodyHtml += `
      <div style="padding:24px;text-align:center;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:12px">
        Listelenecek aktif konaklama kaydı bulunamadı.
      </div>
    `;
  } else {
    filteredGroups.forEach((group) => {
      bodyHtml += `
        <div style="margin-bottom:24px;page-break-inside:avoid;break-inside:avoid">
          <div style="background:#1e293b;color:#ffffff;padding:8px 12px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800">
            <span>🏢 FİRMA: ${group.firmaAdi}</span>
            <span style="font-size:11px;font-weight:600;background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:6px">
              ${group.toplamPersonel} Personel · ${group.odaSayisi} Oda
            </span>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#f1f5f9;color:#334155;border-bottom:2px solid #cbd5e1;font-weight:800;text-transform:uppercase;font-size:9px">
                <th style="padding:7px;border-right:1px solid #e2e8f0;text-align:center;width:40px">#</th>
                <th style="padding:7px;border-right:1px solid #e2e8f0;text-align:left">AD SOYAD</th>
                <th style="padding:7px;border-right:1px solid #e2e8f0;text-align:center;width:110px">TC KİMLİK NO</th>
                <th style="padding:7px;border-right:1px solid #e2e8f0;text-align:left">YERLEŞKE / BLOK</th>
                <th style="padding:7px;border-right:1px solid #e2e8f0;text-align:left">KAT</th>
                <th style="padding:7px;border-right:1px solid #e2e8f0;text-align:center;width:80px">ODA NO</th>
                <th style="padding:7px;text-align:center;width:90px">GİRİŞ TARİHİ</th>
              </tr>
            </thead>
            <tbody>
      `;

      group.personeller.forEach((p, idx) => {
        const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        bodyHtml += `
          <tr style="background:${bg};border-bottom:1px solid #e2e8f0">
            <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;color:#64748b;font-weight:700">${idx + 1}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;font-weight:800;color:#0f172a">${p.personelIsim}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-family:monospace;color:#475569">${p.tcNo}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;color:#334155">${p.yerleskeAdi}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;color:#475569">${p.katAdi}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-weight:800;color:#2563eb">ODA ${p.odaNo}</td>
            <td style="padding:6px;text-align:center;color:#64748b">${p.girisTarihi}</td>
          </tr>
        `;
      });

      bodyHtml += `
            </tbody>
          </table>
        </div>
      `;
    });
  }

  return wrapCorporateReportHtml(bodyHtml, {
    title: 'Firma Bazlı Kamp Personel Oda Raporu',
    docCode: 'KAMP-FIRMA-ODALIST',
    orientation: 'portrait',
    autoPrint: true,
  });
}

/**
 * ExcelJS kullanarak Firma Bazlı Kamp Personel Oda Dağılım dosyasını indirir.
 */
export async function exportFirmaPersonelOdaExcel(
  groups: FirmaPersonelOdaGroup[],
  filenamePrefix = 'Kibritci_Firma_Personel_Oda_Listesi'
): Promise<void> {
  const { createExcelWorkbook } = await import('./exceljsLoader');
  const wb = await createExcelWorkbook();
  wb.creator = 'Kibritçi ERP';
  wb.created = new Date();

  const logoDataUrl = await loadKibritciLogoDataUrl();
  const logoBase64 = logoDataUrl?.replace(/^data:image\/png;base64,/, '') || null;

  const ws = wb.addWorksheet('Firma Dağılım Raporu', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  ws.getColumn(1).width = 8;  // Sıra No
  ws.getColumn(2).width = 28; // Ad Soyad
  ws.getColumn(3).width = 24; // Firma
  ws.getColumn(4).width = 16; // TC No
  ws.getColumn(5).width = 24; // Yerleşke / Blok
  ws.getColumn(6).width = 16; // Kat
  ws.getColumn(7).width = 14; // Oda No
  ws.getColumn(8).width = 16; // Giriş Tarihi

  if (logoBase64) {
    const logoId = wb.addImage({ base64: logoBase64, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.05 }, ext: { width: 160, height: 60 } });
  }

  // Header Title
  ws.mergeCells(1, 1, 1, 8);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'KİBRİTÇİ İNŞAAT — FİRMA BAZLI PERSONEL VE ODA DAĞILIM RAPORU';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
  ws.getRow(1).height = 32;

  // Subtitle
  const basim = new Date().toLocaleString('tr-TR');
  ws.mergeCells(2, 1, 2, 8);
  const subCell = ws.getCell(2, 1);
  subCell.value = `Rapor Basım Tarihi: ${basim}  |  Aktif Konaklayan Personel & Oda Listesi`;
  subCell.font = { size: 9, color: { argb: 'FF475569' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  let r = 4;

  for (const group of groups) {
    // Firm Header Section
    ws.mergeCells(r, 1, r, 8);
    const firmHeader = ws.getCell(r, 1);
    firmHeader.value = `🏢 FİRMA: ${group.firmaAdi}  (${group.toplamPersonel} Personel · ${group.odaSayisi} Oda)`;
    firmHeader.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    firmHeader.alignment = { horizontal: 'left', vertical: 'middle' };
    firmHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    ws.getRow(r).height = 24;
    r += 1;

    // Table Headers
    const headers = ['#', 'AD SOYAD', 'FİRMA', 'TC KİMLİK NO', 'YERLEŞKE / BLOK', 'KAT', 'ODA NO', 'GİRİŞ TARİHİ'];
    headers.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    });
    ws.getRow(r).height = 20;
    r += 1;

    // Personnel Rows
    group.personeller.forEach((p, idx) => {
      const isEven = idx % 2 === 1;
      const fillBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

      ws.getCell(r, 1).value = idx + 1;
      ws.getCell(r, 1).alignment = { horizontal: 'center' };

      ws.getCell(r, 2).value = p.personelIsim;
      ws.getCell(r, 2).font = { bold: true };

      ws.getCell(r, 3).value = p.firmaAdi;
      ws.getCell(r, 4).value = p.tcNo;
      ws.getCell(r, 4).alignment = { horizontal: 'center' };

      ws.getCell(r, 5).value = p.yerleskeAdi;
      ws.getCell(r, 6).value = p.katAdi;

      ws.getCell(r, 7).value = `ODA ${p.odaNo}`;
      ws.getCell(r, 7).font = { bold: true, color: { argb: 'FF1D4ED8' } };
      ws.getCell(r, 7).alignment = { horizontal: 'center' };

      ws.getCell(r, 8).value = p.girisTarihi;
      ws.getCell(r, 8).alignment = { horizontal: 'center' };

      for (let c = 1; c <= 8; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
      r += 1;
    });

    r += 1; // Empty row between firms
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}_${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
