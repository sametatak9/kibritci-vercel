import { KampFaaliyet, Personel, SahaFaaliyeti } from '../types/erp';
import { formatDateLabelTr } from './dateKeyUtils';
import { resolveFaaliyetEkip } from './faaliyetPersonelUtils';
import { createExcelWorkbook } from './exceljsLoader';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import {
  formatMesaiFaaliyetLabel,
  getFaaliyetFotolar,
  isMesaiSahaFaaliyet,
} from './sahaFaaliyetUtils';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kaynakEtiket(kaynak?: string): string {
  const k = String(kaynak || '').toUpperCase();
  if (k === 'FORMEN_MOBIL') return 'Formen Mobil';
  if (k === 'IDARI_SAHA') return 'İdari Saha';
  if (k === 'TESISATCI_MOBIL') return 'Tesisatçı';
  if (k === 'MERMERCI_MOBIL') return 'Mermerci';
  if (k === 'KAMPCI') return 'Kampçı';
  return k ? k.replace(/_/g, ' ') : 'Saha kaydı';
}

function ekipLabel(
  f: SahaFaaliyeti | KampFaaliyet,
  personeller: Personel[]
): string {
  return resolveFaaliyetEkip(f, personeller)
    .map((u) =>
      u.mesaiSaati != null && u.mesaiSaati > 0
        ? `${u.adSoyad} (${u.mesaiSaati}sa)`
        : u.adSoyad
    )
    .join(', ');
}

function renderFotoBlock(fotolar: string[]): string {
  if (fotolar.length === 0) {
    return '<p style="margin:8px 0 0;font-size:11px;color:#94a3b8;font-style:italic;">Fotoğraf eklenmemiş</p>';
  }
  const imgs = fotolar
    .map(
      (url) =>
        `<img src="${escapeHtml(url)}" alt="Faaliyet fotoğrafı" style="max-width:100%;max-height:240px;border-radius:8px;border:1px solid #e2e8f0;object-fit:contain;background:#f8fafc;" />`
    )
    .join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:10px;">${imgs}</div>`;
}

function renderSahaCard(
  f: SahaFaaliyeti,
  index: number,
  personeller: Personel[]
): string {
  const fotolar = getFaaliyetFotolar(f);
  const ekip = ekipLabel(f, personeller);
  const konum = [f.parsel && `Parsel ${f.parsel}`, f.blok && `Blok ${f.blok}`]
    .filter(Boolean)
    .join(' · ');
  const mesai = isMesaiSahaFaaliyet(f)
    ? `<p style="margin:8px 0 0;font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;">Mesai: ${escapeHtml(formatMesaiFaaliyetLabel(f, personeller) || '—')}</p>`
    : '';

  return `
    <article style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:700;">#${index + 1} · Saha · ${escapeHtml(kaynakEtiket(f.kaynakEkran))}</div>
          <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:4px;">${escapeHtml(f.isNiteligi || 'İş niteliği belirtilmemiş')}</div>
          ${konum ? `<div style="font-size:11px;color:#475569;margin-top:4px;">📍 ${escapeHtml(konum)}</div>` : ''}
        </div>
        ${
          isMesaiSahaFaaliyet(f)
            ? '<span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;background:#fef3c7;color:#92400e;white-space:nowrap;">Mesai</span>'
            : ''
        }
      </div>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;">${escapeHtml(f.aciklama || '—')}</p>
      <p style="margin:8px 0 0;font-size:11px;color:#334155;"><strong>Personel:</strong> ${escapeHtml(ekip || '—')}</p>
      <p style="margin:4px 0 0;font-size:10px;color:#64748b;">Kaydeden: ${escapeHtml(f.kaydedenFormen || f.kaydeden || '—')}</p>
      ${mesai}
      ${renderFotoBlock(fotolar)}
    </article>`;
}

function renderKampCard(
  f: KampFaaliyet,
  index: number,
  personeller: Personel[]
): string {
  const fotolar = getFaaliyetFotolar(f);
  const ekip = ekipLabel(f, personeller);
  const tip = [f.faaliyetTipi, f.faaliyetGrubu].filter(Boolean).join(' · ');

  return `
    <article style="border:1px solid #99f6e4;border-radius:12px;padding:16px;margin-bottom:16px;background:#f0fdfa;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font-size:11px;color:#0f766e;font-weight:700;">#${index + 1} · Kamp · ${escapeHtml(tip || '—')}</div>
          <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:4px;">${escapeHtml(f.yerleskeAdi || 'Kamp yerleşkesi')}</div>
        </div>
        <span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;background:#ccfbf1;color:#115e59;white-space:nowrap;">Kamp</span>
      </div>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;">${escapeHtml(f.aciklama || '—')}</p>
      <p style="margin:8px 0 0;font-size:11px;color:#334155;"><strong>Personel:</strong> ${escapeHtml(ekip || '—')}</p>
      <p style="margin:4px 0 0;font-size:10px;color:#64748b;">Kaydeden: ${escapeHtml(f.kaydedenKampci || '—')}</p>
      ${renderFotoBlock(fotolar)}
    </article>`;
}

