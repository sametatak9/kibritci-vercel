import { Personel } from '../types/erp';
import { KIBRITCI_COMPANY, kibritciLogoHtml } from './kibritciBrand';
import { validateIBAN } from './personelOdemeUtils';
import { openHtmlReportWindow } from './reportEmail';

export type IbanListeSatir = {
  adSoyad: string;
  tcNo: string;
  gorev: string;
  iban: string;
  ibanGecerli: boolean;
  tutar?: number;
};

export function formatIbanDisplay(iban?: string | null): string {
  const raw = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!raw || raw === 'TR') return '';
  return raw.replace(/(.{4})/g, '$1 ').trim();
}

export function buildIbanListeSatirlari(
  personeller: Array<{
    ad?: string;
    soyad?: string;
    tcNo?: string;
    gorev?: string;
    ibanNo?: string;
    iban?: string;
  }>,
  tutarByIndex?: number[]
): IbanListeSatir[] {
  return personeller.map((p, i) => {
    const iban = String(p.ibanNo || (p as { iban?: string }).iban || '')
      .replace(/\s+/g, '')
      .toUpperCase();
    return {
      adSoyad: `${p.ad || ''} ${p.soyad || ''}`.trim() || '—',
      tcNo: String(p.tcNo || '').trim(),
      gorev: String(p.gorev || '').trim() || '—',
      iban,
      ibanGecerli: validateIBAN(iban),
      tutar: tutarByIndex?.[i],
    };
  });
}

export function ibanListePlainText(rows: IbanListeSatir[], opts?: { includeTutar?: boolean }): string {
  const header = opts?.includeTutar
    ? 'Ad Soyad\tTC Kimlik\tGörevi\tIBAN\tTutar'
    : 'Ad Soyad\tTC Kimlik\tGörevi\tIBAN';
  const lines = rows.map((r) => {
    const base = [r.adSoyad, r.tcNo || '—', r.gorev, r.iban || 'YOK'];
    if (opts?.includeTutar) base.push((r.tutar ?? 0).toFixed(2));
    return base.join('\t');
  });
  return [header, ...lines].join('\n');
}

export function copyIbanListe(rows: IbanListeSatir[], opts?: { includeTutar?: boolean }): number {
  const text = ibanListePlainText(rows, opts);
  if (!rows.length) return 0;
  void navigator.clipboard.writeText(text);
  return rows.length;
}

export function openIbanListeHtml(
  rows: IbanListeSatir[],
  opts: { baslik: string; donem?: string; includeTutar?: boolean }
) {
  const tutarCol = opts.includeTutar;
  const toplam = rows.reduce((s, r) => s + (r.tutar || 0), 0);
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${opts.baslik}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 28px 32px; }
          .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 18px; }
          .meta { text-align: right; font-size: 11px; color: #475569; }
          .meta h1 { margin: 0 0 4px; font-size: 16px; color: #1e3a8a; }
          .addr { font-size: 10px; color: #64748b; margin-top: 8px; max-width: 360px; line-height: 1.4; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #1e3a8a; color: #fff; text-align: left; padding: 8px 7px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
          td { border-bottom: 1px solid #e2e8f0; padding: 7px; }
          tr:nth-child(even) td { background: #f8fafc; }
          .mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10px; }
          .miss { color: #b45309; font-weight: 700; }
          .foot { margin-top: 16px; font-size: 11px; color: #334155; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="head">
          <div>
            ${kibritciLogoHtml(52)}
            <p class="addr">${KIBRITCI_COMPANY.legalName}<br/>${KIBRITCI_COMPANY.address}<br/>${KIBRITCI_COMPANY.phone}</p>
          </div>
          <div class="meta">
            <h1>${opts.baslik}</h1>
            <p>${opts.donem || ''}</p>
            <p>Düzenleme: ${new Date().toLocaleString('tr-TR')}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Ad Soyad</th>
              <th>TC Kimlik No</th>
              <th>Görevi</th>
              <th>IBAN</th>
              ${tutarCol ? '<th style="text-align:right">Tutar (TL)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><strong>${r.adSoyad}</strong></td>
                <td class="mono">${r.tcNo || '—'}</td>
                <td>${r.gorev}</td>
                <td class="mono ${r.ibanGecerli ? '' : 'miss'}">${
                  r.ibanGecerli ? formatIbanDisplay(r.iban) : r.iban || 'IBAN YOK'
                }</td>
                ${
                  tutarCol
                    ? `<td style="text-align:right;font-variant-numeric:tabular-nums">${(r.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`
                    : ''
                }
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div class="foot">
          <span>${rows.length} personel · ${rows.filter((r) => r.ibanGecerli).length} geçerli IBAN</span>
          ${
            tutarCol
              ? `<span><strong>Toplam:</strong> ${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>`
              : ''
          }
        </div>
      </body>
    </html>
  `;
  openHtmlReportWindow(html, opts.baslik);
}

export function personelToIbanRow(p: Personel, tutar?: number): IbanListeSatir {
  const iban = String(p.ibanNo || '').replace(/\s+/g, '').toUpperCase();
  return {
    adSoyad: `${p.ad || ''} ${p.soyad || ''}`.trim(),
    tcNo: p.tcNo || '',
    gorev: p.gorev || '—',
    iban,
    ibanGecerli: validateIBAN(iban),
    tutar,
  };
}
