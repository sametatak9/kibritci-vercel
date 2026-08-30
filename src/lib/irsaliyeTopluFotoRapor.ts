/**
 * Geçmiş irsaliyeler — seçilen kayıtların fotoğraflı toplu HTML raporu.
 * Fiş / imzalı evrak / kapı foto paketleri ve bağlı çekim fişi görsellerini birleştirir.
 */
import { doc, getDoc } from 'firebase/firestore';
import type { Irsaliye } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { formatDateLabelTr } from './dateKeyUtils';
import { irsaliyeHizmetMiktari } from './evrakDonusum';
import { db } from './firebase';
import { collectAllFotoUrls, isLikelyImageUrl } from './guvenlikEvrakFotolar';
import {
  irsaliyeNoChainSortKey,
  malzemeTipiLabel,
  resolveMicirMalzemeTipiFromIrsaliye,
} from './micirUtils';
import { openHtmlReportWindow } from './reportEmail';

export type IrsaliyeFotoKaynak = {
  url: string;
  label: string;
  kind: 'image' | 'pdf';
};

export type IrsaliyeFotoRaporKaydi = {
  irsaliye: Irsaliye;
  fotolar: IrsaliyeFotoKaynak[];
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** data URL, http(s) veya blob — "Plaka: …" gibi metin notlarını ele. */
export function isUsableEvrakMediaUrl(url: unknown): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('data:image/') || u.startsWith('data:application/pdf')) return true;
  if (u.startsWith('blob:')) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

