import type { AylikYoklamaMap, KasaHareketi, Personel } from '../types/erp';
import { formatDateLabelTr, todayDateKey } from './dateKeyUtils';
import {
  buildGunlukYoklamaOzet,
  buildGunlukYoklamaRaporHtml,
  buildGunlukYoklamaSatirlari,
} from './yoklamaGunRaporu';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n: number): string {
  return (Number(n) || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderKasaSection(hareketler: KasaHareketi[], dateKey: string): string {
  const dayRows = hareketler
    .filter((k) => String(k.tarih).slice(0, 10) === dateKey)
    .sort((a, b) => {
      const dc = String(a.tarih).localeCompare(String(b.tarih));
      if (dc !== 0) return dc;
      return a.hareketTipi === 'GİRİŞ' ? -1 : 1;
    });

  let giris = 0;
  let cikis = 0;
  for (const kh of dayRows) {
    const t = Number(kh.tutar) || 0;
    if (kh.hareketTipi === 'GİRİŞ') giris += t;
    else cikis += t;
  }
  const net = giris - cikis;

  const rows =
    dayRows.length > 0
      ? dayRows
          .map(
            (kh, i) => `<tr>
        <td>${i + 1}</td>
        <td style="font-weight:800;color:${kh.hareketTipi === 'GİRİŞ' ? '#059669' : '#e11d48'}">${escapeHtml(kh.hareketTipi)}</td>
        <td>${escapeHtml(String(kh.aciklama || '—'))}</td>
        <td style="text-align:right;font-weight:700;font-family:monospace">${formatMoney(Number(kh.tutar) || 0)}</td>
      </tr>`
          )
          .join('')
      : `<tr><td colspan="4" style="color:#64748b;padding:12px">Bu gün için kasa hareketi yok.</td></tr>`;

  return `
  <section style="margin-top:28px;page-break-inside:avoid">
    <h2 style="font-size:16px;margin:0 0 8px;color:#0f172a">Kasa Giriş / Çıkış — ${escapeHtml(formatDateLabelTr(dateKey))}</h2>
    <div class="ozet" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="min-width:100px;flex:1;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;text-align:center">
        <strong style="display:block;font-size:18px;color:#059669">${formatMoney(giris)}</strong>
        <span style="font-size:10px;font-weight:700;color:#047857">TOPLAM GİREN</span>
      </div>
      <div style="min-width:100px;flex:1;background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:12px;text-align:center">
        <strong style="display:block;font-size:18px;color:#e11d48">${formatMoney(cikis)}</strong>
        <span style="font-size:10px;font-weight:700;color:#be123c">TOPLAM ÇIKAN</span>
      </div>
      <div style="min-width:100px;flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center">
        <strong style="display:block;font-size:18px;color:#0f172a">${formatMoney(net)}</strong>
        <span style="font-size:10px;font-weight:700;color:#475569">GÜNLÜK NET</span>
      </div>
      <div style="min-width:100px;flex:1;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px;text-align:center">
        <strong style="display:block;font-size:18px;color:#c2410c">${dayRows.length}</strong>
        <span style="font-size:10px;font-weight:700;color:#9a3412">KAYIT ADEDİ</span>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;width:32px">#</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;width:70px">Tip</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1">Açıklama</th>
          <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:right;width:110px">Tutar (₺)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#fff7ed;font-weight:800">
          <td colspan="3" style="padding:10px;border-top:2px solid #fdba74;text-align:right">GÜNLÜK TOPLAM</td>
          <td style="padding:10px;border-top:2px solid #fdba74;text-align:right;font-family:monospace">
            +${formatMoney(giris)} / −${formatMoney(cikis)} · Net ${formatMoney(net)}
          </td>
        </tr>
      </tfoot>
    </table>
  </section>`;
}

/** Bugünkü yoklama listesi + aynı günün kasa giriş/çıkışları — yazdırılabilir HTML */
export function buildGunlukYoklamaKasaRaporHtml(opts: {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  kasaHareketleri: KasaHareketi[];
  dateKey?: string;
}): string {
  const dateKey = opts.dateKey || todayDateKey();
  const [y, m, d] = dateKey.split('-').map(Number);
  const yokRows = buildGunlukYoklamaSatirlari(opts.personeller, opts.yoklamalar, y, m, d);
  const yokOzet = buildGunlukYoklamaOzet(yokRows);
  const yokHtml = buildGunlukYoklamaRaporHtml(yokRows, yokOzet, y, m, d);
  const kasaBlock = renderKasaSection(opts.kasaHareketleri, dateKey);

  return yokHtml.replace(
    '</body></html>',
    `${kasaBlock}
  <p class="meta" style="margin-top:28px">Bu rapor seçili günün yoklama listesi ile kasa giriş/çıkış özetini birlikte sunar.</p>
  </body></html>`
  );
}

export function openGunlukYoklamaKasaRaporHtml(html: string, title: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcıda yeni pencere açılmasına izin verin.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
}
