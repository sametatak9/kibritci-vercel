import type { KampFaaliyet, Personel, SahaFaaliyeti } from '../types/erp';
import { formatDateLabelTr } from './dateKeyUtils';
import {
  buildFaaliyetPersoneller,
  buildPeriodFaaliyetOzeti,
  formatFaaliyetTarihLabel,
  getPersonFaaliyetleriInPeriod,
  getPersonKampFaaliyetleriInPeriod,
  resolveFaaliyetEkip,
} from './faaliyetPersonelUtils';
import { downloadKibritciReportHtml, openKibritciReportPrint } from './kibritciReportTemplate';
import { kibritciReportHeaderHtml } from './kibritciBrand';
import {
  formatMesaiFaaliyetLabel,
  getFaaliyetTumFotolar,
  isMesaiSahaFaaliyet,
} from './sahaFaaliyetUtils';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blokKey(f: SahaFaaliyeti | KampFaaliyet): string {
  const parsel = String((f as SahaFaaliyeti).parsel || '').trim();
  const blok = String((f as SahaFaaliyeti).blok || (f as KampFaaliyet).yerleskeAdi || '').trim();
  if (parsel && blok) return `${parsel} · ${blok}`;
  if (blok) return blok;
  if (parsel) return parsel;
  const yer = String((f as KampFaaliyet).yerleskeAdi || '').trim();
  return yer || 'BLOK / LOKASYON BELİRTİLMEMİŞ';
}

function faaliyetBaslik(
  f: SahaFaaliyeti | KampFaaliyet,
  personeller: Personel[] = []
): string {
  if ('isNiteligi' in f && f.isNiteligi) {
    if (isMesaiSahaFaaliyet(f as SahaFaaliyeti)) {
      const mesaiLabel = formatMesaiFaaliyetLabel(f as SahaFaaliyeti, personeller);
      return mesaiLabel || `MESAİ · ${String(f.isNiteligi)}`;
    }
    return String(f.isNiteligi);
  }
  return String((f as KampFaaliyet).faaliyetTipi || 'Kamp faaliyeti');
}

function fotoGridHtml(urls: string[], max = 6): string {
  const list = urls.filter(Boolean).slice(0, max);
  if (!list.length) {
    return `<p class="muted">Bu kayıtta fotoğraf yok.</p>`;
  }
  return `<div class="foto-grid">${list
    .map(
      (u) =>
        `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="Faaliyet fotoğrafı" loading="lazy"/></a>`
    )
    .join('')}${
    urls.length > max
      ? `<span class="foto-more">+${urls.length - max} fotoğraf daha</span>`
      : ''
  }</div>`;
}

function imzaBarlariHtml(): string {
  const roles = ['Hazırlayan', 'Muhasebe', 'Şantiye Şefi'];
  return `<section class="imza">
    <h2>ONAY / İMZA BARLARI</h2>
    <div class="imza-grid">
      ${roles
        .map(
          (r) => `<div class="imza-bar">
        <div class="imza-title">${escapeHtml(r.toLocaleUpperCase('tr-TR'))}</div>
        <div class="imza-body">İmza / Kaşe<br/><br/>______________________________</div>
        <div class="imza-name">Ad Soyad: __________________</div>
      </div>`
        )
        .join('')}
    </div>
  </section>`;
}

export type FaaliyetAylikReportOpts = {
  year: number;
  month: number;
  sahaFaaliyetleri: SahaFaaliyeti[];
  kampFaaliyetleri?: KampFaaliyet[];
  personeller: Personel[];
  yoklamalar?: import('../types/erp').AylikYoklamaMap;
};