function classifyMedia(url: string): 'image' | 'pdf' {
  const u = url.trim().toLowerCase();
  if (u.startsWith('data:application/pdf') || /\.pdf(\?|#|$)/i.test(u)) return 'pdf';
  if (isLikelyImageUrl(url) || u.startsWith('data:image/')) return 'image';
  return 'image';
}

function pushFoto(
  out: IrsaliyeFotoKaynak[],
  seen: Set<string>,
  url: unknown,
  label: string
): void {
  const raw = String(url || '').trim();
  if (!isUsableEvrakMediaUrl(raw) || seen.has(raw)) return;
  seen.add(raw);
  out.push({ url: raw, label, kind: classifyMedia(raw) });
}

function asFotoDoc(rec: unknown): Parameters<typeof collectAllFotoUrls>[0] {
  const d = (rec && typeof rec === 'object' ? rec : {}) as Record<string, unknown>;
  return {
    fotoUrl: typeof d.fotoUrl === 'string' ? d.fotoUrl : undefined,
    fotoUrls: Array.isArray(d.fotoUrls) ? (d.fotoUrls as string[]) : undefined,
    scanPdfUrl: typeof d.scanPdfUrl === 'string' ? d.scanPdfUrl : undefined,
    evrakFotolar: Array.isArray(d.evrakFotolar) ? (d.evrakFotolar as never) : undefined,
    kalemFotolar: Array.isArray(d.kalemFotolar) ? (d.kalemFotolar as never) : undefined,
    firmaFotolar: Array.isArray(d.firmaFotolar) ? (d.firmaFotolar as never) : undefined,
    faturaFotolar: Array.isArray(d.faturaFotolar) ? (d.faturaFotolar as never) : undefined,
  };
}

/** Tek kayıttaki tüm görsel / PDF URL'leri (etiketli, tekrarsız). */
export function collectIrsaliyeFotoKaynaklari(
  rec: unknown,
  defaultLabel = 'Evrak görseli'
): IrsaliyeFotoKaynak[] {
  const d = (rec && typeof rec === 'object' ? rec : {}) as Record<string, unknown>;
  const out: IrsaliyeFotoKaynak[] = [];
  const seen = new Set<string>();

  pushFoto(out, seen, d.fisEvrakUrl, 'Fiş / irsaliye görseli');
  pushFoto(out, seen, d.imzaliEvrakUrl, 'İmzalı evrak');
  pushFoto(out, seen, d.fisGorselUrl, 'Çekim fişi görseli');
  pushFoto(out, seen, d.evrakUrl, 'Evrak');

  for (const url of collectAllFotoUrls(asFotoDoc(d))) {
    const kind = classifyMedia(url);
    pushFoto(
      out,
      seen,
      url,
      kind === 'pdf' ? 'Tarama PDF' : defaultLabel
    );
  }
  return out;
}

async function getColDoc(col: string, id: string): Promise<Record<string, unknown> | null> {
  const sid = String(id || '').trim();
  if (!sid) return null;
  try {
    const snap = await getDoc(doc(db, col, sid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch {
    return null;
  }
}

function sortIrs(list: Irsaliye[]): Irsaliye[] {
  return [...list].sort((a, b) => {
    const d = String(a.tarih || '').localeCompare(String(b.tarih || ''));
    if (d !== 0) return d;
    return irsaliyeNoChainSortKey(a.irsaliyeNo) - irsaliyeNoChainSortKey(b.irsaliyeNo);
  });
}

function mergeFotolar(...lists: IrsaliyeFotoKaynak[][]): IrsaliyeFotoKaynak[] {
  const seen = new Set<string>();
  const out: IrsaliyeFotoKaynak[] = [];
  for (const list of lists) {
    for (const f of list) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      out.push(f);
    }
  }
  return out;
}

/**
 * Seçilen irsaliyeleri canlı dokümandan ve bağlı fiş / kapı evrakından fotoğraflarla doldurur.
 */
export async function loadSeciliIrsaliyeFotoKayitlari(input: {
  ids: string[];
  irsaliyeler: Irsaliye[];
}): Promise<IrsaliyeFotoRaporKaydi[]> {
  const knownById = new Map((input.irsaliyeler || []).map((ir) => [ir.id, ir]));
  const ids = [...new Set((input.ids || []).map(String).filter(Boolean))];

  const liveDocs = await Promise.all(ids.map((id) => getColDoc('irsaliyeler', id)));

  const resolved: Irsaliye[] = ids.map((id, i) => {
    const live = liveDocs[i];
    if (live) return live as unknown as Irsaliye;
    return knownById.get(id) || ({ id, irsaliyeId: id, irsaliyeNo: id, firma: '', tarih: '', onayDurumu: '', kalemler: [] } as Irsaliye);
  });

  const extraIds = new Map<string, { col: string; id: string }>();
  const addExtra = (col: string, id?: string) => {
    const sid = String(id || '').trim();
    if (!sid) return;
    extraIds.set(`${col}:${sid}`, { col, id: sid });
  };
  for (const ir of resolved) {
    addExtra('guvenlikGelenEvraklar', ir.guvenlikEvrakId);
    addExtra('guvenlikGelenEvraklar', ir.id);
    addExtra('vidanjorFisleri', ir.vidanjorFisId);
    addExtra('micirStabilizeFisleri', ir.micirFisId);
    addExtra('yildirimTankerFisleri', ir.yildirimTankerFisId);
  }

  const extraEntries = [...extraIds.values()];
  const extraDocs = await Promise.all(extraEntries.map((e) => getColDoc(e.col, e.id)));
  const extraByKey = new Map<string, Record<string, unknown>>();
  extraEntries.forEach((e, i) => {
    const d = extraDocs[i];
    if (d) extraByKey.set(`${e.col}:${e.id}`, d);
  });

  const pickExtra = (col: string, id?: string) => {
    const sid = String(id || '').trim();
    if (!sid) return null;
    return extraByKey.get(`${col}:${sid}`) || null;
  };

  return sortIrs(resolved).map((ir) => {
    const fotolar = mergeFotolar(
      collectIrsaliyeFotoKaynaklari(ir, 'İrsaliye görseli'),
      collectIrsaliyeFotoKaynaklari(pickExtra('guvenlikGelenEvraklar', ir.guvenlikEvrakId), 'Kapı evrak fotoğrafı'),
      collectIrsaliyeFotoKaynaklari(pickExtra('guvenlikGelenEvraklar', ir.id), 'Kapı evrak fotoğrafı'),
      collectIrsaliyeFotoKaynaklari(pickExtra('vidanjorFisleri', ir.vidanjorFisId), 'Vidanjör fiş görseli'),
      collectIrsaliyeFotoKaynaklari(pickExtra('micirStabilizeFisleri', ir.micirFisId), 'Mıcır fiş görseli'),
      collectIrsaliyeFotoKaynaklari(pickExtra('yildirimTankerFisleri', ir.yildirimTankerFisId), 'Tanker fiş görseli')
    );
    return { irsaliye: ir, fotolar };
  });
}

function renderFotoBlock(f: IrsaliyeFotoKaynak, idx: number): string {
  if (f.kind === 'pdf') {
    return `<div class="ir-foto-slot">
      <p class="ir-foto-label">${esc(f.label)} · PDF</p>
      <a class="ir-foto-pdf" href="${esc(f.url)}" target="_blank" rel="noopener">PDF evrakı yeni sekmede aç</a>
    </div>`;
  }
  return `<figure class="ir-foto-slot">
    <p class="ir-foto-label">${esc(f.label)}${idx > 0 ? ` · ${idx + 1}` : ''}</p>
    <button type="button" class="ir-foto-btn" data-foto-url="${esc(f.url)}" title="Büyütmek için tıklayın">
      <img src="${esc(f.url)}" alt="${esc(f.label)}" />
    </button>
  </figure>`;
}

function renderKayit(k: IrsaliyeFotoRaporKaydi, sira: number): string {
  const ir = k.irsaliye;
  const h = irsaliyeHizmetMiktari(ir);
  const tip = resolveMicirMalzemeTipiFromIrsaliye(ir);
  const kalemler = (ir.kalemler || [])
    .map((x) => `${esc(x.urunAdi)} ${esc(x.miktar)} ${esc(x.birim)}`)
    .join(' · ');
  const fotoHtml = k.fotolar.length
    ? `<div class="ir-foto-grid">${k.fotolar.map((f, i) => renderFotoBlock(f, i)).join('')}</div>`
    : `<p class="ir-foto-yok">Bu irsaliyede yüklenmiş fotoğraf bulunamadı.</p>`;

  return `<article class="ir-foto-card">
    <header class="ir-foto-head">
      <div class="ir-foto-sira">${sira}</div>
      <div class="min-w-0">
        <h2>İrsaliye ${esc(ir.irsaliyeNo || ir.id)}</h2>
        <p>
          ${esc(formatDateLabelTr(ir.tarih))}
          · ${esc(ir.firma || '—')}
          ${ir.plaka ? ` · Plaka ${esc(ir.plaka)}` : ''}
          ${ir.onayDurumu ? ` · ${esc(ir.onayDurumu)}` : ''}
          ${tip ? ` · ${esc(malzemeTipiLabel(tip))}` : ''}
          ${h.miktar > 0 ? ` · ${h.miktar.toLocaleString('tr-TR')} ${esc(h.etiket)}` : ''}
          ${ir.saId ? ` · SA ${esc(ir.saId)}` : ''}
          ${ir.faturaNo ? ` · Birleşim ${esc(ir.faturaNo)}` : ''}
        </p>
        ${kalemler ? `<p class="ir-foto-kalem">${kalemler}</p>` : ''}
      </div>
    </header>
    ${fotoHtml}
  </article>`;
}

export function buildSeciliIrsaliyeFotoRaporHtml(input: {
  kayitlar: IrsaliyeFotoRaporKaydi[];
  cariUnvan?: string;
}): string {
  const kayitlar = input.kayitlar || [];
  const fotoToplam = kayitlar.reduce((n, k) => n + k.fotolar.length, 0);
  const eksik = kayitlar.filter((k) => k.fotolar.length === 0).length;
  const body = `
    <div class="mb-5">
      <h1 class="text-lg font-black tracking-tight text-slate-900 m-0">Seçilen İrsaliyeler — Fotoğraflı Rapor</h1>
      <p class="text-xs text-slate-600 mt-1 mb-0">
        ${esc(input.cariUnvan || 'Cari')}
        · ${kayitlar.length} irsaliye
        · ${fotoToplam} görsel
        ${eksik ? ` · ${eksik} kayıtta foto yok` : ''}
        · ${esc(new Date().toLocaleString('tr-TR'))}
      </p>
      <p class="text-[11px] text-slate-500 mt-2 mb-0">Fotoğrafa tıklayınca büyür. Yazdır / PDF için üstteki e-posta çubuğundaki yazdırı kullanın.</p>
    </div>
    ${kayitlar.map((k, i) => renderKayit(k, i + 1)).join('')}
    <div id="ir-foto-lightbox" hidden>
      <button type="button" id="ir-foto-lightbox-close">Kapat</button>
      <img id="ir-foto-lightbox-img" alt="Büyük fotoğraf" />
    </div>
    <script>
      (function () {
        var box = document.getElementById('ir-foto-lightbox');
        var img = document.getElementById('ir-foto-lightbox-img');
        var closeBtn = document.getElementById('ir-foto-lightbox-close');
        function closeLb() { if (box) box.hidden = true; }
        document.addEventListener('click', function (e) {
          var btn = e.target && e.target.closest ? e.target.closest('.ir-foto-btn') : null;
          if (!btn || !box || !img) return;
          var url = btn.getAttribute('data-foto-url');
          if (!url) return;
          img.src = url;
          box.hidden = false;
        });
        if (closeBtn) closeBtn.addEventListener('click', closeLb);
        if (box) box.addEventListener('click', function (e) { if (e.target === box) closeLb(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
      })();
    </script>
  `;
  return wrapCorporateReportHtml(body, {
    title: 'Seçilen İrsaliyeler — Fotoğraflı Rapor',
    docCode: 'IRSALIYE-FOTO-RAPOR',
    orientation: 'portrait',
    autoPrint: false,
    extraCss: `
      .ir-foto-card{break-inside:avoid;page-break-inside:avoid;margin:0 0 18px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff}
      .ir-foto-head{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
      .ir-foto-sira{flex:none;width:28px;height:28px;border-radius:999px;background:#1e3a5f;color:#fff;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center}
      .ir-foto-head h2{margin:0;font-size:14px;font-weight:900;color:#0f172a}
      .ir-foto-head p{margin:3px 0 0;font-size:11px;color:#475569;line-height:1.45}
      .ir-foto-kalem{font-family:ui-monospace,monospace;font-size:10px!important;color:#334155}
      .ir-foto-grid{display:grid;grid-template-columns:1fr;gap:14px;padding:12px 14px}
      .ir-foto-label{margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#64748b}
      .ir-foto-btn{display:block;width:100%;padding:0;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:#0f172a;cursor:zoom-in}
      .ir-foto-btn img{display:block;width:100%;max-height:620px;object-fit:contain;background:#0f172a}
      .ir-foto-pdf{display:inline-block;padding:10px 12px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-weight:800;text-decoration:none}
      .ir-foto-yok{margin:0;padding:16px 14px;font-size:12px;color:#b45309;background:#fffbeb;font-style:italic}
      #ir-foto-lightbox[hidden]{display:none!important}
      #ir-foto-lightbox{position:fixed;inset:0;z-index:50;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;padding:24px}
      #ir-foto-lightbox img{max-width:96vw;max-height:90vh;object-fit:contain;border-radius:12px;background:#111}
      #ir-foto-lightbox-close{position:absolute;top:16px;right:16px;border:0;background:#fff;color:#0f172a;font-weight:900;font-size:13px;border-radius:999px;padding:8px 14px;cursor:pointer}
      @media print{
        #ir-foto-lightbox{display:none!important}
        .ir-foto-card{page-break-after:always}
        .ir-foto-card:last-of-type{page-break-after:auto}
        .ir-foto-btn img{max-height:170mm}
      }
    `,
  });
}

export async function openSeciliIrsaliyeFotoRaporu(input: {
  ids: string[];
  irsaliyeler: Irsaliye[];
  cariUnvan?: string;
}): Promise<{ kayit: number; foto: number; eksik: number }> {
  const kayitlar = await loadSeciliIrsaliyeFotoKayitlari({
    ids: input.ids,
    irsaliyeler: input.irsaliyeler,
  });
  if (!kayitlar.length) {
    throw new Error('Rapor için irsaliye bulunamadı.');
  }
  const html = buildSeciliIrsaliyeFotoRaporHtml({
    kayitlar,
    cariUnvan: input.cariUnvan,
  });
  const w = openHtmlReportWindow(html, 'Seçilen İrsaliyeler — Fotoğraflı Rapor');
  if (!w) {
    throw new Error('Pop-up engellendi. Tarayıcıda pencere izni verin.');
  }
  const foto = kayitlar.reduce((n, k) => n + k.fotolar.length, 0);
  const eksik = kayitlar.filter((k) => k.fotolar.length === 0).length;
  return { kayit: kayitlar.length, foto, eksik };
}
