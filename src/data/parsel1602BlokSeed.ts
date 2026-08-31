/**
 * 160/2 — Duvar aplikasyon + ruhsat kaynaklı blok / kat modeli
 *
 * Kaynaklar:
 * - Duvar aplikasyon DWG (2025_06–10): A1, A2, B1, B2, B3, C1–C4
 * - Yapı ruhsatı 160-2 PARSEL.PDF: blok bazlı kat + daire (parsel toplam 246 konut)
 */

export const PARSEL_160_2 = 'Parsel Bölge 160/2';

export type BlokKatTipi1602 = 'TEKNIK' | 'ZEMIN' | 'KONUT' | 'CATI';
export type DaireTipi1602 = '1+1' | '2+1' | '3+1';

export interface BlokKatSablon1602 {
  kod: string;
  label: string;
  tip: BlokKatTipi1602;
  konut: boolean;
}

export interface Blok1602Profil {
  blok: string;
  katSayisi: number;
  daireSayisi: number;
  katlar: BlokKatSablon1602[];
  tipListesi: DaireTipi1602[];
  dwgKaynak: string;
}

function kat(
  kod: string,
  label: string,
  tip: BlokKatTipi1602,
  konut = tip === 'KONUT' || tip === 'ZEMIN'
): BlokKatSablon1602 {
  return { kod, label, tip, konut };
}

/** A — 1 bodrum + zemin + 1…4 (ruhsat: 1 alt + 5 üst = 6) */
const KAT_A: BlokKatSablon1602[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
];

/** B1 — 2 bodrum + zemin + 1…4 (ruhsat: 2 alt + 5 üst = 7) */
const KAT_B1: BlokKatSablon1602[] = [
  kat('B1', '1. Bodrum', 'TEKNIK', false),
  kat('B2', '2. Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
];

/** B2/B3 — 1 bodrum + zemin + 1…3 (ruhsat: 1 alt + 4 üst = 5) */
const KAT_B23: BlokKatSablon1602[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
];

/** C1 — 1 bodrum + zemin + 1…5 (ruhsat 7 kat) */
const KAT_C1: BlokKatSablon1602[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

/** C2–C4 — 1 bodrum + zemin + 1…4 (ruhsat ~6 kat; C2 DWG: 1.bodrum) */
const KAT_C: BlokKatSablon1602[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
];

export const BLOK_1602_PROFILLERI: Blok1602Profil[] = [
  {
    blok: 'A1',
    katSayisi: 6,
    daireSayisi: 39,
    katlar: KAT_A,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 Parsel A1 Blok Duvar Aplikasyonu 2025_06_12.dwg',
  },
  {
    blok: 'A2',
    katSayisi: 6,
    daireSayisi: 37,
    katlar: KAT_A,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 Parsel A2 Blok Duvar Aplikasyonu 2025_06_04.dwg',
  },
  {
    blok: 'B1',
    katSayisi: 7,
    daireSayisi: 33,
    katlar: KAT_B1,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 Parsel B1 Duvar Aplikasyonu 2025_08_21_R02.dwg',
  },
  {
    blok: 'B2',
    katSayisi: 5,
    daireSayisi: 25,
    katlar: KAT_B23,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 B2 DUVAR APLİKASYON _R02_2025_08_24.dwg',
  },
  {
    blok: 'B3',
    katSayisi: 5,
    daireSayisi: 24,
    katlar: KAT_B23,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 Parsel B3 Duvar Aplikasyonu 2025_10_06_R03.dwg',
  },
  {
    blok: 'C1',
    katSayisi: 7,
    daireSayisi: 22,
    katlar: KAT_C1,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 PARSEL C1 BLOK DUVAR APLİKASYONU 2025_06_24.dwg',
  },
  {
    blok: 'C2',
    katSayisi: 6,
    daireSayisi: 22,
    katlar: KAT_C,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 PARSEL C2 BLOK DUVAR APLİKASYONU 2025_09_23.dwg',
  },
  {
    blok: 'C3',
    katSayisi: 6,
    daireSayisi: 22,
    katlar: KAT_C,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 PARSEL C3 BLOK DUVAR APLİKASYONU 2025_06_24.dwg',
  },
  {
    blok: 'C4',
    katSayisi: 6,
    daireSayisi: 22,
    katlar: KAT_C,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '160-2 PARSEL C4 BLOK DUVAR APLİKASYONU 2025_06_24.dwg',
  },
];

export function profil1602(blok: string): Blok1602Profil | undefined {
  return BLOK_1602_PROFILLERI.find((p) => p.blok === blok);
}

export function isParsel1602(parsel: string): boolean {
  return parsel.includes('160/2');
}

export function katSablon1602(blok: string, katNo: number): BlokKatSablon1602 | undefined {
  const p = profil1602(blok);
  if (!p || katNo < 1 || katNo > p.katlar.length) return undefined;
  return p.katlar[katNo - 1];
}

export function daireSayisiKatta1602(blok: string, katNo: number): number {
  const p = profil1602(blok);
  const katRow = katSablon1602(blok, katNo);
  if (!p || !katRow?.konut) return 0;
  const konutIndex = p.katlar.filter((k) => k.konut).findIndex((k) => k.kod === katRow.kod);
  if (konutIndex < 0) return 0;
  const n = p.katlar.filter((k) => k.konut).length;
  if (n <= 0) return 0;
  const base = Math.floor(p.daireSayisi / n);
  const rem = p.daireSayisi % n;
  return base + (konutIndex < rem ? 1 : 0);
}

export function tipForDaire1602(blok: string, daireIndex: number): DaireTipi1602 {
  const tips = profil1602(blok)?.tipListesi || ['2+1', '3+1'];
  if (daireIndex <= 2) return tips.includes('2+1') ? '2+1' : tips[0];
  return tips.includes('3+1') ? '3+1' : tips[tips.length - 1];
}

/** 39+37+33+25+24+22×4 = 246 */
export function ozet1602() {
  const daire = BLOK_1602_PROFILLERI.reduce((s, p) => s + p.daireSayisi, 0);
  return { blokSayisi: BLOK_1602_PROFILLERI.length, daire };
}
