import type {
  TemizlikBaca,
  TemizlikBacaKonumTipi,
  TemizlikBacaKoridor,
  TemizlikBacaTespit,
  TemizlikBacaUygulama,
  TemizlikDaire,
  TemizlikKartDurum,
  TemizlikTespit,
  TemizlikUygulama,
} from '../types/erp';

export const TEMIZLIK_DEFAULT_PARSEL = 'Parsel Bölge 157/51';

export const TEMIZLIK_ODA_CHIPS = [
  'Salon',
  'Mutfak',
  'Yatak 1',
  'Yatak 2',
  'Banyo',
  'WC',
  'Hol',
  'Balkon',
] as const;

export const TEMIZLIK_KART_DURUM_LABEL: Record<TemizlikKartDurum, string> = {
  TESPIT_BEKLIYOR: 'Tespit bekliyor',
  PLANLANDI: 'Planlandı',
  UYGULAMA_DEVAM: 'Uygulama devam',
  TAMAMLANDI: 'Tamamlandı',
};

export function newTemizlikId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function deriveKartDurum(opts: {
  hasTespit: boolean;
  planlananYevmiye: number;
  harcananYevmiye: number;
  uygulamalar: { durum?: string }[];
}): TemizlikKartDurum {
  if (!opts.hasTespit) return 'TESPIT_BEKLIYOR';
  if (opts.uygulamalar.length === 0) return 'PLANLANDI';
  const markedDone = opts.uygulamalar.some((u) => u.durum === 'TAMAMLANDI');
  const kalan = Math.max(0, Number(opts.planlananYevmiye || 0) - Number(opts.harcananYevmiye || 0));
  if (markedDone || (opts.planlananYevmiye > 0 && kalan <= 0)) return 'TAMAMLANDI';
  return 'UYGULAMA_DEVAM';
}

export function sumYevmiye(rows: { harcananYevmiye?: number }[]): number {
  return rows.reduce((acc, r) => acc + (Number(r.harcananYevmiye) || 0), 0);
}

export function latestByDate<T>(rows: T[]): T | undefined {
  return [...rows].sort((a, b) => {
    const da = String((a as { tarih?: string }).tarih || '');
    const db = String((b as { tarih?: string }).tarih || '');
    return db.localeCompare(da);
  })[0];
}

export type TemizlikParselOzet = {
  parsel: string;
  adet: number;
  tespitli: number;
  tamamlanan: number;
  planYevmiye: number;
  harcananYevmiye: number;
  kalanYevmiye: number;
};

export type TemizlikBlokOzet = TemizlikParselOzet & { blok: string };

function ozetFromDaireler(
  daireler: TemizlikDaire[],
  tespitler: TemizlikTespit[],
  uygulamalar: TemizlikUygulama[]
): Omit<TemizlikParselOzet, 'parsel'> {
  let plan = 0;
  let harcanan = 0;
  let tespitli = 0;
  let tamamlanan = 0;
  for (const d of daireler) {
    const t = latestByDate(tespitler.filter((x) => x.daireId === d.id));
    const u = uygulamalar.filter((x) => x.daireId === d.id);
    const h = sumYevmiye(u);
    const p = Number(t?.planlananYevmiye || 0);
    plan += p;
    harcanan += h;
    if (t) tespitli += 1;
    const durum = deriveKartDurum({
      hasTespit: !!t,
      planlananYevmiye: p,
      harcananYevmiye: h,
      uygulamalar: u,
    });
    if (durum === 'TAMAMLANDI') tamamlanan += 1;
  }
  return {
    adet: daireler.length,
    tespitli,
    tamamlanan,
    planYevmiye: plan,
    harcananYevmiye: harcanan,
    kalanYevmiye: Math.max(0, plan - harcanan),
  };
}

export function ozetDaireParsel(
  parsel: string,
  daireler: TemizlikDaire[],
  tespitler: TemizlikTespit[],
  uygulamalar: TemizlikUygulama[]
): TemizlikParselOzet {
  return {
    parsel,
    ...ozetFromDaireler(
      daireler.filter((d) => d.parsel === parsel),
      tespitler,
      uygulamalar
    ),
  };
}

export function ozetDaireBlok(
  parsel: string,
  blok: string,
  daireler: TemizlikDaire[],
  tespitler: TemizlikTespit[],
  uygulamalar: TemizlikUygulama[]
): TemizlikBlokOzet {
  return {
    parsel,
    blok,
    ...ozetFromDaireler(
      daireler.filter((d) => d.parsel === parsel && d.blok === blok),
      tespitler,
      uygulamalar
    ),
  };
}

