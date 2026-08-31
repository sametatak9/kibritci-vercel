import { collection, onSnapshot } from 'firebase/firestore';
import { db, removeDocument, saveDocument } from './firebase';
import {
  KullaniciLike,
  kullaniciDocId,
  resolveRolePermissions,
  saveKullaniciForSignup,
} from './kullaniciUtils';
import { isMobileRole, normalizeYetki } from './yetkiUtils';

export const BEKLEYEN_COLLECTION = 'bekleyenUyelikler';
const LOCAL_QUEUE_KEY = 'kibritci_bekleyen_uyelik_queue';

export type BekleyenKaynak = 'kayit_formu' | 'api_yedek' | 'admin_manuel';
export type BekleyenDurum = 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDILDI';

export interface BekleyenUyelik {
  id: string;
  email: string;
  password: string;
  ad: string;
  soyad: string;
  tcNo: string;
  imzaText?: string;
  imzaStyle?: string;
  imzaCanvas?: string;
  matchedPersonelId?: string | null;
  kaynak: BekleyenKaynak;
  durum: BekleyenDurum;
  olusturulma: string;
  hataSebebi?: string;
  apiYedek?: boolean;
}

export function isFirestoreWriteFailure(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = e?.message || '';
  return (
    e?.code === 'resource-exhausted' ||
    msg === 'FIRESTORE_TIMEOUT' ||
    msg.includes('zaman aşım') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota')
  );
}

export function buildBekleyenFromSignup(input: {
  email: string;
  password: string;
  ad: string;
  soyad: string;
  tcNo: string;
  imzaText?: string;
  imzaStyle?: string;
  imzaCanvas?: string;
  matchedPersonelId?: string | null;
  hataSebebi?: string;
  kaynak?: BekleyenKaynak;
}): BekleyenUyelik {
  const emailKey = kullaniciDocId(input.email);
  return {
    id: emailKey,
    email: emailKey,
    password: input.password,
    ad: input.ad.trim(),
    soyad: input.soyad.trim(),
    tcNo: input.tcNo.trim(),
    imzaText: input.imzaText,
    imzaStyle: input.imzaStyle,
    imzaCanvas: input.imzaCanvas,
    matchedPersonelId: input.matchedPersonelId ?? null,
    kaynak: input.kaynak ?? 'kayit_formu',
    durum: 'BEKLEMEDE',
    olusturulma: new Date().toISOString(),
    hataSebebi: input.hataSebebi,
  };
}

/** Firebase dolunca: önce bekleyen koleksiyon, sonra API, en son localStorage */
export async function queueSignupFallback(
  record: BekleyenUyelik
): Promise<'firestore' | 'api' | 'local'> {
  const lean: BekleyenUyelik = { ...record, imzaCanvas: undefined };

  try {
    await saveDocument(BEKLEYEN_COLLECTION, lean);
    return 'firestore';
  } catch (firestoreErr) {
    console.warn('bekleyenUyelikler yazılamadı:', firestoreErr);
  }

  try {
    const res = await fetch('/api/pending-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...record, apiYedek: true }),
    });
    if (res.ok) return 'api';
  } catch (apiErr) {
    console.warn('API pending-signup başarısız:', apiErr);
  }

  const existing: BekleyenUyelik[] = JSON.parse(
    localStorage.getItem(LOCAL_QUEUE_KEY) || '[]'
  );
  const filtered = existing.filter((x) => x.email !== record.email);
  filtered.push({ ...record, apiYedek: true });
  localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(filtered));
  return 'local';
}

export function readLocalPendingQueue(): BekleyenUyelik[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function removeFromLocalPendingQueue(email: string): void {
  const emailKey = kullaniciDocId(email);
  const existing = readLocalPendingQueue().filter((x) => x.email !== emailKey);
  localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(existing));
}

export async function fetchApiPendingSignups(): Promise<BekleyenUyelik[]> {
  try {
    const res = await fetch('/api/pending-signups');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []) as BekleyenUyelik[];
  } catch {
    return [];
  }
}

export async function deleteApiPendingSignup(email: string): Promise<void> {
  const emailKey = kullaniciDocId(email);
  try {
    await fetch(`/api/pending-signups/${encodeURIComponent(emailKey)}`, {
      method: 'DELETE',
    });
  } catch {
    /* ignore */
  }
}

export function subscribeBekleyenUyelikler(
  onData: (items: BekleyenUyelik[]) => void,
  onError?: (err: unknown) => void
): () => void {
  return onSnapshot(
    collection(db, BEKLEYEN_COLLECTION),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as BekleyenUyelik)
        .filter((x) => x.durum === 'BEKLEMEDE')
        .sort(
          (a, b) =>
            new Date(b.olusturulma).getTime() - new Date(a.olusturulma).getTime()
        );
      onData(items);
    },
    (err) => onError?.(err)
  );
}

