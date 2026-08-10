import type { AylikYoklamaMap, GunlukYoklama, KampKaydi, Personel } from '../types/erp';
import { personelAdSoyadKey } from './personelKayitKaliteUtils';
import { removeDocument, saveDocument } from './firebase';
import { validateTC } from './personelOdemeUtils';
import { canonicalFirmaUnvan } from './firmaCanonicalUtils';
import { asYoklamaGunMap } from './yoklamaUtils';
import { firmaEslesir, isTaseronPersonelRecord, withTaseronPersonelGorev } from './taseronUtils';

const digitsOnly = (raw: string) => String(raw || '').replace(/\D/g, '');

function personHasYoklamaData(yoklamalar: AylikYoklamaMap | undefined, personelId: string): boolean {
  if (!yoklamalar) return false;
  const map = asYoklamaGunMap(yoklamalar[personelId]);
  if (!map) return false;
  return Object.values(map).some((d) => d?.durum && d.durum !== 'Girilmedi');
}

function countYoklamaDays(yoklamalar: AylikYoklamaMap | undefined, personelId: string): number {
  const map = asYoklamaGunMap(yoklamalar?.[personelId]);
  if (!map) return 0;
  return Object.values(map).filter((d) => d?.durum && d.durum !== 'Girilmedi').length;
}

function samePersonelFirmaScope(a: Personel, b: Personel): boolean {
  const aTaseron = isTaseronPersonelRecord(a);
  const bTaseron = isTaseronPersonelRecord(b);
  if (aTaseron || bTaseron) {
    return firmaEslesir(a.firmaAdi || '', b.firmaAdi || '');
  }
  return !aTaseron && !bTaseron;
}

function scorePersonelCanonical(p: Personel, yoklamalar?: AylikYoklamaMap): number {
  let score = 0;
  score += countYoklamaDays(yoklamalar, p.id) * 20;
  if (personHasYoklamaData(yoklamalar, p.id)) score += 200;
  if (validateTC(digitsOnly(p.tcNo || ''))) score += 150;
  if (p.id.startsWith('PRS-')) score += 80;
  if (p.id.startsWith('PRS-YEDITEPE-')) score += 40;
  if (p.fotografUrl) score += 15;
  if (p.ibanNo) score += 10;
  if (p.telefonNo) score += 8;
  if (p.iseGirisTarihi) score += 5;
  if (p.durum !== false) score += 3;
  score += Object.values(p).filter((v) => String(v || '').trim()).length;
  return score;
}

function mergePersonelFields(members: Personel[], yoklamalar?: AylikYoklamaMap): Personel {
  const sorted = [...members].sort(
    (a, b) => scorePersonelCanonical(b, yoklamalar) - scorePersonelCanonical(a, yoklamalar)
  );
  const base = sorted[0];
  const merged: Personel = { ...base };

  for (const p of sorted.slice(1)) {
    merged.tcNo = merged.tcNo?.trim() || p.tcNo?.trim() || merged.tcNo;
    merged.telefonNo = merged.telefonNo?.trim() || p.telefonNo?.trim() || merged.telefonNo;
    merged.eposta = merged.eposta?.trim() || p.eposta?.trim() || merged.eposta;
    merged.adres = merged.adres?.trim() || p.adres?.trim() || merged.adres;
    merged.ibanNo = merged.ibanNo?.trim() || p.ibanNo?.trim() || merged.ibanNo;
    merged.fotografUrl = merged.fotografUrl || p.fotografUrl;
    merged.sigortaEvrakUrl = merged.sigortaEvrakUrl || p.sigortaEvrakUrl;
    merged.iseGirisTarihi = merged.iseGirisTarihi || p.iseGirisTarihi;
    merged.babaAdi = merged.babaAdi?.trim() || p.babaAdi?.trim() || merged.babaAdi;
    merged.dogumTarihi = merged.dogumTarihi?.trim() || p.dogumTarihi?.trim() || merged.dogumTarihi;
    if (!merged.firmaAdi?.trim() && p.firmaAdi?.trim()) merged.firmaAdi = p.firmaAdi;
    if (!merged.firmaTipi && p.firmaTipi) merged.firmaTipi = p.firmaTipi;
  }

  if (merged.firmaAdi) {
    merged.firmaAdi = canonicalFirmaUnvan(merged.firmaAdi);
  }

  return withTaseronPersonelGorev(merged);
}

function mergePersonYoklama(
  keep: GunlukYoklama | undefined,
  dupe: GunlukYoklama | undefined
): GunlukYoklama {
  const result: GunlukYoklama = { ...(keep || {}) };
  for (const [day, data] of Object.entries(dupe || {})) {
    const dayNum = Number(day);
    if (!data) continue;
    const existing = result[dayNum];
    if (!existing || !existing.durum || existing.durum === 'Girilmedi') {
      result[dayNum] = data;
    }
  }
  return result;
}

export type PersonelDuplicateMergePlan = {
  keepId: string;
  deleteIds: string[];
  merged: Personel;
  label: string;
  kampPatchIds: string[];
};

