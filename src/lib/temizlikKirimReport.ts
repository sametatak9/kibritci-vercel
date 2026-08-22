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
  bacaYerSatiri,
  deriveKartDurum,
  koridorlarForParsel,
  latestByDate,
  ozetBacaKoridor,
  ozetBacaParsel,
  ozetDaireBlok,
  ozetDaireParsel,
  parselKisaAd,
  sortBacalar,
  sumYevmiye,
} from './temizlikKirimUtils';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imgRow(urls: string[], max = 6): string {
  const list = (urls || []).filter(Boolean).slice(0, max);
  if (!list.length) return '<p class="text-[11px] text-slate-400">Foto yok</p>';
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">${list
    .map(
      (u) =>
        `<img src="${escapeHtml(u)}" alt="" style="width:110px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0" />`
    )
    .join('')}</div>`;
}

function imgGrid(urls: string[], max = 16): string {
  const list = (urls || []).filter(Boolean).slice(0, max);
  if (!list.length) return '<p style="font-size:12px;color:#94a3b8">Fotoğraf eklenmedi.</p>';
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 8px">
    ${list
      .map(
        (u, i) =>
          `<figure style="margin:0;page-break-inside:avoid">
            <img src="${escapeHtml(u)}" alt="Saha fotoğraf ${i + 1}" style="width:100%;height:210px;object-fit:cover;border-radius:10px;border:1px solid #cbd5e1" />
            <figcaption style="font-size:9px;color:#64748b;margin-top:4px;font-weight:700">Fotoğraf ${i + 1}</figcaption>
          </figure>`
      )
      .join('')}
  </div>`;
}

