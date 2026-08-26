import type { ProjeIlerlemeDurum, ProjeIlerlemeKalemi, ProjeIlerlemeKova } from '../types/erp';

export const PROJE_ILERLEME_KOVALAR: ProjeIlerlemeKova[] = [
  'EKSIK_IMALAT',
  'TADILAT',
  'PEYZAJ',
  'TESLIM_EVRAK',
  'DIGER',
];

export const PROJE_ILERLEME_KOVA_LABEL: Record<ProjeIlerlemeKova, string> = {
  EKSIK_IMALAT: 'Eksik İmalat',
  TADILAT: 'Tadilat',
  PEYZAJ: 'Peyzaj',
  TESLIM_EVRAK: 'Teslim / Evrak',
  DIGER: 'Diğer',
};

export const PROJE_ILERLEME_DURUM_LABEL: Record<ProjeIlerlemeDurum, string> = {
  ACIK: 'Açık',
  DEVAM: 'Devam',
  BEKLEMEDE: 'Beklemede',
  KAPANDI: 'Kapandı',
};

export function newProjeIlerlemeId(): string {
  return `pil_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isKalemKapali(k: ProjeIlerlemeKalemi): boolean {
  return k.durum === 'KAPANDI';
}

/** Ağırlıklı kapanış yüzdesi (0–100). Boş listede 0. */
export function calcKapanisYuzde(kalemler: ProjeIlerlemeKalemi[]): number {
  if (!kalemler.length) return 0;
  let total = 0;
  let done = 0;
  for (const k of kalemler) {
    const w = Number(k.agirlik) || 1;
    total += w;
    if (isKalemKapali(k)) done += w;
  }
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

export function calcKovaYuzde(
  kalemler: ProjeIlerlemeKalemi[],
  kova: ProjeIlerlemeKova
): { yuzde: number; acik: number; toplam: number } {
  const list = kalemler.filter((k) => k.kova === kova);
  return {
    yuzde: calcKapanisYuzde(list),
    acik: list.filter((k) => !isKalemKapali(k)).length,
    toplam: list.length,
  };
}

export function kirmiziListe(kalemler: ProjeIlerlemeKalemi[]): ProjeIlerlemeKalemi[] {
  return kalemler
    .filter((k) => k.kirmiziEngel && !isKalemKapali(k))
    .sort((a, b) => (b.agirlik || 1) - (a.agirlik || 1));
}

export function sortKalemler(a: ProjeIlerlemeKalemi, b: ProjeIlerlemeKalemi): number {
  if (a.kirmiziEngel !== b.kirmiziEngel) return a.kirmiziEngel ? -1 : 1;
  if (isKalemKapali(a) !== isKalemKapali(b)) return isKalemKapali(a) ? 1 : -1;
  const parsel = String(a.parsel || '').localeCompare(String(b.parsel || ''), 'tr');
  if (parsel !== 0) return parsel;
  const blok = String(a.blok || '').localeCompare(String(b.blok || ''), 'tr');
  if (blok !== 0) return blok;
  return String(a.baslik || '').localeCompare(String(b.baslik || ''), 'tr');
}
