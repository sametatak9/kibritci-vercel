/**
 * 157/51 — C blokları daire modeli
 *
 * Kaynaklar:
 * - DWG: 157-51 Parsel C BLOKLAR Daire Yerleşim Planı… (AC1021 — oda geometrisi
 *   binary’den okunamadı)
 * - Tip SketchUp: 157-51 2+1 / 3+1 C TİP MUTFAK.skp (TESLİM)
 *   → giriş kapısı mutfak/salon bölgesine açılıyor; yatak odaları girişten uzakta.
 *
 * UYARI: Aşağıdaki SVG şema tip model + standart konut mantığıdır.
 * Resmi kat planı PDF/export gelince koordinatlar güncellenir.
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

export type CDaireTipi = '1+1' | '2+1' | '3+1';

export interface CBlokProfilSablon {
  blok: CBlokKodu;
  katSayisi: number;
  dairePerKat: number;
}

export const C_BLOK_PROFILLERI: CBlokProfilSablon[] = [
  { blok: 'C1', katSayisi: 6, dairePerKat: 7 }, // 33 daire / 5 konut kat ≈
  { blok: 'C2', katSayisi: 7, dairePerKat: 7 }, // 40 / 6
  { blok: 'C3', katSayisi: 7, dairePerKat: 7 }, // 34 / 5
  { blok: 'C4', katSayisi: 7, dairePerKat: 7 },
];

/** @deprecated Ruhsat toplamı için parsel15751BlokSeed kullanın */
export function cBlokDaireSayisi(p: CBlokProfilSablon): number {
  if (p.blok === 'C1') return 33;
  if (p.blok === 'C2') return 40;
  if (p.blok === 'C3' || p.blok === 'C4') return 34;
  return p.katSayisi * p.dairePerKat;
}

/** Kat N, daire 1..N → "N.0M" */
export function cBlokDaireNo(katNo: number, daireIndex: number): string {
  return `${katNo}.${String(daireIndex).padStart(2, '0')}`;
}

/** Kat planında sıra: 1–2 → 2+1, 3–4 → 3+1 (tip dosya adlarına göre) */
export function cBlokDaireTipi(daireIndex: number): CDaireTipi {
  return daireIndex <= 2 ? '2+1' : '3+1';
}

export type CDaireOdaKey =
  | 'giris'
  | 'hol'
  | 'salon'
  | 'mutfak'
  | 'islak'
  | 'yatak1'
  | 'yatak2'
  | 'yatak3'
  | 'balkon'
  | 'tavan';

