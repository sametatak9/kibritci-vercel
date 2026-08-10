import type { KasaHareketi } from '../types/erp';
import { buildKibritciReportHtml } from './kibritciReportTemplate';
import type { KibritciReportAssets } from './kibritciBrand';

/** Haftalık Kasa raporları — Excel ve HTML karışmasın diye ayrı format etiketleri */
export const KASA_REPORT_FORMAT = {
  excel: {
    badge: 'EXCEL RAPORU — Haftalık Kasa (3 sayfa: özet · kalem · fiş foto)',
    filePrefix: 'Kibritci_Haftalik_Kasa_EXCEL',
    accentLabel: 'Excel',
  },
  html: {
    badge: 'HTML RAPORU — Yazdır / PDF / e-posta (Excel için «Kasa Excel» butonu)',
    filePrefix: 'Kibritci_Haftalik_Kasa_HTML',
    accentLabel: 'HTML',
  },
  soforHtml: {
    badge: 'HTML RAPORU — Şoför masraf ayrımı (genel kasa HTML’inden ayrı)',
    filePrefix: 'Kibritci_Sofor_Masraf_HTML',
    accentLabel: 'Şoför HTML',
  },
} as const;

/** Açık turuncu / krem — ana sayfa ve Kibritçi antet uyumu */
export const KASA_LIGHT = {
  pageBg: '#FFFBF7',
  cardBg: '#FFFFFF',
  headerBg: '#FFF7ED',
  headerBorder: '#FDBA74',
  accent: '#EA580C',
  accentDark: '#9A3412',
  accentSoft: '#FFEDD5',
  text: '#0F172A',
  muted: '#64748B',
  border: '#FED7AA',
  tableHeadBg: '#FFEDD5',
  tableHeadText: '#9A3412',
  groupHeadBg: '#FFF7ED',
  groupHeadText: '#C2410C',
  labelBg: '#FFFBF7',
  labelBorder: '#FED7AA',
  infoBg: '#FFF7ED',
  infoBorder: '#FDBA74',
  infoText: '#9A3412',
  footerBorder: '#FDBA74',
} as const;

/** Excel ARGB (FF + hex) */
export const KASA_EXCEL_ARGB = {
  pageBg: 'FFFFFBF7',
  headerBg: 'FFFFF7ED',
  accentBar: 'FFFDBA74',
  accentText: 'FF9A3412',
  tableHeadBg: 'FFFFEDD5',
  tableHeadText: 'FF9A3412',
  groupHeadBg: 'FFFFF7ED',
  groupHeadText: 'FFC2410C',
  labelBg: 'FFFFFBF7',
  badgeBg: 'FFFFEDD5',
  badgeText: 'FF9A3412',
  border: 'FFFED7AA',
  muted: 'FF64748B',
  amountOut: 'FFB91C1C',
  amountIn: 'FF047857',
} as const;

/** Fiş hangi kasa kaydına ait — Excel ve HTML’de aynı etiket */
export function buildFisKayitEtiketi(
  kh: Pick<KasaHareketi, 'tarih' | 'fisNo' | 'tutar' | 'aciklama'>,
  unvanLabel: string,
  sira: number
): string {
  const fisNo = kh.fisNo ? `Fiş No: ${kh.fisNo}` : 'Fiş No: —';
  const tutar = `${(Number(kh.tutar) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
  const aciklama = String(kh.aciklama || '').trim() || '—';
  return `#${sira} · ${kh.tarih} · ${unvanLabel} · ${fisNo} · ${tutar} · ${aciklama}`;
}

export function kasaHtmlInfoBox(lines: string[]): string {
  const body = lines.map((l) => `<p style="margin:3px 0">${l}</p>`).join('');
  return `<div style="margin:12px 0;padding:12px 14px;background:${KASA_LIGHT.infoBg};border:1px solid ${KASA_LIGHT.infoBorder};border-radius:10px;font-size:11px;color:${KASA_LIGHT.infoText};line-height:1.5">${body}</div>`;
}

export function kasaHtmlSectionTitle(text: string): string {
  return `<h3 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${KASA_LIGHT.accentDark};margin:18px 0 10px;font-weight:800">${text}</h3>`;
}

export function kasaHtmlTableHeadStyle(): string {
  return `background:${KASA_LIGHT.tableHeadBg};color:${KASA_LIGHT.tableHeadText};font-weight:800`;
}

export function kasaHtmlGroupHeadStyle(): string {
  return `display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:${KASA_LIGHT.groupHeadBg};color:${KASA_LIGHT.groupHeadText};border:1px solid ${KASA_LIGHT.border};border-radius:8px 8px 0 0;font-weight:800`;
}

/** Excel / HTML karışmasın — rapor üstünde format rozeti */
export function kasaHtmlFormatBadge(badge: string): string {
  return `<div style="margin:0 0 14px;padding:8px 12px;background:${KASA_LIGHT.accentSoft};border:1px solid ${KASA_LIGHT.headerBorder};border-radius:8px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${KASA_LIGHT.accentDark};text-align:center">${badge}</div>`;
}

const KASA_LIGHT_REPORT_CSS = `
    body { background: ${KASA_LIGHT.pageBg} !important; }
    .page { background: ${KASA_LIGHT.cardBg} !important; border-color: ${KASA_LIGHT.border} !important; box-shadow: 0 8px 24px rgba(234,88,12,.08) !important; }
    .meta { background: ${KASA_LIGHT.headerBg} !important; border-bottom-color: ${KASA_LIGHT.border} !important; }
    .foot { border-top-color: ${KASA_LIGHT.footerBorder} !important; }
    .foot .company { color: ${KASA_LIGHT.accentDark} !important; }
    .head div[style*="border-bottom"] { border-bottom-color: ${KASA_LIGHT.headerBorder} !important; }
    .head [style*="color:#1e4e78"], .head [style*="color: #1e4e78"] { color: ${KASA_LIGHT.accentDark} !important; }
`;

/** Kibritçi antet + açık turuncu tema — HTML raporları (Excel değil) */
export function buildKasaLightReportHtml(options: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  formatBadge: string;
  meta?: string[];
  assets?: KibritciReportAssets;
  fileName: string;
}): string {
  const badgeBlock = kasaHtmlFormatBadge(options.formatBadge);
  const html = buildKibritciReportHtml({
    title: options.title,
    subtitle: options.subtitle,
    bodyHtml: `${badgeBlock}${options.bodyHtml}`,
    meta: options.meta,
    assets: options.assets,
    fileName: options.fileName,
  });
  return html.replace('</head>', `<style>${KASA_LIGHT_REPORT_CSS}</style></head>`);
}
