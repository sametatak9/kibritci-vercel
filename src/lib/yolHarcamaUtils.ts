/** Şoför yol / masraf fişi yardımcıları */
import { KasaHareketi, YolHarcamasi } from '../types/erp';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';

export function filterYolHarcamalariByRange(
  items: YolHarcamasi[],
  startDate: string,
  endDate: string,
  surucu?: string
): YolHarcamasi[] {
  const a = normalizeDateKey(startDate) || startDate;
  const b = normalizeDateKey(endDate) || endDate;
  const driver = String(surucu || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return (items || [])
    .filter((x) => {
      const t = normalizeDateKey(x.tarih) || x.tarih;
      if (t < a || t > b) return false;
      if (driver) {
        return String(x.surucu || '')
          .trim()
          .toLocaleLowerCase('tr-TR')
          .includes(driver);
      }
      return true;
    })
    .sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
}

export function filterSoforKasaHareketleri(
  items: KasaHareketi[],
  startDate: string,
  endDate: string,
  surucu?: string
): KasaHareketi[] {
  const a = normalizeDateKey(startDate) || startDate;
  const b = normalizeDateKey(endDate) || endDate;
  const driver = String(surucu || '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return (items || [])
    .filter((x) => {
      if (!x.soforOdemesi && !String(x.id || '').startsWith('kh_yol_')) return false;
      const t = normalizeDateKey(x.tarih) || x.tarih;
      if (t < a || t > b) return false;
      if (driver) {
        return String(x.surucu || '')
          .trim()
          .toLocaleLowerCase('tr-TR')
          .includes(driver);
      }
      return true;
    })
    .sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A4 taranmış görünüm: kalem tablosu + fiş foto ızgarası */
export function buildSoforMasrafIadeReportHtml(options: {
  startDate: string;
  endDate: string;
  items: Array<{
    id: string;
    tarih: string;
    fisNo?: string;
    aciklama: string;
    tutar: number;
    surucu?: string;
    fotoUrl?: string;
  }>;
  surucuFiltre?: string;
  olusturan?: string;
}): string {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const rows = [...options.items].sort((a, b) => a.tarih.localeCompare(b.tarih));
  const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);

  const tableRows = rows
    .map(
      (r, i) => `<tr>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-family:ui-monospace,monospace">${escapeHtml(r.tarih)}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:700">${escapeHtml(r.fisNo || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${escapeHtml(r.aciklama || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${escapeHtml(r.surucu || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:800">${Number(r.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
    </tr>`
    )
    .join('');

  const photos = rows
    .filter((r) => r.fotoUrl)
    .map(
      (r) => `<figure style="margin:0;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;page-break-inside:avoid">
      <div style="padding:6px 8px;background:#f1f5f9;font-size:10px;font-weight:700;color:#334155">
        ${escapeHtml(r.fisNo || r.id)} · ${escapeHtml(r.tarih)} · ${Number(r.tutar || 0).toLocaleString('tr-TR')} ₺
      </div>
      <img src="${escapeHtml(r.fotoUrl!)}" alt="Fiş" style="display:block;width:100%;max-height:320px;object-fit:contain;background:#f8fafc" />
      <figcaption style="padding:6px 8px;font-size:10px;color:#64748b">${escapeHtml(r.aciklama || '')}</figcaption>
    </figure>`
    )
    .join('');

  const title = 'ŞOFÖR MASRAF İADE RAPORU';
  const subtitle = `${start} — ${end}${options.surucuFiltre ? ` · ${options.surucuFiltre}` : ''}`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 16px; color: #0f172a; }
    .page { max-width: 210mm; margin: 0 auto; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div style="margin:12px 0;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11px;color:#475569">
      <p style="margin:2px 0">Kalem: <strong>${rows.length}</strong> · Toplam: <strong>${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Oluşturan: ${escapeHtml(options.olusturan || '—')} · ${new Date().toLocaleString('tr-TR')}</p>
      <p style="margin:2px 0;font-style:italic">Bu rapor merkez geri ödemesi için şoför masraf fişlerinin birleşik dökümüdür.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:7px;border:1px solid #1e3a5f">#</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Tarih</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Fiş No</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Açıklama</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Şoför</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:right">Tutar</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#94a3b8">Kayıt yok</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:800">
          <td colspan="5" style="padding:8px;border:1px solid #cbd5e1;text-align:right">TOPLAM</td>
          <td style="padding:8px;border:1px solid #cbd5e1;text-align:right">${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
        </tr>
      </tfoot>
    </table>
    <h3 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#1e3a5f;margin:0 0 10px">Fiş görselleri (taranmış ek)</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${photos || '<p style="color:#94a3b8;font-style:italic;grid-column:1/-1">Fiş görseli yok</p>'}
    </div>
    <footer style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
      Kibritçi ERP · Şoför Masraf İade · Haftalık Kasa bağlantılı
    </footer>
  </div>
</body>
</html>`;
}

export function openSoforMasrafIadeReport(html: string, title: string): void {
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
