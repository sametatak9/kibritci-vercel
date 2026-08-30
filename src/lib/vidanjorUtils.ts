import { CariKart, Fatura, VidanjorFis } from '../types/erp';

export const SEKER_VIDANJOR_UNVAN = 'ŞEKER VİDANJÖR';

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

export function isSekerVidanjorFirma(name?: string | null): boolean {
  const n = normalizeFirmaUnvan(name);
  return n.includes('SEKER') && n.includes('VIDANJOR');
}

export function findSekerVidanjorCari(cariKartlar: CariKart[]): CariKart | undefined {
  return (cariKartlar || []).find((c) => isSekerVidanjorFirma(c.unvan));
}

export function vibrateVidanjorAlert(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([220, 80, 220, 80, 320]);
    }
  } catch {
    /* ignore */
  }
}

export function sumCekimAdedi(fisler: VidanjorFis[]): number {
  return (fisler || []).reduce((s, f) => s + (Number(f.cekimAdedi) || 0), 0);
}

/** Fatura kalemlerinden çekim/adet miktarını tahmin et */
export function faturaCekimAdedi(fatura: Fatura): number {
  const kalemler = fatura.kalemler || [];
  if (kalemler.length === 0) return 0;
  const cekimLike = kalemler.filter((k) => {
    const ad = String(k.urunAdi || '').toLocaleLowerCase('tr-TR');
    return (
      ad.includes('çekim') ||
      ad.includes('cekim') ||
      ad.includes('vidanj') ||
      ad.includes('adet') ||
      ad.includes('sefer')
    );
  });
  const pool = cekimLike.length > 0 ? cekimLike : kalemler;
  return pool.reduce((s, k) => s + (Number(k.miktar) || 0), 0);
}

export function filterFislerByMonth(fisler: VidanjorFis[], yil: number, ay: number): VidanjorFis[] {
  const prefix = `${yil}-${String(ay).padStart(2, '0')}`;
  return (fisler || []).filter((f) => String(f.tarih || '').startsWith(prefix));
}

export function filterFaturalarByCariMonth(
  faturalar: Fatura[],
  cariUnvan: string,
  yil: number,
  ay: number
): Fatura[] {
  const prefix = `${yil}-${String(ay).padStart(2, '0')}`;
  const target = normalizeFirmaUnvan(cariUnvan);
  return (faturalar || []).filter((f) => {
    if (!String(f.tarih || '').startsWith(prefix)) return false;
    return normalizeFirmaUnvan(f.cariUnvan) === target || isSekerVidanjorFirma(f.cariUnvan);
  });
}

export type CekimEslesmeSonuc = {
  fisToplam: number;
  faturaToplam: number;
  fark: number;
  uyumlu: boolean;
  faturaSayisi: number;
};

export function compareCekimFatura(
  fisler: VidanjorFis[],
  faturalar: Fatura[],
  yil: number,
  ay: number,
  cariUnvan = SEKER_VIDANJOR_UNVAN
): CekimEslesmeSonuc {
  const monthFis = filterFislerByMonth(fisler, yil, ay).filter(
    (f) => !f.durum || f.durum === 'ONAYLANDI'
  );
  const monthFat = filterFaturalarByCariMonth(faturalar, cariUnvan, yil, ay);
  const fisToplam = sumCekimAdedi(monthFis);
  const faturaToplam = monthFat.reduce((s, f) => s + faturaCekimAdedi(f), 0);
  const fark = fisToplam - faturaToplam;
  return {
    fisToplam,
    faturaToplam,
    fark,
    uyumlu: monthFat.length === 0 ? true : Math.abs(fark) < 0.001,
    faturaSayisi: monthFat.length,
  };
}
