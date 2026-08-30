import { kibritciReportHeaderHtml } from './kibritciBrand';
import { normalizeKampFaaliyetForDisplay } from './mobilOnayUtils';

export interface KampGunlukFaaliyetKaydi {
  id: string;
  tarih?: string;
  kaydeden?: string;
  faaliyetTipi?: string;
  yerleskeAdi?: string;
  aciklama?: string;
  fotoUrl?: string | null;
  durum?: string;
  [key: string]: unknown;
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function formatKampFaaliyetDonemLabel(tarih: string, mode: 'day' | 'month'): string {
  const [y, m, d] = tarih.split('-').map(Number);
  if (!y || !m) return tarih;
  if (mode === 'month') return `${TR_MONTHS[m - 1] || m} ${y}`;
  return `${String(d).padStart(2, '0')} ${TR_MONTHS[m - 1] || m} ${y}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFaaliyetCard(doc: KampGunlukFaaliyetKaydi, index: number): string {
  const view = normalizeKampFaaliyetForDisplay(doc as Record<string, unknown>);
  const tarih = String(doc.tarih || '-');
  const durum = String(doc.durum || '—');
  const foto = view.photo
    ? `<img src="${escapeHtml(view.photo)}" alt="Faaliyet fotoğrafı" style="max-width:100%;max-height:280px;border-radius:8px;border:1px solid #e2e8f0;margin-top:10px;object-fit:contain;" />`
    : '<p style="margin:8px 0 0;font-size:11px;color:#94a3b8;font-style:italic;">Fotoğraf eklenmemiş</p>';

  return `
    <article style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:700;">#${index + 1} · ${escapeHtml(tarih)}</div>
          <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:4px;">${escapeHtml(view.kategori)}</div>
          <div style="font-size:11px;color:#475569;margin-top:4px;">📍 ${escapeHtml(view.yerleske || '—')}</div>
        </div>
        <span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;background:#f1f5f9;color:#334155;white-space:nowrap;">${escapeHtml(durum)}</span>
      </div>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;">${escapeHtml(view.aciklama || '—')}</p>
      <p style="margin:8px 0 0;font-size:10px;color:#64748b;">Kaydeden: ${escapeHtml(view.kaydeden)}</p>
      ${foto}
    </article>`;
}

export function buildKampFaaliyetReportHtml(options: {
  mode: 'day' | 'month';
  anchorDate: string;
  records: KampGunlukFaaliyetKaydi[];
  olusturan?: string;
}): string {
  const donem = formatKampFaaliyetDonemLabel(options.anchorDate, options.mode);
  const title =
    options.mode === 'day'
      ? 'KAMP GÜNLÜK FAALİYET RAPORU'
      : 'KAMP AYLIK FAALİYET RAPORU';
  const subtitle =
    options.mode === 'day'
      ? `${donem} tarihli iş kayıtları`
      : `${donem} dönemi iş kayıtları`;

  const sorted = [...options.records].sort((a, b) =>
    String(a.tarih || '').localeCompare(String(b.tarih || ''))
  );

  const body =
    sorted.length === 0
      ? '<p style="color:#64748b;font-style:italic;">Bu dönem için kamp faaliyet kaydı bulunamadı.</p>'
      : sorted.map((r, i) => renderFaaliyetCard(r, i)).join('');

  const meta = [
    `Toplam kayıt: ${sorted.length}`,
    `Oluşturan: ${options.olusturan || 'Kamp Yönetimi'}`,
    `Basım: ${new Date().toLocaleString('tr-TR')}`,
  ];

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${title} — ${donem}</title>
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
    ${body}
    <footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
      Kibritçi İnşaat ERP · Kamp Faaliyet Takip Modülü
    </footer>
  </div>
</body>
</html>`;
}

export function openKampFaaliyetReport(html: string, title: string): void {
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
