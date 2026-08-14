import { AylikYoklamaMap, KampFaaliyet, Personel, SahaFaaliyeti } from '../types/erp';
import { formatDateLabelTr } from './dateKeyUtils';
import { buildDayPersonelRaporu, resolveFaaliyetEkip } from './faaliyetPersonelUtils';
import { createExcelWorkbook } from './exceljsLoader';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import {
  formatMesaiFaaliyetLabel,
  getFaaliyetFotolar,
  getFaaliyetTumFotolar,
  isMesaiSahaFaaliyet,
} from './sahaFaaliyetUtils';
import { buildIlerlemeTimelineHtml } from './faaliyetIlerlemeReportUtils';
import { ilerlemeDurumuLabel } from './faaliyetEtiketUtils';

/** Excel'e gömmek için görseli JPEG base64'e çevirir (webp/data/http). */
async function loadImageAsJpegBase64(url: string): Promise<string | null> {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const fromCanvas = (src: string): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      const finish = () => {
        try {
          const maxW = 520;
          const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width));
          const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const b64 = dataUrl.replace(/^data:image\/jpeg;base64,/i, '');
          resolve(b64 || null);
        } catch {
          resolve(null);
        }
      };
      img.onload = finish;
      img.onerror = () => resolve(null);
      img.src = src;
    });

  if (raw.startsWith('data:image/')) {
    const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
    if (m && !/webp/i.test(m[1])) {
      // png/jpeg doğrudan kullanılabilir; exceljs jpeg tercih
      if (/jpe?g/i.test(m[1])) return m[2];
    }
    return fromCanvas(raw);
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) {
    const viaImg = await fromCanvas(raw);
    if (viaImg) return viaImg;
    try {
      const resp = await fetch(raw, { mode: 'cors' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await fromCanvas(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportModuleLoadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  const low = raw.toLowerCase();
  if (
    low.includes('failed to fetch dynamically imported module') ||
    low.includes('importing a module') ||
    low.includes('not a valid javascript mime') ||
    low.includes('text/html')
  ) {
    return 'Sayfa güncellenmiş (eski önbellek). Ctrl+F5 ile yenileyip raporu tekrar deneyin.';
  }
  return raw || 'Rapor oluşturulamadı.';
}

export { reportModuleLoadError };

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ilerlemeOzet(f: SahaFaaliyeti): string {
  const list = (f.ilerlemeKayitlari || [])
    .map((k) => String(k.yorum || '').trim())
    .filter(Boolean);
  return list.join(' · ');
}

function kaynakEtiket(kaynak?: string): string {
  const k = String(kaynak || '').toUpperCase();
  if (k === 'FORMEN_MOBIL') return 'Formen Mobil';
  if (k === 'IDARI_SAHA') return 'İdari Saha';
  if (k === 'GUNLUK_PROGRAM') return 'Günlük Program';
  if (k === 'TESISATCI_MOBIL') return 'Tesisatçı';
  if (k === 'MERMERCI_MOBIL') return 'Mermerci';
  if (k === 'SERAMIK_MOBIL') return 'Götürü / Seramik';
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
      (url, idx) =>
        `<button type="button" class="foto-thumb" data-foto-url="${escapeHtml(url)}" title="Büyütmek için tıklayın" style="display:block;width:100%;padding:0;border:2px solid #64748b;border-radius:10px;overflow:hidden;background:#0f172a;cursor:zoom-in;box-shadow:0 2px 8px rgba(15,23,42,.12)">
          <img src="${escapeHtml(url)}" alt="Faaliyet fotoğrafı ${idx + 1}" style="display:block;width:100%;height:200px;object-fit:cover;pointer-events:none" />
          <span style="display:block;padding:4px;font-size:9px;font-weight:800;color:#e2e8f0;background:#1e293b;text-align:center">🔍 Büyüt</span>
        </button>`
    )
    .join('');
  return `<div style="margin-top:12px;">
    <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Saha / Kamp fotoğrafları (${fotolar.length}) — tıklayınca büyür</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">${imgs}</div>
  </div>`;
}

function renderSahaCard(
  f: SahaFaaliyeti,
  index: number,
  personeller: Personel[]
): string {
  const sabahFotolar = getFaaliyetFotolar(f);
  const tumFotolar = getFaaliyetTumFotolar(f);
  const ekip = ekipLabel(f, personeller);
  const konum = [f.parsel && `Parsel ${f.parsel}`, f.blok && `Blok ${f.blok}`]
    .filter(Boolean)
    .join(' · ');
  const mesai = isMesaiSahaFaaliyet(f)
    ? `<p style="margin:8px 0 0;font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;">Mesai: ${escapeHtml(formatMesaiFaaliyetLabel(f, personeller) || '—')}</p>`
    : '';
  const ilerlemeCount = (f.ilerlemeKayitlari || []).length;

  return `
    <article style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font-size:11px;color:#64748b;font-weight:700;">#${index + 1} · Saha · ${escapeHtml(kaynakEtiket(f.kaynakEkran))}</div>
          <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:4px;">${escapeHtml(f.isNiteligi || 'İş niteliği belirtilmemiş')}</div>
          ${
            f.isEtiketi
              ? `<div style="margin-top:4px;font-size:10px;font-weight:800;color:#6d28d9;">Etiket: ${escapeHtml(f.isEtiketi)}</div>`
              : ''
          }
          ${konum ? `<div style="font-size:11px;color:#475569;margin-top:4px;">📍 ${escapeHtml(konum)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          ${
            isMesaiSahaFaaliyet(f)
              ? '<span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;background:#fef3c7;color:#92400e;white-space:nowrap;">Mesai</span>'
              : ''
          }
          <span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:999px;background:#f1f5f9;color:#475569;white-space:nowrap">${escapeHtml(ilerlemeDurumuLabel(f.ilerlemeDurumu))}</span>
        </div>
      </div>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;"><strong>Sabah açıklaması:</strong> ${escapeHtml(f.aciklama || '—')}</p>
      <p style="margin:8px 0 0;font-size:11px;color:#334155;"><strong>Personel:</strong> ${escapeHtml(ekip || '—')}</p>
      <p style="margin:4px 0 0;font-size:10px;color:#64748b;">Kaydeden: ${escapeHtml(f.kaydedenFormen || f.kaydeden || '—')} · İlerleme kaydı: ${ilerlemeCount}</p>
      ${mesai}
      ${
        sabahFotolar.length > 0
          ? `<div style="margin-top:10px"><div style="font-size:10px;font-weight:800;color:#64748b;margin-bottom:6px">Sabah fotoğrafları (${sabahFotolar.length})</div>${renderFotoBlock(sabahFotolar)}</div>`
          : tumFotolar.length === 0
            ? renderFotoBlock([])
            : ''
      }
      ${buildIlerlemeTimelineHtml(f)}
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
  yoklamalar?: AylikYoklamaMap;
  olusturan?: string;
  atanmamisPersoneller?: Personel[];
}): string {
  const label = formatDateLabelTr(options.dateKey);
  const saha = options.sahaFaaliyetleri || [];
  const kamp = options.kampFaaliyetleri || [];
  const ozet = buildDayPersonelRaporu(
    saha,
    kamp,
    options.personeller,
    options.dateKey,
    options.yoklamalar || {}
  );
  const title = 'GÜNLÜK SAHA FAALİYETİ DETAYLI RAPORU';
  const subtitle = `${label} — faaliyetler, açıklamalar ve saha fotoğrafları`;

  const personelRows = ozet.faaliyetliPersoneller
    .map(
      (p, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${escapeHtml(p.adSoyad)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${escapeHtml(p.gorev)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.sahaSayisi}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.kampSayisi}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;">${p.faaliyetSayisi}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.fotoSayisi}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:${
            p.yoklamaDurum === 'Geldi'
              ? '#d1fae5;color:#065f46'
              : p.yoklamaDurum === 'Yok'
                ? '#ffe4e6;color:#9f1239'
                : p.yoklamaDurum === 'İzinli'
                  ? '#e0f2fe;color:#075985'
                  : '#f1f5f9;color:#64748b'
          };">${escapeHtml(p.yoklamaDurum)}</span>
        </td>
      </tr>`
    )
    .join('');

  const yokRows = ozet.yokPersoneller
    .map(
      (p, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #fecdd3;text-align:center;color:#9f1239;">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #fecdd3;font-weight:700;color:#0f172a;">${escapeHtml(p.adSoyad)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #fecdd3;color:#475569;">${escapeHtml(p.gorev)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #fecdd3;text-align:center;">
          <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:#ffe4e6;color:#9f1239;">Yok</span>
        </td>
      </tr>`
    )
    .join('');

  const atanmamis = options.atanmamisPersoneller || [];
  const atanmamisRows = atanmamis
    .map(
      (p, i) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #fde68a;text-align:center;color:#92400e;">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #fde68a;font-weight:700;color:#0f172a;">${escapeHtml(`${p.ad || ''} ${p.soyad || ''}`.trim())}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #fde68a;color:#475569;">${escapeHtml(p.gorev || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #fde68a;text-align:center;">
          <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;">Atanmadı</span>
        </td>
      </tr>`
    )
    .join('');

  const atanmamisPage =
    atanmamis.length === 0
      ? ''
      : `
    <section style="margin:20px 0 8px;">
      <h2 style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">
        Geldi — henüz görevlendirilmeyen (${atanmamis.length})
      </h2>
      <p style="margin:0 0 12px;font-size:11px;color:#64748b;">Yoklamada Geldi, henüz saha kaydına bağlanmamış personel</p>
      <table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #fde68a;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#b45309;color:#fff;">
            <th style="padding:9px 10px;text-align:center;width:36px;">#</th>
            <th style="padding:9px 10px;text-align:left;">Ad Soyad</th>
            <th style="padding:9px 10px;text-align:left;">Görev</th>
            <th style="padding:9px 10px;text-align:center;">Durum</th>
          </tr>
        </thead>
        <tbody>${atanmamisRows}</tbody>
      </table>
    </section>`;

  const personelPage = `
    <section class="personel-page" style="page-break-before:always;margin-top:8px;">
      <h2 style="font-size:14px;font-weight:900;color:#0f172a;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">
        Faaliyeti Olan Personeller (${ozet.personelSayisi})
      </h2>
      <p style="margin:0 0 12px;font-size:11px;color:#64748b;">
        Bu günde saha veya kamp faaliyet kaydına bağlı personel özeti
      </p>
      ${
        ozet.faaliyetliPersoneller.length === 0
          ? '<p style="color:#64748b;font-style:italic;">Bu gün faaliyetli personel bulunamadı.</p>'
          : `<table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#1e4e78;color:#fff;">
                  <th style="padding:9px 10px;text-align:center;width:36px;">#</th>
                  <th style="padding:9px 10px;text-align:left;">Ad Soyad</th>
                  <th style="padding:9px 10px;text-align:left;">Görev</th>
                  <th style="padding:9px 10px;text-align:center;">Saha</th>
                  <th style="padding:9px 10px;text-align:center;">Kamp</th>
                  <th style="padding:9px 10px;text-align:center;">Toplam</th>
                  <th style="padding:9px 10px;text-align:center;">Foto</th>
                  <th style="padding:9px 10px;text-align:center;">Yoklama</th>
                </tr>
              </thead>
              <tbody>${personelRows}</tbody>
            </table>`
      }

      <h2 style="font-size:14px;font-weight:900;color:#9f1239;margin:28px 0 6px;text-transform:uppercase;letter-spacing:0.04em;">
        Yok Olan Personeller (${ozet.yokSayisi})
      </h2>
      <p style="margin:0 0 12px;font-size:11px;color:#64748b;">
        Bu gün yoklama kaydında durumu "Yok" olan aktif personeller
      </p>
      ${
        ozet.yokPersoneller.length === 0
          ? '<p style="color:#64748b;font-style:italic;">Bu gün yok kaydı bulunamadı.</p>'
          : `<table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #fecdd3;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#be123c;color:#fff;">
                  <th style="padding:9px 10px;text-align:center;width:36px;">#</th>
                  <th style="padding:9px 10px;text-align:left;">Ad Soyad</th>
                  <th style="padding:9px 10px;text-align:left;">Görev</th>
                  <th style="padding:9px 10px;text-align:center;">Durum</th>
                </tr>
              </thead>
              <tbody>${yokRows}</tbody>
            </table>`
      }
    </section>`;

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

  const meta = [
    `Tarih: ${label}`,
    `Toplam kayıt: ${ozet.faaliyetSayisi} (saha ${ozet.sahaSayisi} · kamp ${ozet.kampSayisi})`,
    `Faaliyeti olan personel: ${ozet.personelSayisi}`,
    `Yok olan personel: ${ozet.yokSayisi}`,
    atanmamis.length ? `Henüz görevlendirilmeyen Geldi: ${atanmamis.length}` : '',
    `Fotoğraf: ${ozet.fotoSayisi}`,
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
    .toolbar { position: sticky; top: 0; z-index: 40; display:flex; gap:8px; justify-content:flex-end; padding:0 0 12px; background:linear-gradient(#fff,#fff 80%,transparent); }
    .toolbar button { border:0; border-radius:10px; padding:8px 14px; font-size:12px; font-weight:800; cursor:pointer; background:#1e3a5f; color:#fff; }
    #foto-lightbox { display:none; position:fixed; inset:0; z-index:9999; background:rgba(15,23,42,.92); align-items:center; justify-content:center; padding:24px; cursor:zoom-out; }
    #foto-lightbox.open { display:flex; }
    #foto-lightbox img { max-width:min(96vw,1100px); max-height:90vh; object-fit:contain; border-radius:12px; background:#111; cursor:default; }
    #foto-lightbox .lb-close { position:absolute; top:16px; right:16px; border:0; background:#fff; color:#0f172a; font-weight:900; font-size:14px; border-radius:999px; padding:8px 14px; cursor:pointer; }
    @media print {
      body { padding: 12px; }
      article { break-inside: avoid; }
      .personel-page { page-break-before: always; }
      .toolbar, #foto-lightbox, .foto-thumb span { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar"><button type="button" onclick="window.print()">🖨 Yazdır / PDF</button></div>
    ${kibritciReportHeaderHtml(title, subtitle)}
    <div class="meta">${meta.filter(Boolean).map((m) => `<p>${escapeHtml(m)}</p>`).join('')}<p style="margin-top:6px;font-weight:700;color:#1e3a5f">Fotoğrafa tıklayınca büyür. Üstten Yazdır / PDF alın.</p></div>
    ${bodyParts.join('')}
    ${atanmamisPage}
    ${personelPage}
    <footer style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
      Kibritçi İnşaat ERP · Faaliyeti Olan Personeller
    </footer>
  </div>
  <div id="foto-lightbox" role="dialog" aria-modal="true">
    <button type="button" class="lb-close" id="foto-lightbox-close">Kapat ✕</button>
    <img id="foto-lightbox-img" alt="Büyük fotoğraf" />
  </div>
  <script>
    (function () {
      var lb = document.getElementById('foto-lightbox');
      var img = document.getElementById('foto-lightbox-img');
      var closeBtn = document.getElementById('foto-lightbox-close');
      function openLb(url) { if (!url||!lb||!img) return; img.src=url; lb.classList.add('open'); }
      function closeLb() { if (!lb||!img) return; lb.classList.remove('open'); img.removeAttribute('src'); }
      document.addEventListener('click', function (e) {
        var t = e.target; if (!t) return;
        var btn = t.closest ? t.closest('.foto-thumb') : null;
        if (btn) { e.preventDefault(); openLb(btn.getAttribute('data-foto-url')); return; }
        if (t === lb || t === closeBtn) closeLb();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
      if (img) img.addEventListener('click', function (e) { e.stopPropagation(); });
    })();
  </script>
</body>
</html>`;
}

export function downloadFaaliyetGunlukReportHtml(html: string, dateKey: string): void {
  triggerBrowserDownload(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `Gunluk_Saha_Faaliyet_Detay_${dateKey}.html`
  );
}

/** Tıklama anında açılmış pencereye raporu yazar (async import sonrası window.open engellenir). */
export function fillFaaliyetGunlukReportWindow(w: Window, html: string, title: string): boolean {
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.document.title = title;
    try {
      w.focus();
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    try {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      w.location.replace(url);
      return true;
    } catch {
      return false;
    }
  }
}

/** Yazdır / PDF — pop-up yoksa HTML indirir */
export function openFaaliyetGunlukReportPdf(html: string, title: string, dateKey?: string): void {
  const w = window.open('about:blank', '_blank');
  if (w && fillFaaliyetGunlukReportWindow(w, html, title)) return;
  downloadFaaliyetGunlukReportHtml(html, dateKey || 'rapor');
  alert('Pop-up engellendi. Rapor HTML olarak indirildi — dosyayı açıp Yazdır / PDF alın.');
}

export async function exportFaaliyetGunlukExcel(options: {
  dateKey: string;
  sahaFaaliyetleri: SahaFaaliyeti[];
  kampFaaliyetleri: KampFaaliyet[];
  personeller: Personel[];
  yoklamalar?: AylikYoklamaMap;
}): Promise<void> {
  const label = formatDateLabelTr(options.dateKey);
  const ozet = buildDayPersonelRaporu(
    options.sahaFaaliyetleri,
    options.kampFaaliyetleri,
    options.personeller,
    options.dateKey,
    options.yoklamalar || {}
  );
  const workbook = await createExcelWorkbook();
  const sheet = workbook.addWorksheet('Günlük Faaliyet', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
    },
  });

  sheet.mergeCells('A1:L1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Günlük Saha Faaliyeti Detaylı Raporu';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E4E78' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:L2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `Tarih: ${label} · Saha ${ozet.sahaSayisi} · Kamp ${ozet.kampSayisi} · Faaliyetli ${ozet.personelSayisi} · Yok ${ozet.yokSayisi} · Açıklama + fotoğraflar gömülü (L sütunu + Fotoğraflar sekmesi)`;
  dateCell.font = { name: 'Arial', size: 11, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const headers = [
    'Kaynak',
    'Başlık / Yerleşke',
    'Tip',
    'İş etiketi',
    'Parsel / Blok',
    'Personel',
    'Açıklama',
    'Gün içi not',
    'Kaydeden',
    'Foto adedi',
    'Foto URL',
    'Foto',
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
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 32 },
    { width: 36 },
    { width: 32 },
    { width: 18 },
    { width: 10 },
    { width: 28 },
    { width: 22 },
  ];

  const thinBorder = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  type FotoSatir = {
    kaynak: string;
    baslik: string;
    aciklama: string;
    urls: string[];
    mainRowNumber?: number;
  };
  const fotoSatirlari: FotoSatir[] = [];

  const addMainRow = async (opts: {
    kaynak: string;
    baslik: string;
    tip: string;
    etiket?: string;
    konum: string;
    personel: string;
    aciklama: string;
    ilerleme?: string;
    kaydeden: string;
    fotolar: string[];
    highlightKamp?: boolean;
  }) => {
    const row = sheet.addRow([
      opts.kaynak,
      opts.baslik,
      opts.tip,
      opts.etiket || '—',
      opts.konum,
      opts.personel,
      opts.aciklama,
      opts.ilerleme || '—',
      opts.kaydeden,
      opts.fotolar.length,
      opts.fotolar[0] || '—',
      opts.fotolar.length ? '' : '—',
    ]);
    row.height = opts.fotolar.length > 0 ? 88 : 28;
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
      if (opts.highlightKamp && colNumber === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFCCFBF1' },
        };
      }
    });

    fotoSatirlari.push({
      kaynak: opts.kaynak,
      baslik: opts.baslik,
      aciklama: opts.aciklama,
      urls: opts.fotolar,
      mainRowNumber: row.number,
    });

    if (opts.fotolar[0]) {
      const b64 = await loadImageAsJpegBase64(opts.fotolar[0]);
      if (b64) {
        const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
        sheet.addImage(imageId, {
          tl: { col: 11, row: row.number - 1 },
          ext: { width: 118, height: 78 },
          editAs: 'oneCell',
        });
      }
    }
  };

  for (const f of options.sahaFaaliyetleri) {
    const fotolar = getFaaliyetTumFotolar(f);
    await addMainRow({
      kaynak: kaynakEtiket(f.kaynakEkran),
      baslik: f.isNiteligi || '—',
      tip: kaynakEtiket(f.kaynakEkran) + (isMesaiSahaFaaliyet(f) ? ' · Mesai' : ''),
      etiket: f.isEtiketi || '',
      konum:
        [f.parsel && `P:${f.parsel}`, f.blok && `B:${f.blok}`].filter(Boolean).join(' ') || '—',
      personel: ekipLabel(f, options.personeller) || '—',
      aciklama: f.aciklama || '—',
      ilerleme: ilerlemeOzet(f),
      kaydeden: f.kaydedenFormen || f.kaydeden || '—',
      fotolar,
    });
  }

  for (const f of options.kampFaaliyetleri) {
    const tip = [f.faaliyetTipi, f.faaliyetGrubu].filter(Boolean).join(' · ');
    const fotolar = getFaaliyetFotolar(f);
    await addMainRow({
      kaynak: 'Kampçı',
      baslik: f.yerleskeAdi || '—',
      tip: tip || '—',
      konum: '—',
      personel: ekipLabel(f, options.personeller) || '—',
      aciklama: f.aciklama || '—',
      kaydeden: f.kaydedenKampci || '—',
      fotolar,
      highlightKamp: true,
    });
  }

  if (options.sahaFaaliyetleri.length === 0 && options.kampFaaliyetleri.length === 0) {
    sheet.addRow(['—', 'Bu gün için kayıt yok', '', '', '', '', '', '', '', 0, '', '']);
  }

  // Fotoğraflar albüm sayfası — her kayıt için büyük görseller
  const fotoSheet = workbook.addWorksheet('Fotoğraflar', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  fotoSheet.mergeCells('A1:E1');
  const fTitle = fotoSheet.getCell('A1');
  fTitle.value = `Faaliyet Fotoğrafları — ${label}`;
  fTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  fTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  fTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  fotoSheet.getRow(1).height = 26;

  fotoSheet.mergeCells('A2:E2');
  const fHint = fotoSheet.getCell('A2');
  fHint.value =
    'Her kaydın fotoğrafları aşağıda gömülüdür. Ana sayfada L sütununda ilk fotoğraf görünür.';
  fHint.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };

  fotoSheet.columns = [
    { width: 6 },
    { width: 16 },
    { width: 28 },
    { width: 36 },
    { width: 28 },
  ];

  let albumNo = 0;
  for (const sat of fotoSatirlari) {
    albumNo += 1;
    const head = fotoSheet.addRow([
      albumNo,
      sat.kaynak,
      sat.baslik,
      sat.aciklama || '',
      sat.urls.length ? `${sat.urls.length} foto` : 'Foto yok',
    ]);
    head.eachCell((cell) => {
      cell.border = thinBorder;
      cell.font = { bold: true, size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    head.height = 28;

    if (sat.urls.length === 0) continue;

    // Her foto için ayrı satır + gömülü görsel (yan yana max 2)
    for (let i = 0; i < sat.urls.length; i += 2) {
      const chunk = sat.urls.slice(i, i + 2);
      const imgRow = fotoSheet.addRow(['', '', '', '', '']);
      imgRow.height = 150;
      imgRow.eachCell((cell) => {
        cell.border = thinBorder;
      });

      for (let j = 0; j < chunk.length; j++) {
        const b64 = await loadImageAsJpegBase64(chunk[j]);
        if (!b64) {
          fotoSheet.getCell(imgRow.number, 3 + j).value = 'Görsel yüklenemedi';
          continue;
        }
        const imageId = workbook.addImage({ base64: b64, extension: 'jpeg' });
        fotoSheet.addImage(imageId, {
          tl: { col: 1 + j * 2, row: imgRow.number - 1 },
          ext: { width: 260, height: 140 },
          editAs: 'oneCell',
        });
      }
    }
  }

  if (fotoSatirlari.length === 0) {
    fotoSheet.addRow(['—', '—', 'Bu gün faaliyet kaydı yok', '', '']);
  } else {
    const withFoto = fotoSatirlari.filter((s) => s.urls.length > 0).length;
    const note = fotoSheet.addRow([
      '',
      '',
      `Toplam ${fotoSatirlari.length} kayıt · ${withFoto} kayıtta fotoğraf var`,
      '',
      '',
    ]);
    note.getCell(3).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
  }

  // Faaliyeti olan personeller sayfası
  const personelSheet = workbook.addWorksheet('Faaliyetli Personel', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  personelSheet.mergeCells('A1:H1');
  const pTitle = personelSheet.getCell('A1');
  pTitle.value = `Faaliyeti Olan Personeller — ${label}`;
  pTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  pTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E78' } };
  pTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  personelSheet.getRow(1).height = 24;

  const pHeaders = ['#', 'Ad Soyad', 'Görev', 'Saha', 'Kamp', 'Toplam', 'Foto', 'Yoklama'];
  const pHeaderRow = personelSheet.addRow(pHeaders);
  pHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });
  personelSheet.columns = [
    { width: 5 },
    { width: 28 },
    { width: 22 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 12 },
  ];
  ozet.faaliyetliPersoneller.forEach((p, i) => {
    const row = personelSheet.addRow([
      i + 1,
      p.adSoyad,
      p.gorev,
      p.sahaSayisi,
      p.kampSayisi,
      p.faaliyetSayisi,
      p.fotoSayisi,
      p.yoklamaDurum,
    ]);
    row.eachCell((cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle' };
    });
  });
  if (ozet.faaliyetliPersoneller.length === 0) {
    personelSheet.addRow(['—', 'Bu gün faaliyetli personel yok', '', '', '', '', '', '']);
  }

  // Yok olan personeller sayfası
  const yokSheet = workbook.addWorksheet('Yok Personel', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  yokSheet.mergeCells('A1:D1');
  const yTitle = yokSheet.getCell('A1');
  yTitle.value = `Yok Olan Personeller — ${label} (${ozet.yokSayisi})`;
  yTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  yTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE123C' } };
  yTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  yokSheet.getRow(1).height = 24;

  const yHeaderRow = yokSheet.addRow(['#', 'Ad Soyad', 'Görev', 'Durum']);
  yHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9F1239' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });
  yokSheet.columns = [{ width: 5 }, { width: 28 }, { width: 24 }, { width: 10 }];
  ozet.yokPersoneller.forEach((p, i) => {
    const row = yokSheet.addRow([i + 1, p.adSoyad, p.gorev, 'Yok']);
    row.eachCell((cell) => {
      cell.border = thinBorder;
    });
  });
  if (ozet.yokPersoneller.length === 0) {
    yokSheet.addRow(['—', 'Bu gün yok kaydı yok', '', '']);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  triggerBrowserDownload(
    new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Gunluk_Saha_Faaliyet_Detay_${options.dateKey}.xlsx`
  );
}
