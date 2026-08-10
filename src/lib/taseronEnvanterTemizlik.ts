import type { CariKart, KampKaydi, Personel, AylikYoklamaMap } from '../types/erp';
import {
  applyCariDedupPlan,
  applyCariDedupPlansInMemory,
  planCariKartDedup,
  type CariDedupPlan,
} from './cariKartDedupUtils';
import {
  canonicalFirmaUnvan,
  firmaDedupKey,
  isJunkFirmaAdi,
} from './firmaCanonicalUtils';
import { removeDocument, saveDocument } from './firebase';
import {
  buildTaseronFirmaEnvanteri,
  firmaAnahtar,
  firmaEslesir,
  getTaseronCariKartlar,
  TASERON_PERSONEL_DEPARTMAN,
  withTaseronPersonelGorev,
} from './taseronUtils';
import {
  applyPersonelDuplicateMerge,
  planPersonelDuplicateMerge,
  type PersonelDuplicateMergePlan,
} from './personelDuplicateMerge';

export type TaseronEnvanterTemizlikPlan = {
  dedupPlans: CariDedupPlan[];
  fuzzyMergePlans: CariDedupPlan[];
  createCariler: CariKart[];
  deletePersonelIds: string[];
  personelPatches: Array<{ id: string; patch: Partial<Personel> }>;
  kampPatches: Array<{ id: string; patch: Partial<KampKaydi> }>;
  personelMergePlans: PersonelDuplicateMergePlan[];
  summary: string[];
};

function shouldFuzzyMergeTaseronUnvan(a: string, b: string): boolean {
  if (firmaEslesir(a, b)) return true;
  const ka = firmaAnahtar(a);
  const kb = firmaAnahtar(b);
  if (!ka || !kb || ka === kb) return false;
  const wa = ka.split(' ')[0];
  const wb = kb.split(' ')[0];
  return wa.length >= 3 && wa === wb;
}

function pickKeepUnvan(a: string, b: string): string {
  const ca = canonicalFirmaUnvan(a);
  const cb = canonicalFirmaUnvan(b);
  return ca.length >= cb.length ? ca : cb;
}

