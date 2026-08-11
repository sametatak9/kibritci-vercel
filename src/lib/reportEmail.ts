/** Raporları kullanıcının kendi mail istemcisi / web sağlayıcısı ile gönderme */

export type ReportMailProvider = 'default' | 'gmail' | 'outlook';

export interface ReportEmailPayload {
  subject: string;
  body?: string;
  /** HTML rapor — indirilip eke eklenebilir */
  html?: string;
  fileName?: string;
  defaultTo?: string;
  /** Alıcının tarayıcıda açıp indirebileceği kalıcı bağlantı (tek link) */
  downloadUrl?: string;
  /** Renkli HTML rapor görüntüleme / indirme bağlantısı */
  htmlDownloadUrl?: string;
  /** Excel tablo indirme bağlantısı */
  excelDownloadUrl?: string;
  /** HTML raporu düz metin gövdeye dökme (kasa raporu gibi ek dosyalı gönderimler) */
  expandHtmlInBody?: boolean;
  /** Excel dosya adı — diyalogda gösterilir */
  excelFileName?: string;
  /** Excel indirme (e-posta gönderiminde otomatik çağrılır) */
  downloadExcel?: () => void | Promise<void>;
}

const MAX_MAILTO_BODY = 12000;

export function htmlToPlainText(html: string): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  if (typeof document === 'undefined') {
    return stripped
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const el = document.createElement('div');
  el.innerHTML = stripped;
  return (el.innerText || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildReportMailBody(options: {
  subject: string;
  body?: string;
  html?: string;
  downloadUrl?: string;
  htmlDownloadUrl?: string;
  excelDownloadUrl?: string;
  expandHtmlInBody?: boolean;
  hasExcelAttachment?: boolean;
}): string {
  const stubRe = /ekte\s+HTML|indirilebilir|HTML olarak/i;
  const bodyTrim = (options.body || '').trim();
  const fromHtml = options.html ? htmlToPlainText(options.html) : '';
  const expandHtml = options.expandHtmlInBody !== false;

  // Kısa «ek indirin» metni yerine HTML rapordan düz metin dökümü kullan
  let base = bodyTrim;
  if (fromHtml && expandHtml) {
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
  const linkLines: string[] = [];
  const htmlLink = options.htmlDownloadUrl || options.downloadUrl;
  if (htmlLink) {
    linkLines.push(`HTML Rapor (renkli tablo + fiş görselleri): ${htmlLink}`);
  }
  if (options.excelDownloadUrl) {
    linkLines.push(`Excel Tablo (özet + kalem kalem + evrak): ${options.excelDownloadUrl}`);
  }
  const linkBlock =
    linkLines.length > 0
      ? `

── İNDİRME BAĞLANTILARI ──
${linkLines.join('\n')}
`
      : '';
  const attachmentNote =
    options.html || options.hasExcelAttachment
      ? `

Ek dosyalar (otomatik indirilir — lütfen e-postanıza ekleyin):
${options.html ? '• HTML rapor — antetli, tablo ve fiş görselleri' : ''}
${options.hasExcelAttachment ? '• Excel tablo — özet, kalem kalem ve evrak sayfası' : ''}
`
      : '';
  const outro = `

---
Bu mesaj Kibritçi ERP rapor gönderimi ile açılmıştır.${
    options.html && !options.downloadUrl && expandHtml
      ? ' İsterseniz «HTML İndir» ile görsel ekli tam raporu da ekleyebilirsiniz.'
      : ''
  }${attachmentNote}`;
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
  /** Açık turuncu Kibritçi tema (varsayılan) */
  variant?: 'light' | 'dark';
}): string {
  const subject = (options?.subject || 'Kibritçi Rapor').replace(/"/g, '&quot;');
  const fileName = (options?.fileName || 'Kibritci_Rapor.html').replace(/"/g, '&quot;');
  const light = (options?.variant || 'light') === 'light';
  const barBg = light ? '#FFF7ED' : '#0f172a';
  const barText = light ? '#9A3412' : '#fff';
  const barBorder = light ? '#FDBA74' : 'transparent';
  const btnPrint = light ? '#EA580C' : '#334155';
  const btnEmail = light ? '#047857' : '#10b981';
  const btnDlBg = light ? '#FFFBF7' : '#1e293b';
  const btnDlText = light ? '#9A3412' : '#fff';
  const btnDlBorder = light ? '#FDBA74' : '#475569';

  return `
<div id="kibritci-report-email-bar" class="kibritci-no-print" style="position:sticky;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;padding:10px 14px;margin:-8px -8px 16px;background:${barBg};color:${barText};font-family:system-ui,sans-serif;font-size:12px;border-radius:10px;border:1px solid ${barBorder};box-shadow:0 2px 10px rgba(234,88,12,.08)">
  <span style="margin-right:auto;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.9">Rapor</span>
  <button type="button" onclick="window.print()" style="cursor:pointer;background:${btnPrint};color:#fff;border:0;border-radius:8px;padding:8px 12px;font-weight:700">Yazdır / PDF</button>
  <button type="button" onclick="window.__kibritciEmailFromReportWindow && window.__kibritciEmailFromReportWindow()" style="cursor:pointer;background:${btnEmail};color:#fff;border:0;border-radius:8px;padding:8px 12px;font-weight:700">E-posta ile Gönder</button>
  <button type="button" onclick="window.__kibritciDownloadFromReportWindow && window.__kibritciDownloadFromReportWindow()" style="cursor:pointer;background:${btnDlBg};color:${btnDlText};border:1px solid ${btnDlBorder};border-radius:8px;padding:8px 12px;font-weight:700">HTML İndir</button>
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
  function openEmailComposer(payload){
    if (typeof window.__kibritciOpenReportEmail === 'function') {
      window.__kibritciOpenReportEmail(payload);
      return true;
    }
    try {
      if (window.opener && typeof window.opener.__kibritciOpenReportEmail === 'function') {
        window.opener.__kibritciOpenReportEmail(payload);
        return true;
      }
    } catch (e) {}
    return false;
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
    var payload = { subject: SUBJECT, body: plainFromDoc(), html: fullHtml(), fileName: FILENAME, expandHtmlInBody: false };
    if (openEmailComposer(payload)) return;
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
    #kibritci-report-email-card header{padding:14px 18px;background:#FFF7ED;color:#9A3412;border-bottom:1px solid #FDBA74;font-size:13px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
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
    htmlDownloadUrl: payload.htmlDownloadUrl,
    excelDownloadUrl: payload.excelDownloadUrl,
    expandHtmlInBody: payload.expandHtmlInBody,
    hasExcelAttachment: Boolean(payload.downloadExcel || payload.excelDownloadUrl),
  });
  const fileName = payload.fileName || `Kibritci_Rapor_${Date.now()}.html`;
  const excelName = payload.excelFileName || '';
  const hasHostedLinks = Boolean(payload.htmlDownloadUrl || payload.excelDownloadUrl || payload.downloadUrl);
  const hasDualAttach = Boolean(payload.html && payload.downloadExcel);
  const downloadUrlHint = hasHostedLinks
    ? 'Mesajda HTML ve Excel indirme bağlantıları yer alır. Alıcılar linke tıklayarak renkli raporu görüntüleyebilir.'
    : hasDualAttach
      ? '«Gönder»e basınca HTML ve Excel dosyaları otomatik indirilir — her ikisini de e-postanıza ek dosya olarak ekleyin.'
      : payload.html
        ? 'HTML raporu eklemek için «Gönder»e basınca otomatik indirilir; mailinize ek dosya olarak ekleyin.'
        : payload.downloadExcel
          ? 'Excel dosyası «Gönder»e basınca otomatik indirilir; mailinize ek dosya olarak ekleyin.'
          : '';

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
          Varsayılan posta, Gmail veya Outlook açılır. Mesaj gövdesi özet bilgi içerir; tam rapor ek dosyalarda sunulur.
          ${downloadUrlHint}
          ${excelName ? `<br><span style="font-family:ui-monospace,monospace;font-size:10px;color:#475569">Excel: ${excelName.replace(/</g, '&lt;')}</span>` : ''}
        </p>
      </div>
      <div class="actions">
        <button type="button" class="btn-default" data-act="default">Varsayılan Posta</button>
        <button type="button" class="btn-gmail" data-act="gmail">Gmail</button>
        <button type="button" class="btn-outlook" data-act="outlook">Outlook</button>
        ${payload.html ? `<button type="button" class="btn-dl" data-act="download">HTML İndir (Ek)</button>` : ''}
        ${payload.downloadExcel ? `<button type="button" class="btn-dl" data-act="download-excel">Excel İndir (Ek)</button>` : ''}
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
      if (act === 'download-excel' && payload.downloadExcel) {
        void Promise.resolve(payload.downloadExcel()).catch(() => {
          alert('Excel indirilemedi. Tekrar deneyin veya Haftalık Kasa Excel butonunu kullanın.');
        });
        return;
      }
      const to = (overlay.querySelector('#kibritci-mail-to') as HTMLInputElement)?.value || '';
      const subject =
        (overlay.querySelector('#kibritci-mail-subject') as HTMLInputElement)?.value || subject0;
      const body =
        (overlay.querySelector('#kibritci-mail-body') as HTMLTextAreaElement)?.value || body0;
      const provider = act as ReportMailProvider;
      if (provider === 'default' || provider === 'gmail' || provider === 'outlook') {
        void (async () => {
          try {
            if (payload.downloadExcel) {
              await Promise.resolve(payload.downloadExcel!());
            }
            if (payload.html && !payload.downloadUrl && !payload.htmlDownloadUrl) {
              downloadReportHtmlFile(payload.html!, fileName);
            }
          } catch {
            alert('Ek dosyalar indirilemedi. «HTML İndir» / «Excel İndir» ile tekrar deneyin.');
          }
          openMailCompose(provider, to, subject, body);
          if (
            ((payload.html && !payload.downloadUrl && !payload.htmlDownloadUrl) || payload.downloadExcel) &&
            !hasHostedLinks
          ) {
            setTimeout(() => {
              const parts: string[] = [];
              if (payload.html && !payload.downloadUrl && !payload.htmlDownloadUrl) {
                parts.push('HTML rapor (.html)');
              }
              if (payload.downloadExcel) {
                parts.push('Excel tablo (.xlsx)');
              }
              alert(
                `${parts.join(' ve ')} indirildi.\n\nPosta penceresinde indirilen dosyaları ek (attachment) olarak ekleyin — alıcı tam raporu HTML ve Excel formatında görür.`
              );
            }, 400);
          } else if (hasHostedLinks) {
            setTimeout(() => {
              alert(
                'E-posta mesajında HTML ve Excel indirme bağlantıları yer alır.\n\nAlıcılar linke tıklayarak renkli HTML raporu ve Excel tabloyu indirebilir. İsterseniz indirilen dosyaları da ek olarak ekleyebilirsiniz.'
              );
            }, 400);
          }
          close();
        })();
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
  const bridge = openReportEmailComposer;
  try {
    (w as Window & { __kibritciOpenReportEmail?: typeof openReportEmailComposer }).__kibritciOpenReportEmail =
      bridge;
  } catch {
    /* no-op */
  }
  w.document.write(html);
  w.document.close();
  if (title) w.document.title = title;
  try {
    (w as Window & { __kibritciOpenReportEmail?: typeof openReportEmailComposer }).__kibritciOpenReportEmail =
      bridge;
  } catch {
    /* no-op */
  }
  return w;
}
