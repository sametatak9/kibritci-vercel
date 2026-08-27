/**
 * 157/51 — C blokları daire yerleşim planı
 * Kaynak: 157-51 Parsel C BLOKLAR Daire Yerleşim Planı,
 * Tavan ve Islak Hacim Detayları_2025.03.12.dwg
 *
 * Parselde 4 C bloğu: C1 · C2 · C3 · C4
 * Tipik kasa (parsel varsayılanı ile uyumlu): 7 kat × 4 daire/kat = 28 daire/blok
 */

import {
  DisiplinWbsSablon,
  PARSEL_157_51,
  disiplinKalemId,
} from './parsel15751DisiplinSeed';

export const C_BLOKLAR_157_51 = ['C1', 'C2', 'C3', 'C4'] as const;
export type CBlokKodu = (typeof C_BLOKLAR_157_51)[number];

export const C_BLOK_DWG =
  '157-51 Parsel C BLOKLAR Daire Yerleşim Planı, Tavan ve Islak Hacim Detayları_2025.03.12.dwg';

export interface CBlokProfilSablon {
  blok: CBlokKodu;
  katSayisi: number;
  dairePerKat: number;
  tipEtiket: string;
}

export const C_BLOK_PROFILLERI: CBlokProfilSablon[] = [
  { blok: 'C1', katSayisi: 7, dairePerKat: 4, tipEtiket: '2+1 / 3+1' },
  { blok: 'C2', katSayisi: 7, dairePerKat: 4, tipEtiket: '2+1 / 3+1' },
  { blok: 'C3', katSayisi: 7, dairePerKat: 4, tipEtiket: '2+1 / 3+1' },
  { blok: 'C4', katSayisi: 7, dairePerKat: 4, tipEtiket: '2+1 / 3+1' },
];

export function cBlokDaireSayisi(p: CBlokProfilSablon): number {
  return p.katSayisi * p.dairePerKat;
}

/** Kat N, daire 1..N → "N.0M" */
export function cBlokDaireNo(katNo: number, daireIndex: number): string {
  return `${katNo}.${String(daireIndex).padStart(2, '0')}`;
}

/** Tipik daire planı odaları — DWG: yerleşim + ıslak + mutfak + tavan */
export type CDaireOdaKey =
  | 'salon'
  | 'yatak1'
  | 'yatak2'
  | 'mutfak'
  | 'islak'
  | 'hol'
  | 'balkon';

export interface CDaireOdaSablon {
  key: CDaireOdaKey;
  label: string;
  /** SVG viewBox 0..100 içi yüzde kutusu */
  x: number;
  y: number;
  w: number;
  h: number;
  /** İlerleme gorsel anahtarı (MIMARI WBS) */
  gorsel: string;
}

/**
 * Şematik daire yerleşim planı (tek ünite — tüm C daireleri aynı tip şema).
 * DWG binary’den oda koordinatı çıkmadığı için plan başlığına göre tipik yerleşim.
 */
export const C_DAIRE_PLAN_ODALARI: CDaireOdaSablon[] = [
  { key: 'balkon', label: 'Balkon', x: 62, y: 4, w: 34, h: 18, gorsel: 'yerlesim' },
  { key: 'salon', label: 'Salon', x: 4, y: 4, w: 56, h: 38, gorsel: 'yerlesim' },
  { key: 'hol', label: 'Hol / Antre', x: 40, y: 44, w: 28, h: 28, gorsel: 'hol' },
  { key: 'yatak1', label: 'Yatak 1', x: 4, y: 44, w: 34, h: 24, gorsel: 'yerlesim' },
  { key: 'yatak2', label: 'Yatak 2', x: 4, y: 70, w: 34, h: 26, gorsel: 'yerlesim' },
  { key: 'mutfak', label: 'Mutfak', x: 70, y: 44, w: 26, h: 28, gorsel: 'mutfak' },
  { key: 'islak', label: 'Islak hacim', x: 70, y: 74, w: 26, h: 22, gorsel: 'islak' },
];

/** Mimari / iç işler — C blok başına */
export const MIMARI_C_WBS_SABLON: DisiplinWbsSablon[] = [
  {
    kod: 'MIM-01',
    baslik: 'Daire yerleşim planı',
    grup: 'MIMARI',
    kapsam: 'BLOK',
    sira: 1,
    gorsel: 'yerlesim',
    dwgKaynak: C_BLOK_DWG,
  },
  {
    kod: 'MIM-02',
    baslik: 'Islak hacim detayları',
    grup: 'MIMARI',
    kapsam: 'BLOK',
    sira: 2,
    gorsel: 'islak',
    dwgKaynak: 'Islak Hacim Detayları',
  },
  {
    kod: 'MIM-03',
    baslik: 'Mutfak',
    grup: 'MIMARI',
    kapsam: 'BLOK',
    sira: 3,
    gorsel: 'mutfak',
    dwgKaynak: 'MUTFAK / yerleşim',
  },
  {
    kod: 'MIM-04',
    baslik: 'Tavan detayları',
    grup: 'MIMARI',
    kapsam: 'BLOK',
    sira: 4,
    gorsel: 'tavan',
    dwgKaynak: 'Tavan Detayları',
  },
  {
    kod: 'MIM-05',
    baslik: 'Antre / hol / sirkülasyon',
    grup: 'MIMARI',
    kapsam: 'BLOK',
    sira: 5,
    gorsel: 'hol',
    dwgKaynak: 'Daire Yerleşim Planı',
  },
];

export function expandMimariCSablon(parsel = PARSEL_157_51) {
  const out: Array<{ id: string; parsel: string; blok: string; sablon: DisiplinWbsSablon }> = [];
  for (const s of MIMARI_C_WBS_SABLON) {
    for (const blok of C_BLOKLAR_157_51) {
      out.push({
        id: disiplinKalemId(parsel, blok, s.kod),
        parsel,
        blok,
        sablon: s,
      });
    }
  }
  return out;
}

export function cBlokParselOzet() {
  const blokSayisi = C_BLOKLAR_157_51.length;
  const daire = C_BLOK_PROFILLERI.reduce((s, p) => s + cBlokDaireSayisi(p), 0);
  const kat = C_BLOK_PROFILLERI[0]?.katSayisi || 7;
  const dairePerKat = C_BLOK_PROFILLERI[0]?.dairePerKat || 4;
  return { blokSayisi, daire, kat, dairePerKat };
}

export function profilForCBlok(blok: string): CBlokProfilSablon | undefined {
  return C_BLOK_PROFILLERI.find((p) => p.blok === blok);
}
