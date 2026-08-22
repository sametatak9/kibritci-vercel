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

function resmiImzaCetveliHtml(imza?: {
  hazirlayan?: string;
  parselSefi?: string;
  projeMuduru?: string;
}): string {
  const cells = [
    { unvan: 'Hazırlayan', gorev: 'Saha tespit / tutanak', ad: imza?.hazirlayan || '' },
    { unvan: 'Kontrol eden', gorev: 'Parsel şefi / saha kontrol', ad: imza?.parselSefi || '' },
    { unvan: 'Onaylayan', gorev: 'Proje müdürü / işveren vekili', ad: imza?.projeMuduru || '' },
  ];
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:28px;page-break-inside:avoid">
      <tr>
        ${cells
          .map(
            (c) => `<td style="width:33.33%;border:1px solid #0f172a;vertical-align:top;padding:0">
              <p style="margin:0;padding:6px 8px;background:#0f172a;color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-family:Times New Roman,Times,serif">${escapeHtml(c.unvan)}</p>
              <p style="margin:0;padding:6px 8px 0;font-size:10px;color:#334155">${escapeHtml(c.gorev)}</p>
              <p style="margin:0;padding:8px;font-size:13px;font-weight:700;min-height:22px">${escapeHtml(c.ad || '…')}</p>
              <div style="height:64px;border-top:1px dashed #94a3b8;margin:0 8px"></div>
              <p style="margin:0;padding:4px 8px 8px;font-size:9px;color:#64748b">İmza ve kaşe</p>
            </td>`
          )
          .join('')}
      </tr>
    </table>
    <p style="font-size:10px;line-height:1.5;color:#1e293b;margin:16px 0 0;text-align:justify">
      İşbu tutanak üç nüsha düzenlenmiş olup hazırlayan, kontrol eden ve onaylayan tarafından imzalanmıştır.
      Tespit fotoğrafları tutanağın ayrılmaz ekidir. İmza ve kaşe tamamlandıktan sonra bu belge, ilgili parseldeki
      <strong>altyapı baca temizliği ve çevre düzenleme</strong> işinin tamamlandığına dair hakediş / ödeme dayanağı olarak kullanılabilir.
    </p>`;
}

function imgGrid(urls: string[], etiket: string, max = 16): string {
  const list = (urls || []).filter(Boolean).slice(0, max);
  if (!list.length) return '<p style="font-size:12px;color:#334155">Ek fotoğraf bulunmamaktadır.</p>';
  return `<table style="width:100%;border-collapse:collapse">
    ${Array.from({ length: Math.ceil(list.length / 2) }, (_, row) => {
      const a = list[row * 2];
      const b = list[row * 2 + 1];
      const cell = (u: string | undefined, n: number) =>
        u
          ? `<td style="width:50%;border:1px solid #0f172a;padding:8px;vertical-align:top">
              <img src="${escapeHtml(u)}" alt="Ek-1 Fotoğraf ${n}" style="width:100%;height:200px;object-fit:cover;display:block;border:1px solid #cbd5e1" />
              <p style="margin:6px 0 0;font-size:10px;font-weight:700">EK-1 / Fotoğraf ${n} — ${escapeHtml(etiket)} saha kontrolü</p>
            </td>`
          : `<td style="width:50%;border:1px solid #0f172a"></td>`;
      return `<tr>${cell(a, row * 2 + 1)}${cell(b, row * 2 + 2)}</tr>`;
    }).join('')}
  </table>`;
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
  blokFotolar?: { blok: string; fotoUrls: string[]; not?: string }[];
}): string {
  const tarih = formatDateLabelTr(opts.tarih || new Date().toISOString());
  const kisa = parselKisaAd(opts.parsel);
  const baca = opts.konu === 'BACA';
  const bloklar = (opts.blokFotolar || []).filter((b) => String(b.blok || '').trim());
  const blokModu = !baca && bloklar.length > 0;
  const blokAdlari = bloklar.map((b) => b.blok.trim().toLocaleUpperCase('tr-TR'));
  const belgeAdi = baca
    ? 'ALTYAPI BACA TEMİZLİĞİ VE ÇEVRE DÜZENLEME İŞ BİTİRME TUTANAĞI'
    : blokModu
      ? 'BLOK TEMİZLİĞİ İŞ BİTİRME TUTANAĞI'
      : 'DAİRE / BLOK TEMİZLİĞİ İŞ BİTİRME TUTANAĞI';
  const docCode = baca ? 'PTT-PARSEL-BACA' : blokModu ? 'PTT-BLOK-TEMIZLIK' : 'PTT-PARSEL-DAIRE';
  const konuSatir = baca
    ? `${opts.parsel} (${kisa}) sınırları içindeki tüm altyapı bacalarının (pit / çukur ağızları) temizliği ile çevre düzenleme işinin tamamlandığının tespiti`
    : blokModu
      ? `${opts.parsel} (${kisa}) kapsamında ${blokAdlari.join(', ')} bloklarının temizlik işinin tamamlandığının tespiti`
      : `${opts.parsel} (${kisa}) sınırları içindeki daire / blok temizlik işinin tamamlandığının tespiti`;
  const sonuc = baca
    ? `Yapılan saha kontrolü sonucunda ${kisa} parselinde yer alan altyapı bacalarının tamamının temizlendiği; pit çukur ağızlarının açıldığı / temizlendiği ve çevre düzenleme (zemin tesviyesi, stabilize-çakıl serimi ve saha düzeni) işinin parsel geneli tamamlandığı tespit edilmiştir. Eksik baca bırakılmamıştır.`
    : blokModu
      ? `Yapılan saha kontrolü sonucunda ${kisa} parselinde ${blokAdlari.map((b) => `Blok ${b}`).join(', ')} bloklarının temizlik işi tamamlanmıştır. Bu altı blok temizlenmiş ve teslime hazır kabul edilir.`
      : `Yapılan saha kontrolü sonucunda ${kisa} parselinde daire / blok temizlik işinin parsel geneli tamamlandığı tespit edilmiştir.`;
  const sahaNotu = String(opts.metin || '').trim();
  const body = `
    <div style="border:2px solid #0f172a;padding:18px 20px 22px;font-family:'Times New Roman',Times,serif;color:#0f172a">
      <p style="margin:0 0 4px;text-align:center;font-size:11px;letter-spacing:.14em;font-weight:700">T.C. — KİBRİTÇİ İNŞAAT TAAHHÜT TURİZM SAN. VE TİC. LTD. ŞTİ.</p>
      <p style="margin:0 0 12px;text-align:center;font-size:16px;font-weight:800;letter-spacing:.04em;line-height:1.35">${escapeHtml(belgeAdi)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 14px">
        <tr>
          <td style="border:1px solid #0f172a;padding:6px 8px;width:22%;font-weight:700;background:#f1f5f9">Belge türü</td>
          <td style="border:1px solid #0f172a;padding:6px 8px">İş bitirme / saha tespit tutanağı (hakediş eki)</td>
          <td style="border:1px solid #0f172a;padding:6px 8px;width:18%;font-weight:700;background:#f1f5f9">Tarih</td>
          <td style="border:1px solid #0f172a;padding:6px 8px">${escapeHtml(tarih)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #0f172a;padding:6px 8px;font-weight:700;background:#f1f5f9">Parsel</td>
          <td style="border:1px solid #0f172a;padding:6px 8px"><strong>${escapeHtml(opts.parsel)}</strong> &nbsp;(&nbsp;${escapeHtml(kisa)}&nbsp;)</td>
          <td style="border:1px solid #0f172a;padding:6px 8px;font-weight:700;background:#f1f5f9">Kapsam</td>
          <td style="border:1px solid #0f172a;padding:6px 8px">${blokModu ? escapeHtml(blokAdlari.map((b) => `Blok ${b}`).join(', ')) : 'Parselin tamamı'}</td>
        </tr>
        <tr>
          <td style="border:1px solid #0f172a;padding:6px 8px;font-weight:700;background:#f1f5f9">Konu</td>
          <td colspan="3" style="border:1px solid #0f172a;padding:6px 8px">${escapeHtml(konuSatir)}</td>
        </tr>
      </table>

      <p style="margin:0 0 6px;font-size:12px;font-weight:800;text-decoration:underline">MADDE 1 — Yer ve iş tanımı</p>
      <p style="margin:0 0 12px;font-size:12px;line-height:1.55;text-align:justify">
        İşbu tutanak, ${escapeHtml(opts.parsel)} üzerinde yürütülen ${
          baca
            ? 'altyapı baca (yağmur / atık / pit çukuru ağızları) temizliği ve buna bağlı çevre düzenleme'
            : blokModu
              ? `${blokAdlari.length} bloğa ait daire / blok temizlik`
              : 'daire ve blok temizlik'
        } işinin saha kontrolü ile düzenlenmiştir.
        ${
          blokModu
            ? 'Her bloğun temizliği ayrı fotoğraflarla belgelenmiştir.'
            : 'Tespit, her baca için ayrı kart açılmaksızın parsel bütününde yapılmış; ekli fotoğraflar sahanın genel durumunu belgelemektedir.'
        }
      </p>

      <p style="margin:0 0 6px;font-size:12px;font-weight:800;text-decoration:underline">MADDE 2 — Yapılan işler</p>
      <ol style="margin:0 0 12px;padding-left:18px;font-size:12px;line-height:1.55">
        ${
          baca
            ? `<li>Parsel genelindeki altyapı baca ağızlarının açılması, içinin ve çevresinin temizlenmesi.</li>
               <li>Pit / çukur çevresindeki moloz, ambalaj ve döküntülerin kaldırılması.</li>
               <li>Blok avluları ve baca hatları boyunca zemin tesviyesi, stabilize / çakıl serimi ve çevre düzeni.</li>
               <li>Temizlenen baca ağızlarının saha kontrol fotoğrafları ile belgelenmesi.</li>`
            : blokModu
              ? bloklar
                  .map(
                    (b) =>
                      `<li><strong>Blok ${escapeHtml(b.blok.toLocaleUpperCase('tr-TR'))}</strong> temizlik işi tamamlanmıştır.${b.not ? ` ${escapeHtml(b.not)}` : ''}</li>`
                  )
                  .join('')
              : `<li>Daire ve bloklarda temizlik işinin parsel geneli tamamlanması.</li>
               <li>Saha kontrol fotoğrafları ile belgelenmesi.</li>`
        }
      </ol>

      <p style="margin:0 0 6px;font-size:12px;font-weight:800;text-decoration:underline">MADDE 3 — Tespit ve sonuç</p>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.55;text-align:justify;font-weight:700;border:1px solid #0f172a;padding:10px 12px;background:#fffbeb">
        ${escapeHtml(sonuc)}
      </p>
      ${
        sahaNotu
          ? `<p style="margin:0 0 4px;font-size:11px;font-weight:800">Saha tutanak notu</p>
             <p style="margin:0 0 12px;font-size:12px;line-height:1.5;text-align:justify;border:1px solid #cbd5e1;padding:8px 10px">${escapeHtml(sahaNotu)}</p>`
          : ''
      }

      <p style="margin:0 0 6px;font-size:12px;font-weight:800;text-decoration:underline">MADDE 4 — Ekler</p>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.5">
        ${
          blokModu
            ? 'EK-1: Blok bazında saha kontrol fotoğrafları. Her bloğun altındaki görüntüler o bloğun temizliğini belgeler.'
            : `EK-1: Saha kontrol fotoğrafları (${opts.fotoUrls.filter(Boolean).length} adet). Fotoğraflar ${escapeHtml(kisa)} parselinde ${baca ? 'temizlenen baca ağızları ve çevre düzenleme zeminini' : 'tamamlanan temizlik işini'} göstermektedir.`
        }
      </p>
      ${
        blokModu
          ? bloklar
              .map((b, i) => {
                const ad = b.blok.toLocaleUpperCase('tr-TR');
                return `<p style="margin:14px 0 6px;font-size:12px;font-weight:800">EK-1.${i + 1} — BLOK ${escapeHtml(ad)}${b.not ? ` — ${escapeHtml(b.not)}` : ''}</p>${imgGrid(b.fotoUrls || [], `Blok ${ad}`)}`;
              })
              .join('')
          : imgGrid(opts.fotoUrls, kisa)
      }

      <p style="margin:16px 0 0;font-size:12px;line-height:1.55;text-align:justify">
        MADDE 5 — İşbu tutanak gerçeğe aykırı husus taşımadığını beyan eden aşağıda imzası bulunanlarca imzalanmıştır.
        ${baca ? `<strong>${escapeHtml(kisa)} parselindeki tüm altyapı bacaları temizlenmiş kabul edilir.</strong>` : ''}
        ${blokModu ? `<strong>${escapeHtml(kisa)} parselinde ${escapeHtml(blokAdlari.join(', '))} bloklarının temizlik işi tamamlanmış kabul edilir.</strong>` : ''}
      </p>
      ${resmiImzaCetveliHtml(opts.imza)}
    </div>
  `;
  return wrapCorporateReportHtml(body, {
    title: `${opts.parsel} ${belgeAdi}`,
    docCode,
    orientation: 'portrait',
    letterhead: true,
    autoPrint: true,
    extraCss: `
      .corporate-report-body{font-family:'Times New Roman',Times,Georgia,serif}
      @media print{img{break-inside:avoid}}
    `,
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

export function openTemizlikRapor(html: string, title: string, existing?: Window | null): void {
  const w = existing && !existing.closed ? existing : window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcıda bu site için pencere açmaya izin verin, sonra tekrar basın.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
}
