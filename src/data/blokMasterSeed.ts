import { PARSEL_BLOK_MAP } from './parselBlokMap';
import type { ProjeBlokProfili } from '../types/erp';

/** Parsel bazlı varsayılan kat / daire — Firestore profili yoksa kullanılır */
const PARSEL_DEFAULTS: Record<string, { kat: number; daire: number }> = {
  'Parsel Bölge 160/2': { kat: 8, daire: 32 },
  'Parsel Bölge 157/51': { kat: 7, daire: 28 },
  'Parsel Bölge 157/46': { kat: 6, daire: 24 },
};

export function blokProfilId(parsel: string, blok: string): string {
  return `${parsel}|${blok}`;
}

export function seedBlokProfilleri(): ProjeBlokProfili[] {
  const out: ProjeBlokProfili[] = [];
  for (const [parsel, bloklar] of Object.entries(PARSEL_BLOK_MAP)) {
    if (parsel === 'GENEL SAHA') continue;
    const def = PARSEL_DEFAULTS[parsel] || { kat: 6, daire: 24 };
    for (const blok of bloklar) {
      if (blok === 'GENEL SAHA') continue;
      out.push({
        id: blokProfilId(parsel, blok),
        parsel,
        blok,
        katSayisi: def.kat,
        daireSayisi: def.daire,
      });
    }
  }
  return out;
}

export function mergeBlokProfilleri(
  firestore: ProjeBlokProfili[],
  temizlikDaireSayilari?: Map<string, number>
): ProjeBlokProfili[] {
  const seed = seedBlokProfilleri();
  const map = new Map(seed.map((p) => [p.id, { ...p }]));
  for (const p of firestore) {
    map.set(p.id, { ...map.get(p.id), ...p, id: blokProfilId(p.parsel, p.blok) });
  }
  if (temizlikDaireSayilari) {
    for (const [id, n] of temizlikDaireSayilari) {
      const row = map.get(id);
      if (row && n > 0) row.daireSayisi = n;
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.parsel}${a.blok}`.localeCompare(`${b.parsel}${b.blok}`, 'tr')
  );
}
