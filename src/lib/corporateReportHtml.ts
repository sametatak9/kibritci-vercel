import {
  KIBRITCI_REPORT_HEADER_DATA_URL,
  KIBRITCI_REPORT_WATERMARK_DATA_URL,
} from './reportBrandAssets';
import { getReportEmailToolbarHtml } from './reportEmail';

export const CORPORATE_COMPANY = {
  legalName: 'KİBRİTÇİ İNŞAAT TAAHHÜT TURİZM SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
  address: 'Rüzgarlıbahçe Mah. Cumhuriyet Cad. Gülsan Plaza No: 22 /1 Kat: 3 Kavacık - Beykoz / İstanbul',
  phone: 'T: +90 212 213 77 61 - 66 - 68',
  email: 'info@kibritciinsaat.com.tr',
  website: 'kibritciinsaat.com.tr',
};

export function getCorporateReportCss(): string {
  return `
    .corporate-report{position:relative;display:flex;flex-direction:column;min-height:190mm;background:#fff;color:#1e293b;font-family:Inter,ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .corporate-report--portrait{min-height:277mm}
    .corporate-report--landscape{min-height:190mm}
    .corporate-report-watermark-img{position:absolute;right:1.5%;top:50%;transform:translateY(-50%);width:420px;max-width:52%;height:auto;opacity:1;pointer-events:none;z-index:0}
    .corporate-report-logo-img{height:75px;width:auto;max-width:220px;display:block;object-fit:cover;object-position:left center;}
    .corporate-report-header{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;margin-bottom:16px;flex-shrink:0}
    .corporate-report-meta{text-align:right}
    .corporate-report-doc-code{display:block;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid #334155;padding:3px 9px;background:#f8fafc;margin-bottom:3px}
    .corporate-report-date{display:block;font-size:8px;color:#64748b;font-family:JetBrains Mono,ui-monospace,monospace}
    .corporate-report-body{position:relative;z-index:1;flex:1 1 auto}
    .corporate-report-footer{position:relative;z-index:2;margin-top:auto;padding-top:18px;padding-bottom:2px;flex-shrink:0}
    .corporate-report-footer-line{height:1px;background:linear-gradient(to right,transparent,#cbd5e1 15%,#cbd5e1 85%,transparent);margin-bottom:6px}
    .corporate-report-footer-grid{display:grid;grid-template-columns:1fr auto auto;gap:8px 12px;align-items:end;font-size:6px;line-height:1.35;color:#64748b}
    .corporate-report-footer-legal{font-weight:700;font-size:5.5px;letter-spacing:.03em;color:#475569;text-transform:uppercase;margin:0 0 2px}
    .corporate-report-footer-address{font-size:5.5px;color:#94a3b8;margin:0}
    .corporate-report-footer-contact{border-left:1px solid #e2e8f0;padding-left:10px;white-space:nowrap;font-size:5.5px}
    .corporate-report-footer-contact p{margin:0}
    .corporate-report-footer-web{text-align:right;font-weight:600;font-size:5.5px;color:#64748b;align-self:end}
    .corporate-report-footer-web p{margin:0}
    .corporate-antet-page{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:top center;z-index:0;pointer-events:none;opacity:.32;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .corporate-report--letterhead{background:#fff}
    .corporate-report--letterhead .corporate-report-watermark-img{opacity:.14}
    .corporate-report--letterhead .corporate-report-header{min-height:28mm;padding-top:4px;margin-bottom:8px}
    .corporate-report--letterhead .corporate-report-logo-img{height:82px;max-width:260px;object-fit:contain;object-position:left center;background:rgba(255,255,255,.92);padding:4px 10px 4px 0;position:relative;z-index:3}
    @media print{.corporate-report--portrait{min-height:270mm}.corporate-report-footer{margin-top:auto}.corporate-report-watermark-img{opacity:.14;-webkit-print-color-adjust:exact;print-color-adjust:exact}.corporate-report-logo-img{-webkit-print-color-adjust:exact;print-color-adjust:exact}.corporate-antet-page{opacity:.32!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;
}

export function wrapCorporateReportHtml(
  bodyContent: string,
  options?: {
    docCode?: string;
    orientation?: 'portrait' | 'landscape';
    title?: string;
    extraCss?: string;
    autoPrint?: boolean;
    /** Resmi antetli kağıt görseli (logo + künye) */
    letterhead?: boolean;
  }
): string {
  const watermarkUrl = KIBRITCI_REPORT_WATERMARK_DATA_URL;
  const printDate = new Date().toLocaleDateString('tr-TR');
  const docCode = options?.docCode ?? '';
  const orientation = options?.orientation ?? 'landscape';
  const title = options?.title ?? 'Kibritçi Rapor';
  const extraCss = options?.extraCss ?? '';
  const autoPrint = options?.autoPrint !== false;
  const letterhead = Boolean(options?.letterhead);
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const antetUrl = letterhead ? `${origin}/kibritci-antetli.png` : '';
  const logoUrl = KIBRITCI_REPORT_HEADER_DATA_URL || `${origin}/kibritci-logo.png`;

  const emailToolbar = getReportEmailToolbarHtml({
    subject: title,
    fileName: `${String(title).replace(/[^\w.\-ğüşıöçĞÜŞİÖÇ ]+/gi, '_').slice(0, 60) || 'Kibritci_Rapor'}.html`,
  });

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${getCorporateReportCss()}${extraCss}</style>
</head>
<body class="bg-white text-slate-900 font-sans p-4 sm:p-8">
  ${emailToolbar}
  <div class="corporate-report corporate-report--${orientation}${letterhead ? ' corporate-report--letterhead' : ''}" data-orientation="${orientation}" style="position:relative;background:#fff">
    ${letterhead && antetUrl ? `<img src="${antetUrl}" alt="" class="corporate-antet-page" aria-hidden="true" />` : ''}
    <img src="${watermarkUrl}" alt="" class="corporate-report-watermark-img" aria-hidden="true" />
    <header class="corporate-report-header">
      <img src="${logoUrl}" alt="Kibritçi İnşaat" class="corporate-report-logo-img" />
      ${docCode ? `<div class="corporate-report-meta"><span class="corporate-report-doc-code">${docCode}</span><span class="corporate-report-date">Baskı: ${printDate}</span></div>` : ''}
    </header>
    <main class="corporate-report-body">${bodyContent}</main>
    <footer class="corporate-report-footer">
      <div class="corporate-report-footer-line"></div>
      <div class="corporate-report-footer-grid">
        <div>
          <p class="corporate-report-footer-legal">${CORPORATE_COMPANY.legalName}</p>
          <p class="corporate-report-footer-address">${CORPORATE_COMPANY.address}</p>
        </div>
        <div class="corporate-report-footer-contact">
          <p>${CORPORATE_COMPANY.phone}</p>
          <p>@: ${CORPORATE_COMPANY.email}</p>
        </div>
        <div class="corporate-report-footer-web"><p>${CORPORATE_COMPANY.website}</p></div>
      </div>
    </footer>
  </div>
  ${autoPrint ? '<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>' : ''}
</body>
</html>`;
}