function nextTaseronKod(existing: CariKart[]): string {
  const nums = existing
    .map((c) => c.kod?.match(/TSR-(\d+)/i)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `TSR-${String(next).padStart(2, '0')}`;
}

function buildTaseronCariKart(unvan: string, existingCariler: CariKart[]): CariKart {
  const label = canonicalFirmaUnvan(unvan);
  const slug = firmaDedupKey(label).replace(/\s+/g, '_').slice(0, 16) || 'FIRMA';
  return {
    id: `ck_taseron_${slug}_${Date.now()}`,
    kartTipi: 'TASERON',
    kod: nextTaseronKod(existingCariler),
    unvan: label,
    yetkili: '',
    telefon: '',
    eposta: '',
    vergiNo: '',
    vergiDairesi: '',
    adres: '',
    iban: '',
    durum: 'AKTIF',
    notlar: 'Taşeron envanter temizliği ile otomatik oluşturuldu.',
  };
}

/** Aynı kök adlı taşeron carileri birleştir (EMA + EMA MERMER vb.) */
export function planFuzzyTaseronCariMerge(
  cariKartlar: CariKart[],
  personeller: Personel[] = []
): CariDedupPlan[] {
  const taseron = getTaseronCariKartlar(cariKartlar).filter((c) => !isJunkFirmaAdi(c.unvan));
  const used = new Set<string>();
  const plans: CariDedupPlan[] = [];

  for (let i = 0; i < taseron.length; i += 1) {
    const seed = taseron[i];
    if (used.has(seed.id)) continue;
    const group = [seed];
    used.add(seed.id);

    for (let j = i + 1; j < taseron.length; j += 1) {
      const other = taseron[j];
      if (used.has(other.id)) continue;
      const matchesGroup = group.some((g) => shouldFuzzyMergeTaseronUnvan(g.unvan, other.unvan));
      if (matchesGroup) {
        group.push(other);
        used.add(other.id);
      }
    }

    if (group.length < 2) continue;

    const sorted = [...group].sort(
      (a, b) =>
        (b.durum === 'AKTIF' ? 1 : 0) - (a.durum === 'AKTIF' ? 1 : 0) ||
        String(b.unvan).length - String(a.unvan).length
    );
    let keep = { ...sorted[0], unvan: pickKeepUnvan(sorted[0].unvan, sorted[sorted.length - 1].unvan) };
    for (const dup of sorted.slice(1)) {
      keep = {
        ...keep,
        unvan: pickKeepUnvan(keep.unvan, dup.unvan),
        telefon: keep.telefon?.trim() || dup.telefon?.trim() || '',
        vergiNo: keep.vergiNo?.trim() || dup.vergiNo?.trim() || '',
        adres: keep.adres?.trim() || dup.adres?.trim() || '',
        iban: keep.iban?.trim() || dup.iban?.trim() || '',
        kod: keep.kod?.trim() || dup.kod?.trim() || keep.kod,
      };
    }
    const deleteIds = group.filter((c) => c.id !== keep.id).map((c) => c.id);
    plans.push({
      key: `fuzzy::${firmaDedupKey(keep.unvan)}`,
      keep,
      deleteIds,
      idRemap: Object.fromEntries(deleteIds.map((id) => [id, keep.id])),
    });
  }

  return plans;
}

function findCariForFirma(cariler: CariKart[], firmaAdi: string): CariKart | undefined {
  return cariler.find((c) => firmaEslesir(c.unvan, firmaAdi));
}

function inferFirmaFromKamp(personelId: string, kampKayitlari: KampKaydi[]): string | null {
  const stays = kampKayitlari.filter(
    (k) => k.durum === 'AKTIF' && k.personelId === personelId && !isJunkFirmaAdi(k.calistigiFirma)
  );
  if (stays.length === 0) return null;
  const counts = new Map<string, number>();
  for (const k of stays) {
    const f = String(k.calistigiFirma || '').trim();
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export function planTaseronEnvanterTemizlik(
  cariKartlar: CariKart[],
  personeller: Personel[],
  kampKayitlari: KampKaydi[] = [],
  yoklamalar?: AylikYoklamaMap
): TaseronEnvanterTemizlikPlan {
  const summary: string[] = [];
  const dedupPlans = planCariKartDedup(cariKartlar, personeller);
  const afterDedup = applyCariDedupPlansInMemory(cariKartlar, dedupPlans);
  const fuzzyMergePlans = planFuzzyTaseronCariMerge(afterDedup, personeller);
  const afterMerge = applyCariDedupPlansInMemory(afterDedup, fuzzyMergePlans);

  const junkDeleteIds = dedupPlans.filter((p) => p.junkOnly).flatMap((p) => p.deleteIds);
  if (junkDeleteIds.length > 0) {
    summary.push(`${junkDeleteIds.length} geçersiz cari silinecek (AAA, Y vb.)`);
  }
  if (fuzzyMergePlans.length > 0) {
    summary.push(
      `${fuzzyMergePlans.length} fuzzy birleştirme (ör. EMA + EMA MERMER → ${fuzzyMergePlans.map((p) => p.keep.unvan).join(', ')})`
    );
  }

  const createCariler: CariKart[] = [];
  const personelPatches: Array<{ id: string; patch: Partial<Personel> }> = [];
  const kampPatches: Array<{ id: string; patch: Partial<KampKaydi> }> = [];
  const deletePersonelIds: string[] = [];

  const workingCariler = [...afterMerge, ...createCariler];

  const envanter = buildTaseronFirmaEnvanteri(afterMerge, personeller, kampKayitlari);
  for (const row of envanter) {
    if (row.cari) continue;
    if (isJunkFirmaAdi(row.unvan)) continue;

    const existing = findCariForFirma(workingCariler, row.unvan);
    if (existing) continue;

    const created = buildTaseronCariKart(row.unvan, workingCariler);
    createCariler.push(created);
    workingCariler.push(created);
    summary.push(`Cari'siz "${row.unvan}" → yeni taşeron cari (${created.kod})`);
  }

  const allCariler = [...afterMerge, ...createCariler];
  const fallbackCari =
    findCariForFirma(allCariler, 'TAŞERON') ||
    createCariler.find((c) => firmaAnahtar(c.unvan) === 'taseron') ||
    null;

  for (const p of personeller) {
    if (p.firmaTipi !== 'TASERON' && !p.firmaAdi?.trim()) continue;
    const firma = String(p.firmaAdi || '').trim();

    if (isJunkFirmaAdi(firma)) {
      const inferred = inferFirmaFromKamp(p.id, kampKayitlari);
      const targetCari =
        (inferred && findCariForFirma(allCariler, inferred)) ||
        fallbackCari;

      if (targetCari && inferred) {
        personelPatches.push({
          id: p.id,
          patch: withTaseronPersonelGorev({
            ...p,
            firmaTipi: 'TASERON',
            firmaAdi: targetCari.unvan,
            departman: TASERON_PERSONEL_DEPARTMAN,
          }),
        });
      } else if (targetCari) {
        personelPatches.push({
          id: p.id,
          patch: withTaseronPersonelGorev({
            ...p,
            firmaTipi: 'TASERON',
            firmaAdi: targetCari.unvan,
            departman: TASERON_PERSONEL_DEPARTMAN,
          }),
        });
      }
      continue;
    }

    const matched = findCariForFirma(allCariler, firma);
    if (matched && !firmaEslesir(firma, matched.unvan)) {
      personelPatches.push({
        id: p.id,
        patch: withTaseronPersonelGorev({
          ...p,
          firmaTipi: 'TASERON',
          firmaAdi: matched.unvan,
        }),
      });
    }
  }

  for (const plan of [...dedupPlans, ...fuzzyMergePlans]) {
    if (plan.junkOnly) continue;
    const canon = plan.keep.unvan;
    for (const p of personeller) {
      if (!p.firmaAdi?.trim()) continue;
      const dup = plan.deleteIds
        .map((id) => cariKartlar.find((c) => c.id === id))
        .find((c) => c && firmaEslesir(p.firmaAdi || '', c.unvan));
      if (dup && !personelPatches.some((x) => x.id === p.id)) {
        personelPatches.push({
          id: p.id,
          patch: withTaseronPersonelGorev({
            ...p,
            firmaTipi: 'TASERON',
            firmaAdi: canon,
          }),
        });
      }
    }
    for (const k of kampKayitlari) {
      if (!k.calistigiFirma?.trim()) continue;
      const dup = plan.deleteIds
        .map((id) => cariKartlar.find((c) => c.id === id))
        .find((c) => c && firmaEslesir(k.calistigiFirma || '', c.unvan));
      if (dup && !kampPatches.some((x) => x.id === k.id)) {
        kampPatches.push({ id: k.id, patch: { calistigiFirma: canon } });
      }
    }
  }

  for (const k of kampKayitlari) {
    if (isJunkFirmaAdi(k.calistigiFirma)) {
      const p = k.personelId ? personeller.find((x) => x.id === k.personelId) : undefined;
      const target =
        (p?.firmaAdi && !isJunkFirmaAdi(p.firmaAdi) ? p.firmaAdi : null) ||
        inferFirmaFromKamp(k.personelId || '', kampKayitlari);
      if (target && !kampPatches.some((x) => x.id === k.id)) {
        kampPatches.push({ id: k.id, patch: { calistigiFirma: canonicalFirmaUnvan(target) } });
      }
    }
  }

  if (createCariler.length > 0 && !summary.some((s) => s.startsWith("Cari'siz"))) {
    summary.push(`${createCariler.length} cari'siz firma için taşeron cari kartı oluşturulacak`);
  }
  if (personelPatches.length > 0) {
    summary.push(`${personelPatches.length} personel firma adı düzeltilecek`);
  }
  if (deletePersonelIds.length > 0) {
    summary.push(`${deletePersonelIds.length} geçersiz firma personeli silinecek`);
  }
  if (kampPatches.length > 0) {
    summary.push(`${kampPatches.length} kamp yerleşim firması düzeltilecek`);
  }

  const personelMergePlans = planPersonelDuplicateMerge(personeller, yoklamalar, kampKayitlari);
  if (personelMergePlans.length > 0) {
    summary.push(
      `${personelMergePlans.length} mükerrer personel birleştirilecek (${personelMergePlans
        .map((p) => p.label)
        .slice(0, 5)
        .join(', ')}${personelMergePlans.length > 5 ? '…' : ''})`
    );
  }

  return {
    dedupPlans,
    fuzzyMergePlans,
    createCariler,
    deletePersonelIds,
    personelPatches,
    kampPatches,
    personelMergePlans,
    summary,
  };
}

export type TaseronEnvanterTemizlikResult = {
  cariKartlar: CariKart[];
  personeller: Personel[];
  kampKayitlari: KampKaydi[];
  yoklamalar?: AylikYoklamaMap;
  deletedCariIds: string[];
  deletedPersonelIds: string[];
  mergedPersonelCount: number;
};

export async function applyTaseronEnvanterTemizlik(
  cariKartlar: CariKart[],
  personeller: Personel[],
  kampKayitlari: KampKaydi[],
  plan: TaseronEnvanterTemizlikPlan,
  yoklamalar: AylikYoklamaMap = {}
): Promise<TaseronEnvanterTemizlikResult> {
  let nextCariler = [...cariKartlar];
  const deletedCariIds: string[] = [];

  for (const c of plan.createCariler) {
    await saveDocument('cariKartlar', c);
    nextCariler.push(c);
  }

  for (const p of [...plan.dedupPlans, ...plan.fuzzyMergePlans]) {
    await applyCariDedupPlan(p);
    deletedCariIds.push(...p.deleteIds);
  }
  nextCariler = applyCariDedupPlansInMemory(
    applyCariDedupPlansInMemory(nextCariler, plan.dedupPlans),
    plan.fuzzyMergePlans
  );

  let nextPersoneller = [...personeller];
  for (const { id, patch } of plan.personelPatches) {
    const prev = nextPersoneller.find((p) => p.id === id);
    if (!prev) continue;
    const merged = { ...prev, ...patch };
    await saveDocument('personeller', merged);
    nextPersoneller = nextPersoneller.map((p) => (p.id === id ? merged : p));
  }

  const deletedPersonelIds: string[] = [];
  for (const id of plan.deletePersonelIds) {
    await removeDocument('personeller', id);
    deletedPersonelIds.push(id);
    nextPersoneller = nextPersoneller.filter((p) => p.id !== id);
  }

  let nextKamp = [...kampKayitlari];
  for (const { id, patch } of plan.kampPatches) {
    const prev = nextKamp.find((k) => k.id === id);
    if (!prev) continue;
    const merged = { ...prev, ...patch };
    await saveDocument('kampKayitlari', merged);
    nextKamp = nextKamp.map((k) => (k.id === id ? merged : k));
  }

  let mergedPersonelCount = 0;
  let nextYoklamalar = yoklamalar;
  if (plan.personelMergePlans.length > 0) {
    const mergeResult = await applyPersonelDuplicateMerge(
      nextPersoneller,
      plan.personelMergePlans,
      yoklamalar,
      nextKamp
    );
    nextPersoneller = mergeResult.personeller;
    nextYoklamalar = mergeResult.yoklamalar;
    deletedPersonelIds.push(...plan.personelMergePlans.flatMap((p) => p.deleteIds));
    mergedPersonelCount = mergeResult.mergedCount;
    for (const mp of plan.personelMergePlans) {
      nextKamp = nextKamp.map((k) =>
        mp.deleteIds.includes(k.personelId || '') ? { ...k, personelId: mp.keepId } : k
      );
    }
  }

  return {
    cariKartlar: nextCariler,
    personeller: nextPersoneller,
    kampKayitlari: nextKamp,
    yoklamalar: nextYoklamalar,
    deletedCariIds,
    deletedPersonelIds,
    mergedPersonelCount,
  };
}

export function previewTaseronEnvanterTemizlik(
  cariKartlar: CariKart[],
  personeller: Personel[],
  kampKayitlari: KampKaydi[] = [],
  yoklamalar?: AylikYoklamaMap
): TaseronEnvanterTemizlikPlan {
  return planTaseronEnvanterTemizlik(cariKartlar, personeller, kampKayitlari, yoklamalar);
}
