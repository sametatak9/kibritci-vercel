/**
 * Parsel yerleşim şeması — DWG/ruhsat blok dizilimine göre özet (kuşbakışı).
 * Tam koordinat IFC/PDF gelince güncellenir.
 */

export const PARSEL_157_46 = 'Parsel Bölge 157/46';
export const PARSEL_157_51 = 'Parsel Bölge 157/51';
export const PARSEL_160_2 = 'Parsel Bölge 160/2';

export const HARITA_PARSEL_LIST = [PARSEL_157_46, PARSEL_157_51, PARSEL_160_2] as const;

export interface BlokSiteKonum {
  blok: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AltyapiHat {
  id: string;
  baslik: string;
  points: string;
}

export interface PeyzajAlan {
  id: string;
  baslik: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParselSiteLayout {
  parsel: string;
  kisaAd: string;
  viewBox: string;
  /** Ana yol / servis aksı */
  yol?: { x: number; y: number; w: number; h: number; rx?: number };
  bloklar: BlokSiteKonum[];
  altyapi: AltyapiHat[];
  peyzaj: PeyzajAlan[];
  kaynakNot: string;
}

function blokRow(
  bloks: string[],
  y: number,
  opts?: { x0?: number; w?: number; h?: number; gap?: number }
): BlokSiteKonum[] {
  const x0 = opts?.x0 ?? 8;
  const w = opts?.w ?? 18;
  const h = opts?.h ?? 16;
  const gap = opts?.gap ?? 3;
  return bloks.map((blok, i) => ({
    blok,
    x: x0 + i * (w + gap),
    y,
    w,
    h,
  }));
}

export const PARSEL_SITE_LAYOUTS: Record<string, ParselSiteLayout> = {
  [PARSEL_157_46]: {
    parsel: PARSEL_157_46,
    kisaAd: '157/46',
    viewBox: '0 0 100 88',
    yol: { x: 4, y: 40, w: 92, h: 8, rx: 2 },
    bloklar: [
      ...blokRow(['A1', 'A2', 'B1', 'B2'], 6, { x0: 10, w: 19 }),
      ...blokRow(['C1', 'C2', 'D1', 'D2'], 24, { x0: 10, w: 19 }),
      ...blokRow(['E1', 'E2', 'F1', 'F2'], 52, { x0: 10, w: 19 }),
      ...blokRow(['G', 'H', 'I'], 70, { x0: 22, w: 16, h: 14 }),
    ],
    altyapi: [
      { id: 'kanal', baslik: 'Pis su spine', points: '6,44 94,44' },
      { id: 'drenaj', baslik: 'Drenaj hattı', points: '6,48 50,48 50,84 94,84' },
      { id: 'asu', baslik: 'ASU kolektör', points: '50,12 50,40' },
    ],
    peyzaj: [
      { id: 'p1', baslik: 'Kuzey peyzaj', x: 2, y: 2, w: 96, h: 4 },
      { id: 'p2', baslik: 'Güney bahçe', x: 2, y: 82, w: 96, h: 5 },
      { id: 'p3', baslik: 'Yaya yolu', x: 2, y: 38, w: 4, h: 12 },
    ],
    kaynakNot: '157-46 duvar aplikasyon + ruhsat · A–I blokları',
  },
  [PARSEL_157_51]: {
    parsel: PARSEL_157_51,
    kisaAd: '157/51',
    viewBox: '0 0 100 88',
    yol: { x: 6, y: 42, w: 88, h: 7, rx: 2 },
    bloklar: [
      ...blokRow(['A1', 'A2', 'A3'], 8, { x0: 14, w: 22 }),
      ...blokRow(['B1', 'B2'], 32, { x0: 24, w: 24 }),
      ...blokRow(['C1', 'C2', 'C3', 'C4'], 56, { x0: 8, w: 19 }),
    ],
    altyapi: [
      { id: 'kanal', baslik: 'TR Pissu kanal', points: '8,45 92,45' },
      { id: 'yagmur', baslik: 'Yağmur / süzgeç', points: '8,49 92,49' },
      { id: 'baca', baslik: 'Manhol hattı', points: '20,45 20,78 80,78 80,45' },
    ],
    peyzaj: [
      { id: 'beton', baslik: 'Sert döşeme', x: 4, y: 4, w: 92, h: 5 },
      { id: 'yaya', baslik: 'Yaya yolu', x: 4, y: 40, w: 5, h: 10 },
      { id: 'agac', baslik: 'Yeşil alan', x: 4, y: 78, w: 92, h: 7 },
    ],
    kaynakNot: '51-ALTYAPI-R11 + XREF peyzaj · C blok daire planı',
  },
  [PARSEL_160_2]: {
    parsel: PARSEL_160_2,
    kisaAd: '160/2',
    viewBox: '0 0 100 88',
    yol: { x: 5, y: 41, w: 90, h: 8, rx: 2 },
    bloklar: [
      ...blokRow(['A1', 'A2'], 10, { x0: 26, w: 24 }),
      ...blokRow(['B1', 'B2', 'B3'], 34, { x0: 14, w: 22 }),
      ...blokRow(['C1', 'C2', 'C3', 'C4'], 58, { x0: 8, w: 19 }),
    ],
    altyapi: [
      { id: 'kanal', baslik: 'Kanalizasyon', points: '6,45 94,45' },
      { id: 'yol', baslik: 'Yol profili', points: '6,49 94,49' },
    ],
    peyzaj: [
      { id: 'giris', baslik: 'Giriş peyzajı', x: 3, y: 3, w: 94, h: 5 },
      { id: 'orta', baslik: 'Orta yeşil', x: 42, y: 22, w: 16, h: 14 },
      { id: 'guney', baslik: 'Güney alan', x: 3, y: 80, w: 94, h: 5 },
    ],
    kaynakNot: '160-2 duvar aplikasyon + ruhsat (246 konut)',
  },
};

export function siteLayoutForParsel(parsel: string): ParselSiteLayout | undefined {
  return PARSEL_SITE_LAYOUTS[parsel];
}
