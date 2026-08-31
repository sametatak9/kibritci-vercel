import { fetchCollection, saveDocument } from './firebase';
import {
  PORTAL_PAGES,
  YetkiSablonu,
  buildKisitliSayfalarForRole,
  normalizeYetki,
  sanitizeKisitliSayfalar,
} from './yetkiUtils';
import { KullaniciLike, saveKullanici, kullaniciDocId } from './kullaniciUtils';

export const YETKI_SABLON_COLLECTION = 'yetkiSablonlari';

export function defaultSablonForRole(yetki: string): YetkiSablonu {
  const normalized = normalizeYetki(yetki);
  const autoRestricted = buildKisitliSayfalarForRole(normalized) ?? [];
  const gorulebilir = PORTAL_PAGES.map((p) => p.key).filter((k) => !autoRestricted.includes(k));
  return {
    id: normalized,
    yetki: normalized,
    kisitliSayfalar: sanitizeKisitliSayfalar(normalized, autoRestricted),
    saltOkunurSayfalar: [],
    guncellemeTarihi: new Date().toISOString(),
  };
}

export async function loadYetkiSablonlari(): Promise<YetkiSablonu[]> {
  try {
    const rows = await fetchCollection<YetkiSablonu>(YETKI_SABLON_COLLECTION);
    return rows.map((r) => ({
      ...defaultSablonForRole(r.yetki || r.id),
      ...r,
      yetki: normalizeYetki(r.yetki || r.id),
      id: normalizeYetki(r.yetki || r.id),
    }));
  } catch {
    return [];
  }
}

export async function saveYetkiSablonu(sablon: YetkiSablonu): Promise<void> {
  const normalized = normalizeYetki(sablon.yetki);
  const payload: YetkiSablonu = {
    ...sablon,
    id: normalized,
    yetki: normalized,
    kisitliSayfalar: sanitizeKisitliSayfalar(normalized, sablon.kisitliSayfalar),
    guncellemeTarihi: new Date().toISOString(),
  };
  await saveDocument(YETKI_SABLON_COLLECTION, payload);
}

export async function applySablonToRoleUsers(
  sablon: YetkiSablonu,
  kullanicilar: KullaniciLike[]
): Promise<number> {
  const role = normalizeYetki(sablon.yetki);
  const targets = kullanicilar.filter((u) => normalizeYetki(u.yetki) === role);
  let count = 0;
  for (const u of targets) {
    await saveKullanici({
      ...u,
      kisitliSayfalar: sablon.kisitliSayfalar,
      saltOkunurSayfalar: sablon.saltOkunurSayfalar,
      yetkiUpdatedAt: new Date().toISOString(),
    });
    count += 1;
  }
  return count;
}
