import type { HazirTutanak } from '../types/erp';
import { wrapCorporateReportHtml } from './corporateReportHtml';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMoney(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTarih(tarih: string): string {
  const d = tarih ? new Date(`${tarih}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return tarih || '';
  return d.toLocaleDateString('tr-TR');
}

export function hasarKalemlerindeFiyatVar(ht: HazirTutanak): boolean {
  return (ht.kalemler || []).some((k) => parseMoney(k.birimFiyat) != null);
}

export function buildTaseronHasarTutanakBody(ht: HazirTutanak): string {
  const fotolar = [ht.foto1, ht.foto2, ht.foto3].filter(Boolean) as string[];
  const kalemler = (ht.kalemler || []).filter((k) => String(k.malzemeAdi || '').trim());
  const showFiyat = hasarKalemlerindeFiyatVar(ht);
  let toplam = 0;
  const kalemRows = kalemler
    .map((k, i) => {
      const miktar = Number(String(k.miktar).replace(',', '.')) || 0;
      const fiyat = parseMoney(k.birimFiyat);
      const tutar = fiyat != null ? fiyat * (miktar || 1) : null;
      if (tutar != null) toplam += tutar;
      return `<tr>
        <td style="padding:7px 8px;border:1px solid #cbd5e1;text-align:center;font-family:ui-monospace,monospace">${i + 1}</td>
        <td style="padding:7px 8px;border:1px solid #cbd5e1">${escapeHtml(k.malzemeAdi)}</td>
        <td style="padding:7px 8px;border:1px solid #cbd5e1;text-align:right">${escapeHtml(k.miktar)} ${escapeHtml(k.cinsi || '')}</td>
        ${
          showFiyat
            ? `<td style="padding:7px 8px;border:1px solid #cbd5e1;text-align:right">${fiyat != null ? formatMoney(fiyat) : '—'}</td>
               <td style="padding:7px 8px;border:1px solid #cbd5e1;text-align:right">${tutar != null ? formatMoney(tutar) : '—'}</td>`
            : `<td style="padding:7px 8px;border:1px solid #cbd5e1">${escapeHtml(k.aciklama || '')}</td>`
        }
      </tr>`;
    })
    .join('');

  const fotoHtml = fotolar.length
    ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(fotolar.length, 3)},1fr);gap:10px;margin:16px 0 8px">
        ${fotolar
          .map(
            (src, i) =>
              `<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc">
                <img src="${src}" alt="Hasar ${i + 1}" style="width:100%;height:160px;object-fit:cover;display:block" />
                <p style="margin:0;padding:4px 6px;font-size:8px;color:#64748b;text-align:center">HASAR GÖRSEL ${i + 1}</p>
              </div>`
          )
          .join('')}
      </div>`
    : '';

  const sigImg = (src?: string) =>
    src
      ? `<img src="${src}" alt="imza" style="height:52px;max-width:180px;object-fit:contain;display:block;margin:8px auto 0" />`
      : `<div style="height:52px"></div>`;

  return `
    <p style="font-size:9px;font-weight:800;letter-spacing:.14em;color:#64748b;margin:0 0 6px">ZARAR / HASAR TESPİT TUTANAĞI</p>
    <h1 style="font-size:16px;font-weight:900;margin:0 0 14px;letter-spacing:.04em">${escapeHtml(ht.konu || 'Hasarlı Bölge Tespit Tutanağı')}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px">
      <tbody>
        <tr>
          <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;width:32%;font-weight:700;color:#64748b">Belge No</td>
          <td style="padding:8px;border:1px solid #e2e8f0;font-weight:800">${escapeHtml(ht.belgeNo)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#64748b">Tarih</td>
          <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(formatTarih(ht.tarih))}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#64748b">Parsel / Blok</td>
          <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml([ht.parsel, ht.blok].filter(Boolean).join(' / ') || '—')}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#64748b">Taşeron Firma</td>
          <td style="padding:8px;border:1px solid #e2e8f0;font-weight:800">${escapeHtml(ht.taseronAdi || '—')}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#64748b">Taşeron Yetkilisi</td>
          <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(ht.taseronYetkili || '—')}</td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:9px;font-weight:800;letter-spacing:.1em;color:#64748b;margin:0 0 6px">HASAR DETAYI VE OLAY AÇIKLAMASI</p>
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:12px;line-height:1.55;min-height:72px;white-space:pre-wrap">${escapeHtml(ht.icerik)}</div>
    ${fotoHtml}
    ${
      kalemler.length
        ? `<p style="font-size:9px;font-weight:800;letter-spacing:.1em;color:#64748b;margin:16px 0 6px">${showFiyat ? 'MADDİ TESPİT KALEMLERİ' : 'TESPİT EDİLEN KALEMLER (BİRİM FİYAT SONRADAN GİRİLEBİLİR)'}</p>
           <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px">
             <thead>
               <tr style="background:#f1f5f9">
                 <th style="padding:7px 8px;border:1px solid #cbd5e1;width:32px">#</th>
                 <th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:left">Kalem</th>
                 <th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:right">Miktar</th>
                 ${
                   showFiyat
                     ? '<th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:right">Birim Fiyat (₺)</th><th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:right">Tutar (₺)</th>'
                     : '<th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:left">Açıklama</th>'
                 }
               </tr>
             </thead>
             <tbody>${kalemRows}</tbody>
             ${
               showFiyat
                 ? `<tfoot><tr>
                      <td colspan="4" style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-weight:800">TOPLAM</td>
                      <td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-weight:900">${formatMoney(toplam)}</td>
                    </tr></tfoot>`
                 : ''
             }
           </table>`
        : ''
    }
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:36px;text-align:center;font-size:11px">
      <div>
        <p style="margin:0;font-weight:800;letter-spacing:.08em">KİBRİTÇİ İNŞAAT YETKİLİSİ</p>
        ${sigImg(ht.hazirlayanImza)}
        <div style="border-top:1px solid #0f172a;margin-top:8px;padding-top:6px">${escapeHtml(ht.hazirlayanAd || '................................')}</div>
      </div>
      <div>
        <p style="margin:0;font-weight:800;letter-spacing:.08em">TAŞERON FİRMA YETKİLİSİ</p>
        ${sigImg(ht.taseronImza)}
        <div style="border-top:1px solid #0f172a;margin-top:8px;padding-top:6px">${escapeHtml(ht.taseronYetkili || '................................')}</div>
      </div>
    </div>
  `;
}

export function openTaseronHasarTutanakPrint(ht: HazirTutanak): void {
  const html = wrapCorporateReportHtml(buildTaseronHasarTutanakBody(ht), {
    docCode: ht.belgeNo,
    orientation: 'portrait',
    title: `${ht.belgeNo} — Hasar Tespit Tutanağı`,
    autoPrint: true,
  });
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up engellendi. Tarayıcı izinlerini kontrol edin.');
    return;
  }
  win.document.write(html);
  win.document.close();
}
