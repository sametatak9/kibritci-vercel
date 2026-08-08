/** Raporları kullanıcının kendi mail istemcisi / web sağlayıcısı ile gönderme */

export type ReportMailProvider = 'default' | 'gmail' | 'outlook';

export interface ReportEmailPayload {
  subject: string;
  body?: string;
  /** HTML rapor — indirilip eke eklenebilir */
  html?: string;
  fileName?: string;
  defaultTo?: string;
  /** Alıcının tarayıcıda açıp indirebileceği kalıcı bağlantı */
  downloadUrl?: string;
}

const MAX_MAILTO_BODY = 12000;

export function htmlToPlainText(html: string): string {
  if (typeof document === 'undefined') {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.innerText || el.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildReportMailBody(options: {
  subject: string;
  body?: string;
  html?: string;
  downloadUrl?: string;
}): string {
  const stubRe = /ekte\s+HTML|indirilebilir|HTML olarak/i;
  const bodyTrim = (options.body || '').trim();
  const fromHtml = options.html ? htmlToPlainText(options.html) : '';

  // Kısa «ek indirin» metni yerine HTML rapordan düz metin dökümü kullan
  let base = bodyTrim;
  if (fromHtml) {
    if (!base || stubRe.test(base) || base.length < 280) {
      const introLine = bodyTrim && !stubRe.test(bodyTrim) ? `${bodyTrim}\n\n` : '';
      base = `${introLine}${fromHtml}`;
    } else if (!base.includes(fromHtml.slice(0, 80))) {
      base = `${base}\n\n—— Rapor dökümü ——\n${fromHtml}`;
    }
  }

  const intro = `Sayın Seçkin Yetkili,

Kibritçi İnşaat ERP üzerinden hazırlanan rapor bilginize sunulmuştur.

Konu: ${options.subject}

`;
  const linkBlock = options.downloadUrl
    ? `

Evrakı görüntülemek / indirmek için bağlantı:
${options.downloadUrl}
`
    : '';
  const outro = `

---
Bu mesaj Kibritçi ERP rapor gönderimi ile açılmıştır.${
    options.html && !options.downloadUrl
      ? ' İsterseniz «HTML İndir» ile görsel ekli tam raporu da ekleyebilirsiniz.'
      : ''
  }
`;
  const combined = `${intro}${base}${linkBlock}${outro}`;
  return combined.length > MAX_MAILTO_BODY
    ? `${combined.slice(0, MAX_MAILTO_BODY)}\n\n… (rapor uzun olduğu için kısaltıldı; tam metin için HTML İndir kullanın)`
    : combined;
}

export function buildMailComposeUrl(
  provider: ReportMailProvider,
  to: string,
  subject: string,
  body: string
): string {
  const toClean = to
    .split(/[;,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
  const encSubject = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);

  if (provider === 'gmail') {
    const params = new URLSearchParams({ view: 'cm', fs: '1', su: subject, body });
    if (toClean) params.set('to', toClean);
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  if (provider === 'outlook') {
    const params = new URLSearchParams({ subject, body });
    if (toClean) params.set('to', toClean);
    return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
  }

  return `mailto:${encodeURIComponent(toClean).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encSubject}&body=${encBody}`;
}

export function openMailCompose(
  provider: ReportMailProvider,
  to: string,
  subject: string,
  body: string
): void {
  const url = buildMailComposeUrl(provider, to, subject, body);
  const win = window.open(url, '_blank');
  if (!win && provider === 'default') {
    window.location.href = url;
  }
}

export function downloadReportHtmlFile(html: string, fileName: string): void {
  const safe = (fileName || 'Kibritci_Rapor').replace(/[^\w.\-ğüşıöçĞÜŞİÖÇ ]+/gi, '_');
  const name = safe.endsWith('.html') ? safe : `${safe}.html`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rapor pencerelerine enjekte edilen no-print araç çubuğu HTML'i */
export function getReportEmailToolbarHtml(options?: {
  subject?: string;
  fileName?: string;
}): string {
  const subject = (options?.subject || 'Kibritçi Rapor').replace(/"/g, '&quot;');
  const fileName = (options?.fileName || 'Kibritci_Rapor.html').replace(/"/g, '&quot;');
  return `
<div id="kibritci-report-email-bar" class="kibritci-no-print" style="position:sticky;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;padding:10px 14px;margin:-8px -8px 16px;background:#0f172a;color:#fff;font-family:system-ui,sans-serif;font-size:12px;border-radius:10px">
  <span style="margin-right:auto;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.85">Rapor</span>
  <button type="button" onclick="window.print()" style="cursor:pointer;background:#334155;color:#fff;border:0;border-radius:8px;padding:8px 12px;font-weight:700">Yazdır / PDF</button>
  <button type="button" onclick="window.__kibritciEmailFromReportWindow && window.__kibritciEmailFromReportWindow()" style="cursor:pointer;background:#10b981;color:#fff;border:0;border-radius:8px;padding:8px 12px;font-weight:700">E-posta ile Gönder</button>
  <button type="button" onclick="window.__kibritciDownloadFromReportWindow && window.__kibritciDownloadFromReportWindow()" style="cursor:pointer;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:8px;padding:8px 12px;font-weight:700">HTML İndir</button>
</div>
<style>@media print{.kibritci-no-print,#kibritci-report-email-bar{display:none!important}}</style>
<script>
(function(){
  var SUBJECT = ${JSON.stringify(subject)};
  var FILENAME = ${JSON.stringify(fileName)};
  function plainFromDoc(){
    var bar = document.getElementById('kibritci-report-email-bar');
    if (bar) bar.style.display = 'none';
    var t = (document.body && (document.body.innerText || document.body.textContent)) || '';
    if (bar) bar.style.display = '';
    return (t || '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 3500);
  }
  function fullHtml(){
    return '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
  }
  window.__kibritciDownloadFromReportWindow = function(){
    try {
      var blob = new Blob([fullHtml()], {type:'text/html;charset=utf-8'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = FILENAME; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('İndirme başarısız'); }
  };
  window.__kibritciEmailFromReportWindow = function(){
    var payload = { subject: SUBJECT, body: plainFromDoc(), html: fullHtml(), fileName: FILENAME };
    try {
      if (window.opener && typeof window.opener.__kibritciOpenReportEmail === 'function') {
        window.opener.__kibritciOpenReportEmail(payload);
        return;
      }
    } catch (e) {}
    if (typeof window.__kibritciOpenReportEmail === 'function') {
      window.__kibritciOpenReportEmail(payload);
      return;
    }
    var to = prompt('Alıcı e-posta (boş bırakılabilir):', '') || '';
    var body = encodeURIComponent('Sayın Yetkili,\\n\\n' + (payload.body || '') + '\\n\\n---\\nKibritçi ERP');
    window.open('mailto:' + encodeURIComponent(to).replace(/%40/g,'@') + '?subject=' + encodeURIComponent(SUBJECT) + '&body=' + body, '_blank');
  };
})();
</script>`;
}

function ensureComposerStyles(): void {
  if (document.getElementById('kibritci-report-email-css')) return;
  const style = document.createElement('style');
  style.id = 'kibritci-report-email-css';
  style.textContent = `
    #kibritci-report-email-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif}
    #kibritci-report-email-card{width:100%;max-width:480px;background:#fff;border-radius:20px;box-shadow:0 25px 50px rgba(0,0,0,.25);overflow:hidden}
    #kibritci-report-email-card header{padding:14px 18px;background:#0f172a;color:#fff;font-size:13px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
    #kibritci-report-email-card .body{padding:16px 18px;display:flex;flex-direction:column;gap:10px}
    #kibritci-report-email-card label{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
    #kibritci-report-email-card input,#kibritci-report-email-card textarea{width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:12px;font-weight:600;color:#0f172a;background:#f8fafc}
    #kibritci-report-email-card textarea{min-height:220px;resize:vertical;font-weight:500;line-height:1.45;font-family:ui-monospace,Consolas,monospace;font-size:11px}
    #kibritci-report-email-card .hint{font-size:10px;color:#64748b;line-height:1.4}
    #kibritci-report-email-card .actions{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 16px}
    #kibritci-report-email-card .actions button{border:0;border-radius:10px;padding:9px 12px;font-size:11px;font-weight:800;cursor:pointer}
    #kibritci-report-email-card .btn-default{background:#10b981;color:#fff}
    #kibritci-report-email-card .btn-gmail{background:#ea4335;color:#fff}
    #kibritci-report-email-card .btn-outlook{background:#0078d4;color:#fff}
    #kibritci-report-email-card .btn-dl{background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0!important}
    #kibritci-report-email-card .btn-close{background:transparent;color:#94a3b8;font-size:16px;padding:0 4px}
  `;
  document.head.appendChild(style);
}

/** Her yerden açılabilen e-posta gönderim diyaloğu */
export function openReportEmailComposer(payload: ReportEmailPayload): void {
  if (typeof document === 'undefined') return;
  ensureComposerStyles();
  document.getElementById('kibritci-report-email-overlay')?.remove();

  const subject0 = payload.subject || 'Kibritçi Rapor';
  const body0 = buildReportMailBody({
    subject: subject0,
    body: payload.body,
    html: payload.html,
    downloadUrl: payload.downloadUrl,
  });
  const fileName = payload.fileName || `Kibritci_Rapor_${Date.now()}.html`;
  const downloadUrlHint = payload.downloadUrl
    ? `Mesajda indirme bağlantısı yer alır: ${payload.downloadUrl}`
    : 'HTML raporu eklemek için önce indirip mailinize ekleyebilirsiniz.';

  const overlay = document.createElement('div');
  overlay.id = 'kibritci-report-email-overlay';
  overlay.innerHTML = `
    <div id="kibritci-report-email-card" role="dialog" aria-modal="true" aria-label="Raporu e-posta ile gönder">
      <header>
        <span>📧 Raporu E-posta ile Gönder</span>
        <button type="button" class="btn-close" data-act="close" aria-label="Kapat">✕</button>
      </header>
      <div class="body">
        <div>
          <label for="kibritci-mail-to">Alıcılar (birden fazla: virgül veya noktalı virgül)</label>
          <input id="kibritci-mail-to" type="text" autocomplete="email" placeholder="kisi1@firma.com, kisi2@firma.com" value="${(payload.defaultTo || '').replace(/"/g, '&quot;')}" />
        </div>
        <div>
          <label for="kibritci-mail-subject">Konu</label>
          <input id="kibritci-mail-subject" type="text" value="${subject0.replace(/"/g, '&quot;')}" />
        </div>
        <div>
          <label for="kibritci-mail-body">Mesaj</label>
          <textarea id="kibritci-mail-body"></textarea>
        </div>
        <p class="hint">
          Bilgisayarınızdaki varsayılan posta uygulaması, Gmail veya Outlook açılır.
          İstediğiniz kişiye gönderebilirsiniz. ${downloadUrlHint}
        </p>
      </div>
      <div class="actions">
        <button type="button" class="btn-default" data-act="default">Varsayılan Posta</button>
        <button type="button" class="btn-gmail" data-act="gmail">Gmail</button>
        <button type="button" class="btn-outlook" data-act="outlook">Outlook</button>
        ${payload.html ? `<button type="button" class="btn-dl" data-act="download">HTML İndir (Ek)</button>` : ''}
        <button type="button" class="btn-dl" data-act="close" style="margin-left:auto">Kapat</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const bodyEl = overlay.querySelector('#kibritci-mail-body') as HTMLTextAreaElement | null;
  if (bodyEl) bodyEl.value = body0;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = (btn as HTMLElement).dataset.act;
      if (act === 'close') {
        close();
        return;
      }
      if (act === 'download' && payload.html) {
        downloadReportHtmlFile(payload.html, fileName);
        return;
      }
      const to = (overlay.querySelector('#kibritci-mail-to') as HTMLInputElement)?.value || '';
      const subject =
        (overlay.querySelector('#kibritci-mail-subject') as HTMLInputElement)?.value || subject0;
      const body =
        (overlay.querySelector('#kibritci-mail-body') as HTMLTextAreaElement)?.value || body0;
      const provider = act as ReportMailProvider;
      if (provider === 'default' || provider === 'gmail' || provider === 'outlook') {
        // Bağlantı yoksa yerel HTML indirerek eklemeyi kolaylaştır
        if (payload.html && !payload.downloadUrl) {
          downloadReportHtmlFile(payload.html, fileName);
        }
        openMailCompose(provider, to, subject, body);
        close();
      }
    });
  });
}

/** Global köprü — rapor pencerelerinden opener üzerinden çağrılır */
export function installReportEmailGlobalBridge(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __kibritciOpenReportEmail?: typeof openReportEmailComposer }).__kibritciOpenReportEmail =
    openReportEmailComposer;
}

installReportEmailGlobalBridge();

/** HTML raporu yeni pencerede açar (e-posta araç çubuğu + köprü) */
export function openHtmlReportWindow(html: string, title?: string): Window | null {
  installReportEmailGlobalBridge();
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up engellendi. Tarayıcıda pencere izni verin.');
    return null;
  }
  w.document.write(html);
  w.document.close();
  if (title) w.document.title = title;
  return w;
}