export async function approveBekleyenSignup(
  record: BekleyenUyelik,
  yetki: string
): Promise<KullaniciLike> {
  const emailKey = kullaniciDocId(record.email);
  const normalizedYetki = normalizeYetki(yetki);
  const mobileRole = isMobileRole(normalizedYetki);

  const portalPayload = {
    email: emailKey,
    password: record.password,
    role: normalizedYetki,
    yetki: normalizedYetki,
    ad: record.ad,
    soyad: record.soyad,
    tcNo: record.tcNo,
    imzaText: record.imzaText || `${record.ad} ${record.soyad}`,
    imzaStyle: record.imzaStyle || 'cursive',
    matchedPersonelId: record.matchedPersonelId,
    createdAt: record.olusturulma,
  };

  const kullaniciPayload = await resolveRolePermissions(
    {
      id: emailKey,
      email: emailKey,
      yetki: normalizedYetki,
      durum: mobileRole ? 'AKTİF' : 'ONAY BEKLİYOR',
      kayitTarihi: record.olusturulma.split('T')[0],
      ad: record.ad,
      soyad: record.soyad,
      tcNo: record.tcNo,
      imzaText: record.imzaText,
      imzaStyle: record.imzaStyle,
      imzaCanvas: record.imzaCanvas,
      matchedPersonelId: record.matchedPersonelId || undefined,
      yetkiUpdatedAt: new Date().toISOString(),
    },
    normalizedYetki
  );

  await saveKullaniciForSignup(kullaniciPayload, portalPayload);

  await removeDocument(BEKLEYEN_COLLECTION, emailKey).catch(() => undefined);
  await deleteApiPendingSignup(emailKey);
  removeFromLocalPendingQueue(emailKey);

  return kullaniciPayload;
}

export async function rejectBekleyenSignup(record: BekleyenUyelik): Promise<void> {
  const emailKey = kullaniciDocId(record.email);
  await removeDocument(BEKLEYEN_COLLECTION, emailKey).catch(() => undefined);
  await deleteApiPendingSignup(emailKey);
  removeFromLocalPendingQueue(emailKey);
}

export async function createManualUser(input: {
  email: string;
  password: string;
  ad: string;
  soyad: string;
  tcNo?: string;
  yetki: string;
}): Promise<{ user: KullaniciLike; queued: boolean }> {
  const emailKey = kullaniciDocId(input.email);
  const normalizedYetki = normalizeYetki(input.yetki);
  const now = new Date().toISOString();

  const portalPayload = {
    email: emailKey,
    password: input.password,
    role: normalizedYetki,
    yetki: normalizedYetki,
    ad: input.ad.trim(),
    soyad: input.soyad.trim(),
    tcNo: input.tcNo?.trim() || '',
    imzaText: `${input.ad.trim()} ${input.soyad.trim()}`,
    imzaStyle: 'cursive',
    createdAt: now,
  };

  const kullaniciPayload = await resolveRolePermissions(
    {
      id: emailKey,
      email: emailKey,
      yetki: normalizedYetki,
      durum: 'AKTİF',
      kayitTarihi: now.split('T')[0],
      ad: input.ad.trim(),
      soyad: input.soyad.trim(),
      tcNo: input.tcNo?.trim(),
      imzaText: `${input.ad.trim()} ${input.soyad.trim()}`,
      imzaStyle: 'cursive',
      yetkiUpdatedAt: now,
    },
    normalizedYetki
  );

  try {
    await saveKullaniciForSignup(kullaniciPayload, portalPayload);
    return { user: kullaniciPayload, queued: false };
  } catch (err) {
    if (!isFirestoreWriteFailure(err)) throw err;
    const bekleyen = buildBekleyenFromSignup({
      email: emailKey,
      password: input.password,
      ad: input.ad,
      soyad: input.soyad,
      tcNo: input.tcNo || '00000000000',
      kaynak: 'admin_manuel',
      hataSebebi: err instanceof Error ? err.message : 'quota',
    });
    const queueResult = await queueSignupFallback(bekleyen);
    if (queueResult === 'local') {
      console.warn('Bekleyen kayıt yalnızca tarayıcıda — sunucu/API erişimini kontrol edin.');
    }
    return { user: kullaniciPayload, queued: true };
  }
}

export function mergePendingLists(
  firestoreItems: BekleyenUyelik[],
  apiItems: BekleyenUyelik[],
  localItems: BekleyenUyelik[]
): BekleyenUyelik[] {
  const byEmail = new Map<string, BekleyenUyelik>();
  for (const item of [...localItems, ...apiItems, ...firestoreItems]) {
    if (item.durum !== 'BEKLEMEDE') continue;
    byEmail.set(kullaniciDocId(item.email), item);
  }
  return Array.from(byEmail.values()).sort(
    (a, b) => new Date(b.olusturulma).getTime() - new Date(a.olusturulma).getTime()
  );
}
