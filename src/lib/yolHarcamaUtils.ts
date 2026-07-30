/** Şoför yol / masraf fişi yardımcıları — onay sonrası Haftalık Kasa çıkışı */
import { KasaHareketi, YolHarcamasi } from '../types/erp';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import { formatDateLabelTr, normalizeDateKey, todayDateKey } from './dateKeyUtils';
import {
  getReportEmailToolbarHtml,
  openHtmlReportWindow,
  openReportEmailComposer,
} from './reportEmail';

/** Merkez muhasebe / yönetim alıcısı (şoför masraf & kasa harcama raporları) */
export const MERKEZ_KASA_EMAIL = 'yonetim@kibritci.com';

export function isSoforKasaHareketi(k?: Pick<KasaHareketi, 'id' | 'soforOdemesi'> | null): boolean {
  if (!k) return false;
  return Boolean(k.soforOdemesi) || String(k.id || '').startsWith('kh_yol_');
}

export function yolHarcamaKasaDocId(yolHarcamaId: string): string {
  return `kh_yol_${String(yolHarcamaId || '').trim()}`;
}

/** Onaylanan şoför fişinden Haftalık Kasa ÇIKIŞ kaydı (eksi bakiye) */
export function buildYolHarcamaKasaCikisPayload(
  item: Pick<
    YolHarcamasi,
    'id' | 'tarih' | 'tutar' | 'aciklama' | 'fisNo' | 'faturaFotoUrl' | 'surucu'
  >
): KasaHareketi {
  const id = yolHarcamaKasaDocId(item.id);
  const tarih =
    normalizeDateKey(item.tarih) ||
    String(item.tarih || '').slice(0, 10) ||
    todayDateKey();
  const surucu = String(item.surucu || '').trim() || 'Bilinmeyen';
  const fisNo = String(item.fisNo || '').trim();
  const aciklamaExtra = String(item.aciklama || '').trim();
  return {
    id,
    tarih,
    hareketTipi: 'ÇIKIŞ',
    tutar: Math.abs(parseFloat(String(item.tutar)) || 0),
    aciklama: `Şoför Yol Harcaması (Fiş: ${fisNo || '—'} · ${surucu})${
      aciklamaExtra ? ` — ${aciklamaExtra}` : ''
    }`,
    referansTipi: 'DİĞER',
    referansId: item.id,
    fisEvrakUrl: item.faturaFotoUrl || '',
    soforOdemesi: true,
    surucu,
    fisNo,
  };
}

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
      if (!isSoforKasaHareketi(x)) return false;
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

