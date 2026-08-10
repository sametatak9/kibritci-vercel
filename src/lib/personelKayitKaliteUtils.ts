import { Personel } from '../types/erp';

export type PersonelKayitSorunu =
  | 'CIFT_ISIM'
  | 'CIFT_TC'
  | 'ISIMDE_RAKAM'
  | 'GECERSIZ_ISIM'
  | 'EKSIK_BILGI';

export const PERSONEL_SORUN_LABEL: Record<PersonelKayitSorunu, string> = {
  CIFT_ISIM: 'Çift İsim',
  CIFT_TC: 'Çift TC',
  ISIMDE_RAKAM: 'İsimde Rakam',
  GECERSIZ_ISIM: 'Geçersiz İsim',
  EKSIK_BILGI: 'Eksik Bilgi',
};

export function personelAdSoyadKey(p: Pick<Personel, 'ad' | 'soyad'>): string {
  return `${String(p.ad || '').trim()} ${String(p.soyad || '').trim()}`.trim().toLowerCase();
}

export function isimdeRakamVar(p: Pick<Personel, 'ad' | 'soyad'>): boolean {
  return /\d/.test(String(p.ad || '')) || /\d/.test(String(p.soyad || ''));
}

const PLACEHOLDER_NAME_RE =
  /^(test|deneme|xxx+|yok|bilinmiyor|personel|ad\s*soyad|isimsiz|dummy|null|undefined)$/i;

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

export function eksikTemelBilgi(p: Personel): boolean {
  return !String(p.ad || '').trim() || !String(p.soyad || '').trim() || !String(p.iseGirisTarihi || '').trim();
}

export type PersonelKaliteIndex = {
  issuesById: Map<string, PersonelKayitSorunu[]>;
  problematicIds: Set<string>;
  duplicateNameGroups: Array<[string, Personel[]]>;
  duplicateNameIds: Set<string>;
  duplicateTcIds: Set<string>;
  digitNameIds: Set<string>;
  invalidNameIds: Set<string>;
};

export function buildPersonelKaliteIndex(personeller: Personel[]): PersonelKaliteIndex {
  const nameCount = new Map<string, number>();
  const tcCount = new Map<string, number>();
  const byName = new Map<string, Personel[]>();

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

  for (const p of personeller) {
    const issues: PersonelKayitSorunu[] = [];
    const name = personelAdSoyadKey(p);
    if (name.length >= 3 && (nameCount.get(name) || 0) > 1) {
      issues.push('CIFT_ISIM');
      duplicateNameIds.add(p.id);
    }
    const tc = String(p.tcNo || '').trim();
    if (tc && (tcCount.get(tc) || 0) > 1) {
      issues.push('CIFT_TC');
      duplicateTcIds.add(p.id);
    }
    if (isimdeRakamVar(p)) {
      issues.push('ISIMDE_RAKAM');
      digitNameIds.add(p.id);
    }
    if (gecersizIsimKaydi(p)) {
      issues.push('GECERSIZ_ISIM');
      invalidNameIds.add(p.id);
    }
    if (eksikTemelBilgi(p)) {
      issues.push('EKSIK_BILGI');
    }
    if (issues.length > 0) issuesById.set(p.id, issues);
  }

  const duplicateNameGroups = [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'tr'));

  return {
    issuesById,
    problematicIds: new Set(issuesById.keys()),
    duplicateNameGroups,
    duplicateNameIds,
    duplicateTcIds,
    digitNameIds,
    invalidNameIds,
  };
}

export function personelKaliteSorunlari(
  index: PersonelKaliteIndex,
  personelId: string
): PersonelKayitSorunu[] {
  return index.issuesById.get(personelId) || [];
}
