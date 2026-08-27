import { PARSEL_BLOK_MAP } from './parselBlokMap';
import { profil15746 } from './parsel15746BlokSeed';
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
      const p46 = parsel.includes('157/46') ? profil15746(blok) : undefined;
      out.push({
        id: blokProfilId(parsel, blok),
        parsel,
        blok,
        katSayisi: p46?.katSayisi ?? def.kat,
        daireSayisi: p46?.daireSayisi ?? def.daire,
        not: p46
          ? `Duvar aplikasyon + ruhsat · ${p46.dwgKaynak}`
          : undefined,
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
    const p46 = p.parsel.includes('157/46') ? profil15746(p.blok) : undefined;
    // 157/46: ruhsat + duvar aplikasyon kat/daire sayılarını koru (eski 6×24 ezmesin)
    if (p46) {
      map.set(id, {
        ...base,
        ...p,
        id,
        katSayisi: p46.katSayisi,
        daireSayisi: p46.daireSayisi,
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
      // 157/46 ruhsat daire sayısını temizlik envanteri ile ezme
      if (row.parsel.includes('157/46') && profil15746(row.blok)) continue;
      row.daireSayisi = n;
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.parsel}${a.blok}`.localeCompare(`${b.parsel}${b.blok}`, 'tr')
  );
}