/** Seçili aralıktaki tüm kasa çıkışları (şoför + diğer harcamalar) */
export function filterKasaCikisHareketleri(
  items: KasaHareketi[],
  startDate: string,
  endDate: string
): KasaHareketi[] {
  const a = normalizeDateKey(startDate) || startDate;
  const b = normalizeDateKey(endDate) || endDate;
  return (items || [])
    .filter((x) => {
      if (x.hareketTipi !== 'ÇIKIŞ') return false;
      const t = normalizeDateKey(x.tarih) || x.tarih;
      return t >= a && t <= b;
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

type RaporKalem = {
  id: string;
  tarih: string;
  fisNo?: string;
  aciklama: string;
  tutar: number;
  surucu?: string;
  fotoUrl?: string;
  tipEtiket?: string;
};

function buildMasrafTableHtml(rows: RaporKalem[], toplam: number): string {
  const tableRows = rows
    .map(
      (r, i) => `<tr>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-family:ui-monospace,monospace">${escapeHtml(r.tarih)}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:700">${escapeHtml(r.fisNo || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${escapeHtml(r.tipEtiket || '')}${escapeHtml(r.aciklama || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${escapeHtml(r.surucu || '—')}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:800;color:#b91c1c">−${Number(r.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
    </tr>`
    )
    .join('');

  return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:7px;border:1px solid #1e3a5f">#</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Tarih</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Fiş No</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Açıklama</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:left">Şoför / Kaynak</th>
          <th style="padding:7px;border:1px solid #1e3a5f;text-align:right">Çıkış (−)</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#94a3b8">Kayıt yok</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background:#fff1f2;font-weight:800">
          <td colspan="5" style="padding:8px;border:1px solid #cbd5e1;text-align:right">TOPLAM KASA ÇIKIŞI</td>
          <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;color:#b91c1c">−${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
        </tr>
      </tfoot>
    </table>`;
}

function buildFotoGridHtml(rows: RaporKalem[]): string {
  const photos = rows
    .filter((r) => r.fotoUrl)
    .map(
      (r) => `<figure style="margin:0;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#fff;page-break-inside:avoid">
      <div style="padding:6px 8px;background:#f1f5f9;font-size:10px;font-weight:700;color:#334155">
        ${escapeHtml(r.fisNo || r.id)} · ${escapeHtml(r.tarih)} · −${Number(r.tutar || 0).toLocaleString('tr-TR')} ₺
      </div>
      <img src="${escapeHtml(r.fotoUrl!)}" alt="Fiş" style="display:block;width:100%;max-height:320px;object-fit:contain;background:#f8fafc" />
      <figcaption style="padding:6px 8px;font-size:10px;color:#64748b">${escapeHtml(r.aciklama || '')}</figcaption>
    </figure>`
    )
    .join('');
  return `<h3 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#1e3a5f;margin:0 0 10px">Fiş görselleri (taranmış ek)</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${photos || '<p style="color:#94a3b8;font-style:italic;grid-column:1/-1">Fiş görseli yok</p>'}
    </div>`;
}

/** A4: şoför masraf / iade dökümü */
export function buildSoforMasrafIadeReportHtml(options: {
  startDate: string;
  endDate: string;
  items: RaporKalem[];
  surucuFiltre?: string;
  olusturan?: string;
}): string {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const rows = [...options.items].sort((a, b) => a.tarih.localeCompare(b.tarih));
  const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const title = 'ŞOFÖR MASRAF İADE RAPORU';
  const subtitle = `${start} — ${end}${options.surucuFiltre ? ` · ${options.surucuFiltre}` : ''}`;
  const subject = `Kibritçi — Şoför Masraf İade (${start} / ${end})`;
  const fileName = `Sofor_Masraf_Iade_${options.startDate}_${options.endDate}.html`;
  const toolbar = getReportEmailToolbarHtml({ subject, fileName });

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
  ${toolbar}
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div style="margin:12px 0;padding:10px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:11px;color:#9f1239">
      <p style="margin:2px 0">Kalem: <strong>${rows.length}</strong> · Toplam kasa çıkışı: <strong>−${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Oluşturan: ${escapeHtml(options.olusturan || '—')} · ${new Date().toLocaleString('tr-TR')}</p>
      <p style="margin:2px 0;font-style:italic">Yönetici onaylı şoför fişleri Haftalık Kasa’ya eksi bakiye (ÇIKIŞ) olarak işlenir. Bu rapor merkeze gönderim içindir.</p>
    </div>
    ${buildMasrafTableHtml(rows, toplam)}
    ${buildFotoGridHtml(rows)}
    <footer style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
      Kibritçi ERP · Şoför Masraf · Haftalık Kasa çıkışı
    </footer>
  </div>
</body>
</html>`;
}

/** A4: seçili aralıktaki tüm kasa çıkış / harcama dökümü */
export function buildKasaHarcamaAralikReportHtml(options: {
  startDate: string;
  endDate: string;
  items: KasaHareketi[];
  olusturan?: string;
}): string {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const rows: RaporKalem[] = [...options.items]
    .sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)))
    .map((r) => ({
      id: r.id,
      tarih: r.tarih,
      fisNo: r.fisNo,
      aciklama: r.aciklama,
      tutar: Number(r.tutar) || 0,
      surucu: r.surucu || (isSoforKasaHareketi(r) ? 'Şoför' : r.referansTipi),
      fotoUrl: r.fisEvrakUrl,
      tipEtiket: isSoforKasaHareketi(r) ? '[Şoför] ' : '',
    }));
  const toplam = rows.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const soforToplam = options.items
    .filter((x) => isSoforKasaHareketi(x))
    .reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const title = 'KASA HARCAMA (ÇIKIŞ) RAPORU';
  const subtitle = `${start} — ${end}`;
  const subject = `Kibritçi — Kasa Harcama Raporu (${start} / ${end})`;
  const fileName = `Kasa_Harcama_${options.startDate}_${options.endDate}.html`;
  const toolbar = getReportEmailToolbarHtml({ subject, fileName });

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
  ${toolbar}
  <div class="page">
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div style="margin:12px 0;padding:10px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:11px;color:#9f1239">
      <p style="margin:2px 0">Çıkış kalemi: <strong>${rows.length}</strong> · Toplam: <strong>−${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Şoför fişleri payı: <strong>−${soforToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</strong></p>
      <p style="margin:2px 0">Oluşturan: ${escapeHtml(options.olusturan || '—')} · ${new Date().toLocaleString('tr-TR')}</p>
    </div>
    ${buildMasrafTableHtml(rows, toplam)}
    ${buildFotoGridHtml(rows)}
    <footer style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center">
      Kibritçi ERP · Haftalık Kasa · Aralık harcama dökümü
    </footer>
  </div>
</body>
</html>`;
}

export function openSoforMasrafIadeReport(html: string, title: string): void {
  openHtmlReportWindow(html, title);
}

export function emailSoforMasrafIadeReport(options: {
  html: string;
  startDate: string;
  endDate: string;
  toplam?: number;
}): void {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const toplamStr =
    options.toplam != null
      ? ` Toplam çıkış: −${options.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺.`
      : '';
  openReportEmailComposer({
    subject: `Kibritçi — Şoför Masraf İade (${start} / ${end})`,
    body: `Merkez bilginize sunulur.${toplamStr}\n\nŞoför yol harcaması fişleri (yönetici onaylı / Haftalık Kasa çıkışı) ekte HTML olarak indirilebilir.`,
    html: options.html,
    fileName: `Sofor_Masraf_Iade_${options.startDate}_${options.endDate}.html`,
    defaultTo: MERKEZ_KASA_EMAIL,
  });
}

export function emailKasaHarcamaAralikReport(options: {
  html: string;
  startDate: string;
  endDate: string;
  toplam?: number;
}): void {
  const start = formatDateLabelTr(normalizeDateKey(options.startDate) || options.startDate);
  const end = formatDateLabelTr(normalizeDateKey(options.endDate) || options.endDate);
  const toplamStr =
    options.toplam != null
      ? ` Toplam kasa çıkışı: −${options.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺.`
      : '';
  openReportEmailComposer({
    subject: `Kibritçi — Kasa Harcama Raporu (${start} / ${end})`,
    body: `Merkez bilginize sunulur.${toplamStr}\n\nSeçili aralıktaki Haftalık Kasa çıkış / harcama dökümü ekte HTML olarak indirilebilir.`,
    html: options.html,
    fileName: `Kasa_Harcama_${options.startDate}_${options.endDate}.html`,
    defaultTo: MERKEZ_KASA_EMAIL,
  });
}
