/** Günlük yoklama meslek / iş grubu etiketleri (görevden bağımsız: ne iş yaptıkları) */

export const YOKLAMA_MESLEK_ETIKETLERI = [
  'KIRIM İŞLERİ',
  'DRENAJ İŞLERİ',
  'KABA İNŞAAT',
  'KALIP',
  'DEMİR',
  'BETON',
  'TESİSAT',
  'SIVA / ALÇI',
  'BOYA',
  'PEYZAJ',
  'KAMP',
  'MAKİNE / OPERATÖR',
  'DİĞER',
] as const;

export const YOKLAMA_ETIKETSIZ = 'ETİKETSİZ';

export function normalizeYoklamaEtiketi(raw?: string | null): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  return t.toLocaleUpperCase('tr-TR');
}

export function isBuiltinYoklamaEtiketi(raw?: string | null): boolean {
  const k = normalizeYoklamaEtiketi(raw);
  return (YOKLAMA_MESLEK_ETIKETLERI as readonly string[]).includes(k);
}

export function yoklamaEtiketDocId(raw: string): string {
  const n = normalizeYoklamaEtiketi(raw);
  return n.replace(/[/#[\]]/g, '_').slice(0, 120) || 'etiket';
}

/** Ön tanımlı + kayıtlı + yoklamada kullanılmış etiketleri tek listede birleştir */
export function mergeYoklamaEtiketKatalogu(parts: Array<Iterable<string> | undefined> = []): string[] {
  const set = new Set<string>(YOKLAMA_MESLEK_ETIKETLERI);
  for (const part of parts) {
    if (!part) continue;
    for (const raw of part) {
      const e = normalizeYoklamaEtiketi(raw);
      if (e) set.add(e);
    }
  }
  const known = YOKLAMA_MESLEK_ETIKETLERI as readonly string[];
  return [...set].sort((a, b) => {
    const ia = known.indexOf(a);
    const ib = known.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'tr');
  });
}

export function yoklamaEtiketOptionsWithCustom(
  current?: string | null,
  extras: Array<Iterable<string> | undefined> = []
): string[] {
  return mergeYoklamaEtiketKatalogu([current ? [current] : [], ...extras]);
}

/** Yoklama haritasındaki tüm gün etiketlerini topla — geçmiş iş girişleri kaybolmasın */
export function collectUsedYoklamaEtiketleri(
  map: Record<string, Record<string, { isEtiketi?: string } | undefined> | undefined> | undefined
): string[] {
  const set = new Set<string>();
  for (const personMap of Object.values(map || {})) {
    if (!personMap || typeof personMap !== 'object') continue;
    for (const data of Object.values(personMap)) {
      const etiket = normalizeYoklamaEtiketi(data?.isEtiketi);
      if (etiket) set.add(etiket);
    }
  }
  return [...set];
}

export function yoklamaEtiketBadgeClass(etiket?: string | null): string {
  const k = normalizeYoklamaEtiketi(etiket);
  switch (k) {
    case 'KIRIM İŞLERİ':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'DRENAJ İŞLERİ':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'KABA İNŞAAT':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    case 'KALIP':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'DEMİR':
      return 'bg-slate-100 text-slate-800 border-slate-300';
    case 'BETON':
      return 'bg-stone-100 text-stone-800 border-stone-300';
    case 'TESİSAT':
      return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    case 'SIVA / ALÇI':
      return 'bg-lime-50 text-lime-800 border-lime-200';
    case 'BOYA':
      return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200';
    case 'PEYZAJ':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'KAMP':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'MAKİNE / OPERATÖR':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export interface YoklamaEtiketOzeti {
  etiket: string;
  adet: number;
  geldi: number;
  mesaiToplam: number;
}

export function buildYoklamaEtiketOzeti(
  rows: Array<{ isEtiketi?: string; durum?: string; mesaiSaati?: number }>
): YoklamaEtiketOzeti[] {
  const buckets = new Map<string, YoklamaEtiketOzeti>();
  const ensure = (etiket: string) => {
    let row = buckets.get(etiket);
    if (!row) {
      row = { etiket, adet: 0, geldi: 0, mesaiToplam: 0 };
      buckets.set(etiket, row);
    }
    return row;
  };

  for (const r of rows) {
    const etiket = normalizeYoklamaEtiketi(r.isEtiketi) || YOKLAMA_ETIKETSIZ;
    const row = ensure(etiket);
    row.adet += 1;
    row.mesaiToplam += Number(r.mesaiSaati) || 0;
    if (r.durum === 'Geldi') row.geldi += 1;
  }

  const known = YOKLAMA_MESLEK_ETIKETLERI as readonly string[];
  return [...buckets.values()].sort((a, b) => {
    if (a.etiket === YOKLAMA_ETIKETSIZ) return 1;
    if (b.etiket === YOKLAMA_ETIKETSIZ) return -1;
    const ia = known.indexOf(a.etiket);
    const ib = known.indexOf(b.etiket);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.etiket.localeCompare(b.etiket, 'tr');
  });
}
