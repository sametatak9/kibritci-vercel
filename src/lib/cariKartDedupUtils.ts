import type { CariKart, Personel } from '../types/erp';
import { removeDocument, saveDocument } from './firebase';
import { firmaAnahtar, firmaEslesir, personelForCariKart } from './taseronUtils';

export type CariDedupPlan = {
  key: string;
  keep: CariKart;
  deleteIds: string[];
  idRemap: Record<string, string>;
};

function mergeCariFields(keep: CariKart, dup: CariKart): CariKart {
  const notlar = [keep.notlar, dup.notlar].filter(Boolean).join(' · ');
  return {
    ...keep,
    yetkili: keep.yetkili?.trim() || dup.yetkili?.trim() || '',
    telefon: keep.telefon?.trim() || dup.telefon?.trim() || '',
    eposta: keep.eposta?.trim() || dup.eposta?.trim() || '',
    vergiNo: keep.vergiNo?.trim() || dup.vergiNo?.trim() || '',
    vergiDairesi: keep.vergiDairesi?.trim() || dup.vergiDairesi?.trim() || '',
    adres: keep.adres?.trim() || dup.adres?.trim() || '',
    iban: keep.iban?.trim() || dup.iban?.trim() || '',
    kod: keep.kod?.trim() || dup.kod?.trim() || keep.kod,
    notlar: notlar || keep.notlar,
    durum: keep.durum === 'PASIF' && dup.durum === 'AKTIF' ? 'AKTIF' : keep.durum,
  };
}

/** Hangi kart kalır: seed id, personel sayısı, dolu alanlar */
export function scoreCariCanonical(c: CariKart, personeller: Personel[]): number {
  let score = 0;
  if (c.id === 'ck_taseron_kuter') score += 1000;
  if (c.id.startsWith('ck_taseron_')) score += 500;
  if (c.id.startsWith('ck_')) score += 100;
  if (c.durum === 'AKTIF') score += 50;
  score += personelForCariKart(personeller, c).length * 10;
  if (c.telefon?.trim()) score += 5;
  if (c.vergiNo?.trim()) score += 5;
  if (c.adres?.trim()) score += 3;
  if (c.iban?.trim()) score += 2;
  return score;
}

function pickCanonicalFromGroup(group: CariKart[], personeller: Personel[]): CariKart {
  return [...group].sort(
    (a, b) => scoreCariCanonical(b, personeller) - scoreCariCanonical(a, personeller)
  )[0];
}

/** Aynı unvan + kart tipi mükerrer cari grupları */
export function planCariKartDedup(
  cariKartlar: CariKart[],
  personeller: Personel[] = []
): CariDedupPlan[] {
  const byKey = new Map<string, CariKart[]>();

  for (const c of cariKartlar) {
    const unvan = String(c.unvan || '').trim();
    if (!unvan) continue;
    const key = `${c.kartTipi || 'GENEL'}::${firmaAnahtar(unvan) || unvan.toLocaleLowerCase('tr-TR')}`;
    const list = byKey.get(key) || [];
    list.push(c);
    byKey.set(key, list);
  }

  const plans: CariDedupPlan[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    let keep = pickCanonicalFromGroup(group, personeller);
    for (const dup of group) {
      if (dup.id === keep.id) continue;
      keep = mergeCariFields(keep, dup);
    }
    const deleteIds = group.filter((c) => c.id !== keep.id).map((c) => c.id);
    const idRemap: Record<string, string> = {};
    deleteIds.forEach((id) => {
      idRemap[id] = keep.id;
    });
    plans.push({ key, keep, deleteIds, idRemap });
  }
  return plans;
}

export function findDuplicateCariler(cari: CariKart, cariKartlar: CariKart[]): CariKart[] {
  return cariKartlar.filter((c) => c.id !== cari.id && firmaEslesir(c.unvan, cari.unvan));
}

/** Mükerrer cari birleştir: canonical kartı kaydet, kopyaları sil */
export async function applyCariDedupPlan(plan: CariDedupPlan): Promise<void> {
  await saveDocument('cariKartlar', plan.keep);
  for (const id of plan.deleteIds) {
    await removeDocument('cariKartlar', id);
  }
}

export async function mergeDuplicateCarilerFor(
  cari: CariKart,
  cariKartlar: CariKart[],
  personeller: Personel[] = []
): Promise<{ keep: CariKart; deletedIds: string[] } | null> {
  const dupes = findDuplicateCariler(cari, cariKartlar);
  if (dupes.length === 0) return null;
  const group = [cari, ...dupes];
  const keep = pickCanonicalFromGroup(group, personeller);
  let merged = keep;
  for (const dup of group) {
    if (dup.id === keep.id) continue;
    merged = mergeCariFields(merged, dup);
  }
  const deleteIds = group.filter((c) => c.id !== keep.id).map((c) => c.id);
  await applyCariDedupPlan({ key: keep.unvan, keep: merged, deleteIds, idRemap: Object.fromEntries(deleteIds.map((id) => [id, merged.id])) });
  return { keep: merged, deletedIds: deleteIds };
}

/** Bellekte mükerrer cari planlarını uygular (Firestore yazımından önce) */
export function applyCariDedupPlansInMemory(
  cariKartlar: CariKart[],
  plans: CariDedupPlan[]
): CariKart[] {
  if (plans.length === 0) return cariKartlar;
  const deleteSet = new Set(plans.flatMap((p) => p.deleteIds));
  const keepMap = new Map(plans.map((p) => [p.keep.id, p.keep]));
  return cariKartlar
    .filter((c) => !deleteSet.has(c.id))
    .map((c) => keepMap.get(c.id) ?? c);
}
