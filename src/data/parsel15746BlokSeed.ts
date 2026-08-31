/**
 * 157/46 — Duvar aplikasyon + ruhsat kaynaklı blok / kat modeli
 *
 * Kaynaklar:
 * - Duvar aplikasyon DWG (2025 R02–R08): bodrum / zemin / normal / çatı kat plan başlıkları
 * - Yapı ruhsatı 157-46 PARSEL.PDF: blok bazlı toplam kat + daire sayısı
 *
 * UYARI: Kat etiketleri DWG plan başlıklarından; daire/kat dağılımı ruhsat
 * toplamına göre eşitlenir (kat planı PDF gelince netleştirilir).
 */

export const PARSEL_157_46 = 'Parsel Bölge 157/46';

export type BlokKatTipi = 'TEKNIK' | 'ZEMIN' | 'KONUT' | 'CATI';

export type DaireTipi15746 = '1+1' | '2+1' | '3+1';

export interface BlokKatSablon {
  /** UI / ID için kısa kod */
  kod: string;
  label: string;
  tip: BlokKatTipi;
  /** Bu katta daire var mı (teknik/çatı genelde yok) */
  konut: boolean;
}

export interface Blok15746Profil {
  blok: string;
  /** Ruhsat: yapının toplam kat sayısı */
  katSayisi: number;
  /** Ruhsat: konut birimi (daire) sayısı */
  daireSayisi: number;
  /** Duvar aplikasyon kat sırası (alttan üste) */
  katlar: BlokKatSablon[];
  tipListesi: DaireTipi15746[];
  dwgKaynak: string;
}

function kat(
  kod: string,
  label: string,
  tip: BlokKatTipi,
  konut = tip === 'KONUT' || tip === 'ZEMIN'
): BlokKatSablon {
  return { kod, label, tip, konut };
}