export function ozetBacaParsel(
  parsel: string,
  bacalar: TemizlikBaca[],
  tespitler: TemizlikBacaTespit[],
  uygulamalar: TemizlikBacaUygulama[]
): TemizlikParselOzet {
  const mine = bacalar.filter((d) => d.parsel === parsel);
  let plan = 0;
  let harcanan = 0;
  let tespitli = 0;
  let tamamlanan = 0;
  for (const d of mine) {
    const t = latestByDate(tespitler.filter((x) => x.bacaId === d.id));
    const u = uygulamalar.filter((x) => x.bacaId === d.id);
    const h = sumYevmiye(u);
    const p = Number(t?.planlananYevmiye || 0);
    plan += p;
    harcanan += h;
    if (t) tespitli += 1;
    const durum = deriveKartDurum({
      hasTespit: !!t,
      planlananYevmiye: p,
      harcananYevmiye: h,
      uygulamalar: u,
    });
    if (durum === 'TAMAMLANDI') tamamlanan += 1;
  }
  return {
    parsel,
    adet: mine.length,
    tespitli,
    tamamlanan,
    planYevmiye: plan,
    harcananYevmiye: harcanan,
    kalanYevmiye: Math.max(0, plan - harcanan),
  };
}

export function ozetBacaKoridor(
  parsel: string,
  koridor: TemizlikBacaKoridor,
  bacalar: TemizlikBaca[],
  tespitler: TemizlikBacaTespit[],
  uygulamalar: TemizlikBacaUygulama[]
): TemizlikParselOzet {
  return ozetBacaParsel(
    parsel,
    bacalar.filter((b) => b.parsel === parsel && b.koridor === koridor),
    tespitler,
    uygulamalar
  );
}

export function sortBacalar(rows: TemizlikBaca[]): TemizlikBaca[] {
  return [...rows].sort((a, b) => {
    const ka = a.koridor || 'K9';
    const kb = b.koridor || 'K9';
    if (ka !== kb) return ka.localeCompare(kb);
    const sa = Number(a.siraNo) || 9999;
    const sb = Number(b.siraNo) || 9999;
    if (sa !== sb) return sa - sb;
    return String(a.etiket || '').localeCompare(String(b.etiket || ''), 'tr', { numeric: true });
  });
}

export function bacaYerSatiri(b: TemizlikBaca): string {
  return (
    buildBacaYerOzeti({
      konumTipi: b.konumTipi,
      blok: b.blok,
      blok2: b.blok2,
      ekstra: b.yerTarifi,
    }) || b.yerTarifi || 'Yer tarifi yok'
  );
}

export function parselKisaAd(parsel: string): string {
  return String(parsel || '').replace(/^Parsel Bölge\s+/i, '').trim() || parsel;
}

export function parselBacaKodOnEk(parsel: string): string {
  const kisa = parselKisaAd(parsel);
  if (kisa.includes('/')) {
    const tail = kisa.split('/').pop() || kisa;
    return tail.padStart(2, '0');
  }
  return kisa.replace(/\D/g, '').slice(-2).padStart(2, '0') || 'XX';
}

export type BacaKoridorTanimi = {
  id: TemizlikBacaKoridor;
  baslik: string;
  aciklama: string;
  bloklar: string[];
};

export const BACA_KORIDORLAR: Record<string, BacaKoridorTanimi[]> = {
  'Parsel Bölge 157/51': [
    { id: 'K1', baslik: 'K1 · C sırası', aciklama: 'C2–C3–C4 yatay hat', bloklar: ['C2', 'C3', 'C4'] },
    { id: 'K2', baslik: 'K2 · Orta sıra', aciklama: 'A3–B2–B1 yatay hat', bloklar: ['A3', 'B2', 'B1'] },
    { id: 'K3', baslik: 'K3 · Güney sıra', aciklama: 'C1–A2–A1 yatay hat', bloklar: ['C1', 'A2', 'A1'] },
  ],
  'Parsel Bölge 160/2': [
    { id: 'K1', baslik: 'K1 · Kuzey', aciklama: 'A1A / A1B / A2A / A2B', bloklar: ['A1A', 'A1B', 'A2A', 'A2B'] },
    { id: 'K2', baslik: 'K2 · Orta', aciklama: 'B–C sıkışık hat', bloklar: ['B1', 'B2', 'C1', 'C3', 'C4'] },
    { id: 'K3', baslik: 'K3 · Güney', aciklama: 'C2 / B3 tarafı', bloklar: ['C2', 'B3'] },
  ],
  'Parsel Bölge 157/46': [
    { id: 'K1', baslik: 'K1 · Dış yay', aciklama: 'F1–F2–A–B dış kuşak', bloklar: ['F1', 'F2', 'A1', 'A2', 'B1', 'B2'] },
    { id: 'K2', baslik: 'K2 · İç avlu', aciklama: 'G–H–I–E–D avlu', bloklar: ['G', 'H', 'I', 'E1', 'E2', 'D1', 'D2'] },
    { id: 'K3', baslik: 'K3 · Boyun', aciklama: '51’e bakan B2 ağzı', bloklar: ['B2', 'C1', 'C2'] },
  ],
};

