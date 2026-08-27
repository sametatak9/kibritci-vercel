import { PARSEL_BLOK_MAP } from './parselBlokMap';
import { profil15746 } from './parsel15746BlokSeed';
import { profil15751 } from './parsel15751BlokSeed';
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

function ruhsatProfil(parsel: string, blok: string) {
  if (parsel.includes('157/46')) return profil15746(blok);
  if (parsel.includes('157/51')) return profil15751(blok);
  return undefined;
}

export function seedBlokProfilleri(): ProjeBlokProfili[] {
  const out: ProjeBlokProfili[] = [];
  for (const [parsel, bloklar] of Object.entries(PARSEL_BLOK_MAP)) {
    if (parsel === 'GENEL SAHA') continue;
    const def = PARSEL_DEFAULTS[parsel] || { kat: 6, daire: 24 };
    for (const blok of bloklar) {
      if (blok === 'GENEL SAHA') continue;
      const ruhsat = ruhsatProfil(parsel, blok);
      out.push({
        id: blokProfilId(parsel, blok),
        parsel,
        blok,
        katSayisi: ruhsat?.katSayisi ?? def.kat,
        daireSayisi: ruhsat?.daireSayisi ?? def.daire,
        not: ruhsat ? `Duvar aplikasyon + ruhsat · ${ruhsat.dwgKaynak}` : undefined,
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
    const id = blokProfilId(p.parsel, p.blok);
    const base = map.get(id);
    const ruhsat = ruhsatProfil(p.parsel, p.blok);
    // Ruhsatlı parsellerde kat/daire sayılarını eski seed/temizlik ezmesin
    if (ruhsat) {
      map.set(id, {
        ...base,
        ...p,
        id,
        katSayisi: ruhsat.katSayisi,
        daireSayisi: ruhsat.daireSayisi,
        not: p.not || base?.not,
      });
    } else {
      map.set(id, { ...base, ...p, id });
    }
  }
  if (temizlikDaireSayilari) {
    for (const [id, n] of temizlikDaireSayilari) {
      const row = map.get(id);
      if (!row || n <= 0) continue;
      if (ruhsatProfil(row.parsel, row.blok)) continue;
      row.daireSayisi = n;
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.parsel}${a.blok}`.localeCompare(`${b.parsel}${b.blok}`, 'tr')
  );
}
