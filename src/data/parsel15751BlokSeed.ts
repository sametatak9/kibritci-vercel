/**
 * 157/51 — Duvar aplikasyon + ruhsat kaynaklı blok / kat modeli
 *
 * Kaynaklar:
 * - Duvar aplikasyon DWG (2025_08_29 / 09_23 / 09_27): A1-A2, A3, B1, B2, C1–C4
 * - Yapı ruhsatı 157-51 PARSEL.pdf: blok bazlı toplam kat + daire
 *
 * UYARI: Kat etiketleri DWG + ruhsat (yol altı/üstü); daire/kat dağılımı
 * ruhsat toplamına göre eşitlenir.
 */

export const PARSEL_157_51 = 'Parsel Bölge 157/51';

export type BlokKatTipi15751 = 'TEKNIK' | 'ZEMIN' | 'KONUT' | 'CATI';

export type DaireTipi15751 = '1+1' | '2+1' | '3+1';

export interface BlokKatSablon15751 {
  kod: string;
  label: string;
  tip: BlokKatTipi15751;
  konut: boolean;
}

export interface Blok15751Profil {
  blok: string;
  katSayisi: number;
  daireSayisi: number;
  katlar: BlokKatSablon15751[];
  tipListesi: DaireTipi15751[];
  dwgKaynak: string;
}

function kat(
  kod: string,
  label: string,
  tip: BlokKatTipi15751,
  konut = tip === 'KONUT' || tip === 'ZEMIN'
): BlokKatSablon15751 {
  return { kod, label, tip, konut };
}

/** A/B — 1 bodrum + zemin + 1…5. kat (ruhsat: 1 alt + 6 üst = 7) */
const KAT_AB: BlokKatSablon15751[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

/** C1 — 1 bodrum + 5 konut katı (ruhsat: 6 toplam, 5 üst) */
const KAT_C1: BlokKatSablon15751[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
];

/** C2 — 1 bodrum + 6 konut (ruhsat: 7 toplam, 6 üst) */
const KAT_C2: BlokKatSablon15751[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

/** C3/C4 — 2 bodrum + 5 konut (DWG: 1./2. bodrum; ruhsat: 2 alt + 5 üst) */
const KAT_C34: BlokKatSablon15751[] = [
  kat('B1', '1. Bodrum', 'TEKNIK', false),
  kat('B2', '2. Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
];

export const BLOK_15751_PROFILLERI: Blok15751Profil[] = [
  {
    blok: 'A1',
    katSayisi: 7,
    daireSayisi: 24,
    katlar: KAT_AB,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-51 A1-A2 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'A2',
    katSayisi: 7,
    daireSayisi: 24,
    katlar: KAT_AB,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-51 A1-A2 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'A3',
    katSayisi: 7,
    daireSayisi: 24,
    katlar: KAT_AB,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-51 A3 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'B1',
    katSayisi: 7,
    daireSayisi: 24,
    katlar: KAT_AB,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-51 B1 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'B2',
    katSayisi: 7,
    daireSayisi: 24,
    katlar: KAT_AB,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-51 B2 BLOK 2025_09_27.dwg',
  },
  {
    blok: 'C1',
    katSayisi: 6,
    daireSayisi: 33,
    katlar: KAT_C1,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-51 C1 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'C2',
    katSayisi: 7,
    daireSayisi: 40,
    katlar: KAT_C2,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-51 C2 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'C3',
    katSayisi: 7,
    daireSayisi: 34,
    katlar: KAT_C34,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-51 C3 BLOK 2025_08_29.dwg',
  },
  {
    blok: 'C4',
    katSayisi: 7,
    daireSayisi: 34,
    katlar: KAT_C34,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-51 C4 BLOK 2025_09_23.dwg',
  },
];

export function profil15751(blok: string): Blok15751Profil | undefined {
  return BLOK_15751_PROFILLERI.find((p) => p.blok === blok);
}

export function isParsel15751(parsel: string): boolean {
  return parsel.includes('157/51');
}

export function katSablon15751(blok: string, katNo: number): BlokKatSablon15751 | undefined {
  const p = profil15751(blok);
  if (!p || katNo < 1 || katNo > p.katlar.length) return undefined;
  return p.katlar[katNo - 1];
}

export function daireSayisiKatta15751(blok: string, katNo: number): number {
  const p = profil15751(blok);
  const kat = katSablon15751(blok, katNo);
  if (!p || !kat?.konut) return 0;
  const konutIndex = p.katlar.filter((k) => k.konut).findIndex((k) => k.kod === kat.kod);
  if (konutIndex < 0) return 0;
  const n = p.katlar.filter((k) => k.konut).length;
  if (n <= 0) return 0;
  const base = Math.floor(p.daireSayisi / n);
  const rem = p.daireSayisi % n;
  return base + (konutIndex < rem ? 1 : 0);
}

export function tipForDaire15751(blok: string, daireIndex: number): DaireTipi15751 {
  const tips = profil15751(blok)?.tipListesi || ['2+1', '3+1'];
  if (tips.length === 1) return tips[0];
  if (tips.includes('1+1') && daireIndex === 1) return '1+1';
  if (daireIndex <= 2) return tips.includes('2+1') ? '2+1' : tips[0];
  return tips.includes('3+1') ? '3+1' : tips[tips.length - 1];
}

/** Ruhsat parsel toplamı kontrolü: 24×5 + 33 + 40 + 34 + 34 = 261 */
export function ozet15751() {
  const daire = BLOK_15751_PROFILLERI.reduce((s, p) => s + p.daireSayisi, 0);
  return { blokSayisi: BLOK_15751_PROFILLERI.length, daire };
}
