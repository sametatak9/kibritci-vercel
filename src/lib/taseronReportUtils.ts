import { OperatorFaaliyet, TaseronEnerjiKaydi, TaseronKesintiRaporu } from '../types/erp';
import { ayAdi, enerjiAktifKalemler, enerjiToplamTutar, makineEtiketi, makineKaynakGrupLabel, resolveMakineKaynakGrup, sayacFarki, sayacTutari, type MakineKaynakGrup } from './taseronUtils';
import { buildKibritciReportHtml, downloadKibritciReportHtml, openKibritciReportPrint } from './kibritciReportTemplate';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function faaliyetSatirlariHtml(faaliyetler: OperatorFaaliyet[]): string {
  return (faaliyetler || [])
    .map((f) => {
      const fotoCell = f.fotoUrl
        ? `<a href="${esc(f.fotoUrl)}" target="_blank" rel="noopener"><img src="${esc(f.fotoUrl)}" alt="Kanıt" style="max-width:72px;max-height:54px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1"/></a>`
        : '<span style="color:#94a3b8">—</span>';
      return `<tr>
          <td style="padding:8px;border:1px solid #e2e8f0;white-space:nowrap">${esc(f.tarih)}</td>
          <td style="padding:8px;border:1px solid #e2e8f0">${esc(f.operatorIsim)}</td>
          <td style="padding:8px;border:1px solid #e2e8f0">${esc(makineEtiketi(f))}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;white-space:nowrap">${esc(f.baslangicSaat)}–${esc(f.bitisSaat)}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-weight:800;font-size:13px;color:#0f172a">${Number(f.calismaSuresi || 0).toFixed(1)} sa</td>
          <td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;color:#1e293b;line-height:1.35">${esc(f.yapilanIs || '—')}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${fotoCell}</td>
        </tr>`;
    })
    .join('');
}

function faaliyetTabloHtml(faaliyetler: OperatorFaaliyet[]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px">
      <thead>
        <tr style="background:#0f172a;color:#fff">
          <th style="padding:8px;text-align:left">Tarih</th>
          <th style="padding:8px;text-align:left">Operatör</th>
          <th style="padding:8px;text-align:left">Makine</th>
          <th style="padding:8px;text-align:left">Saat Aralığı</th>
          <th style="padding:8px;text-align:right">Süre (sa)</th>
          <th style="padding:8px;text-align:left">İş Açıklaması</th>
          <th style="padding:8px;text-align:center">Foto</th>
        </tr>
      </thead>
      <tbody>${faaliyetSatirlariHtml(faaliyetler)}</tbody>
    </table>`;
}

function kaynakBlokBaslik(grup: MakineKaynakGrup): { baslik: string; renk: string } {
  if (grup === 'KIRALIK') {
    return { baslik: 'KİRALIK / TAŞERON MAKİNESİ', renk: '#0f766e' };
  }
  return { baslik: 'ANA FİRMA MAKİNESİ', renk: '#b45309' };
}

export function buildIsMakinesiKesintiReportHtml(rapor: TaseronKesintiRaporu): string {
  const ayLabel = ayAdi(Number(rapor.donemAy));
  const grup =
    rapor.makineKaynakGrup ||
    (rapor.faaliyetler?.[0] ? resolveMakineKaynakGrup(rapor.faaliyetler[0]) : 'ANA_FIRMA');
  const kaynakEtiket = makineKaynakGrupLabel(grup);
  const blok = kaynakBlokBaslik(grup);
  const toplamSaat = Number(rapor.toplamSaat) || 0;

  const fotoGaleri = (rapor.faaliyetler || [])
    .filter((f) => f.fotoUrl)
    .map(
      (f) =>
        `<div style="display:inline-block;margin:6px;text-align:center;vertical-align:top;width:120px">
          <a href="${esc(f.fotoUrl)}" target="_blank" rel="noopener">
            <img src="${esc(f.fotoUrl)}" alt="${esc(f.tarih)}" style="width:110px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1"/>
          </a>
          <div style="font-size:9px;color:#64748b;margin-top:4px">${esc(f.tarih)}<br/><strong>${Number(f.calismaSuresi || 0).toFixed(1)} sa</strong></div>
        </div>`
    )
    .join('');

  const bodyHtml = `
    <div style="border:2px solid ${blok.renk};border-radius:10px;padding:12px 14px;margin-bottom:14px;background:#fff">
      <p style="margin:0 0 4px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${blok.renk}">Makine kaynağı</p>
      <p style="margin:0;font-size:16px;font-weight:900;color:#0f172a">${esc(blok.baslik)}</p>
      <p style="margin:6px 0 0;font-size:12px"><strong>Kesilecek taşeron:</strong> ${esc(rapor.taseronFirmaAdi)}</p>
      <p style="margin:2px 0 0;font-size:12px"><strong>Dönem:</strong> ${esc(ayLabel)} ${esc(rapor.donemYil)}</p>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div style="flex:1;min-width:140px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#fffbeb">
        <p style="margin:0;font-size:10px;font-weight:800;color:#92400e;text-transform:uppercase">Toplam saat</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:900;font-family:monospace">${toplamSaat.toFixed(1)} sa</p>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#f8fafc">
        <p style="margin:0;font-size:10px;font-weight:800;color:#475569;text-transform:uppercase">Faaliyet</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:900;font-family:monospace">${(rapor.faaliyetler || []).length}</p>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#fef2f2">
        <p style="margin:0;font-size:10px;font-weight:800;color:#991b1b;text-transform:uppercase">Kesinti</p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:900;color:#b91c1c">${fmt(rapor.kesintiTutari)} TL</p>
        <p style="margin:2px 0 0;font-size:10px;color:#64748b">${fmt(rapor.saatlikUcret)} TL/sa</p>
      </div>
    </div>
    <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#334155">Saat ve iş açıklamaları (asıl belgedir)</p>
    ${faaliyetTabloHtml(rapor.faaliyetler || [])}
    ${
      fotoGaleri
        ? `<div style="margin-top:18px"><p style="font-size:11px;font-weight:bold;color:#334155;margin-bottom:8px">Kanıt Fotoğrafları</p>${fotoGaleri}</div>`
        : ''
    }`;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ayLabel} ${rapor.donemYil} — İŞ MAKİNESİ KESİNTİ · ${blok.baslik}`,
    meta: [
      `Taşeron: ${rapor.taseronFirmaAdi}`,
      kaynakEtiket,
      `${toplamSaat.toFixed(1)} sa`,
      `Oluşturan: ${rapor.olusturanKullanici}`,
    ],
    bodyHtml,
  });
}

