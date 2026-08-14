import type { Personel } from '../types/erp';

/** Puantaj etiket grupları — yoklama meslek etiketinden bağımsız kadro takibi */
export const PERSONEL_TAKIP_ETIKET_ONSETLERI = ['ZER YAPI'] as const;

export function normalizePersonelTakipEtiketi(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

export function isBuiltinPersonelTakipEtiketi(raw?: string | null): boolean {
  const k = normalizePersonelTakipEtiketi(raw);
  return (PERSONEL_TAKIP_ETIKET_ONSETLERI as readonly string[]).includes(k);
}

export function personelTakipEtiketDocId(raw: string): string {
  const n = normalizePersonelTakipEtiketi(raw);
  return n.replace(/[/#[\]]/g, '_').slice(0, 120) || 'etiket';
}

export function listPersonelTakipEtiketleri(p?: Personel): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of p?.takipEtiketleri || []) {
    const k = normalizePersonelTakipEtiketi(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function personelHasTakipEtiketi(p: Personel | undefined, etiket: string): boolean {
  if (!p) return false;
  const k = normalizePersonelTakipEtiketi(etiket);
  if (!k) return false;
  return listPersonelTakipEtiketleri(p).includes(k);
}

export function withPersonelTakipEtiketi(p: Personel, etiket: string, on: boolean): Personel {
  const k = normalizePersonelTakipEtiketi(etiket);
  if (!k) return p;
  const set = new Set(listPersonelTakipEtiketleri(p));
  if (on) set.add(k);
  else set.delete(k);
  return { ...p, takipEtiketleri: Array.from(set) };
}

export function collectUsedPersonelTakipEtiketleri(personeller: Personel[]): string[] {
  const set = new Set<string>();
  for (const p of personeller || []) {
    for (const e of listPersonelTakipEtiketleri(p)) set.add(e);
  }
  return [...set];
}

export function mergePersonelTakipEtiketKatalogu(
  parts: Array<Iterable<string> | undefined> = []
): string[] {
  const set = new Set<string>(PERSONEL_TAKIP_ETIKET_ONSETLERI);
  for (const part of parts) {
    if (!part) continue;
    for (const raw of part) {
      const e = normalizePersonelTakipEtiketi(raw);
      if (e) set.add(e);
    }
  }
  const known = PERSONEL_TAKIP_ETIKET_ONSETLERI as readonly string[];
  return [...set].sort((a, b) => {
    const ia = known.indexOf(a);
    const ib = known.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'tr');
  });
}
