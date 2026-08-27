/**
 * Blok Kontrol takip kalemleri — üç başlık:
 * KABA · İNCE · ALTYAPI
 */

export type TakipKalemGrup = 'KABA' | 'INCE' | 'ALTYAPI';

export const TAKIP_KALEM_GRUP_LABEL: Record<TakipKalemGrup, string> = {
  KABA: 'Kaba kalemler',
  INCE: 'İnce kalemler',
  ALTYAPI: 'Altyapı kalemleri',
};

export const TAKIP_KALEM_GRUP_SIRASI: TakipKalemGrup[] = ['KABA', 'INCE', 'ALTYAPI'];

export interface TakipKalemSablon {
  kod: string;
  baslik: string;
  grup: TakipKalemGrup;
}

/** Daire odası — ortak */
export const ODA_KABA_KALEMLER: TakipKalemSablon[] = [
  { kod: 'KABA_DUVAR', baslik: 'Kaba duvar / dolgu', grup: 'KABA' },
  { kod: 'SIVA', baslik: 'Sıva / alçı', grup: 'KABA' },
  { kod: 'TAVAN_KABA', baslik: 'Tavan kaba', grup: 'KABA' },
];

export const ODA_INCE_KALEMLER: TakipKalemSablon[] = [
  { kod: 'BOYA', baslik: 'Boya', grup: 'INCE' },
  { kod: 'ZEMIN', baslik: 'Zemin kaplama', grup: 'INCE' },
  { kod: 'KAPI', baslik: 'Kapı / doğrama', grup: 'INCE' },
  { kod: 'TAVAN', baslik: 'Tavan / asma tavan', grup: 'INCE' },
];

export const ODA_ALTYAPI_KALEMLER: TakipKalemSablon[] = [
  { kod: 'ELEKTRIK', baslik: 'Elektrik / aydınlatma', grup: 'ALTYAPI' },
  { kod: 'TESISAT_MEK', baslik: 'Mekanik tesisat (ısıtma)', grup: 'ALTYAPI' },
];

export const ODA_OZEL_KALEMLER: Record<string, TakipKalemSablon[]> = {
  mutfak: [
    { kod: 'TEZGAH', baslik: 'Tezgâh / dolap', grup: 'INCE' },
    { kod: 'EVYE', baslik: 'Evye / batarya', grup: 'INCE' },
    { kod: 'DAVLUMBAZ', baslik: 'Davlumbaz / baca', grup: 'ALTYAPI' },
  ],
  islak: [
    { kod: 'SERAMIK', baslik: 'Seramik / fayans', grup: 'INCE' },
    { kod: 'TESISAT', baslik: 'Su / pis su tesisatı', grup: 'ALTYAPI' },
    { kod: 'DUSEKABIN', baslik: 'Duşakabin / klozet', grup: 'INCE' },
  ],
  balkon: [
    { kod: 'PARAPET', baslik: 'Parapet / korkuluk', grup: 'KABA' },
    { kod: 'SU_YALITIM', baslik: 'Su yalıtımı', grup: 'ALTYAPI' },
  ],
  giris: [{ kod: 'GIRIS_KAPI', baslik: 'Daire giriş kapısı', grup: 'INCE' }],
  tavan: [
    { kod: 'ASMA_TAVAN', baslik: 'Asma tavan', grup: 'INCE' },
    { kod: 'AYDINLATMA', baslik: 'Tavan aydınlatma', grup: 'ALTYAPI' },
    { kod: 'BOYA', baslik: 'Tavan boya', grup: 'INCE' },
  ],
};

/** Teknik / bodrum ortak alan */
export const TEKNIK_KABA_KALEMLER: TakipKalemSablon[] = [
  { kod: 'KABA_DUVAR', baslik: 'Kaba duvar / dolgu', grup: 'KABA' },
  { kod: 'SIVA', baslik: 'Sıva', grup: 'KABA' },
  { kod: 'SU_YALITIM', baslik: 'Su yalıtımı', grup: 'KABA' },
];

export const TEKNIK_INCE_KALEMLER: TakipKalemSablon[] = [
  { kod: 'BOYA', baslik: 'Boya', grup: 'INCE' },
  { kod: 'ZEMIN', baslik: 'Zemin kaplama', grup: 'INCE' },
  { kod: 'KAPI', baslik: 'Kapı / yangın kapısı', grup: 'INCE' },
];

export const TEKNIK_ALTYAPI_KALEMLER: TakipKalemSablon[] = [
  { kod: 'ELEKTRIK', baslik: 'Elektrik', grup: 'ALTYAPI' },
  { kod: 'MEKANIK', baslik: 'Mekanik / kalorifer hattı', grup: 'ALTYAPI' },
  { kod: 'SU_PISSU', baslik: 'Su / pis su', grup: 'ALTYAPI' },
  { kod: 'HAVALANDIRMA', baslik: 'Havalandırma', grup: 'ALTYAPI' },
];

export function kalemlerForOdaTakip(odaKey: string): TakipKalemSablon[] {
  if (odaKey === 'tavan') return [...(ODA_OZEL_KALEMLER.tavan || [])];
  return [
    ...ODA_KABA_KALEMLER,
    ...ODA_INCE_KALEMLER,
    ...ODA_ALTYAPI_KALEMLER,
    ...(ODA_OZEL_KALEMLER[odaKey] || []),
  ];
}

export function kalemlerForTeknikAlan(): TakipKalemSablon[] {
  return [...TEKNIK_KABA_KALEMLER, ...TEKNIK_INCE_KALEMLER, ...TEKNIK_ALTYAPI_KALEMLER];
}

export function groupKalemlerByTakip<T extends { kalemKod: string; kalemGrup?: TakipKalemGrup }>(
  rows: T[],
  grupOf: (row: T) => TakipKalemGrup
): Array<{ grup: TakipKalemGrup; label: string; rows: T[] }> {
  return TAKIP_KALEM_GRUP_SIRASI.map((grup) => ({
    grup,
    label: TAKIP_KALEM_GRUP_LABEL[grup],
    rows: rows.filter((r) => grupOf(r) === grup),
  })).filter((g) => g.rows.length > 0);
}
