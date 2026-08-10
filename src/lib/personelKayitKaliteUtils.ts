import type { AylikYoklamaMap, Personel } from '../types/erp';
import { levenshteinDistance, normalizeStockCompareName } from './duplicateNameUtils';
import { validateTC } from './personelOdemeUtils';
import { asYoklamaGunMap, isTaseronPersonel, normalizeTurkishName } from './yoklamaUtils';

export type PersonelKayitSorunu =
  | 'CIFT_ISIM'
  | 'YAKIN_ISIM'
  | 'CIFT_TC'
  | 'ISIMDE_RAKAM'
  | 'GECERSIZ_ISIM'
  | 'TEK_KELIME_ISIM'
  | 'GECERSIZ_TC'
  | 'LEGACY_KAYIT'
  | 'YAPAY_IMPORT'
  | 'YOKLAMA_YETIM'
  | 'EKSIK_BILGI';

export const PERSONEL_SORUN_LABEL: Record<PersonelKayitSorunu, string> = {
  CIFT_ISIM: 'Çift İsim',
  YAKIN_ISIM: 'Yakın İsim',
  CIFT_TC: 'Çift TC',
  ISIMDE_RAKAM: 'İsimde Rakam',
  GECERSIZ_ISIM: 'Geçersiz İsim',
  TEK_KELIME_ISIM: 'Tek Kelime İsim',
  GECERSIZ_TC: 'Geçersiz TC',
  LEGACY_KAYIT: 'Excel Import',
  YAPAY_IMPORT: 'Eksik Import Profili',
  YOKLAMA_YETIM: 'Yetim Yoklama ID',
  EKSIK_BILGI: 'Eksik Bilgi',
};

/** Sorunlu kayıt filtresine giren gerçek hatalar */
export const KRITIK_PERSONEL_SORUNLARI: PersonelKayitSorunu[] = [
  'CIFT_ISIM',
  'YAKIN_ISIM',
  'CIFT_TC',
  'ISIMDE_RAKAM',
  'GECERSIZ_ISIM',
  'TEK_KELIME_ISIM',
  'GECERSIZ_TC',
];

export function isKritikPersonelSorunu(sorun: PersonelKayitSorunu): boolean {
  return KRITIK_PERSONEL_SORUNLARI.includes(sorun);
}

export type PersonelKaliteOptions = {
  yoklamalar?: AylikYoklamaMap;
  /** Yakın isim Levenshtein eşiği (varsayılan 2) */
  nearDuplicateMaxDistance?: number;
};

export function personelAdSoyadKey(p: Pick<Personel, 'ad' | 'soyad'>): string {
  return normalizeTurkishName(`${String(p.ad || '').trim()} ${String(p.soyad || '').trim()}`);
}

export function personelCompareNameKey(p: Pick<Personel, 'ad' | 'soyad'>): string {
  return normalizeStockCompareName(`${String(p.ad || '').trim()} ${String(p.soyad || '').trim()}`);
}

function personelFirmaScopeKey(p: Personel): string {
  if (isTaseronPersonel(p)) {
    return `T:${String(p.firmaAdi || 'TASERON').trim().toLocaleUpperCase('tr-TR')}`;
  }
  return 'ANA_FIRMA';
}

export function isimdeRakamVar(p: Pick<Personel, 'ad' | 'soyad'>): boolean {
  return /\d/.test(String(p.ad || '')) || /\d/.test(String(p.soyad || ''));
}

const PLACEHOLDER_NAME_RE =
  /^(test|deneme|xxx+|yok|bilinmiyor|personel|ad\s*soyad|isimsiz|dummy|null|undefined|bilinmeyen|unknown)$/i;

/** Tek harf, boş, placeholder vb. */
export function gecersizIsimKaydi(p: Pick<Personel, 'ad' | 'soyad'>): boolean {
  const ad = String(p.ad || '').trim();
  const soyad = String(p.soyad || '').trim();
  if (!ad || !soyad) return true;
  if (ad.length < 2 || soyad.length < 2) return true;
  if (PLACEHOLDER_NAME_RE.test(ad) || PLACEHOLDER_NAME_RE.test(soyad)) return true;
  if (/^[^a-zA-ZçğıöşüÇĞİÖŞÜ]+$/.test(ad) || /^[^a-zA-ZçğıöşüÇĞİÖŞÜ]+$/.test(soyad)) return true;
  return false;
}

