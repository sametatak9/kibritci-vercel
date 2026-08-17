import type {
  TemizlikBaca,
  TemizlikBacaTespit,
  TemizlikBacaUygulama,
  TemizlikDaire,
  TemizlikTespit,
  TemizlikUygulama,
} from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';
import { formatDateLabelTr } from './dateKeyUtils';
import {
  TEMIZLIK_KART_DURUM_LABEL,
  deriveKartDurum,
  latestByDate,
  ozetBacaParsel,
  ozetDaireParsel,
  sumYevmiye,
} from './temizlikKirimUtils';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imgRow(urls: string[]): string {
  const list = (urls || []).filter(Boolean).slice(0, 6);
  if (!list.length) return '<p class="text-[11px] text-slate-400">Foto yok</p>';
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">${list
    .map(
      (u) =>
        `<img src="${escapeHtml(u)}" alt="" style="width:110px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0" />`
    )
    .join('')}</div>`;
}

export function buildDaireParselRaporHtml(opts: {
  parsel: string;
  daireler: TemizlikDaire[];
  tespitler: TemizlikTespit[];
  uygulamalar: TemizlikUygulama[];
}): string {
  const ozet = ozetDaireParsel(opts.parsel, opts.daireler, opts.tespitler, opts.uygulamalar);
  const daireler = opts.daireler
    .filter((d) => d.parsel === opts.parsel)
    .sort((a, b) => `${a.blok} ${a.daireNo}`.localeCompare(`${b.blok} ${b.daireNo}`, 'tr'));

  const blocks = Array.from(new Set(daireler.map((d) => d.blok)));
  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 6px">${escapeHtml(opts.parsel)} — Daire Temizlik Tespiti ve Uygulama Raporu</h1>
    <p style="font-size:12px;color:#475569;margin:0 0 16px">Daire ${ozet.adet} · Tespit ${ozet.tespitli} · Tamamlanan ${ozet.tamamlanan} · Plan ${ozet.planYevmiye} yevmiye · Harcanan ${ozet.harcananYevmiye} · Kalan ${ozet.kalanYevmiye}</p>
    ${blocks
      .map((blok) => {
        const rows = daireler.filter((d) => d.blok === blok);
        return `
          <h2 style="font-size:14px;font-weight:800;margin:18px 0 8px">Blok ${escapeHtml(blok)}</h2>
          ${rows
            .map((d) => {
              const t = latestByDate(opts.tespitler.filter((x) => x.daireId === d.id));
              const u = opts.uygulamalar.filter((x) => x.daireId === d.id);
              const h = sumYevmiye(u);
              const p = Number(t?.planlananYevmiye || 0);
              const durum = deriveKartDurum({
                hasTespit: !!t,
                planlananYevmiye: p,
                harcananYevmiye: h,
                uygulamalar: u,
              });
              const odalar = (t?.odalar || [])
                .map(
                  (o) =>
                    `<li>${escapeHtml(o.ad)} — ${escapeHtml(o.durum)}${o.yorum ? `: ${escapeHtml(o.yorum)}` : ''}</li>`
                )
                .join('');
              return `
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px">
                  <p style="font-weight:800;margin:0">Daire ${escapeHtml(d.daireNo)}${d.kat ? ` · Kat ${escapeHtml(d.kat)}` : ''} — ${TEMIZLIK_KART_DURUM_LABEL[durum]}</p>
                  <p style="font-size:12px;color:#475569;margin:4px 0">İş: ${escapeHtml(t?.isTipi || '—')} · Plan ${p} yevmiye · Harcanan ${h} · Kalan ${Math.max(0, p - h)}</p>
                  ${t?.genelYorum ? `<p style="font-size:12px">${escapeHtml(t.genelYorum)}</p>` : ''}
                  ${t?.planNotu ? `<p style="font-size:12px"><strong>Plan:</strong> ${escapeHtml(t.planNotu)}</p>` : ''}
                  ${odalar ? `<ul style="font-size:12px;margin:6px 0">${odalar}</ul>` : ''}
                  ${imgRow((t?.odalar || []).flatMap((o) => o.fotoUrls || []))}
                </div>`;
            })
            .join('')}
        `;
      })
      .join('')}
    <p style="font-size:10px;color:#94a3b8;margin-top:16px">Baskı: ${formatDateLabelTr(new Date().toISOString())}</p>
  `;
  return wrapCorporateReportHtml(body, {
    title: `${opts.parsel} Daire Temizlik Raporu`,
    docCode: 'TEMİZLİK-DAİRE',
    orientation: 'portrait',
    letterhead: true,
    autoPrint: true,
  });
}

export function buildBacaParselRaporHtml(opts: {
  parsel: string;
  bacalar: TemizlikBaca[];
  tespitler: TemizlikBacaTespit[];
  uygulamalar: TemizlikBacaUygulama[];
}): string {
  const ozet = ozetBacaParsel(opts.parsel, opts.bacalar, opts.tespitler, opts.uygulamalar);
  const bacalar = opts.bacalar
    .filter((d) => d.parsel === opts.parsel)
    .sort((a, b) => a.etiket.localeCompare(b.etiket, 'tr'));

  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 6px">${escapeHtml(opts.parsel)} — Baca Çukur Temizlik Tespiti ve Planı</h1>
    <p style="font-size:12px;color:#475569;margin:0 0 16px">Baca ${ozet.adet} · Tespit ${ozet.tespitli} · Tamamlanan ${ozet.tamamlanan} · Plan ${ozet.planYevmiye} yevmiye · Harcanan ${ozet.harcananYevmiye} · Kalan ${ozet.kalanYevmiye}</p>
    ${bacalar
      .map((d) => {
        const t = latestByDate(opts.tespitler.filter((x) => x.bacaId === d.id));
        const u = opts.uygulamalar.filter((x) => x.bacaId === d.id);
        const h = sumYevmiye(u);
        const p = Number(t?.planlananYevmiye || 0);
        const durum = deriveKartDurum({
          hasTespit: !!t,
          planlananYevmiye: p,
          harcananYevmiye: h,
          uygulamalar: u,
        });
        return `
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px">
            <p style="font-weight:800;margin:0">${escapeHtml(d.etiket)}${d.blok ? ` · ${escapeHtml(d.blok)}` : ''} — ${TEMIZLIK_KART_DURUM_LABEL[durum]}</p>
            <p style="font-size:12px;margin:4px 0"><strong>Yer:</strong> ${escapeHtml(d.yerTarifi)}</p>
            <p style="font-size:12px;color:#475569;margin:4px 0">Kirlilik: ${escapeHtml(t?.kirlilikDurumu || '—')} · Plan ${p} yevmiye · Harcanan ${h} · Kalan ${Math.max(0, p - h)}</p>
            ${t?.iscilikYorumu ? `<p style="font-size:12px">${escapeHtml(t.iscilikYorumu)}</p>` : ''}
            ${t?.planNotu ? `<p style="font-size:12px"><strong>Plan:</strong> ${escapeHtml(t.planNotu)}</p>` : ''}
            ${imgRow(t?.fotoUrls || [])}
          </div>`;
      })
      .join('')}
    <p style="font-size:10px;color:#94a3b8;margin-top:16px">Baskı: ${formatDateLabelTr(new Date().toISOString())}</p>
  `;
  return wrapCorporateReportHtml(body, {
    title: `${opts.parsel} Baca Çukur Temizlik Raporu`,
    docCode: 'TEMİZLİK-BACA',
    orientation: 'portrait',
    letterhead: true,
    autoPrint: true,
  });
}

export function openTemizlikRapor(html: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcı izinlerini kontrol edin.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
}