export interface CDaireOdaSablon {
  key: CDaireOdaKey;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tip model doğrulaması: giriş → hol → mutfak/salon yan yana;
 * yatak odaları girişten uzak (üst bant).
 */
export const C_PLAN_2_PLUS_1: CDaireOdaSablon[] = [
  { key: 'yatak1', label: 'Yatak 1', x: 4, y: 4, w: 44, h: 28, },
  { key: 'yatak2', label: 'Yatak 2', x: 50, y: 4, w: 46, h: 28, },
  { key: 'salon', label: 'Salon', x: 4, y: 34, w: 58, h: 30, },
  { key: 'balkon', label: 'Balkon', x: 64, y: 34, w: 32, h: 16, },
  { key: 'hol', label: 'Hol / Antre', x: 4, y: 66, w: 28, h: 28, },
  { key: 'mutfak', label: 'Mutfak', x: 34, y: 66, w: 34, h: 28, },
  { key: 'islak', label: 'Islak hacim', x: 70, y: 54, w: 26, h: 40, },
  { key: 'giris', label: 'Giriş', x: 10, y: 94, w: 16, h: 4, },
];

export const C_PLAN_3_PLUS_1: CDaireOdaSablon[] = [
  { key: 'yatak1', label: 'Yatak 1', x: 4, y: 4, w: 30, h: 26, },
  { key: 'yatak2', label: 'Yatak 2', x: 36, y: 4, w: 30, h: 26, },
  { key: 'yatak3', label: 'Yatak 3', x: 68, y: 4, w: 28, h: 26, },
  { key: 'salon', label: 'Salon', x: 4, y: 32, w: 58, h: 28, },
  { key: 'balkon', label: 'Balkon', x: 64, y: 32, w: 32, h: 14, },
  { key: 'hol', label: 'Hol / Antre', x: 4, y: 62, w: 26, h: 30, },
  { key: 'mutfak', label: 'Mutfak', x: 32, y: 62, w: 36, h: 30, },
  { key: 'islak', label: 'Islak hacim', x: 70, y: 50, w: 26, h: 42, },
  { key: 'giris', label: 'Giriş', x: 8, y: 94, w: 16, h: 4, },
];

export const C_PLAN_1_PLUS_1: CDaireOdaSablon[] = [
  { key: 'yatak1', label: 'Yatak', x: 4, y: 4, w: 46, h: 36 },
  { key: 'salon', label: 'Salon', x: 52, y: 4, w: 44, h: 36 },
  { key: 'hol', label: 'Hol / Antre', x: 4, y: 44, w: 28, h: 28 },
  { key: 'mutfak', label: 'Mutfak', x: 34, y: 44, w: 34, h: 28 },
  { key: 'islak', label: 'Islak hacim', x: 70, y: 44, w: 26, h: 40 },
  { key: 'balkon', label: 'Balkon', x: 4, y: 76, w: 40, h: 16 },
  { key: 'giris', label: 'Giriş', x: 10, y: 94, w: 16, h: 4 },
];

export function planOdalarForTip(tip: CDaireTipi): CDaireOdaSablon[] {
  if (tip === '3+1') return C_PLAN_3_PLUS_1;
  if (tip === '1+1') return C_PLAN_1_PLUS_1;
  return C_PLAN_2_PLUS_1;
}

/** Oda içi kalem şablonu — popup’ta kalem kalem (eski API; yeni: takipKalemSablon) */
export interface COdaKalemSablon {
  kod: string;
  baslik: string;
}

export const C_ODA_ORTAK_KALEMLER: COdaKalemSablon[] = [
  { kod: 'SIVA', baslik: 'Sıva / alçı' },
  { kod: 'BOYA', baslik: 'Boya' },
  { kod: 'ZEMIN', baslik: 'Zemin kaplama' },
  { kod: 'KAPI', baslik: 'Kapı / doğrama' },
  { kod: 'ELEKTRIK', baslik: 'Elektrik / aydınlatma' },
  { kod: 'TAVAN', baslik: 'Tavan' },
];

export const C_ODA_OZEL_KALEMLER: Partial<Record<CDaireOdaKey, COdaKalemSablon[]>> = {
  mutfak: [
    { kod: 'TEZGAH', baslik: 'Tezgâh / dolap' },
    { kod: 'EVYE', baslik: 'Evye / batarya' },
    { kod: 'DAVLUMBAZ', baslik: 'Davlumbaz / baca' },
  ],
  islak: [
    { kod: 'SERAMIK', baslik: 'Seramik / fayans' },
    { kod: 'TESISAT', baslik: 'Su / pis su tesisatı' },
    { kod: 'DUSEKABIN', baslik: 'Duşakabin / klozet' },
  ],
  balkon: [
    { kod: 'PARAPET', baslik: 'Parapet / korkuluk' },
    { kod: 'SU_YALITIM', baslik: 'Su yalıtımı' },
  ],
  giris: [{ kod: 'GIRIS_KAPI', baslik: 'Daire giriş kapısı' }],
};

export function kalemlerForOda(odaKey: CDaireOdaKey): COdaKalemSablon[] {
  if (odaKey === 'tavan') {
    return [
      { kod: 'ASMA_TAVAN', baslik: 'Asma tavan' },
      { kod: 'AYDINLATMA', baslik: 'Tavan aydınlatma' },
      { kod: 'BOYA', baslik: 'Tavan boya' },
    ];
  }
  return [...C_ODA_ORTAK_KALEMLER, ...(C_ODA_OZEL_KALEMLER[odaKey] || [])];
}

export function cDaireKalemId(
  parsel: string,
  blok: string,
  daireNo: string,
  odaKey: string,
  kalemKod: string
): string {
  return `${parsel}|${blok}|${daireNo}|${odaKey}|${kalemKod}`.replace(/\s+/g, '_');
}

/** Mimari blok WBS (özet ilerleme) */
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
    dwgKaynak: '157-51 2+1/3+1 C TİP MUTFAK.skp',
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

export const C_PLAN_DOGRULAMA_NOTU =
  'DWG oda geometrisi okunamadı. Yerleşim: 2+1/3+1 C tip SketchUp (giriş yanında mutfak/salon; yataklar uzak). PDF kat planı gelince birebir güncellenir.';
