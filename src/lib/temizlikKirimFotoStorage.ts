import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';
import { compressImage } from './imageCompress';

const UPLOAD_TIMEOUT_MS = 18000;
const URL_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} zaman aşımı`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function uploadTemizlikKirimFoto(
  kind: 'daire' | 'baca',
  entityId: string,
  asama: string,
  dataUrl: string
): Promise<string> {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  let compressed = raw;
  try {
    compressed = await withTimeout(
      compressImage(raw, 1280, 1280, 0.72, 7000),
      8000,
      'Foto sıkıştırma'
    );
  } catch {
    compressed = raw;
  }

  const safeAsama = String(asama || 'foto').replace(/[^\w.-]+/g, '_');
  const storageRef = ref(storage, `temizlik-kirim/${kind}/${entityId}/${safeAsama}_${Date.now()}.jpg`);
  try {
    await withTimeout(
      uploadString(storageRef, compressed, 'data_url', {
        contentType: compressed.includes('image/png') ? 'image/png' : 'image/jpeg',
      }),
      UPLOAD_TIMEOUT_MS,
      'Foto yükleme'
    );
    return await withTimeout(getDownloadURL(storageRef), URL_TIMEOUT_MS, 'Foto adresi');
  } catch (err) {
    console.warn('Temizlik foto Storage atlandı (Firestore’a base64 yazılmayacak):', entityId, err);
    return '';
  }
}

export async function uploadTemizlikKirimFotolar(
  kind: 'daire' | 'baca',
  entityId: string,
  asama: string,
  dataUrls: string[]
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const url = await uploadTemizlikKirimFoto(kind, entityId, `${asama}_${i}`, dataUrls[i]);
    if (url) out.push(url);
  }
  return out;
}