/** Dönemdeki tüm firma raporlarını tek belgede: Ana Firma Makinesi / Kiralık ayrı bloklar */
export function buildTopluIsMakinesiKesintiReportHtml(
  raporlar: TaseronKesintiRaporu[],
  ay: number,
  yil: number
): string {
  const ayLabel = ayAdi(ay);
  const sorted = [...raporlar].sort((a, b) => {
    const ga = a.makineKaynakGrup === 'KIRALIK' ? 1 : 0;
    const gb = b.makineKaynakGrup === 'KIRALIK' ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return String(a.taseronFirmaAdi || '').localeCompare(String(b.taseronFirmaAdi || ''), 'tr');
  });

  const ana = sorted.filter((r) => (r.makineKaynakGrup || resolveMakineKaynakGrup(r.faaliyetler?.[0])) !== 'KIRALIK');
  const kiralik = sorted.filter((r) => (r.makineKaynakGrup || resolveMakineKaynakGrup(r.faaliyetler?.[0])) === 'KIRALIK');

  const firmaBlok = (list: TaseronKesintiRaporu[], grup: MakineKaynakGrup) => {
    if (!list.length) return '';
    const meta = kaynakBlokBaslik(grup);
    const toplamSaat = list.reduce((s, r) => s + (Number(r.toplamSaat) || 0), 0);
    const toplamTutar = list.reduce((s, r) => s + (Number(r.kesintiTutari) || 0), 0);
    const firmalar = list
      .map((r) => {
        return `<div style="margin:14px 0 18px;page-break-inside:avoid">
          <div style="background:#f1f5f9;border-left:4px solid ${meta.renk};padding:8px 12px;margin-bottom:8px">
            <p style="margin:0;font-size:13px;font-weight:900">${esc(r.taseronFirmaAdi)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#334155">
              <strong>${Number(r.toplamSaat || 0).toFixed(1)} sa</strong> · ${(r.faaliyetler || []).length} faaliyet
              · ${r.ucretOnayBekliyor ? 'ücret bekliyor' : `${fmt(r.saatlikUcret)} TL/sa → <strong style="color:#b91c1c">${fmt(r.kesintiTutari)} TL</strong>`}
            </p>
          </div>
          ${faaliyetTabloHtml(r.faaliyetler || [])}
        </div>`;
      })
      .join('');
    return `<section style="margin:22px 0">
      <h2 style="margin:0 0 8px;padding:10px 12px;background:${meta.renk};color:#fff;font-size:14px;border-radius:8px">${esc(meta.baslik)} — ${list.length} firma · ${toplamSaat.toFixed(1)} sa · ${fmt(toplamTutar)} TL</h2>
      ${firmalar}
    </section>`;
  };

  const genelSaat = sorted.reduce((s, r) => s + (Number(r.toplamSaat) || 0), 0);
  const bodyHtml = `
    <div style="border:2px solid #0f172a;padding:12px 14px;border-radius:10px;margin-bottom:16px">
      <p style="margin:0;font-size:12px;font-weight:800">TOPLU İŞ MAKİNESİ KESİNTİ RAPORU</p>
      <p style="margin:6px 0 0;font-size:13px"><strong>Dönem:</strong> ${esc(ayLabel)} ${yil}</p>
      <p style="margin:4px 0 0;font-size:13px"><strong>Toplam:</strong> ${sorted.length} rapor · ${genelSaat.toFixed(1)} saat</p>
      <p style="margin:8px 0 0;font-size:11px;color:#475569">Ana Firma Makinesi ve Kiralık / Taşeron Makinesi ayrı bloklarda listelenir. Saat ve iş açıklaması asıl belgedir.</p>
    </div>
    ${firmaBlok(ana, 'ANA_FIRMA')}
    ${firmaBlok(kiralik, 'KIRALIK')}
  `;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ayLabel} ${yil} — TOPLU İŞ MAKİNESİ KESİNTİ (Ana Firma / Kiralık ayrı)`,
    meta: [`${sorted.length} rapor`, `${genelSaat.toFixed(1)} sa`, `Ana: ${ana.length}`, `Kiralık: ${kiralik.length}`],
    bodyHtml,
  });
}

export function yazdirTopluIsMakinesiRaporu(raporlar: TaseronKesintiRaporu[], ay: number, yil: number): void {
  if (!raporlar.length) {
    alert('Bu dönem için yazdırılacak iş makinesi kesinti raporu yok.');
    return;
  }
  openKibritciReportPrint(
    buildTopluIsMakinesiKesintiReportHtml(raporlar, ay, yil),
    `Toplu İş Makinesi Kesinti ${ay}/${yil}`
  );
}

export function indirTopluIsMakinesiRaporu(raporlar: TaseronKesintiRaporu[], ay: number, yil: number): void {
  if (!raporlar.length) {
    alert('Bu dönem için indirilecek iş makinesi kesinti raporu yok.');
    return;
  }
  const html = buildTopluIsMakinesiKesintiReportHtml(raporlar, ay, yil);
  downloadKibritciReportHtml(
    html,
    `Kibritci_Toplu_IsMakinesi_${String(ay).padStart(2, '0')}_${yil}.html`
  );
}

export function buildEnerjiKesintiReportHtml(
  taseronAdi: string,
  ay: number,
  yil: number,
  kayit: TaseronEnerjiKaydi
): string {
  const ayLabel = ayAdi(ay);
  const e = kayit.elektrik;
  const s = kayit.su;
  const g = kayit.dogalgaz;
  const toplam = enerjiToplamTutar(kayit);
  const aktif = new Set(enerjiAktifKalemler(kayit));
  // Eski kayıt: aktif boşsa hepsini göster
  const showAll = aktif.size === 0 && !kayit.aktifKalemler;
  const rows: string[] = [];
  if (showAll || aktif.has('ELEKTRIK')) {
    rows.push(
      `<tr><td>⚡ Elektrik (kWh)</td><td style="text-align:right">${e.ilkOkuma}</td><td style="text-align:right">${e.sonOkuma}</td><td style="text-align:right">${sayacFarki(e)}</td><td style="text-align:right">${fmt(e.birimFiyat)}</td><td style="text-align:right;font-weight:bold">${fmt(sayacTutari(e))}</td></tr>`
    );
  }
  if (showAll || aktif.has('SU')) {
    rows.push(
      `<tr><td>💧 Su (m³)</td><td style="text-align:right">${s.ilkOkuma}</td><td style="text-align:right">${s.sonOkuma}</td><td style="text-align:right">${sayacFarki(s)}</td><td style="text-align:right">${fmt(s.birimFiyat)}</td><td style="text-align:right;font-weight:bold">${fmt(sayacTutari(s))}</td></tr>`
    );
  }
  if (showAll || aktif.has('DOGALGAZ')) {
    rows.push(
      `<tr><td>🔥 Doğalgaz (m³)</td><td style="text-align:right">${g.ilkOkuma}</td><td style="text-align:right">${g.sonOkuma}</td><td style="text-align:right">${sayacFarki(g)}</td><td style="text-align:right">${fmt(g.birimFiyat)}</td><td style="text-align:right;font-weight:bold">${fmt(sayacTutari(g))}</td></tr>`
    );
  }
  const aciklamaHtml = kayit.aciklama
    ? `<p style="margin-top:12px"><strong>Açıklama / neden:</strong> ${String(kayit.aciklama).replace(/</g, '&lt;')}</p>`
    : '';

  const bodyHtml = `
    <p><strong>Taşeron:</strong> ${taseronAdi}</p>
    <p><strong>Dönem:</strong> ${ayLabel} ${yil}</p>
    ${aciklamaHtml}
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:16px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:8px">Kalem</th>
          <th style="padding:8px;text-align:right">İlk Sayaç</th>
          <th style="padding:8px;text-align:right">Son Sayaç</th>
          <th style="padding:8px;text-align:right">Fark</th>
          <th style="padding:8px;text-align:right">Birim Fiyat</th>
          <th style="padding:8px;text-align:right">Tutar (TL)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('\n') || '<tr><td colspan="6">Kesinti kalemi yok</td></tr>'}
        <tr style="background:#fef2f2;font-weight:bold"><td colspan="5" style="text-align:right;padding:8px">GENEL TOPLAM</td><td style="text-align:right;padding:8px;color:#b91c1c">${fmt(toplam)} TL</td></tr>
      </tbody>
    </table>`;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ayLabel} ${yil} — ELEKTRİK / SU / DOĞALGAZ KESİNTİ RAPORU`,
    meta: [`Taşeron: ${taseronAdi}`],
    bodyHtml,
  });
}