/** AI / Excel import — ad-soyad tek alana yazılmış */
export function tekKelimeIsimKaydi(p: Pick<Personel, 'ad' | 'soyad'>): boolean {
  const ad = String(p.ad || '').trim();
  const soyad = String(p.soyad || '').trim();
  if (!soyad && ad.split(/\s+/).length >= 2) return true;
  if (soyad.length === 1 && ad.length >= 2) return true;
  return false;
}

export function gecersizTcKaydi(p: Pick<Personel, 'tcNo'>): boolean {
  const tc = String(p.tcNo || '').trim();
  if (!tc) return false;
  return !validateTC(tc);
}

/** PRS-LEGACY-* — eski Excel / otomatik yoklama import kimliği */
export function legacyImportKaydi(p: Pick<Personel, 'id'>): boolean {
  return /^PRS-LEGACY/i.test(String(p.id || ''));
}

/** createMinimalPersonel / AI yoklama import parmak izi — geçerli kadro kaydı değilse */
export function yapayImportKaydi(p: Personel, yoklamalar?: AylikYoklamaMap): boolean {
  if (isGercekCalisanImportKaydi(p, yoklamalar)) return false;

  const noTc = !String(p.tcNo || '').trim();
  const noTel = !String(p.telefonNo || '').trim();
  const defaultDogum = String(p.dogumTarihi || '').startsWith('1990-01-01');
  const defaultAdres = String(p.adres || '').includes('Yüksekova Konut');
  const sigortasiz = String(p.sgkDurumu || '').trim() === 'Sigortasız';

  if (legacyImportKaydi(p)) {
    return noTc && !personHasYoklamaData(yoklamalar, p.id);
  }

  return noTc && noTel && sigortasiz && (defaultDogum || defaultAdres);
}

/** Excel/AI import ile açılmış ama yoklama/kimlik ile doğrulanmış gerçek çalışan */
export function isGercekCalisanImportKaydi(
  p: Personel,
  yoklamalar?: AylikYoklamaMap
): boolean {
  if (gecersizIsimKaydi(p)) return false;
  const hasTc = validateTC(String(p.tcNo || '').trim());
  const hasYoklama = personHasYoklamaData(yoklamalar, p.id);
  const hasHire = Boolean(String(p.iseGirisTarihi || '').trim());
  if (p.kaynak === 'LEGACY_IMPORT' && hasHire && (hasTc || hasYoklama)) return true;
  if (!legacyImportKaydi(p) && p.kaynak !== 'LEGACY_IMPORT') {
    return hasHire && (hasTc || hasYoklama) && !yapayImportStubFingerprint(p);
  }
  return hasHire && (hasTc || hasYoklama);
}

function yapayImportStubFingerprint(p: Personel): boolean {
  const noTc = !String(p.tcNo || '').trim();
  const noTel = !String(p.telefonNo || '').trim();
  const defaultDogum = String(p.dogumTarihi || '').startsWith('1990-01-01');
  const defaultAdres = String(p.adres || '').includes('Yüksekova Konut');
  const sigortasiz = String(p.sgkDurumu || '').trim() === 'Sigortasız';
  return noTc && noTel && sigortasiz && (defaultDogum || defaultAdres);
}

export function eksikKritikBilgi(p: Personel): boolean {
  return !String(p.ad || '').trim() || !String(p.soyad || '').trim();
}

export function eksikTemelBilgi(p: Personel): boolean {
  return eksikKritikBilgi(p) || !String(p.iseGirisTarihi || '').trim();
}

function personHasYoklamaData(yoklamalar: AylikYoklamaMap | undefined, personelId: string): boolean {
  if (!yoklamalar) return false;
  const map = asYoklamaGunMap(yoklamalar[personelId]);
  if (!map) return false;
  return Object.values(map).some((d) => d?.durum && d.durum !== 'Girilmedi');
}