/** A — 2 bodrum + zemin + 1–3 normal (A2-A1 plan başlıkları) */
const KAT_A: BlokKatSablon[] = [
  kat('B1', '1. Bodrum', 'TEKNIK', false),
  kat('B2', '2. Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
];

/** B — bodrum 1–2 + konut katları */
const KAT_B: BlokKatSablon[] = [
  kat('B1', '1. Bodrum', 'TEKNIK', false),
  kat('B2', '2. Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
];

/** C — bodrum + zemin + normal; C2 çatı xref */
const KAT_C: BlokKatSablon[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

/** D — bodrum + zemin + 1…5. kat planı */
const KAT_D: BlokKatSablon[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

/** E/F — bodrum + normal kat */
const KAT_EF: BlokKatSablon[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

/** G/H — bodrum + zemin + 1 / 2–4 normal */
const KAT_GH: BlokKatSablon[] = [
  kat('B', 'Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
];

/** I — 1. bodrum + zemin + 1 / 2–4 normal */
const KAT_I: BlokKatSablon[] = [
  kat('B', '1. Bodrum', 'TEKNIK', false),
  kat('Z', 'Zemin', 'ZEMIN', true),
  kat('K1', '1. Kat', 'KONUT', true),
  kat('K2', '2. Kat', 'KONUT', true),
  kat('K3', '3. Kat', 'KONUT', true),
  kat('K4', '4. Kat', 'KONUT', true),
  kat('K5', '5. Kat', 'KONUT', true),
];

export const BLOK_15746_PROFILLERI: Blok15746Profil[] = [
  {
    blok: 'A1',
    katSayisi: 6,
    daireSayisi: 14,
    katlar: KAT_A,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-46 PARSEL A BLOK DUVAR APLİKASYONU 2025_10_17_R02.dwg',
  },
  {
    blok: 'A2',
    katSayisi: 6,
    daireSayisi: 14,
    katlar: KAT_A,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-46 PARSEL A BLOK DUVAR APLİKASYONU 2025_10_17_R02.dwg',
  },
  {
    blok: 'B1',
    katSayisi: 6,
    daireSayisi: 14,
    katlar: KAT_B,
    tipListesi: ['1+1', '2+1'],
    dwgKaynak: '157-46 PARSEL B BLOK DUVAR APLİKASYONU 2025_10_14_R07.dwg',
  },
  {
    blok: 'B2',
    katSayisi: 6,
    daireSayisi: 14,
    katlar: KAT_B,
    tipListesi: ['1+1', '2+1'],
    dwgKaynak: '157-46 PARSEL B BLOK DUVAR APLİKASYONU 2025_10_14_R07.dwg',
  },
  {
    blok: 'C1',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_C,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-46 C_BLOK_DUVAR APLİKASYON_2025_11_15_R04.dwg',
  },
  {
    blok: 'C2',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_C,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-46 C_BLOK_DUVAR APLİKASYON_2025_11_15_R04.dwg',
  },
  {
    blok: 'D1',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_D,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-46 D_BLOK_DUVAR APLİKASYON_2025_08_20_R03.dwg',
  },
  {
    blok: 'D2',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_D,
    tipListesi: ['1+1', '2+1', '3+1'],
    dwgKaynak: '157-46 D_BLOK_DUVAR APLİKASYON_2025_08_20_R03.dwg',
  },
  {
    blok: 'E1',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_EF,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-46 PARSEL E1-E2 BLOK DUVAR APLİKASYON 2025_07_04_R08.dwg',
  },
  {
    blok: 'E2',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_EF,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-46 PARSEL E1-E2 BLOK DUVAR APLİKASYON 2025_07_04_R08.dwg',
  },
  {
    blok: 'F1',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_EF,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-46 PARSEL F1-F2 BLOK DUVAR APLİKASYON 2025_07_04_R03.dwg',
  },
  {
    blok: 'F2',
    katSayisi: 7,
    daireSayisi: 18,
    katlar: KAT_EF,
    tipListesi: ['2+1', '3+1'],
    dwgKaynak: '157-46 PARSEL F1-F2 BLOK DUVAR APLİKASYON 2025_07_04_R03.dwg',
  },
  {
    blok: 'G',
    katSayisi: 6,
    daireSayisi: 22,
    katlar: KAT_GH,
    tipListesi: ['1+1', '2+1'],
    dwgKaynak: '157-46 PARSEL G BLOK DUVAR APLİKASYONU 2025_08_20_R03.dwg',
  },
  {
    blok: 'H',
    katSayisi: 6,
    daireSayisi: 22,
    katlar: KAT_GH,
    tipListesi: ['1+1', '2+1'],
    dwgKaynak: '157-46 PARSEL H  BLOK DUVAR APLİKASYON_ 2025_08_20_R03.dwg',
  },
  {
    blok: 'I',
    katSayisi: 7,
    daireSayisi: 22,
    katlar: KAT_I,
    tipListesi: ['1+1', '2+1'],
    dwgKaynak: '157-46 PARSEL I BLOKLAR DUVAR APLİKASYONU 2025_07_25_R03.dwg',
  },
];

export function profil15746(blok: string): Blok15746Profil | undefined {
  return BLOK_15746_PROFILLERI.find((p) => p.blok === blok);
}

export function isParsel15746(parsel: string): boolean {
  return parsel.includes('157/46');
}

/** Alttan üste 1-based kat no → şablon */
export function katSablon15746(blok: string, katNo: number): BlokKatSablon | undefined {
  const p = profil15746(blok);
  if (!p || katNo < 1 || katNo > p.katlar.length) return undefined;
  return p.katlar[katNo - 1];
}

export function konutKatSayisi15746(blok: string): number {
  return profil15746(blok)?.katlar.filter((k) => k.konut).length || 0;
}

/** Ruhsat daire toplamını konut katlarına dağıt (kalan üst kata) */
export function daireSayisiKatta15746(blok: string, katNo: number): number {
  const p = profil15746(blok);
  const kat = katSablon15746(blok, katNo);
  if (!p || !kat?.konut) return 0;
  const konutIndex = p.katlar.filter((k) => k.konut).findIndex((k) => k.kod === kat.kod);
  if (konutIndex < 0) return 0;
  const n = p.katlar.filter((k) => k.konut).length;
  if (n <= 0) return 0;
  const base = Math.floor(p.daireSayisi / n);
  const rem = p.daireSayisi % n;
  return base + (konutIndex < rem ? 1 : 0);
}

export function tipForDaire15746(blok: string, daireIndex: number): DaireTipi15746 {
  const tips = profil15746(blok)?.tipListesi || ['2+1', '3+1'];
  if (tips.length === 1) return tips[0];
  if (tips.includes('1+1') && tips.includes('2+1') && !tips.includes('3+1')) {
    return daireIndex === 1 ? '1+1' : '2+1';
  }
  if (tips.includes('1+1') && daireIndex === 1) return '1+1';
  if (daireIndex <= 2) return tips.includes('2+1') ? '2+1' : tips[0];
  return tips.includes('3+1') ? '3+1' : tips[tips.length - 1];
}

/** Teknik kat ortak alan takip kalemleri (kalorifer / sığınak / depo) */
export const TEKNIK_KAT_ALANLARI = [
  { key: 'kalorifer', label: 'Kalorifer / kazan' },
  { key: 'siginak', label: 'Sığınak' },
  { key: 'depo', label: 'Ortak depo' },
  { key: 'su_deposu', label: 'Su deposu' },
  { key: 'merdiven', label: 'Merdiven / hol' },
  { key: 'asansor', label: 'Asansör kuyusu' },
] as const;

export type TeknikAlanKey = (typeof TEKNIK_KAT_ALANLARI)[number]['key'];