function ozetTabloHtml(
  headers: string[],
  rows: (string | number)[][]
): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 16px">
    <thead>
      <tr>${headers
        .map(
          (h, i) =>
            `<th style="text-align:${i === 0 ? 'left' : 'right'};border-bottom:1px solid #e2e8f0;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#64748b">${escapeHtml(h)}</th>`
        )
        .join('')}</tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (c, i) =>
                  `<td style="text-align:${i === 0 ? 'left' : 'right'};border-bottom:1px solid #f1f5f9;padding:6px 8px;font-weight:${i === 0 ? 800 : 700}">${escapeHtml(c)}</td>`
              )
              .join('')}</tr>`
        )
        .join('')}
    </tbody>
  </table>`;
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
  const blokOzet = blocks.map((blok) =>
    ozetDaireBlok(opts.parsel, blok, opts.daireler, opts.tespitler, opts.uygulamalar)
  );
  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 6px">${escapeHtml(opts.parsel)} — Daire Temizlik Tespiti ve Uygulama Raporu</h1>
    <p style="font-size:12px;color:#475569;margin:0 0 12px">${escapeHtml(parselKisaAd(opts.parsel))}: ${ozet.adet} daire · ${ozet.tespitli} tespit · plan ${ozet.planYevmiye} yevmiye · kalan ${ozet.kalanYevmiye}</p>
    ${ozetTabloHtml(
      ['Blok', 'Daire', 'Tespit', 'İş (yevmiye)', 'Kalan'],
      blokOzet.map((b) => [b.blok, b.adet, `${b.tespitli}/${b.adet}`, b.planYevmiye, b.kalanYevmiye])
    )}
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
  const koridorlar = koridorlarForParsel(opts.parsel);
  const bacalar = sortBacalar(opts.bacalar.filter((d) => d.parsel === opts.parsel));
  const koridorOzet = koridorlar.map((k) =>
    ozetBacaKoridor(opts.parsel, k.id, opts.bacalar, opts.tespitler, opts.uygulamalar)
  );

  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 6px">${escapeHtml(opts.parsel)} — Baca Çukur Temizlik Tespiti ve Planı</h1>
    <p style="font-size:12px;color:#475569;margin:0 0 12px">${escapeHtml(parselKisaAd(opts.parsel))}: ${ozet.adet} baca · ${ozet.tespitli} tespit · plan ${ozet.planYevmiye} yevmiye · kalan ${ozet.kalanYevmiye}</p>
    ${ozetTabloHtml(
      ['Koridor', 'Baca', 'Tespit', 'İş (yevmiye)', 'Kalan'],
      koridorOzet.map((k, i) => [
        koridorlar[i]?.baslik || k.parsel,
        k.adet,
        `${k.tespitli}/${k.adet}`,
        k.planYevmiye,
        k.kalanYevmiye,
      ])
    )}
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
        const uygulanan = u
          .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)))
          .map(
            (x) =>
              `<li>${escapeHtml(x.tarih)} · ${escapeHtml(x.harcananYevmiye)} yevmiye · ${escapeHtml(x.durum)}${x.aciklama ? ` — ${escapeHtml(x.aciklama)}` : ''}</li>`
          )
          .join('');
        return `
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px">
            <p style="font-weight:800;margin:0;font-size:16px">${escapeHtml(d.etiket)} — ${TEMIZLIK_KART_DURUM_LABEL[durum]}</p>
            <p style="font-size:12px;margin:4px 0"><strong>Adres:</strong> ${escapeHtml(bacaYerSatiri(d))}${d.koridor ? ` · ${escapeHtml(d.koridor)}` : ''}</p>
            <p style="font-size:12px;color:#475569;margin:4px 0">Kirlilik: ${escapeHtml(t?.kirlilikDurumu || '—')} · Plan ${p} yevmiye · Harcanan ${h} · Kalan ${Math.max(0, p - h)}</p>
            ${t?.iscilikYorumu ? `<p style="font-size:12px"><strong>Tespit:</strong> ${escapeHtml(t.iscilikYorumu)}</p>` : ''}
            ${t?.planNotu ? `<p style="font-size:12px"><strong>Plan:</strong> ${escapeHtml(t.planNotu)}</p>` : ''}
            ${imgRow(t?.fotoUrls || [])}
            ${uygulanan ? `<p style="font-size:12px;font-weight:800;margin:10px 0 4px">Ne yapıldı</p><ul style="font-size:12px;margin:0">${uygulanan}</ul>` : ''}
            ${u.flatMap((x) => x.fotoUrls || []).length ? imgRow(u.flatMap((x) => x.fotoUrls || [])) : ''}
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

export function temizlikImzaBarHtml(imza?: {
  hazirlayan?: string;
  parselSefi?: string;
  projeMuduru?: string;
}): string {
  const cells = [
    { unvan: 'Hazırlayan', ad: imza?.hazirlayan || '' },
    { unvan: 'Kontrol eden', ad: imza?.parselSefi || '' },
    { unvan: 'Onaylayan', ad: imza?.projeMuduru || '' },
  ];
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;margin-top:42px;page-break-inside:avoid">
      ${cells
        .map(
          (c) => `
        <div style="text-align:center">
          <div style="height:52px"></div>
          <div style="border-top:1px solid #0f172a;padding-top:8px">
            <p style="margin:0;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:800">${escapeHtml(c.unvan)}</p>
            <p style="margin:6px 0 0;font-size:12px;font-weight:800;min-height:18px">${escapeHtml(c.ad || ' ')}</p>
            <p style="margin:2px 0 0;font-size:9px;color:#94a3b8">İmza / kaşe</p>
          </div>
        </div>`
        )
        .join('')}
    </div>
    <p style="font-size:10px;color:#64748b;margin-top:18px;line-height:1.45">
      Bu tutanak, seçilen kapsamda yapılan temizlik tespit ve uygulamasını hakediş esasına göre belgelemek üzere düzenlenmiştir.
      Tespit fotoğrafları ve oda/baca kartları ek niteliğindedir.
    </p>`;
}