export const BACA_KONUM_SECENEK: { id: TemizlikBacaKonumTipi; label: string; hint: string }[] = [
  { id: 'BLOK_ARKASI', label: 'Blok arkası', hint: 'Bloğun arka cephesindeki çukur' },
  { id: 'BLOK_ONU', label: 'Blok önü', hint: 'Giriş / ön cephe tarafı' },
  { id: 'BLOK_ARASI', label: 'Blok arası', hint: 'İki blok arasındaki boşluk' },
  { id: 'AVLU', label: 'Avlu', hint: 'İç avlu / orta boşluk' },
  { id: 'MERDIVEN', label: 'Merdiven dibi', hint: 'Merdiven, rampa, sahanlık yanı' },
];

export function koridorlarForParsel(parsel: string): BacaKoridorTanimi[] {
  return BACA_KORIDORLAR[parsel] || [
    { id: 'K1', baslik: 'K1', aciklama: '1. koridor', bloklar: [] },
    { id: 'K2', baslik: 'K2', aciklama: '2. koridor', bloklar: [] },
    { id: 'K3', baslik: 'K3', aciklama: '3. koridor', bloklar: [] },
  ];
}

export function konumTipiLabel(tipi?: TemizlikBacaKonumTipi): string {
  return BACA_KONUM_SECENEK.find((x) => x.id === tipi)?.label || '';
}

export function buildBacaKod(parsel: string, koridor: TemizlikBacaKoridor, siraNo: number): string {
  return `${parselBacaKodOnEk(parsel)}-${koridor}-${String(siraNo).padStart(2, '0')}`;
}

export function nextBacaSiraNo(
  parsel: string,
  koridor: TemizlikBacaKoridor,
  bacalar: TemizlikBaca[]
): number {
  const used = bacalar
    .filter((b) => b.parsel === parsel && b.koridor === koridor)
    .map((b) => Number(b.siraNo) || 0);
  return Math.max(0, ...used) + 1;
}

export function buildBacaYerOzeti(opts: {
  konumTipi?: TemizlikBacaKonumTipi;
  blok?: string;
  blok2?: string;
  ekstra?: string;
}): string {
  const blok = String(opts.blok || '').trim();
  const blok2 = String(opts.blok2 || '').trim();
  const ekstra = String(opts.ekstra || '').trim();
  let core = '';
  switch (opts.konumTipi) {
    case 'BLOK_ARKASI':
      core = blok ? `${blok} arkası` : 'Blok arkası';
      break;
    case 'BLOK_ONU':
      core = blok ? `${blok} önü` : 'Blok önü';
      break;
    case 'BLOK_ARASI':
      core = blok && blok2 ? `${blok}–${blok2} arası` : blok ? `${blok} arası` : 'Blok arası';
      break;
    case 'AVLU':
      core = blok ? `${blok} avlu` : 'Avlu';
      break;
    case 'MERDIVEN':
      core = blok ? `${blok} merdiven dibi` : 'Merdiven dibi';
      break;
    default:
      core = blok || '';
  }
  if (ekstra && foldTr(ekstra) !== foldTr(core)) return core ? `${core} · ${ekstra}` : ekstra;
  return core;
}

function foldTr(s: string): string {
  return s.toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
}

export function bacaAdresSatiri(b: TemizlikBaca): string {
  const yer = buildBacaYerOzeti({
    konumTipi: b.konumTipi,
    blok: b.blok,
    blok2: b.blok2,
    ekstra: b.yerTarifi,
  });
  return [b.etiket, yer].filter(Boolean).join(' · ');
}

export function nextBacaEtiket(parsel: string, bacalar: TemizlikBaca[]): string {
  const n = bacalar.filter((b) => b.parsel === parsel).length + 1;
  return `Baca-${n}`;
}
