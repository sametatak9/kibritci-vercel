import type { AylikYoklamaMap, Personel } from '../types/erp';
import { saveDocument } from './firebase';
import {
  gecersizIsimKaydi,
  isGercekCalisanImportKaydi,
  legacyImportKaydi,
} from './personelKayitKaliteUtils';

export function buildLegacyPersonelNormalizePatch(
  p: Personel,
  yoklamalar?: AylikYoklamaMap
): Partial<Personel> | null {
  if (!legacyImportKaydi(p) && p.kaynak !== 'LEGACY_IMPORT') return null;
  if (!isGercekCalisanImportKaydi(p, yoklamalar)) return null;

  const patch: Partial<Personel> = {
    kaynak: 'LEGACY_IMPORT',
    onayDurumu: p.onayDurumu === 'ONAY BEKLİYOR' ? 'ONAYLANDI' : p.onayDurumu,
  };

  if (String(p.adres || '').includes('Yüksekova Konut')) {
    patch.adres = '';
  }
  if (String(p.dogumTarihi || '').startsWith('1990-01-01')) {
    patch.dogumTarihi = '';
  }
  if (String(p.sgkDurumu || '').trim() === 'Sigortasız' && String(p.tcNo || '').trim()) {
    patch.sgkDurumu = p.sgkDurumu;
  }

  const changed =
    patch.adres !== undefined ||
    patch.dogumTarihi !== undefined ||
    patch.kaynak !== p.kaynak ||
    patch.onayDurumu !== p.onayDurumu;

  return changed ? patch : { kaynak: 'LEGACY_IMPORT' };
}

export type LegacyPersonelNormalizePlan = {
  patches: Array<{ id: string; before: Personel; after: Personel }>;
};

export function planLegacyPersonelNormalize(
  personeller: Personel[],
  yoklamalar?: AylikYoklamaMap
): LegacyPersonelNormalizePlan {
  const patches: LegacyPersonelNormalizePlan['patches'] = [];
  for (const p of personeller) {
    if (gecersizIsimKaydi(p)) continue;
    if (!legacyImportKaydi(p) && p.kaynak !== 'LEGACY_IMPORT') continue;
    if (!isGercekCalisanImportKaydi(p, yoklamalar)) continue;
    const patch = buildLegacyPersonelNormalizePatch(p, yoklamalar);
    if (!patch) continue;
    patches.push({
      id: p.id,
      before: p,
      after: { ...p, ...patch },
    });
  }
  return { patches };
}

export async function applyLegacyPersonelNormalize(
  personeller: Personel[],
  yoklamalar?: AylikYoklamaMap
): Promise<{ personeller: Personel[]; updatedCount: number }> {
  const plan = planLegacyPersonelNormalize(personeller, yoklamalar);
  let updatedCount = 0;
  let next = [...personeller];

  for (const row of plan.patches) {
    await saveDocument('personeller', row.after);
    next = next.map((p) => (p.id === row.id ? row.after : p));
    updatedCount += 1;
  }

  return { personeller: next, updatedCount };
}
