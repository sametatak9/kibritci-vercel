/** Chrome / StatusStrip için hafif bekleyen-onay sayımı (ACL değiştirmez). */

import { isPendingOlderThanHours } from './acilOnayUtils';

export function isSatinAlmaPending(onayDurumu?: string | null): boolean {
  const s = String(onayDurumu || '');
  return s === 'ONAY BEKLİYOR' || s === 'BEKLİYOR' || s.includes('BEKLİYOR');
}

export function isIrsaliyePending(onayDurumu?: string | null): boolean {
  const s = String(onayDurumu || '');
  return s === 'ONAY BEKLİYOR' || s === 'FARK VAR — YÖNETİCİ BİLDİRİLDİ';
}

export function isFaturaPending(durum?: string | null): boolean {
  const s = String(durum || '');
  return s === 'KONTROL BEKLEYOR' || s === 'FARK VAR';
}

type ChromePendingInput = {
  satinAlmaTalepleri?: Array<{
    onayDurumu?: string | null;
    tarih?: string | null;
    gonderimTarihi?: string | null;
  }>;
  irsaliyeler?: Array<{
    onayDurumu?: string | null;
    kaynak?: string | null;
    tarih?: string | null;
  }>;
  faturalar?: Array<{ durum?: string | null; tarih?: string | null }>;
};

/** Ana kabukta gösterilen onay inbox sayısı (SA + irsaliye + fatura). */
export function countChromePendingOnay(input: ChromePendingInput): number {
  const sa = (input.satinAlmaTalepleri || []).filter((x) => isSatinAlmaPending(x.onayDurumu)).length;
  const ir = (input.irsaliyeler || []).filter(
    (x) =>
      x.kaynak !== 'VIDANJOR_FIS' &&
      x.kaynak !== 'MICIR_STABILIZE_FIS' &&
      isIrsaliyePending(x.onayDurumu)
  ).length;
  const ft = (input.faturalar || []).filter((x) => isFaturaPending(x.durum)).length;
  return sa + ir + ft;
}

/** 48 saatten uzun süredir bekleyen onay sayısı (hatırlatma çipi). */
export function countStaleChromePendingOnay(
  input: ChromePendingInput,
  olderThanHours = 48
): number {
  const sa = (input.satinAlmaTalepleri || []).filter(
    (x) =>
      isSatinAlmaPending(x.onayDurumu) &&
      isPendingOlderThanHours(x.gonderimTarihi || x.tarih, null, olderThanHours)
  ).length;
  const ir = (input.irsaliyeler || []).filter(
    (x) =>
      x.kaynak !== 'VIDANJOR_FIS' &&
      x.kaynak !== 'MICIR_STABILIZE_FIS' &&
      isIrsaliyePending(x.onayDurumu) &&
      isPendingOlderThanHours(x.tarih, null, olderThanHours)
  ).length;
  const ft = (input.faturalar || []).filter(
    (x) =>
      isFaturaPending(x.durum) && isPendingOlderThanHours(x.tarih, null, olderThanHours)
  ).length;
  return sa + ir + ft;
}

/** Kart üzerinde gösterilecek imza / kaşe metni. */
export function resolveImzaOnizlemeText(
  doc: {
    eImzalar?: string[] | null;
    onayStamp?: string | null;
    onaylayanYonetici?: string | null;
    onaySignatureText?: string | null;
  } | null | undefined,
  pendingSignatureText?: string | null
): string | null {
  const existing =
    doc?.eImzalar?.[0] ||
    doc?.onayStamp ||
    doc?.onaylayanYonetici ||
    doc?.onaySignatureText ||
    '';
  if (existing) return String(existing);
  if (pendingSignatureText) return `Basılacak imza: ${pendingSignatureText}`;
  return null;
}