export type PersonelKaliteIndex = {
  issuesById: Map<string, PersonelKayitSorunu[]>;
  problematicIds: Set<string>;
  duplicateNameGroups: Array<[string, Personel[]]>;
  nearDuplicateNameGroups: Array<{ label: string; members: Personel[]; distance: number }>;
  duplicateNameIds: Set<string>;
  nearDuplicateNameIds: Set<string>;
  duplicateTcIds: Set<string>;
  digitNameIds: Set<string>;
  invalidNameIds: Set<string>;
  tekKelimeIsimIds: Set<string>;
  invalidTcIds: Set<string>;
  legacyImportIds: Set<string>;
  yapayImportIds: Set<string>;
  importKaynakIds: Set<string>;
  orphanYoklamaIds: string[];
};

function pushIssue(
  issuesById: Map<string, PersonelKayitSorunu[]>,
  personelId: string,
  sorun: PersonelKayitSorunu
) {
  const list = issuesById.get(personelId) || [];
  if (!list.includes(sorun)) list.push(sorun);
  issuesById.set(personelId, list);
}

function findNearDuplicateGroups(
  personeller: Personel[],
  maxDistance: number
): Array<{ label: string; members: Personel[]; distance: number }> {
  const byScope = new Map<string, Personel[]>();
  for (const p of personeller) {
    const scope = personelFirmaScopeKey(p);
    const list = byScope.get(scope) || [];
    list.push(p);
    byScope.set(scope, list);
  }

  const groups: Array<{ label: string; members: Personel[]; distance: number }> = [];
  const seenPair = new Set<string>();

  for (const pool of byScope.values()) {
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const a = pool[i];
        const b = pool[j];
        const keyA = personelCompareNameKey(a);
        const keyB = personelCompareNameKey(b);
        if (!keyA || !keyB || keyA.length < 5 || keyB.length < 5) continue;
        if (keyA === keyB) continue;
        const dist = levenshteinDistance(keyA, keyB);
        if (dist < 1 || dist > maxDistance) continue;
        const pairKey = [a.id, b.id].sort().join('|');
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        groups.push({
          label: `${a.ad} ${a.soyad} ~ ${b.ad} ${b.soyad}`,
          members: [a, b],
          distance: dist,
        });
      }
    }
  }

  return groups.sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label, 'tr'));
}

