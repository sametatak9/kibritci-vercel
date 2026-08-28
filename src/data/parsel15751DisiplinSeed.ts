/** 157/51 — DWG katmanlarından türetilmiş altyapı + peyzaj WBS şablonu */

import { joinFirestoreDocId } from '../lib/firestoreIdUtils';

export const PARSEL_157_51 = 'Parsel Bölge 157/51';

export type DisiplinGrup = 'ALTYAPI' | 'PEYZAJ' | 'MIMARI';

export type DisiplinKalemDurum = 'PLANLANDI' | 'IMALATTA' | 'TAMAMLANDI' | 'BEKLEMEDE';

export interface DisiplinWbsSablon {
  kod: string;
  baslik: string;
  grup: DisiplinGrup;
  /** GENEL = parsel geneli; BLOK = her blokta tekrar */
  kapsam: 'GENEL' | 'BLOK';
  sira: number;
  /** Görsel katman anahtarı (animasyon) */
  gorsel: string;
  dwgKaynak?: string;
}

/** Altyapı — 51-ALTYAPI-R11.dwg katmanlarından */
export const ALTYAPI_WBS_SABLON: DisiplinWbsSablon[] = [
  {
    kod: 'ALT-01',
    baslik: 'Pis su kanal hattı',
    grup: 'ALTYAPI',
    kapsam: 'GENEL',
    sira: 1,
    gorsel: 'kanal',
    dwgKaynak: 'TR Pissu Kanal',
  },
  {
    kod: 'ALT-02',
    baslik: 'Drenaj / yağmur hattı',
    grup: 'ALTYAPI',
    kapsam: 'GENEL',
    sira: 2,
    gorsel: 'drenaj',
    dwgKaynak: 'NOT-DRENAJ / WP-YAGMUR SUZGEC',
  },
  {
    kod: 'ALT-03',
    baslik: 'Baca / manhol',
    grup: 'ALTYAPI',
    kapsam: 'GENEL',
    sira: 3,
    gorsel: 'baca',
    dwgKaynak: 'BACA NO',
  },
  {
    kod: 'ALT-04',
    baslik: 'ASU / boru hatları',
    grup: 'ALTYAPI',
    kapsam: 'GENEL',
    sira: 4,
    gorsel: 'boru',
    dwgKaynak: 'BAES_ASU_Boru_Etiketleri / U_Boru_Etiketleri',
  },
  {
    kod: 'ALT-05',
    baslik: 'Kot / nivelman',
    grup: 'ALTYAPI',
    kapsam: 'GENEL',
    sira: 5,
    gorsel: 'kot',
    dwgKaynak: 'KOT-BAES / LEVEL_LINE / YAHKOT',
  },
  {
    kod: 'ALT-06',
    baslik: 'Yol kesit / profil',
    grup: 'ALTYAPI',
    kapsam: 'GENEL',
    sira: 6,
    gorsel: 'yol',
    dwgKaynak: 'C-ROAD-PROF / C-ROAD-SCTN',
  },
];

/** Peyzaj — XREF-157-51-YAPISAL-PEYZAJ + altyapı içi XREF katmanları */
export const PEYZAJ_WBS_SABLON: DisiplinWbsSablon[] = [
  {
    kod: 'PEY-01',
    baslik: 'Beton / sert döşeme',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 1,
    gorsel: 'beton',
    dwgKaynak: 'SW-LND-02-DS-BETON',
  },
  {
    kod: 'PEY-02',
    baslik: 'Yaya yolu',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 2,
    gorsel: 'yaya',
    dwgKaynak: 'KBR YAYA GE / AC_YOL',
  },
  {
    kod: 'PEY-03',
    baslik: 'Bisiklet yolu',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 3,
    gorsel: 'bisiklet',
    dwgKaynak: 'SW-LND-02-DS-BISIKLET-YOLU',
  },
  {
    kod: 'PEY-04',
    baslik: 'Ahşap bank / oturma',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 4,
    gorsel: 'bank',
    dwgKaynak: 'SW-LND-03-KM-AHSAP-BANK / OTURMA',
  },
  {
    kod: 'PEY-05',
    baslik: 'Oyun alanı',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 5,
    gorsel: 'oyun',
    dwgKaynak: 'SW-LND-03-PLAY',
  },
  {
    kod: 'PEY-06',
    baslik: 'Parapet / duvar / oluk',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 6,
    gorsel: 'parapet',
    dwgKaynak: 'SW-LND-06-PARAPET / KBR DUVARLAR / KBR OLUK',
  },
  {
    kod: 'PEY-07',
    baslik: 'KBR kaplama (bazalt / baskı beton)',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 7,
    gorsel: 'kaplama',
    dwgKaynak: 'KBR BAZALT / KBR BASKI BETON / KBR EPDM',
  },
  {
    kod: 'PEY-08',
    baslik: 'Bitkisel — ağaç / çalı / çim',
    grup: 'PEYZAJ',
    kapsam: 'BLOK',
    sira: 8,
    gorsel: 'bitki',
    dwgKaynak: 'XREF bitkisel peyzaj (legend gelecek)',
  },
  {
    kod: 'PEY-09',
    baslik: 'Peyzaj kotları',
    grup: 'PEYZAJ',
    kapsam: 'GENEL',
    sira: 9,
    gorsel: 'kot',
    dwgKaynak: 'SW-LND-07-KOT / lnd-kot',
  },
];

export const BLOKLAR_157_51 = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4'] as const;

export function disiplinKalemId(parsel: string, blok: string, kod: string): string {
  return joinFirestoreDocId(parsel, blok, kod);
}

export function expandDisiplinSablon(
  sablonlar: DisiplinWbsSablon[],
  parsel = PARSEL_157_51
): Array<{ id: string; parsel: string; blok: string; sablon: DisiplinWbsSablon }> {
  const out: Array<{ id: string; parsel: string; blok: string; sablon: DisiplinWbsSablon }> = [];
  for (const s of sablonlar) {
    if (s.kapsam === 'GENEL') {
      out.push({
        id: disiplinKalemId(parsel, 'GENEL', s.kod),
        parsel,
        blok: 'GENEL',
        sablon: s,
      });
    } else {
      for (const blok of BLOKLAR_157_51) {
        out.push({
          id: disiplinKalemId(parsel, blok, s.kod),
          parsel,
          blok,
          sablon: s,
        });
      }
    }
  }
  return out;
}
