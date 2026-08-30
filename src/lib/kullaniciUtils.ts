import { doc, setDoc, writeBatch } from 'firebase/firestore';
import {
  db,
  fetchCollection,
  saveSignupDocuments,
  cleanUndefined,
} from './firebase';
import {
  applyRoleDefaults,
  isMobileRole,
  normalizeYetki,
} from './yetkiUtils';
import { loadYetkiSablonlari } from './yetkiSablonUtils';

async function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export interface KullaniciLike {
  id: string;
  email: string;
  yetki?: string;
  durum?: string;
  kayitTarihi?: string;
  sonGorulmeTarihi?: string;
  ad?: string;
  soyad?: string;
  tcNo?: string;
  imzaText?: string;
  imzaStyle?: string;
  imzaCanvas?: string;
  matchedPersonelId?: string;
  kisitliSayfalar?: string[];
  saltOkunurSayfalar?: string[];
  yetkiUpdatedAt?: string;
  sifreSifirlamaTalebi?: boolean;
  /** Firestore belge kimliği (e-postadan farklı olabilir) */
  _docId?: string;
}

/** Firestore belge kimliği = e-posta (tek kaynak, çift kayıt önlenir) */
export function kullaniciDocId(email: string): string {
  return email.trim().toLowerCase();
}

function stripInternalFields(user: KullaniciLike): Record<string, unknown> {
  const { _docId, ...rest } = user;
  return cleanUndefined(rest);
}

function kullaniciPriorityScore(u: KullaniciLike): number {
  const yetki = normalizeYetki(u.yetki);
  let score = 0;
  if (u.durum === 'AKTİF') score += 100;
  else if (u.durum === 'ONAY BEKLİYOR') score += 40;
  if (isMobileRole(yetki)) score += 80;
  if (yetki === 'YÖNETİCİ') score += 45;
  if (yetki && yetki !== 'MİSAFİR') score += 20;
  if (u.ad || u.soyad) score += 5;
  if (u.tcNo) score += 3;
  if (u._docId === kullaniciDocId(u.email)) score += 50;
  if (u.yetkiUpdatedAt) {
    score += Math.min(new Date(u.yetkiUpdatedAt).getTime() / 1e12, 50);
  }
  return score;
}

export function dedupeKullanicilarByEmail<T extends KullaniciLike>(users: T[]): T[] {
  const byEmail = new Map<string, T>();
  for (const u of users) {
    const key = u.email?.trim().toLowerCase();
    if (!key) continue;
    const normalized = { ...u, id: key, email: key } as T;
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, normalized);
      continue;
    }
    const nextScore = kullaniciPriorityScore(normalized);
    const existingScore = kullaniciPriorityScore(existing);
    if (
      nextScore > existingScore ||
      (nextScore === existingScore && normalized._docId === key)
    ) {
      byEmail.set(key, normalized);
    }
  }
  return Array.from(byEmail.values());
}

export function findKullaniciByEmail<T extends KullaniciLike>(
  users: T[],
  email?: string | null
): T | undefined {
  const key = email?.trim().toLowerCase();
  if (!key) return undefined;
  return dedupeKullanicilarByEmail(users.filter((u) => u.email?.trim().toLowerCase() === key))[0];
}

export function hasDuplicateKullaniciEmails(users: KullaniciLike[]): boolean {
  const docIdsByEmail = new Map<string, Set<string>>();
  for (const u of users) {
    const key = u.email?.trim().toLowerCase();
    if (!key) continue;
    const docId = u._docId || u.id;
    if (!docIdsByEmail.has(key)) docIdsByEmail.set(key, new Set());
    docIdsByEmail.get(key)!.add(docId);
  }
  for (const [email, ids] of docIdsByEmail) {
    if (ids.size > 1) return true;
    const only = [...ids][0];
    if (only && only !== kullaniciDocId(email)) return true;
  }
  return false;
}

/** E-posta anahtarlı belgeye yazar; eski UID belgelerini atomik siler */
export async function saveKullanici(user: KullaniciLike): Promise<KullaniciLike> {
  const emailKey = kullaniciDocId(user.email);
  if (!emailKey) throw new Error('Geçersiz e-posta');

  const canonical: KullaniciLike = {
    ...user,
    id: emailKey,
    email: emailKey,
    yetkiUpdatedAt: user.yetkiUpdatedAt || new Date().toISOString(),
  };

  const all = await fetchCollection<KullaniciLike & { id: string }>('kullanicilar');
  const orphanIds = all
    .filter((u) => {
      const uEmail = u.email?.trim().toLowerCase();
      return (uEmail === emailKey || u.id === emailKey) && u.id !== emailKey;
    })
    .map((u) => u.id);

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'kullanicilar', emailKey),
    stripInternalFields(canonical),
    { merge: false }
  );
  for (const orphanId of orphanIds) {
    batch.delete(doc(db, 'kullanicilar', orphanId));
  }
  await withTimeout(batch.commit(), 25000);

  return canonical;
}