export function buildDaireTemizlikTutanakHtml(opts: {
  parsel: string;
  bloklar: string[];
  daireler: TemizlikDaire[];
  tespitler: TemizlikTespit[];
  uygulamalar: TemizlikUygulama[];
  tarih?: string;
  not?: string;
  imza?: { hazirlayan?: string; parselSefi?: string; projeMuduru?: string };
  /** Yalnız tespit veya uygulama olan daireler (hakediş) */
  yalnizIslenen?: boolean;
}): string {
  const blokSet = new Set(opts.bloklar.map((b) => b.toLocaleUpperCase('tr-TR')));
  let daireler = opts.daireler.filter((d) => d.parsel === opts.parsel);
  if (blokSet.size) {
    daireler = daireler.filter((d) => blokSet.has(String(d.blok || '').toLocaleUpperCase('tr-TR')));
  }
  if (opts.yalnizIslenen !== false) {
    daireler = daireler.filter(
      (d) =>
        opts.tespitler.some((t) => t.daireId === d.id) ||
        opts.uygulamalar.some((u) => u.daireId === d.id)
    );
  }
  daireler = daireler.sort((a, b) => `${a.blok} ${a.daireNo}`.localeCompare(`${b.blok} ${b.daireNo}`, 'tr'));
  const blocks = Array.from(new Set(daireler.map((d) => d.blok)));
  const blokOzet = blocks.map((blok) =>
    ozetDaireBlok(opts.parsel, blok, opts.daireler, opts.tespitler, opts.uygulamalar)
  );
  const tarih = formatDateLabelTr(opts.tarih || new Date().toISOString());
  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase">Parsel Temizlik Tespit Tutanağı</h1>
    <p style="font-size:12px;color:#334155;margin:0 0 4px"><strong>${escapeHtml(opts.parsel)}</strong> · ${escapeHtml(parselKisaAd(opts.parsel))} · ${escapeHtml(tarih)}</p>
    <p style="font-size:12px;color:#475569;margin:0 0 12px">Kapsam: ${blocks.length ? blocks.map((b) => `Blok ${escapeHtml(b)}`).join(', ') : 'Tespitli blok yok'} · ${daireler.length} daire kartı</p>
    ${opts.not ? `<p style="font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin:0 0 12px">${escapeHtml(opts.not)}</p>` : ''}
    ${ozetTabloHtml(
      ['Blok', 'Daire', 'Tespit', 'Tamamlanan', 'Plan yevmiye', 'Kalan'],
      blokOzet.map((b) => [b.blok, b.adet, b.tespitli, b.tamamlanan, b.planYevmiye, b.kalanYevmiye])
    )}
    ${blocks
      .map((blok) => {
        const rows = daireler.filter((d) => d.blok === blok);
        return `
          <h2 style="font-size:14px;font-weight:800;margin:18px 0 8px;border-bottom:2px solid #0f766e;padding-bottom:4px">Blok ${escapeHtml(blok)} — ${rows.length} daire</h2>
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
              const fotolar = [
                ...(t?.fotoUrls || []),
                ...(t?.odalar || []).flatMap((o) => o.fotoUrls || []),
                ...u.flatMap((x) => x.fotoUrls || []),
              ];
              return `
                <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;page-break-inside:avoid">
                  <p style="font-weight:800;margin:0">Daire ${escapeHtml(d.daireNo)}${d.kat ? ` · Kat ${escapeHtml(d.kat)}` : ''} — ${TEMIZLIK_KART_DURUM_LABEL[durum]}</p>
                  <p style="font-size:12px;color:#475569;margin:4px 0">İş: ${escapeHtml(t?.isTipi || '—')} · Plan ${p} yevmiye · Yapılan ${h}</p>
                  ${t?.genelYorum ? `<p style="font-size:12px">${escapeHtml(t.genelYorum)}</p>` : ''}
                  ${odalar ? `<ul style="font-size:12px;margin:6px 0">${odalar}</ul>` : ''}
                  ${imgRow(fotolar)}
                </div>`;
            })
            .join('')}
        `;
      })
      .join('')}
    ${temizlikImzaBarHtml(opts.imza)}
  `;
  return wrapCorporateReportHtml(body, {
    title: `${opts.parsel} Parsel Temizlik Tespit Tutanağı`,
    docCode: 'PTT-DAİRE',
    orientation: 'portrait',
    letterhead: true,
    autoPrint: true,
  });
}

export function buildParselTopluTutanakHtml(opts: {
  parsel: string;
  konu: 'BACA' | 'DAIRE';
  tarih?: string;
  metin: string;
  fotoUrls: string[];
  imza?: { hazirlayan?: string; parselSefi?: string; projeMuduru?: string };
}): string {
  const tarih = formatDateLabelTr(opts.tarih || new Date().toISOString());
  const konuBaslik =
    opts.konu === 'BACA' ? 'Altyapı Baca Temizliği ve Çevre Düzenleme' : 'Daire / Blok Temizliği';
  const docCode = opts.konu === 'BACA' ? 'PTT-PARSEL-BACA' : 'PTT-PARSEL-DAIRE';
  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase">Parsel Geneli ${escapeHtml(konuBaslik)} Tutanağı</h1>
    <p style="font-size:12px;color:#334155;margin:0 0 4px"><strong>${escapeHtml(opts.parsel)}</strong> · ${escapeHtml(parselKisaAd(opts.parsel))} · ${escapeHtml(tarih)}</p>
    <p style="font-size:11px;font-weight:800;color:#0f766e;margin:0 0 12px;text-transform:uppercase">Kapsam: parselin tamamı — tek tek kart açılmadan saha kontrolü</p>
    <div style="border:1px solid #0f766e;border-radius:12px;padding:14px 16px;background:#f0fdfa;margin:0 0 16px">
      <p style="margin:0;font-size:13px;line-height:1.55;font-weight:600;color:#134e4a;white-space:pre-wrap">${escapeHtml(opts.metin)}</p>
    </div>
    <h2 style="font-size:13px;font-weight:800;margin:0 0 8px;text-transform:uppercase;letter-spacing:.06em">Saha kontrol fotoğrafları</h2>
    ${imgGrid(opts.fotoUrls)}
    ${temizlikImzaBarHtml(opts.imza)}
  `;
  return wrapCorporateReportHtml(body, {
    title: `${opts.parsel} ${konuBaslik} tutanağı`,
    docCode,
    orientation: 'portrait',
    letterhead: true,
    autoPrint: true,
  });
}

