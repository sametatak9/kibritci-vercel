import type {
  TemizlikBaca,
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

export function ozetDaireParsel(
  parsel: string,
  daireler: TemizlikDaire[],
  tespitler: TemizlikTespit[],
  uygulamalar: TemizlikUygulama[]
): TemizlikParselOzet {
  const mine = daireler.filter((d) => d.parsel === parsel);
  let plan = 0;
  let harcanan = 0;
  let tespitli = 0;
  let tamamlanan = 0;
  for (const d of mine) {
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
    parsel,
    adet: mine.length,
    tespitli,
    tamamlanan,
    planYevmiye: plan,
    harcananYevmiye: harcanan,
    kalanYevmiye: Math.max(0, plan - harcanan),
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

export function nextBacaEtiket(parsel: string, bacalar: TemizlikBaca[]): string {
  const n = bacalar.filter((b) => b.parsel === parsel).length + 1;
  return `Baca-${n}`;
}
