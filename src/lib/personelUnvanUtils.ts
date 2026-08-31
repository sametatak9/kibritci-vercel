import type { Personel } from '../types/erp';

/** Bilinen portal e-postaları → personel ünvanı (eşleşme yoksa yedek) */
const PORTAL_EMAIL_UNVAN: Record<string, string> = {
  'celal@kibritciinsaat.com': 'CELAL YILMAZ',
};

function foldTr(value: string): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function normalizeEmailKey(value: string): string {
  return foldTr(value);
}

export function isEmailLike(value: string): boolean {
  const s = String(value || '').trim();
  return s.includes('@') && s.indexOf('@') > 0;
}

function personelFullName(p: Pick<Personel, 'ad' | 'soyad'>): string {
  return `${p.ad || ''} ${p.soyad || ''}`.trim();
}

function normalizeNameKey(value: string): string {
  return foldTr(value).replace(/\s+/g, ' ');
}

/** Kişi atanmamış kasa çıkışları — kasanın doğrudan harcaması */
export const KASA_ADSIZ_UNVAN = 'KASA';

/**
 * Kasa / şoför özetlerinde aynı kişiyi tek unvan altında birleştirir.
 * Örn. "CELAL YILMAZ" ile "celal@kibritciinsaat.com" → CELAL YILMAZ.
 */
export function resolvePersonelUnvan(
  opts: {
    personelId?: string | null;
    personelAdi?: string | null;
    surucu?: string | null;
    kaydedenEmail?: string | null;
  },
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = []
): { key: string; label: string } {
  const list = personeller || [];

  if (opts.personelId) {
    const byId = list.find((p) => p.id === opts.personelId);
    if (byId) {
      const label = personelFullName(byId) || String(opts.personelAdi || '').trim() || byId.id;
      return { key: `pid:${byId.id}`, label };
    }
  }

  const rawName = String(opts.personelAdi || opts.surucu || '').trim();
  const emailRaw = [
    isEmailLike(rawName) ? rawName : '',
    String(opts.kaydedenEmail || '').trim(),
    isEmailLike(String(opts.surucu || '')) ? String(opts.surucu) : '',
  ].find(Boolean);

  if (emailRaw) {
    const emailKey = normalizeEmailKey(emailRaw);
    const byEposta = list.find(
      (p) => p.eposta && normalizeEmailKey(p.eposta) === emailKey
    );
    if (byEposta) {
      return { key: `pid:${byEposta.id}`, label: personelFullName(byEposta) };
    }

    const alias = PORTAL_EMAIL_UNVAN[emailKey];
    if (alias) {
      const byAliasName = list.find(
        (p) => normalizeNameKey(personelFullName(p)) === normalizeNameKey(alias)
      );
      if (byAliasName) {
        return { key: `pid:${byAliasName.id}`, label: personelFullName(byAliasName) };
      }
      return { key: `name:${normalizeNameKey(alias)}`, label: alias };
    }

    const local = foldTr(emailKey.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
    if (local) {
      const localToken = local.split(/\s+/)[0] || local;
      const byAd = list.filter((p) => foldTr(p.ad || '') === localToken);
      if (byAd.length === 1) {
        const p = byAd[0];
        return { key: `pid:${p.id}`, label: personelFullName(p) };
      }
    }
  }

  if (rawName && !isEmailLike(rawName)) {
    const nameKey = normalizeNameKey(rawName);
    const byName = list.find((p) => normalizeNameKey(personelFullName(p)) === nameKey);
    if (byName) {
      return { key: `pid:${byName.id}`, label: personelFullName(byName) };
    }
    return { key: `name:${nameKey}`, label: rawName };
  }

  if (rawName) {
    return { key: `raw:${normalizeNameKey(rawName)}`, label: rawName };
  }

  return { key: 'adsiz', label: KASA_ADSIZ_UNVAN };
}

/** Şoför portal hesabını personel kartına bağlar (id / TC / e-posta / ad). */
export function matchSoforPersonel(
  currentUser: {
    matchedPersonelId?: string | null;
    tcNo?: string | null;
    email?: string | null;
    ad?: string | null;
    soyad?: string | null;
    displayName?: string | null;
  } | null | undefined,
  personeller: Array<Pick<Personel, 'id' | 'ad' | 'soyad' | 'eposta' | 'tcNo'>> = []
): (typeof personeller)[number] | undefined {
  const list = personeller || [];
  if (!currentUser || list.length === 0) return undefined;

  if (currentUser.matchedPersonelId) {
    const byId = list.find((p) => p.id === currentUser.matchedPersonelId);
    if (byId) return byId;
  }

  const tc = String(currentUser.tcNo || '').trim();
  if (tc) {
    const byTc = list.find((p) => String(p.tcNo || '').trim() === tc);
    if (byTc) return byTc;
  }

  const email = String(currentUser.email || '').trim();
  if (email) {
    const emailKey = normalizeEmailKey(email);
    const byEposta = list.find(
      (p) => p.eposta && normalizeEmailKey(p.eposta) === emailKey
    );
    if (byEposta) return byEposta;

    const alias = PORTAL_EMAIL_UNVAN[emailKey];
    if (alias) {
      const byAlias = list.find(
        (p) => normalizeNameKey(personelFullName(p)) === normalizeNameKey(alias)
      );
      if (byAlias) return byAlias;
    }

    const local = foldTr(emailKey.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
    const localToken = local.split(/\s+/)[0] || '';
    if (localToken) {
      const byAd = list.filter((p) => foldTr(p.ad || '') === localToken);
      if (byAd.length === 1) return byAd[0];
    }
  }

  const full =
    currentUser.ad || currentUser.soyad
      ? `${currentUser.ad || ''} ${currentUser.soyad || ''}`.trim()
      : String(currentUser.displayName || '').trim();
  if (full && !isEmailLike(full)) {
    const nameKey = normalizeNameKey(full);
    return list.find((p) => normalizeNameKey(personelFullName(p)) === nameKey);
  }

  return undefined;
}
