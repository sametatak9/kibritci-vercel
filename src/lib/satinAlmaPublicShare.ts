import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SatinAlmaItem, SatinAlmaTalebi } from '../types/erp';
import { fetchApiJson } from './apiClient';
import { auth, db, ensureFirestoreAuth } from './firebase';

export const PUBLIC_SA_SHARE_COLLECTION = 'publicSatinAlmaPaylasimlari';

export interface SatinAlmaPublicShareDoc {
  id: string;
  kind: 'satin_alma_po';
  saDocId: string;
  saId: string;
  tarih: string;
  talepEden: string;
  cariFirma: string;
  aciklama: string;
  onayDurumu: string;
  kalemler: SatinAlmaItem[];
  eImzalar?: string[];
  createdAt: string;
  createdBy?: string | null;
}

function makeShareToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function buildSatinAlmaPublicShareUrl(token: string): string {
  if (typeof window === 'undefined') return `/?view_po=${token}`;
  return `${window.location.origin}/?view_po=${encodeURIComponent(token)}`;
}

function toSharePayload(sa: SatinAlmaTalebi, createdBy?: string): Omit<SatinAlmaPublicShareDoc, 'id'> {
  return {
    kind: 'satin_alma_po',
    saDocId: sa.id,
    saId: sa.saId,
    tarih: sa.tarih || '',
    talepEden: sa.talepEden || '',
    cariFirma: sa.cariFirma || '',
    aciklama: sa.aciklama || '',
    onayDurumu: sa.onayDurumu || '',
    kalemler: Array.isArray(sa.kalemler) ? sa.kalemler : [],
    eImzalar: Array.isArray(sa.eImzalar) ? sa.eImzalar : [],
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
  };
}

/** E-posta alıcılarının giriş yapmadan PO formunu açabileceği paylaşım kaydı. */
export async function createSatinAlmaPublicShare(options: {
  sa: SatinAlmaTalebi;
  createdBy?: string;
}): Promise<{ token: string; url: string }> {
  await ensureFirestoreAuth({ allowAnonymous: true });
  const payload = toSharePayload(options.sa, options.createdBy);
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);

  if (idToken) {
    try {
      const data = await fetchApiJson<{ token: string; url?: string }>('/api/public/satin-alma-share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ share: payload }),
      });
      if (data.token) {
        return {
          token: data.token,
          url: data.url || buildSatinAlmaPublicShareUrl(data.token),
        };
      }
    } catch (err) {
      console.warn('Satın alma paylaşım API başarısız, Firestore deneniyor:', err);
    }
  }

  const token = makeShareToken();
  await setDoc(doc(db, PUBLIC_SA_SHARE_COLLECTION, token), payload);
  return { token, url: buildSatinAlmaPublicShareUrl(token) };
}

export async function fetchSatinAlmaPublicShare(
  token: string
): Promise<SatinAlmaPublicShareDoc | null> {
  if (!token) return null;

  try {
    const data = await fetchApiJson<SatinAlmaPublicShareDoc & { success?: boolean }>(
      `/api/public/satin-alma-share/${encodeURIComponent(token)}`
    );
    if (data?.id || data?.saId) {
      return {
        ...data,
        id: data.id || token,
      };
    }
  } catch (err) {
    console.warn('Satın alma paylaşım okuma API başarısız, Firestore deneniyor:', err);
  }

  await ensureFirestoreAuth({ allowAnonymous: true });
  const snap = await getDoc(doc(db, PUBLIC_SA_SHARE_COLLECTION, token));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<SatinAlmaPublicShareDoc, 'id'>) };
}
