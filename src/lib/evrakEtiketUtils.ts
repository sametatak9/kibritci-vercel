import type { EvrakEtiketGrubu, FaturaItem, IrsaliyeItem, SatinAlmaItem } from '../types/erp';

export function normalizeEtiketAd(ad: string): string {
  return String(ad || '').replace(/\s+/g, ' ').trim();
}

export function uniqueIds(ids?: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function hydrateEvrakEtiketGrubu(
  raw: Partial<EvrakEtiketGrubu> & { id: string }
): EvrakEtiketGrubu {
  return {
    id: raw.id,
    ad: normalizeEtiketAd(raw.ad || '') || 'Adsız grup',
    aciklama: raw.aciklama ? String(raw.aciklama) : undefined,
    nitelik: raw.nitelik ? String(raw.nitelik) : undefined,
    saIds: uniqueIds(raw.saIds),
    irsaliyeIds: uniqueIds(raw.irsaliyeIds),
    faturaIds: uniqueIds(raw.faturaIds),
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy,
  };
}

export function findEtiketByAd(
  gruplar: EvrakEtiketGrubu[],
  ad: string
): EvrakEtiketGrubu | undefined {
  const n = normalizeEtiketAd(ad).toLocaleLowerCase('tr-TR');
  if (!n) return undefined;
  return gruplar.find((g) => normalizeEtiketAd(g.ad).toLocaleLowerCase('tr-TR') === n);
}

export function createEvrakEtiketGrubu(input: {
  ad: string;
  aciklama?: string;
  nitelik?: string;
  createdBy?: string;
  saIds?: string[];
  irsaliyeIds?: string[];
  faturaIds?: string[];
}): EvrakEtiketGrubu {
  const ad = normalizeEtiketAd(input.ad);
  return {
    id: `etk_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    ad,
    aciklama: input.aciklama ? normalizeEtiketAd(input.aciklama) || undefined : undefined,
    nitelik: input.nitelik ? normalizeEtiketAd(input.nitelik) || undefined : undefined,
    saIds: uniqueIds(input.saIds),
    irsaliyeIds: uniqueIds(input.irsaliyeIds),
    faturaIds: uniqueIds(input.faturaIds),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
}

export function assignDocsToEtiketGrubu(
  gruplar: EvrakEtiketGrubu[],
  opts: {
    grupId?: string;
    yeniAd?: string;
    aciklama?: string;
    nitelik?: string;
    createdBy?: string;
    saIds?: string[];
    irsaliyeIds?: string[];
    faturaIds?: string[];
  }
): EvrakEtiketGrubu[] {
  const saIds = uniqueIds(opts.saIds);
  const irsaliyeIds = uniqueIds(opts.irsaliyeIds);
  const faturaIds = uniqueIds(opts.faturaIds);
  const yeniAd = normalizeEtiketAd(opts.yeniAd || '');
  if (!opts.grupId && !yeniAd) return gruplar;

  const mergeInto = (g: EvrakEtiketGrubu): EvrakEtiketGrubu => ({
    ...g,
    saIds: uniqueIds([...g.saIds, ...saIds]),
    irsaliyeIds: uniqueIds([...g.irsaliyeIds, ...irsaliyeIds]),
    faturaIds: uniqueIds([...g.faturaIds, ...faturaIds]),
  });

  if (opts.grupId) {
    const found = gruplar.some((g) => g.id === opts.grupId);
    if (!found && yeniAd) {
      return [
        createEvrakEtiketGrubu({
          ad: yeniAd,
          aciklama: opts.aciklama,
          nitelik: opts.nitelik,
          createdBy: opts.createdBy,
          saIds,
          irsaliyeIds,
          faturaIds,
        }),
        ...gruplar,
      ];
    }
    return gruplar.map((g) => (g.id === opts.grupId ? mergeInto(g) : g));
  }

  const existing = findEtiketByAd(gruplar, yeniAd);
  if (existing) {
    return gruplar.map((g) => (g.id === existing.id ? mergeInto(g) : g));
  }

  return [
    createEvrakEtiketGrubu({
      ad: yeniAd,
      aciklama: opts.aciklama,
      nitelik: opts.nitelik,
      createdBy: opts.createdBy,
      saIds,
      irsaliyeIds,
      faturaIds,
    }),
    ...gruplar,
  ];
}

export function removeDocFromEtiketGrubu(
  grup: EvrakEtiketGrubu,
  kind: 'sa' | 'irsaliye' | 'fatura',
  id: string
): EvrakEtiketGrubu {
  if (kind === 'sa') return { ...grup, saIds: grup.saIds.filter((x) => x !== id) };
  if (kind === 'irsaliye') return { ...grup, irsaliyeIds: grup.irsaliyeIds.filter((x) => x !== id) };
  return { ...grup, faturaIds: grup.faturaIds.filter((x) => x !== id) };
}

export function renameEvrakEtiketGrubu(
  gruplar: EvrakEtiketGrubu[],
  id: string,
  ad: string
): { next: EvrakEtiketGrubu[]; error?: string } {
  const trimmed = normalizeEtiketAd(ad);
  if (!trimmed) return { next: gruplar, error: 'Grup adı boş bırakılamaz.' };
  const clash = findEtiketByAd(gruplar, trimmed);
  if (clash && clash.id !== id) {
    return { next: gruplar, error: `"${clash.ad}" adında bir grup zaten var.` };
  }
  return {
    next: gruplar.map((g) => (g.id === id ? { ...g, ad: trimmed } : g)),
  };
}

export type EtiketKalem = SatinAlmaItem | IrsaliyeItem | FaturaItem | {
  urunAdi?: string;
  miktar?: number;
  birim?: string;
};

/** Nitelik takibi için kalem özeti: ürün + miktar + birim */
export function kalemOzeti(kalemler?: EtiketKalem[] | null, limit = 4): string {
  const list = kalemler || [];
  if (!list.length) return 'Kalem yok';
  const parts = list.slice(0, limit).map((k) => {
    const ad = String(k.urunAdi || '').trim() || '—';
    const qty = k.miktar != null && Number.isFinite(Number(k.miktar)) ? String(k.miktar) : '';
    const birim = String(k.birim || '').trim();
    return [ad, qty, birim].filter(Boolean).join(' ');
  });
  const extra = list.length > limit ? ` +${list.length - limit}` : '';
  return `${parts.join(' · ')}${extra}`;
}

export function evrakEtiketAramaHayir(
  query: string,
  ...alanlar: Array<string | undefined | null>
): boolean {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  return alanlar.some((a) => String(a || '').toLocaleLowerCase('tr-TR').includes(q));
}
