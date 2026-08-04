import { OperatorFaaliyet, TaseronEnerjiKaydi, TaseronKesintiRaporu } from '../types/erp';
import { ayAdi, enerjiAktifKalemler, enerjiToplamTutar, makineEtiketi, makineKaynakGrupLabel, resolveMakineKaynakGrup, sayacFarki, sayacTutari } from './taseronUtils';
import { buildKibritciReportHtml, downloadKibritciReportHtml, openKibritciReportPrint } from './kibritciReportTemplate';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function buildIsMakinesiKesintiReportHtml(rapor: TaseronKesintiRaporu): string {
  const ayLabel = ayAdi(Number(rapor.donemAy));
  const kaynakEtiket = makineKaynakGrupLabel(
    rapor.makineKaynakGrup ||
      (rapor.faaliyetler?.[0] ? resolveMakineKaynakGrup(rapor.faaliyetler[0]) : 'ANA_FIRMA')
  );
  const rows = rapor.faaliyetler
    .map((f) => {
      const fotoCell = f.fotoUrl
        ? `<a href="${f.fotoUrl}" target="_blank" rel="noopener"><img src="${f.fotoUrl}" alt="Kanıt" style="max-width:72px;max-height:54px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1"/></a>`
        : '<span style="color:#94a3b8">—</span>';
      return `<tr>
          <td>${f.tarih}</td>
          <td>${f.operatorIsim}</td>
          <td>${makineEtiketi(f)}</td>
          <td>${f.baslangicSaat}–${f.bitisSaat}</td>
          <td style="text-align:right;font-weight:bold">${f.calismaSuresi.toFixed(1)} sa</td>
          <td>${f.yapilanIs}</td>
          <td style="text-align:center">${fotoCell}</td>
        </tr>`;
    })
    .join('');

  const fotoGaleri = rapor.faaliyetler
    .filter((f) => f.fotoUrl)
    .map(
      (f) =>
        `<div style="display:inline-block;margin:6px;text-align:center;vertical-align:top;width:120px">
          <a href="${f.fotoUrl}" target="_blank" rel="noopener">
            <img src="${f.fotoUrl}" alt="${f.tarih}" style="width:110px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1"/>
          </a>
          <div style="font-size:9px;color:#64748b;margin-top:4px">${f.tarih}<br/>${f.calismaSuresi.toFixed(1)} sa</div>
        </div>`
    )
    .join('');

  const bodyHtml = `
    <p><strong>Taşeron Firma:</strong> ${rapor.taseronFirmaAdi}</p>
    <p><strong>Makine kaynağı:</strong> ${kaynakEtiket}</p>
    <p><strong>Dönem:</strong> ${ayLabel} ${rapor.donemYil}</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:16px">
      <thead>
        <tr style="background:#1e3a5f;color:#fff">
          <th style="padding:8px;text-align:left">Tarih</th>
          <th style="padding:8px;text-align:left">Operatör</th>
          <th style="padding:8px;text-align:left">Makine</th>
          <th style="padding:8px;text-align:left">Saat Aralığı</th>
          <th style="padding:8px;text-align:right">Süre</th>
          <th style="padding:8px;text-align:left">İş Açıklaması</th>
          <th style="padding:8px;text-align:center">Foto</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${
      fotoGaleri
        ? `<div style="margin-top:18px"><p style="font-size:11px;font-weight:bold;color:#334155;margin-bottom:8px">Kanıt Fotoğrafları</p>${fotoGaleri}</div>`
        : ''
    }
    <div style="margin-top:20px;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px">
      <p><strong>Firma:</strong> ${rapor.taseronFirmaAdi}</p>
      <p><strong>Toplam Çalışma:</strong> ${rapor.toplamSaat.toFixed(1)} saat</p>
      <p><strong>Saatlik Ücret:</strong> ${fmt(rapor.saatlikUcret)} TL</p>
      <p style="color:#b91c1c;font-size:14px;font-weight:bold;margin-top:8px">
        KESİNTİ TOPLAMI: ${fmt(rapor.kesintiTutari)} TL
      </p>
    </div>`;

  return buildKibritciReportHtml({
    title: 'KİBRİTÇİ İNŞAAT',
    subtitle: `${ayLabel} ${rapor.donemYil} — İŞ MAKİNESİ KESİNTİ · ${kaynakEtiket.toLocaleUpperCase('tr-TR')}`,
    meta: [`Taşeron: ${rapor.taseronFirmaAdi}`, kaynakEtiket, `Oluşturan: ${rapor.olusturanKullanici}`],
    bodyHtml,
  });
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
