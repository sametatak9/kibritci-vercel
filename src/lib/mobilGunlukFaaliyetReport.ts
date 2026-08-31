/** Tesisatçı / Mermerci mobil — seçili günün faaliyetlerini birleşik HTML rapor */
import { kibritciReportHeaderHtml } from './kibritciBrand';
import { formatDateLabelTr, normalizeDateKey } from './dateKeyUtils';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';

export type MobilGunlukFaaliyetKaydi = {
  id: string;
  tarih?: string;
  isNiteligi?: string;
  faaliyetGrubu?: string;
  calismaAlani?: string;
  yerleskeAdi?: string;
  parsel?: string;
  blok?: string;
  aciklama?: string;
  fotoUrl?: string;
  fotoUrls?: string[];
  kaydeden?: string;
  aktifPersonelListesi?: string[];
  [key: string]: unknown;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCard(
  doc: MobilGunlukFaaliyetKaydi,
  index: number,
  locLabel: string
): string {
  const fotolar = getFaaliyetFotolar(doc);
  const fotoHtml =
    fotolar.length > 0
      ? fotolar
          .map(
            (url) =>
              `<img src="${escapeHtml(url)}" alt="Faaliyet fotoğrafı" style="max-width:100%;max-height:260px;border-radius:8px;border:1px solid #e2e8f0;margin-top:8px;object-fit:contain;" />`
          )
          .join('')
      : '<p style="margin:8px 0 0;font-size:11px;color:#94a3b8;font-style:italic;">Fotoğraf eklenmemiş</p>';

  const grup =
    String(doc.faaliyetGrubu || '').toUpperCase() === 'MESAI' ? 'MESAİ' : 'NORMAL';

  return `
    <article style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:700;">#${index + 1} · ${escapeHtml(String(doc.tarih || '—'))}</div>
          <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:4px;">${escapeHtml(String(doc.isNiteligi || 'Faaliyet'))}</div>
          <div style="font-size:11px;color:#475569;margin-top:4px;">📍 ${escapeHtml(locLabel)}</div>
        </div>
        <span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;background:#f1f5f9;color:#334155;white-space:nowrap;">${escapeHtml(grup)}</span>
      </div>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;">${escapeHtml(String(doc.aciklama || '—'))}</p>
      <p style="margin:8px 0 0;font-size:10px;color:#64748b;">Kaydeden: ${escapeHtml(String(doc.kaydeden || '—'))}</p>
      ${fotoHtml}
    </article>`;
}

export function buildMobilGunlukFaaliyetReportHtml(options: {
  rol: 'TESİSATÇI' | 'MERMERCİ' | 'GÖTÜRÜ';
  anchorDate: string;
  records: MobilGunlukFaaliyetKaydi[];
  olusturan?: string;
}): string {
  const dateKey = normalizeDateKey(options.anchorDate) || options.anchorDate;
  const donem = formatDateLabelTr(dateKey);
  const title = `${options.rol} GÜNLÜK FAALİYET RAPORU`;
  const subtitle = `${donem} tarihli iş kayıtları (birleşik)`;

  const sorted = [...options.records].sort((a, b) =>
    String(a.isNiteligi || '').localeCompare(String(b.isNiteligi || ''), 'tr')
  );

  const body =
    sorted.length === 0
      ? `<p style="color:#64748b;font-style:italic;">Bu tarih için ${options.rol.toLowerCase()} faaliyet kaydı bulunamadı.</p>`
      : sorted
          .map((r, i) => {
            const loc =
              options.rol === 'TESİSATÇI'
                ? [r.calismaAlani, r.yerleskeAdi].filter(Boolean).join(' · ') || '—'
                : [r.parsel, r.blok].filter(Boolean).join(' / ') || '—';
            return renderCard(r, i, loc);
          })
          .join('');

  const meta = [
    `Toplam kayıt: ${sorted.length}`,
    `Oluşturan: ${options.olusturan || options.rol}`,
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
      Kibritçi İnşaat ERP · ${options.rol} Mobil Faaliyet Modülü
    </footer>
  </div>
</body>
</html>`;
}

export function openMobilGunlukFaaliyetReport(html: string, title: string): void {
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