export function buildFaaliyetGunlukReportHtml(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  kampFaaliyetleri: KampFaaliyet[];
  personeller: Personel[];
  olusturan?: string;
}): string {
  const label = formatDateLabelTr(options.dateKey);
  const saha = options.sahaFaaliyetleri || [];
  const kamp = options.kampFaaliyetleri || [];
  const title = 'GÜNLÜK FAALİYET RAPORU';
  const subtitle = `${label} tarihli saha ve kamp iş kayıtları`;

  const bodyParts: string[] = [];
  if (saha.length > 0) {
    bodyParts.push(
      `<h2 style="font-size:13px;font-weight:800;color:#92400e;margin:20px 0 10px;text-transform:uppercase;letter-spacing:0.04em;">Saha faaliyetleri (${saha.length})</h2>`
    );
    bodyParts.push(
      ...saha.map((f, i) => renderSahaCard(f, i, options.personeller))
    );
  }
  if (kamp.length > 0) {
    bodyParts.push(
      `<h2 style="font-size:13px;font-weight:800;color:#0f766e;margin:20px 0 10px;text-transform:uppercase;letter-spacing:0.04em;">Kamp faaliyetleri (${kamp.length})</h2>`
    );
    bodyParts.push(
      ...kamp.map((f, i) => renderKampCard(f, i, options.personeller))
    );
  }
  if (bodyParts.length === 0) {
    bodyParts.push(
      '<p style="color:#64748b;font-style:italic;">Bu gün için faaliyet kaydı bulunamadı.</p>'
    );
  }

  const fotoSayisi =
    saha.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0) +
    kamp.reduce((n, f) => n + getFaaliyetFotolar(f).length, 0);

  const meta = [
    `Tarih: ${label}`,
    `Toplam kayıt: ${saha.length + kamp.length} (saha ${saha.length} · kamp ${kamp.length})`,
    `Fotoğraf: ${fotoSayisi}`,
    `Oluşturan: ${options.olusturan || 'Faaliyet Personel'}`,
    `Basım: ${new Date().toLocaleString('tr-TR')}`,
  ];

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title} — ${label}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #fff; }
    .page { max-width: 900px; margin: 0 auto; }
    .meta { margin: 16px 0 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 11px; color: #475569; }
    .meta p { margin: 2px 0; }
    @media print {
      body { padding: 12px; }
      article { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div class="meta">${meta.map((m) => `<p>${escapeHtml(m)}</p>`).join('')}</div>
    ${bodyParts.join('')}
    <footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
      Kibritçi İnşaat ERP · Faaliyeti Olan Personeller
    </footer>
  </div>
</body>
</html>`;
}

/** Yazdır / PDF olarak kaydet (tarayıcı yazdırma diyaloğu) */
export function openFaaliyetGunlukReportPdf(html: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcı izinlerini kontrol edin.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  setTimeout(() => w.print(), 500);
}

export async function exportFaaliyetGunlukExcel(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  kampFaaliyetleri: KampFaaliyet[];
  personeller: Personel[];
}): Promise<void> {
  const label = formatDateLabelTr(options.dateKey);
  const workbook = await createExcelWorkbook();
  const sheet = workbook.addWorksheet('Günlük Faaliyet', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
    },
  });

  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Günlük Faaliyet Raporu';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E4E78' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:H2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Tarih: ${label} · Saha ${options.sahaFaaliyetleri.length} · Kamp ${options.kampFaaliyetleri.length}`;
  dateCell.font = { name: 'Arial', size: 11, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const headers = [
    'Kaynak',
    'Başlık / Yerleşke',
    'Tip / Niteliği',
    'Parsel / Blok',
    'Personel',
    'Açıklama',
    'Kaydeden',
    'Foto adedi',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB45309' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  sheet.columns = [
    { width: 14 },
    { width: 28 },
    { width: 22 },
    { width: 16 },
    { width: 36 },
    { width: 40 },
    { width: 18 },
    { width: 10 },
  ];

  const thinBorder = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  for (const f of options.sahaFaaliyetleri) {
    const row = sheet.addRow([
      'Saha',
      f.isNiteligi || '—',
      kaynakEtiket(f.kaynakEkran) + (isMesaiSahaFaaliyet(f) ? ' · Mesai' : ''),
      [f.parsel && `P:${f.parsel}`, f.blok && `B:${f.blok}`].filter(Boolean).join(' ') || '—',
      ekipLabel(f, options.personeller) || '—',
      f.aciklama || '—',
      f.kaydedenFormen || f.kaydeden || '—',
      getFaaliyetFotolar(f).length,
    ]);
    row.eachCell((cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }

  for (const f of options.kampFaaliyetleri) {
    const tip = [f.faaliyetTipi, f.faaliyetGrubu].filter(Boolean).join(' · ');
    const row = sheet.addRow([
      'Kamp',
      f.yerleskeAdi || '—',
      tip || '—',
      '—',
      ekipLabel(f, options.personeller) || '—',
      f.aciklama || '—',
      f.kaydedenKampci || '—',
      getFaaliyetFotolar(f).length,
    ]);
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
      if (colNumber === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFCCFBF1' },
        };
      }
    });
  }

  if (options.sahaFaaliyetleri.length === 0 && options.kampFaaliyetleri.length === 0) {
    sheet.addRow(['—', 'Bu gün için kayıt yok', '', '', '', '', '', 0]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Gunluk_Faaliyet_${options.dateKey}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
