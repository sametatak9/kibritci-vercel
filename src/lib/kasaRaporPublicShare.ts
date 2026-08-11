import { doc, setDoc } from 'firebase/firestore';
import { fetchApiJson } from './apiClient';
import { auth, db, ensureFirestoreAuth } from './firebase';

export const PUBLIC_KASA_RAPOR_COLLECTION = 'publicKasaRaporPaylasimlari';

export interface KasaRaporPublicShareDoc {
  id: string;
  kind: 'kasa_harcama';
  startDate: string;
  endDate: string;
  kalemCount: number;
  genelToplam: number;
  htmlContent?: string;
  htmlUrl?: string;
  excelUrl?: string;
  createdAt: string;
  createdBy?: string | null;
}

function makeShareToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `kr_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `kr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function buildKasaRaporPublicViewUrl(token: string): string {
  if (typeof window === 'undefined') return `/?view_kasa_rapor=${token}`;
  return `${window.location.origin}/?view_kasa_rapor=${encodeURIComponent(token)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** E-posta alıcıları için HTML + Excel indirme bağlantıları oluşturur. */
export async function createKasaRaporPublicShare(options: {
  html: string;
  excelBuffer?: ArrayBuffer | null;
  startDate: string;
  endDate: string;
  kalemCount: number;
  genelToplam: number;
  createdBy?: string;
}): Promise<{
  token: string;
  viewUrl: string;
  htmlUrl: string;
  excelUrl?: string;
}> {
  await ensureFirestoreAuth({ allowAnonymous: true });
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  const excelBase64 = options.excelBuffer ? arrayBufferToBase64(options.excelBuffer) : '';

  if (idToken) {
    try {
      const data = await fetchApiJson<{
        token: string;
        viewUrl?: string;
        htmlUrl?: string;
        excelUrl?: string;
      }>('/api/public/kasa-rapor-share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          html: options.html,
          excelBase64: excelBase64 || undefined,
          meta: {
            startDate: options.startDate,
            endDate: options.endDate,
            kalemCount: options.kalemCount,
            genelToplam: options.genelToplam,
            createdBy: options.createdBy || null,
          },
        }),
      });
      if (data.token) {
        const viewUrl = data.viewUrl || buildKasaRaporPublicViewUrl(data.token);
        return {
          token: data.token,
          viewUrl,
          htmlUrl: data.htmlUrl || viewUrl,
          excelUrl: data.excelUrl || undefined,
        };
      }
    } catch (err) {
      console.warn('Kasa rapor paylaşım API başarısız, Firestore deneniyor:', err);
    }
  }

  const token = makeShareToken();
  const viewUrl = buildKasaRaporPublicViewUrl(token);
  const payload: Omit<KasaRaporPublicShareDoc, 'id'> = {
    kind: 'kasa_harcama',
    startDate: options.startDate,
    endDate: options.endDate,
    kalemCount: options.kalemCount,
    genelToplam: options.genelToplam,
    htmlContent: options.html,
    createdAt: new Date().toISOString(),
    createdBy: options.createdBy || null,
  };
  await setDoc(doc(db, PUBLIC_KASA_RAPOR_COLLECTION, token), payload);
  return { token, viewUrl, htmlUrl: viewUrl };
}

export async function fetchKasaRaporPublicShare(
  token: string
): Promise<KasaRaporPublicShareDoc | null> {
  if (!token) return null;

  try {
    const data = await fetchApiJson<KasaRaporPublicShareDoc & { success?: boolean }>(
      `/api/public/kasa-rapor-share/${encodeURIComponent(token)}`
    );
    if (data?.kind === 'kasa_harcama' || data?.startDate) {
      return { ...data, id: data.id || token };
    }
  } catch (err) {
    console.warn('Kasa rapor paylaşım okuma API başarısız, Firestore deneniyor:', err);
  }

  await ensureFirestoreAuth({ allowAnonymous: true });
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, PUBLIC_KASA_RAPOR_COLLECTION, token));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<KasaRaporPublicShareDoc, 'id'>) };
}
