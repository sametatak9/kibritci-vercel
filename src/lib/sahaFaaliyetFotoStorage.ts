import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';
import { compressImage } from './imageCompress';
import { getFaaliyetFotolar, MAX_SAHA_FOTO_COUNT } from './sahaFaaliyetUtils';
import type { SahaFaaliyeti } from '../types/erp';

const UPLOAD_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} zaman aşımı (${ms}ms)`)), ms);
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

async function preparePayload(dataUrl: string): Promise<string> {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:image/')) return raw;
  if (raw.length < 120_000) return raw;
  try {
    return await withTimeout(
      compressImage(raw, 720, 720, 0.55, 4000),
      4500,
      'Saha foto sıkıştırma'
    );
  } catch {
    return raw;
  }
}

async function uploadOne(faaliyetId: string, dataUrl: string, index: number): Promise<string> {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const payload = await preparePayload(
    raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  );

  try {
    const path = `saha-faaliyet/${faaliyetId}/foto_${index}_${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await withTimeout(
      uploadString(storageRef, payload, 'data_url', {
        contentType: payload.includes('image/png')
          ? 'image/png'
          : payload.includes('image/webp')
            ? 'image/webp'
            : 'image/jpeg',
      }),
      UPLOAD_TIMEOUT_MS,
      'Saha foto Storage'
    );
    return await withTimeout(getDownloadURL(storageRef), 6000, 'Saha foto URL');
  } catch (err) {
    console.warn('Saha foto Storage atlandı, inline kullanılacak:', faaliyetId, index, err);
    return payload;
  }
}

/**
 * data: URL fotoğrafları Firebase Storage'a taşır (Firestore 1MB sınırı için).
 * http(s) URL'ler olduğu gibi bırakılır.
 */
export async function ensureSahaFaaliyetFotolarPersisted(
  record: SahaFaaliyeti
): Promise<SahaFaaliyeti> {
  if (!record?.id) return record;
  const fotos = getFaaliyetFotolar(record).slice(0, MAX_SAHA_FOTO_COUNT);
  if (fotos.length === 0) return record;

  const needsUpload = fotos.some(
    (u) => u.startsWith('data:') || (!/^https?:\/\//i.test(u) && !u.startsWith('blob:'))
  );
  if (!needsUpload) return record;

  const uploaded: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const url = await uploadOne(record.id, fotos[i], i);
    if (url) uploaded.push(url);
  }

  if (uploaded.length === 0) return record;
  return {
    ...record,
    fotoUrls: uploaded,
    fotoUrl: uploaded[0],
  };
}
