import { CariKart } from '../types/erp';

export const ENTO_MADEN_UNVAN = 'Ento Maden';

export type MicirMalzemeTipi = 'MICIR' | 'STABILIZE';

/** Unvan normalize — karşılaştırma için */
export function normalizeFirmaUnvan(name?: string | null): string {
  return String(name || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isEntoMadenFirma(name?: string | null): boolean {
  const n = normalizeFirmaUnvan(name);
  return n.includes('ENTO') && n.includes('MADEN');
}

export function findEntoMadenCari(cariKartlar: CariKart[]): CariKart | undefined {
  return (cariKartlar || []).find((c) => isEntoMadenFirma(c.unvan));
}

export function malzemeTipiLabel(tip?: MicirMalzemeTipi | string | null): string {
  if (tip === 'STABILIZE') return 'Stabilize';
  return 'Mıcır';
}

/** Ton ↔ kg (kapı irsaliyesinde kilo tam girilir, stokta ton da tutulur) */
export function tonToKg(tonaj: number): number {
  if (!Number.isFinite(tonaj)) return 0;
  return Math.round(tonaj * 1000 * 100) / 100;
}

export function kgToTon(kiloKg: number): number {
  if (!Number.isFinite(kiloKg) || kiloKg <= 0) return 0;
  return Math.round((kiloKg / 1000) * 1000) / 1000;
}

/** Kayıttan gösterilecek kg — yoksa tonajdan üretir */
export function resolveMicirKiloKg(input?: {
  kiloKg?: number | null;
  tonaj?: number | null;
} | null): number {
  if (input?.kiloKg != null && Number.isFinite(Number(input.kiloKg)) && Number(input.kiloKg) > 0) {
    return Number(input.kiloKg);
  }
  if (input?.tonaj != null && Number.isFinite(Number(input.tonaj)) && Number(input.tonaj) > 0) {
    return tonToKg(Number(input.tonaj));
  }
  return 0;
}

export function formatMicirMiktarLabel(tonaj?: number | null, kiloKg?: number | null): string {
  const kg = resolveMicirKiloKg({ tonaj, kiloKg });
  const ton = kg > 0 ? kgToTon(kg) : Number(tonaj) || 0;
  if (!kg && !ton) return '—';
  return `${kg.toLocaleString('tr-TR')} kg (${ton.toLocaleString('tr-TR')} ton)`;
}

/** SA kalem adı mıcır / stabilize mi? */
export function satinAlmaKalemMatchesMicir(
  urunAdi?: string | null,
  tip?: MicirMalzemeTipi | string | null
): boolean {
  const u = normalizeFirmaUnvan(urunAdi);
  if (!u) return false;
  if (tip === 'STABILIZE') {
    return u.includes('STABILIZE') || u.includes('STABILIZ') || u.includes('STABIL');
  }
  // MICIR veya tip belirtilmemiş
  if (tip === 'MICIR' || !tip) {
    return (
      u.includes('MICIR') ||
      u.includes('MICEIR') ||
      u.includes('KIRMATA') ||
      u.includes('AGREGA') ||
      u.includes('BALAST')
    );
  }
  return (
    u.includes('MICIR') ||
    u.includes('STABILIZE') ||
    u.includes('STABILIZ') ||
    u.includes('KIRMATA')
  );
}

export function isOpenMicirSatinAlma(sa?: { onayDurumu?: string } | null): boolean {
  if (!sa) return false;
  const d = String(sa.onayDurumu || '').toLocaleUpperCase('tr-TR');
  if (d.includes('RED') || d.includes('KAPAT')) return false;
  return true;
}