export function buildPersonelKaliteIndex(
  personeller: Personel[],
  options?: PersonelKaliteOptions
): PersonelKaliteIndex {
  const yoklamalar = options?.yoklamalar;
  const nearDuplicateMaxDistance = options?.nearDuplicateMaxDistance ?? 2;

  const nameCount = new Map<string, number>();
  const tcCount = new Map<string, number>();
  const byName = new Map<string, Personel[]>();
  const personelIdSet = new Set(personeller.map((p) => p.id));

  for (const p of personeller) {
    const name = personelAdSoyadKey(p);
    if (name.length >= 3) {
      nameCount.set(name, (nameCount.get(name) || 0) + 1);
      const list = byName.get(name) || [];
      list.push(p);
      byName.set(name, list);
    }
    const tc = String(p.tcNo || '').trim();
    if (tc) tcCount.set(tc, (tcCount.get(tc) || 0) + 1);
  }

  const issuesById = new Map<string, PersonelKayitSorunu[]>();
  const duplicateNameIds = new Set<string>();
  const duplicateTcIds = new Set<string>();
  const digitNameIds = new Set<string>();
  const invalidNameIds = new Set<string>();
  const tekKelimeIsimIds = new Set<string>();
  const invalidTcIds = new Set<string>();
  const legacyImportIds = new Set<string>();
  const yapayImportIds = new Set<string>();
  const importKaynakIds = new Set<string>();

  for (const p of personeller) {
    const name = personelAdSoyadKey(p);
    if (name.length >= 3 && (nameCount.get(name) || 0) > 1) {
      pushIssue(issuesById, p.id, 'CIFT_ISIM');
      duplicateNameIds.add(p.id);
    }
    const tc = String(p.tcNo || '').trim();
    if (tc && (tcCount.get(tc) || 0) > 1) {
      pushIssue(issuesById, p.id, 'CIFT_TC');
      duplicateTcIds.add(p.id);
    }
    if (isimdeRakamVar(p)) {
      pushIssue(issuesById, p.id, 'ISIMDE_RAKAM');
      digitNameIds.add(p.id);
    }
    if (gecersizIsimKaydi(p)) {
      pushIssue(issuesById, p.id, 'GECERSIZ_ISIM');
      invalidNameIds.add(p.id);
    }
    if (tekKelimeIsimKaydi(p)) {
      pushIssue(issuesById, p.id, 'TEK_KELIME_ISIM');
      tekKelimeIsimIds.add(p.id);
    }
    if (gecersizTcKaydi(p)) {
      pushIssue(issuesById, p.id, 'GECERSIZ_TC');
      invalidTcIds.add(p.id);
    }

    const gercekImportCalisan = isGercekCalisanImportKaydi(p, yoklamalar);

    if (gercekImportCalisan) {
      importKaynakIds.add(p.id);
      if (legacyImportKaydi(p) || p.kaynak === 'LEGACY_IMPORT') {
        legacyImportIds.add(p.id);
      }
    } else {
      if (legacyImportKaydi(p)) {
        pushIssue(issuesById, p.id, 'LEGACY_KAYIT');
        legacyImportIds.add(p.id);
      }
      if (yapayImportKaydi(p, yoklamalar)) {
        pushIssue(issuesById, p.id, 'YAPAY_IMPORT');
        yapayImportIds.add(p.id);
      }
    }

    if (eksikKritikBilgi(p)) {
      pushIssue(issuesById, p.id, 'EKSIK_BILGI');
    }
  }

  const nearDuplicateNameGroups = findNearDuplicateGroups(personeller, nearDuplicateMaxDistance);
  const nearDuplicateNameIds = new Set<string>();
  for (const group of nearDuplicateNameGroups) {
    for (const p of group.members) {
      pushIssue(issuesById, p.id, 'YAKIN_ISIM');
      nearDuplicateNameIds.add(p.id);
    }
  }

  const orphanYoklamaIds = yoklamalar
    ? Object.keys(yoklamalar).filter((id) => !personelIdSet.has(id))
    : [];

  const duplicateNameGroups = [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'tr'))
    .map(([, list]) => {
      const label = `${list[0].ad} ${list[0].soyad}`.trim().toLocaleLowerCase('tr-TR');
      return [label, list] as [string, Personel[]];
    });

  const problematicIds = new Set<string>();
  for (const [personelId, issues] of issuesById) {
    if (issues.some(isKritikPersonelSorunu)) {
      problematicIds.add(personelId);
    }
  }

  return {
    issuesById,
    problematicIds,
    duplicateNameGroups,
    nearDuplicateNameGroups,
    duplicateNameIds,
    nearDuplicateNameIds,
    duplicateTcIds,
    digitNameIds,
    invalidNameIds,
    tekKelimeIsimIds,
    invalidTcIds,
    legacyImportIds,
    yapayImportIds,
    importKaynakIds,
    orphanYoklamaIds,
  };
}

export function personelKaliteSorunlari(
  index: PersonelKaliteIndex,
  personelId: string
): PersonelKayitSorunu[] {
  return index.issuesById.get(personelId) || [];
}

export function formatPersonelKaliteOzet(index: PersonelKaliteIndex): string {
  const parts: string[] = [];
  if (index.duplicateNameGroups.length > 0) {
    parts.push(`${index.duplicateNameGroups.length} çift isim`);
  }
  if (index.nearDuplicateNameGroups.length > 0) {
    parts.push(`${index.nearDuplicateNameGroups.length} yakın isim`);
  }
  if (index.digitNameIds.size > 0) parts.push(`${index.digitNameIds.size} isimde rakam`);
  if (index.invalidNameIds.size > 0) parts.push(`${index.invalidNameIds.size} geçersiz isim`);
  if (index.tekKelimeIsimIds.size > 0) parts.push(`${index.tekKelimeIsimIds.size} tek kelime`);
  if (index.invalidTcIds.size > 0) parts.push(`${index.invalidTcIds.size} geçersiz TC`);
  if (index.yapayImportIds.size > 0) parts.push(`${index.yapayImportIds.size} eksik import profili`);
  if (index.orphanYoklamaIds.length > 0) {
    parts.push(`${index.orphanYoklamaIds.length} yetim yoklama ID`);
  }
  parts.push(`${index.problematicIds.size} gerçek sorunlu`);
  return parts.join(' · ');
}