/** Yeni üyelik — portal + kullanıcı paralel yazar */
export async function saveKullaniciForSignup(
  user: KullaniciLike,
  portalData?: Record<string, unknown>
): Promise<KullaniciLike> {
  const emailKey = kullaniciDocId(user.email);
  const canonical: KullaniciLike = { ...user, id: emailKey, email: emailKey };

  if (portalData) {
    await saveSignupDocuments(emailKey, portalData, stripInternalFields(canonical));
  } else {
    await saveKullanici(canonical);
  }

  return canonical;
}

export async function resolveRolePermissions(
  user: KullaniciLike,
  newYetki: string
): Promise<KullaniciLike & { yetki: string }> {
  const yetki = normalizeYetki(newYetki);
  const withDefaults = applyRoleDefaults(user, yetki);

  if (isMobileRole(yetki)) {
    return withDefaults;
  }

  try {
    const sablonlar = await loadYetkiSablonlari();
    const sablon = sablonlar.find((s) => normalizeYetki(s.yetki) === yetki);
    if (sablon) {
      return {
        ...withDefaults,
        kisitliSayfalar: sablon.kisitliSayfalar,
        saltOkunurSayfalar: sablon.saltOkunurSayfalar ?? [],
      };
    }
  } catch (err) {
    console.warn('Yetki şablonu yüklenemedi, varsayılan kısıtlar kullanılıyor:', err);
  }

  return withDefaults;
}

export async function persistKullaniciRole<T extends KullaniciLike>(
  kullanicilar: T[],
  targetId: string,
  newYetki: string
): Promise<T> {
  const target =
    kullanicilar.find((u) => u.id === targetId || u._docId === targetId) ||
    findKullaniciByEmail(kullanicilar, targetId);
  if (!target?.email) throw new Error('Kullanıcı bulunamadı');

  const emailKey = kullaniciDocId(target.email);
  const normalizedYetki = normalizeYetki(newYetki);
  const mobileRole = isMobileRole(normalizedYetki);
  const withRole = await resolveRolePermissions(target, normalizedYetki);

  const updated: KullaniciLike = {
    ...withRole,
    id: emailKey,
    email: emailKey,
    durum: mobileRole ? 'AKTİF' : target.durum,
    yetkiUpdatedAt: new Date().toISOString(),
  };

  await saveKullanici(updated);

  try {
    await setDoc(
      doc(db, 'portalKullanicilar', emailKey),
      cleanUndefined({
        role: normalizedYetki,
        yetki: normalizedYetki,
        yetkiUpdatedAt: updated.yetkiUpdatedAt,
      }),
      { merge: true }
    );
  } catch (err) {
    console.warn('portalKullanicilar rol güncellenemedi:', err);
  }

  return updated as T;
}

/** Çift belgeleri e-posta anahtarlı kayda taşır */
export async function repairKullaniciDocIdsIfNeeded(users: KullaniciLike[]): Promise<void> {
  const needsRepair =
    hasDuplicateKullaniciEmails(users) ||
    users.some((u) => {
      const key = kullaniciDocId(u.email);
      return key && (u._docId || u.id) !== key;
    });
  if (!needsRepair) return;

  const deduped = dedupeKullanicilarByEmail(users);
  for (const winner of deduped) {
    await saveKullanici(winner);
  }
}

export function parseKullanicilarSnapshot(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): KullaniciLike[] {
  return docs.map((d) => {
    const data = d.data();
    const email = String(data.email || d.id).trim().toLowerCase();
    return {
      ...data,
      id: email,
      email,
      _docId: d.id,
      yetki: (normalizeYetki(String(data.yetki || data.role || '')) || data.yetki || data.role) as string | undefined,
    } as KullaniciLike;
  });
}

export async function deleteKullaniciByEmail(email: string): Promise<void> {
  const emailKey = kullaniciDocId(email);
  const all = await fetchCollection<KullaniciLike & { id: string }>('kullanicilar');
  const targets = all.filter(
    (u) => u.email?.trim().toLowerCase() === emailKey || u.id === emailKey
  );

  const batch = writeBatch(db);
  for (const t of targets) {
    batch.delete(doc(db, 'kullanicilar', t.id));
  }
  batch.delete(doc(db, 'portalKullanicilar', emailKey));
  batch.delete(doc(db, 'bekleyenUyelikler', emailKey));
  await withTimeout(batch.commit(), 25000);
}
