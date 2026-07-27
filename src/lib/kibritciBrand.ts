/** Kibritçi UI logosu — saydam PNG (koyu/açık arka planda kutu yok) */
export const KIBRITCI_LOGO_PATH = '/kibritci-logo.png';
/** Rapor üst logosu — beyaz zeminli antet kırpımı (yazdırma) */
export const KIBRITCI_REPORT_HEADER_PATH = '/kibritci-report-header.png';
export const KIBRITCI_WATERMARK_PATH = '/kibritci-report-watermark.png';

/** Resmi antet — şirket künyesi (kibritci-antetli.png'den) */
export const KIBRITCI_COMPANY = {
  legalName: 'KİBRİTÇİ İNŞAAT TAAHHÜT TURİZM SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
  shortName: 'KİBRİTÇİ İNŞAAT',
  address: 'Rüzgarlıbahçe Mah. Cumhuriyet Cad. Gülsan Plaza No: 22/1 Kat: 3 Kavacık - Beykoz / İstanbul',
  phone: '+90 212 213 77 61 - 66 - 68',
  email: 'info@kibritciinsaat.com.tr',
  web: 'kibritciinsaat.com.tr',
};

function absUrl(path: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export function getKibritciLogoUrl(): string {
  return absUrl(KIBRITCI_LOGO_PATH);
}

export function getKibritciReportHeaderUrl(): string {
  return absUrl(KIBRITCI_REPORT_HEADER_PATH);
}

export function getKibritciWatermarkUrl(): string {
  return absUrl(KIBRITCI_WATERMARK_PATH);
}

/** Excel / canvas raporları için PNG data URL */
export async function loadKibritciLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(getKibritciLogoUrl());
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function kibritciLogoHtml(heightPx = 56): string {
  const url = getKibritciLogoUrl();
  return `<img src="${url}" alt="Kibritçi İnşaat" class="kibritci-logo" style="height:${heightPx}px;width:auto;max-width:220px;object-fit:contain;background:transparent;border:none;display:block;" />`;
}

export function kibritciReportHeaderHtml(title: string, subtitle?: string): string {
  const headerUrl = getKibritciReportHeaderUrl();
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:3px solid #1e4e78;padding-bottom:14px;margin-bottom:6px;background:transparent;">
      <div style="display:flex;flex-direction:column;gap:6px;">
        <img src="${headerUrl}" alt="${KIBRITCI_COMPANY.shortName}" class="kibritci-logo" style="height:56px;width:auto;max-width:320px;object-fit:contain;background:transparent;border:none;display:block;" />
        <div style="font-size:10px;font-weight:700;color:#1e4e78;letter-spacing:.2px;">${KIBRITCI_COMPANY.legalName}</div>
      </div>
      <div style="text-align:right;min-width:220px;">
        <div style="font-size:17px;font-weight:800;color:#1e4e78;">${title}</div>
        ${subtitle ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">${subtitle}</div>` : ''}
        <div style="font-size:10px;color:#64748b;margin-top:8px;line-height:1.5;">
          ${KIBRITCI_COMPANY.address}<br/>
          T: ${KIBRITCI_COMPANY.phone}<br/>
          ${KIBRITCI_COMPANY.email} · ${KIBRITCI_COMPANY.web}
        </div>
      </div>
    </div>`;
}