export function buildYemekRaporHtml(
  taseronAdi: string,
  ay: number,
  yil: number,
  ozet: { sabah: number; ogle: number; aksam: number; gunSayisi: number },
  gunluk: { tarih: string; sabah: number; ogle: number; aksam: number }[]
): string {
  const ayLabel = ayAdi(ay);
  const gunRows = gunluk
    .map(
      (g) =>
        `<tr><td>${g.tarih}</td><td style="text-align:center">${g.sabah}</td><td style="text-align:center">${g.ogle}</td><td style="text-align:center">${g.aksam}</td><td style="text-align:center;font-weight:bold">${g.sabah + g.ogle + g.aksam}</td></tr>`
    )
    .join('');

  const bodyHtml = `
    <p><strong>Taşeron:</strong> ${taseronAdi}</p>
    <p><strong>Dönem:</strong> ${ayLabel} ${yil} — Günlük yemek adetleri (maddi tutar içermez)</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:16px">
      <thead><tr style="background:#1e3a5f;color:#fff"><th>Tarih</th><th>Sabah</th><th>Öğle</th><th>Akşam</th><th>Toplam</th></tr></thead>
      <tbody>${gunRows}</tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:bold">
          <td>AYLIK TOPLAM (${ozet.gunSayisi} gün)</td>
          <td style="text-align:center">${ozet.sabah}</td>
          <td style="text-align:center">${ozet.ogle}</td>
          <td style="text-align:center">${ozet.aksam}</td>
          <td style="text-align:center">${ozet.sabah + ozet.ogle + ozet.aksam}</td>
        </tr>
      </tfoot>
    </table>`;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ayLabel} ${yil} — YEMEK SAYIM RAPORU`,
    meta: [`Taşeron: ${taseronAdi}`],
    bodyHtml,
  });
}

export function mailtoForRapor(konu: string, html: string, rapor: TaseronKesintiRaporu): void {
  const plain =
    rapor.kesintiTipi === 'IS_MAKINESI'
      ? `${rapor.taseronFirmaAdi} — ${rapor.donemAy}/${rapor.donemYil} iş makinesi kesinti raporu.\nToplam: ${rapor.toplamSaat.toFixed(1)} saat × ${rapor.saatlikUcret} TL = ${rapor.kesintiTutari.toFixed(2)} TL`
      : konu;
  const reportHtml = html || buildIsMakinesiKesintiReportHtml(rapor);
  void import('./reportEmail').then(({ openReportEmailComposer }) => {
    openReportEmailComposer({
      subject: konu,
      body: plain,
      html: reportHtml,
      fileName: `Kibritci_${rapor.taseronFirmaAdi}_${rapor.donemAy}_${rapor.donemYil}.html`,
    });
  });
}

export function indirIsMakinesiRaporu(rapor: TaseronKesintiRaporu): void {
  const html = buildIsMakinesiKesintiReportHtml(rapor);
  downloadKibritciReportHtml(html, `Kibritci_IsMakinesi_${rapor.taseronFirmaAdi}_${rapor.donemAy}_${rapor.donemYil}.html`);
}

export function yazdirIsMakinesiRaporu(rapor: TaseronKesintiRaporu): void {
  openKibritciReportPrint(buildIsMakinesiKesintiReportHtml(rapor), 'İş Makinesi Kesinti Raporu');
}