export function buildFaaliyetAylikReportHtml(opts: FaaliyetAylikReportOpts): string {
  const { year, month, sahaFaaliyetleri, personeller } = opts;
  const kampFaaliyetleri = opts.kampFaaliyetleri || [];
  const yoklamalar = opts.yoklamalar || {};
  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
  const basim = new Date().toLocaleString('tr-TR');
  const ozet = buildPeriodFaaliyetOzeti(
    sahaFaaliyetleri,
    personeller,
    year,
    month,
    kampFaaliyetleri,
    yoklamalar
  );
  const personellerList = buildFaaliyetPersoneller(
    sahaFaaliyetleri,
    personeller,
    year,
    month,
    kampFaaliyetleri,
    yoklamalar
  );

  // Blok bazlı indeks (tüm ay saha + kamp)
  const monthSaha = sahaFaaliyetleri.filter((f) => {
    const t = String(f.tarih || '');
    const parts = t.split('-');
    return Number(parts[0]) === year && Number(parts[1]) === month;
  });
  const monthKamp = kampFaaliyetleri.filter((f) => {
    const t = String(f.tarih || '');
    const parts = t.split('-');
    return Number(parts[0]) === year && Number(parts[1]) === month;
  });

  const blokMap = new Map<string, Array<SahaFaaliyeti | KampFaaliyet>>();
  for (const f of [...monthSaha, ...monthKamp]) {
    const key = blokKey(f);
    const arr = blokMap.get(key) || [];
    arr.push(f);
    blokMap.set(key, arr);
  }
  const blokEntries = [...blokMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));

  const personelSections = personellerList
    .map((p, idx) => {
      const saha = getPersonFaaliyetleriInPeriod(p, sahaFaaliyetleri, year, month);
      const kamp = getPersonKampFaaliyetleriInPeriod(
        p,
        kampFaaliyetleri,
        year,
        month,
        yoklamalar
      );
      const all = [...saha, ...kamp].sort((a, b) =>
        String(b.tarih || '').localeCompare(String(a.tarih || ''), 'tr')
      );
      const fotoCount = all.reduce((n, f) => n + getFaaliyetTumFotolar(f).length, 0);
      const blokSayilari = new Map<string, number>();
      for (const f of all) {
        const k = blokKey(f);
        blokSayilari.set(k, (blokSayilari.get(k) || 0) + 1);
      }
      const blokOzet = [...blokSayilari.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${escapeHtml(k)} (${n})`)
        .join(' · ');

      const kayitHtml = all
        .map((f) => {
          const fotolar = getFaaliyetTumFotolar(f);
          const ekip = resolveFaaliyetEkip(f, personeller)
            .map((e) => e.adSoyad)
            .join(', ');
          return `<article class="kayit">
            <div class="kayit-head">
              <strong>${escapeHtml(formatFaaliyetTarihLabel(f.tarih))}</strong>
              <span class="pill">${escapeHtml(faaliyetBaslik(f, personeller))}</span>
              <span class="pill soft">${escapeHtml(blokKey(f))}</span>
            </div>
            <p class="desc">${escapeHtml(String((f as SahaFaaliyeti).aciklama || (f as KampFaaliyet).aciklama || '—'))}</p>
            ${ekip ? `<p class="meta">Ekip: ${escapeHtml(ekip)}</p>` : ''}
            ${fotoGridHtml(fotolar)}
          </article>`;
        })
        .join('');

      return `<section class="person-block" id="p-${escapeHtml(p.id)}">
        <h3>${idx + 1}. ${escapeHtml(`${p.ad} ${p.soyad}`)}
          <span class="role">${escapeHtml(p.gorev || '—')}</span>
        </h3>
        <div class="stat-row">
          <span><b>${all.length}</b> iş kaydı</span>
          <span><b>${fotoCount}</b> fotoğraf</span>
          <span><b>${saha.length}</b> saha · <b>${kamp.length}</b> kamp</span>
        </div>
        ${blokOzet ? `<p class="blok-ozet">Bloklar: ${blokOzet}</p>` : ''}
        ${kayitHtml || '<p class="muted">Kayıt yok.</p>'}
      </section>`;
    })
    .join('');

  const blokSections = blokEntries
    .map(([blok, list], idx) => {
      const sorted = [...list].sort((a, b) =>
        String(a.tarih || '').localeCompare(String(b.tarih || ''), 'tr')
      );
      const fotoCount = sorted.reduce((n, f) => n + getFaaliyetTumFotolar(f).length, 0);
      const personSet = new Set<string>();
      for (const f of sorted) {
        for (const e of resolveFaaliyetEkip(f, personeller)) {
          personSet.add(e.adSoyad);
        }
      }
      const rows = sorted
        .map((f) => {
          const fotolar = getFaaliyetTumFotolar(f);
          return `<tr>
            <td>${escapeHtml(String(f.tarih || '—'))}</td>
            <td>${escapeHtml(faaliyetBaslik(f, personeller))}</td>
            <td>${escapeHtml(
              resolveFaaliyetEkip(f, personeller)
                .map((e) => e.adSoyad)
                .join(', ') || '—'
            )}</td>
            <td>${escapeHtml(String((f as SahaFaaliyeti).aciklama || (f as KampFaaliyet).aciklama || '—'))}</td>
            <td>${fotoGridHtml(fotolar, 4)}</td>
          </tr>`;
        })
        .join('');

      return `<section class="blok-block">
        <h3>${idx + 1}. ${escapeHtml(blok)}</h3>
        <div class="stat-row">
          <span><b>${sorted.length}</b> faaliyet</span>
          <span><b>${fotoCount}</b> fotoğraf</span>
          <span><b>${personSet.size}</b> personel</span>
        </div>
        <p class="blok-ozet">Personel: ${escapeHtml([...personSet].join(', ') || '—')}</p>
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Faaliyet</th>
              <th>Personel</th>
              <th>Açıklama</th>
              <th>Fotoğraflar</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const body = `
<section class="ozet-kutu">
  <h2>DÖNEM ÖZETİ — ${escapeHtml(periodLabel.toLocaleUpperCase('tr-TR'))}</h2>
  <div class="ozet-grid">
    <div><b>${personellerList.length}</b><span>Personel</span></div>
    <div><b>${ozet.faaliyetSayisi}</b><span>Faaliyet</span></div>
    <div><b>${ozet.sahaFaaliyetSayisi}</b><span>Saha</span></div>
    <div><b>${ozet.kampFaaliyetSayisi}</b><span>Kamp</span></div>
    <div><b>${blokEntries.length}</b><span>Blok / Lokasyon</span></div>
  </div>
  <p class="muted">Bu rapor personel başına iş kayıtlarını ve blok bazlı faaliyetleri fotoğraflarla sunar. Yazdırma anı: ${escapeHtml(basim)}</p>
</section>

<nav class="toc">
  <a href="#bolum-personel">1. Personel Bazlı</a>
  <a href="#bolum-blok">2. Blok Bazlı</a>
  <a href="#bolum-imza">3. İmza</a>
</nav>

<section id="bolum-personel">
  <h2 class="bolum-baslik">1. PERSONEL BAZLI AYLIK FAALİYET</h2>
  <p class="muted">Her personelin dönemdeki iş kaydı sayısı, çalıştığı bloklar ve faaliyet fotoğrafları.</p>
  ${personelSections || '<p class="muted">Bu ay faaliyetli personel yok.</p>'}
</section>

<section id="bolum-blok">
  <h2 class="bolum-baslik">2. BLOK BAZLI AYLIK FAALİYET</h2>
  <p class="muted">Her blok/lokasyonda yapılan faaliyetler, ekip ve görseller.</p>
  ${blokSections || '<p class="muted">Bu ay blok kaydı yok.</p>'}
</section>

<div id="bolum-imza">${imzaBarlariHtml()}</div>
`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>Aylık Faaliyet Raporu — ${escapeHtml(periodLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; background: #e2e8f0; color: #0f172a; }
    .toolbar { position: sticky; top: 0; z-index: 20; display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 16px; background: #0f172a; }
    .toolbar button { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 800; font-size: 12px; }
    .btn-print { background: #f59e0b; color: #0f172a; }
    .btn-close { background: #334155; color: #fff; }
    .page { max-width: 1100px; margin: 16px auto 40px; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 40px rgba(15,23,42,.12); }
    .head { padding: 20px 24px 8px; }
    .meta { padding: 10px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #475569; }
    .content { padding: 20px 24px 32px; }
    h2 { font-size: 15px; margin: 0 0 10px; letter-spacing: .04em; }
    h3 { font-size: 14px; margin: 0 0 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
    .role { font-size: 10px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 999px; padding: 2px 8px; }
    .bolum-baslik { background: #0f172a; color: #fff; padding: 10px 12px; border-radius: 8px; margin-top: 28px; }
    .ozet-kutu { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: linear-gradient(180deg,#fff, #f8fafc); }
    .ozet-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 8px; margin: 12px 0; }
    .ozet-grid div { background: #0f172a; color: #fff; border-radius: 10px; padding: 10px 8px; text-align: center; }
    .ozet-grid b { display: block; font-size: 18px; }
    .ozet-grid span { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; opacity: .8; }
    .toc { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }
    .toc a { text-decoration: none; font-size: 11px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 999px; padding: 6px 10px; }
    .person-block, .blok-block { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin: 14px 0; background: #fff; page-break-inside: avoid; }
    .stat-row { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; margin-bottom: 8px; }
    .stat-row span { background: #f1f5f9; border-radius: 8px; padding: 4px 8px; }
    .blok-ozet { font-size: 11px; color: #334155; margin: 0 0 10px; }
    .kayit { border-top: 1px dashed #cbd5e1; padding: 10px 0; }
    .kayit-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12px; }
    .pill { font-size: 10px; font-weight: 800; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 999px; padding: 2px 8px; }
    .pill.soft { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .desc, .meta { font-size: 12px; margin: 4px 0; color: #334155; }
    .muted { color: #64748b; font-size: 11px; font-style: italic; }
    .foto-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .foto-grid img { width: 110px; height: 82px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; }
    .foto-more { font-size: 10px; font-weight: 800; color: #64748b; align-self: center; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
    th { background: #0f172a; color: #fff; text-align: left; }
    .imza { margin-top: 28px; }
    .imza-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .imza-bar { border: 2px solid #64748b; border-radius: 10px; overflow: hidden; }
    .imza-title { background: #1d4ed8; color: #fff; font-weight: 900; text-align: center; padding: 8px; font-size: 11px; }
    .imza-body { min-height: 90px; text-align: center; padding: 16px 8px; font-size: 11px; color: #475569; font-weight: 700; }
    .imza-name { background: #eef2ff; text-align: center; padding: 8px; font-size: 10px; color: #475569; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .page { margin: 0; border: none; box-shadow: none; border-radius: 0; max-width: none; }
      .foto-grid img { width: 90px; height: 68px; }
      .person-block, .blok-block { break-inside: avoid; }
    }
    @media (max-width: 800px) {
      .ozet-grid { grid-template-columns: repeat(2, 1fr); }
      .imza-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" class="btn-print" onclick="window.print()">🖨 Yazdır / PDF Kaydet</button>
    <button type="button" class="btn-close" onclick="window.close()">Kapat</button>
  </div>
  <div class="page">
    <div class="head">
      ${kibritciReportHeaderHtml(
        'AYLIK PERSONEL & BLOK FAALİYET RAPORU',
        `${periodLabel} · Personel + Blok bazlı`
      )}
    </div>
    <div class="meta">
      Rapor modeli: KBR-FP-AYLIK-${year}${String(month).padStart(2, '0')} ·
      Dönem: ${escapeHtml(periodLabel)} ·
      Yazdırma: ${escapeHtml(basim)}
    </div>
    <div class="content">${body}</div>
  </div>
</body>
</html>`;
}

export function openFaaliyetAylikReport(html: string, title: string): void {
  openKibritciReportPrint(html, title);
}

export function downloadFaaliyetAylikReportHtml(html: string, year: number, month: number): void {
  const stamp = `${year}-${String(month).padStart(2, '0')}`;
  downloadKibritciReportHtml(html, `Aylik_Faaliyet_Personel_Blok_${stamp}.html`);
}

/** Idari / ekran içi printable alanını HTML dosyası olarak indir */
export function downloadPrintableElementHtml(
  root: HTMLElement,
  fileName: string,
  title = 'Saha Faaliyet Raporu'
): void {
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => n.outerHTML)
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  ${styles}
  <style>
    body { margin: 16px; background: #fff; }
    @media print { body { margin: 0; } .no-print, .print\\:hidden { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;display:flex;gap:8px">
    <button onclick="window.print()" style="padding:8px 14px;font-weight:800;background:#f59e0b;border:0;border-radius:8px;cursor:pointer">Yazdır / PDF</button>
  </div>
  ${root.innerHTML}
</body>
</html>`;
  downloadKibritciReportHtml(html, fileName);
}