export function buildBacaTemizlikTutanakHtml(opts: {
  parsel: string;
  bacaIds?: string[];
  bacalar: TemizlikBaca[];
  tespitler: TemizlikBacaTespit[];
  uygulamalar: TemizlikBacaUygulama[];
  tarih?: string;
  not?: string;
  imza?: { hazirlayan?: string; parselSefi?: string; projeMuduru?: string };
  yalnizIslenen?: boolean;
}): string {
  const idSet = new Set(opts.bacaIds || []);
  let bacalar = sortBacalar(opts.bacalar.filter((d) => d.parsel === opts.parsel));
  if (idSet.size) bacalar = bacalar.filter((b) => idSet.has(b.id));
  if (opts.yalnizIslenen !== false) {
    bacalar = bacalar.filter(
      (b) =>
        opts.tespitler.some((t) => t.bacaId === b.id) ||
        opts.uygulamalar.some((u) => u.bacaId === b.id)
    );
  }
  const ozet = ozetBacaParsel(opts.parsel, bacalar, opts.tespitler, opts.uygulamalar);
  const koridorlar = koridorlarForParsel(opts.parsel);
  const koridorOzet = koridorlar.map((k) =>
    ozetBacaKoridor(opts.parsel, k.id, bacalar, opts.tespitler, opts.uygulamalar)
  );
  const tarih = formatDateLabelTr(opts.tarih || new Date().toISOString());
  const body = `
    <h1 style="font-size:18px;font-weight:900;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase">Altyapı Baca Temizlik Tespit Tutanağı</h1>
    <p style="font-size:12px;color:#334155;margin:0 0 4px"><strong>${escapeHtml(opts.parsel)}</strong> · ${escapeHtml(parselKisaAd(opts.parsel))} · ${escapeHtml(tarih)}</p>
    <p style="font-size:12px;color:#475569;margin:0 0 12px">${ozet.adet} baca · ${ozet.tespitli} tespit · ${ozet.tamamlanan} tamamlanan</p>
    ${opts.not ? `<p style="font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin:0 0 12px">${escapeHtml(opts.not)}</p>` : ''}
    ${ozetTabloHtml(
      ['Koridor', 'Baca', 'Tespit', 'Tamamlanan', 'Plan', 'Kalan'],
      koridorlar
        .map((k, i) => ({ baslik: k.baslik, o: koridorOzet[i] }))
        .filter((x) => x.o && x.o.adet > 0)
        .map((x) => [x.baslik, x.o.adet, x.o.tespitli, x.o.tamamlanan, x.o.planYevmiye, x.o.kalanYevmiye])
    )}
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
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;page-break-inside:avoid">
            <p style="font-weight:800;margin:0;font-size:15px">${escapeHtml(d.etiket)} — ${TEMIZLIK_KART_DURUM_LABEL[durum]}</p>
            <p style="font-size:12px;margin:4px 0"><strong>Yer:</strong> ${escapeHtml(bacaYerSatiri(d))}${d.koridor ? ` · ${escapeHtml(d.koridor)}` : ''}</p>
            <p style="font-size:12px;color:#475569;margin:4px 0">Kirlilik: ${escapeHtml(t?.kirlilikDurumu || '—')} · Plan ${p} · Yapılan ${h}</p>
            ${t?.iscilikYorumu ? `<p style="font-size:12px"><strong>Tespit:</strong> ${escapeHtml(t.iscilikYorumu)}</p>` : ''}
            ${imgRow([...(t?.fotoUrls || []), ...u.flatMap((x) => x.fotoUrls || [])])}
          </div>`;
      })
      .join('')}
    ${temizlikImzaBarHtml(opts.imza)}
  `;
  return wrapCorporateReportHtml(body, {
    title: `${opts.parsel} Altyapı Baca Temizlik Tutanağı`,
    docCode: 'PTT-BACA',
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