export function planPersonelDuplicateMerge(
  personeller: Personel[],
  yoklamalar?: AylikYoklamaMap,
  kampKayitlari: KampKaydi[] = []
): PersonelDuplicateMergePlan[] {
  const plans: PersonelDuplicateMergePlan[] = [];
  const consumed = new Set<string>();

  const tcGroups = new Map<string, Personel[]>();
  for (const p of personeller) {
    const tc = digitsOnly(p.tcNo || '');
    if (!validateTC(tc)) continue;
    const list = tcGroups.get(tc) || [];
    list.push(p);
    tcGroups.set(tc, list);
  }

  for (const [, group] of tcGroups) {
    if (group.length < 2) continue;
    const members = group.filter((p) => !consumed.has(p.id));
    if (members.length < 2) continue;

    const sorted = [...members].sort(
      (a, b) => scorePersonelCanonical(b, yoklamalar) - scorePersonelCanonical(a, yoklamalar)
    );
    const keep = sorted[0];
    const deleteIds = sorted.slice(1).map((p) => p.id);
    deleteIds.forEach((id) => consumed.add(id));
    consumed.add(keep.id);

    plans.push({
      keepId: keep.id,
      deleteIds,
      merged: mergePersonelFields(members, yoklamalar),
      label: `${keep.ad} ${keep.soyad} (TC ×${members.length})`,
      kampPatchIds: kampKayitlari
        .filter((k) => deleteIds.includes(k.personelId || ''))
        .map((k) => k.id),
    });
  }

  const nameGroups = new Map<string, Personel[]>();
  for (const p of personeller) {
    if (consumed.has(p.id)) continue;
    const name = personelAdSoyadKey(p);
    if (name.length < 5) continue;
    const list = nameGroups.get(name) || [];
    list.push(p);
    nameGroups.set(name, list);
  }

  for (const [, rawGroup] of nameGroups) {
    if (rawGroup.length < 2) continue;

    const firmaClusters: Personel[][] = [];
    for (const p of rawGroup) {
      if (consumed.has(p.id)) continue;
      let cluster = firmaClusters.find((c) => c.some((x) => samePersonelFirmaScope(x, p)));
      if (!cluster) {
        cluster = [];
        firmaClusters.push(cluster);
      }
      cluster.push(p);
    }

    for (const members of firmaClusters) {
      const activeMembers = members.filter((p) => !consumed.has(p.id));
      if (activeMembers.length < 2) continue;

      const sorted = [...activeMembers].sort(
        (a, b) => scorePersonelCanonical(b, yoklamalar) - scorePersonelCanonical(a, yoklamalar)
      );
      const keep = sorted[0];
      const deleteIds = sorted.slice(1).map((p) => p.id);
      deleteIds.forEach((id) => consumed.add(id));
      consumed.add(keep.id);

      plans.push({
        keepId: keep.id,
        deleteIds,
        merged: mergePersonelFields(activeMembers, yoklamalar),
        label: `${keep.ad} ${keep.soyad} (isim ×${activeMembers.length})`,
        kampPatchIds: kampKayitlari
          .filter((k) => deleteIds.includes(k.personelId || ''))
          .map((k) => k.id),
      });
    }
  }

  return plans;
}

export type PersonelDuplicateMergeResult = {
  personeller: Personel[];
  yoklamalar: AylikYoklamaMap;
  mergedCount: number;
  deletedCount: number;
};

export async function applyPersonelDuplicateMerge(
  personeller: Personel[],
  plans: PersonelDuplicateMergePlan[],
  yoklamalar: AylikYoklamaMap = {},
  kampKayitlari: KampKaydi[] = []
): Promise<PersonelDuplicateMergeResult> {
  let nextPersoneller = [...personeller];
  let nextYoklamalar: AylikYoklamaMap = { ...yoklamalar };
  let mergedCount = 0;
  let deletedCount = 0;

  for (const plan of plans) {
    const merged = { ...plan.merged, id: plan.keepId };
    await saveDocument('personeller', merged);
    nextPersoneller = nextPersoneller.map((p) => (p.id === plan.keepId ? merged : p));
    mergedCount += 1;

    for (const delId of plan.deleteIds) {
      if (nextYoklamalar[delId]) {
        nextYoklamalar[plan.keepId] = mergePersonYoklama(
          nextYoklamalar[plan.keepId],
          nextYoklamalar[delId]
        );
        delete nextYoklamalar[delId];
      }
      await removeDocument('personeller', delId);
      nextPersoneller = nextPersoneller.filter((p) => p.id !== delId);
      deletedCount += 1;
    }

    for (const kamp of kampKayitlari) {
      if (!plan.deleteIds.includes(kamp.personelId || '')) continue;
      const patched = { ...kamp, personelId: plan.keepId };
      await saveDocument('kampKayitlari', patched);
    }
  }

  return { personeller: nextPersoneller, yoklamalar: nextYoklamalar, mergedCount, deletedCount };
}
