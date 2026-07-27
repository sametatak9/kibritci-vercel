/** Kibritçi logolu analiz / evrak raporu HTML şablonu */
import {
  kibritciLogoHtml,
  kibritciReportHeaderHtml,
  getKibritciWatermarkUrl,
  KIBRITCI_COMPANY,
  type KibritciReportAssets,
} from './kibritciBrand';
import { getReportEmailToolbarHtml, installReportEmailGlobalBridge } from './reportEmail';

export function buildKibritciReportHtml(options: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  meta?: string[];
  assets?: KibritciReportAssets;
}): string {
  const metaRows = (options.meta || [])
    .map((m) => `<p style="margin:0;font-size:11px;color:#64748b">${m}</p>`)
    .join('');

  const emailToolbar = getReportEmailToolbarHtml({
    subject: options.subtitle ? `${options.title} — ${options.subtitle}` : options.title,
    fileName: `${String(options.title).replace(/[^\w.\-ğüşıöçĞÜŞİÖÇ ]+/gi, '_').slice(0, 60) || 'Kibritci_Rapor'}.html`,
  });

  const watermarkUrl = options.assets?.watermarkDataUrl || getKibritciWatermarkUrl();

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${options.title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 32px; color: #0f172a; background: #f1f5f9; }
    .page { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; position: relative; box-shadow: 0 10px 30px rgba(15,23,42,.08); }
    .watermark { position: absolute; inset: 0; background-image: url('${watermarkUrl}'); background-repeat: no-repeat; background-position: center 58%; background-size: 62%; opacity: 0.06; pointer-events: none; z-index: 0; }
    .page > *:not(.watermark) { position: relative; z-index: 1; }
    .head { padding: 24px 28px 0; background: transparent; }
    .meta { padding: 12px 28px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .content { padding: 24px 28px; font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
    .foot { padding: 16px 28px; font-size: 10px; color: #64748b; border-top: 2px solid #1e4e78; text-align: center; line-height: 1.6; }
    .foot .company { font-weight: 700; color: #1e4e78; }
    .kibritci-logo { background: transparent !important; }
    table { background: transparent; }
    @media print { body { padding: 0; background: #fff; } .page { border: none; box-shadow: none; } }
  </style>
</head>
<body>
  ${emailToolbar}
  <div class="page">
    <div class="watermark"></div>
    <div class="head">
      ${kibritciReportHeaderHtml(options.title, options.subtitle, { headerDataUrl: options.assets?.headerDataUrl })}
    </div>
    ${metaRows ? `<div class="meta">${metaRows}</div>` : ''}
    <div class="content">${options.bodyHtml.replace(/\n/g, '<br/>')}</div>
    <div class="foot">
      <div class="company">${KIBRITCI_COMPANY.legalName}</div>
      ${KIBRITCI_COMPANY.address}<br/>
      T: ${KIBRITCI_COMPANY.phone} · ${KIBRITCI_COMPANY.email} · ${KIBRITCI_COMPANY.web}<br/>
      <span style="color:#94a3b8;">Kibritçi ERP · Şantiye Finans Kontrol Sistemi · ${new Date().toLocaleDateString('tr-TR')}</span>
    </div>
  </div>
</body>
</html>`;
}

export function openKibritciReportPrint(html: string, title: string): void {
  installReportEmailGlobalBridge();
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcı izinlerini kontrol edin.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  // Kullanıcı araç çubuğundan yazdırabilir; otomatik print biraz gecikmeli
  setTimeout(() => {
    try {
      w.focus();
    } catch {
      /* ignore */
    }
  }, 200);
}

export function downloadKibritciReportHtml(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export { kibritciLogoHtml, kibritciReportHeaderHtml };
