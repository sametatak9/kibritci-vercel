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
    // Inline data URL Firestore yazımında timeout üretir — boş bırak, kayıt fotosuz devam etsin
    console.warn('Saha foto Storage atlandı (inline yazılmayacak):', faaliyetId, index, err);
    return '';
  }
}

async function uploadFotoList(
  faaliyetId: string,
  urls: string[],
  indexOffset: number
): Promise<string[]> {
  const uploaded: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = await uploadOne(faaliyetId, urls[i], indexOffset + i);
    if (url) uploaded.push(url);
  }
  return uploaded;
}

function needsFotoUpload(urls: string[]): boolean {
  return urls.some(
    (u) => u.startsWith('data:') || (!/^https?:\/\//i.test(u) && !u.startsWith('blob:'))
  );
}

/**
 * data: URL fotoğrafları Firebase Storage'a taşır (Firestore 1MB sınırı için).
 * Ana kayıt ve ilerleme aşama fotoğraflarını işler.
 */
export async function ensureSahaFaaliyetFotolarPersisted(
  record: SahaFaaliyeti
): Promise<SahaFaaliyeti> {
  if (!record?.id) return record;

  let next: SahaFaaliyeti = { ...record };
  let changed = false;

  const mainFotos = getFaaliyetFotolar(record).slice(0, MAX_SAHA_FOTO_COUNT);
  if (mainFotos.length > 0 && needsFotoUpload(mainFotos)) {
    const uploaded = await uploadFotoList(record.id, mainFotos, 0);
    if (uploaded.length > 0) {
      next = { ...next, fotoUrls: uploaded, fotoUrl: uploaded[0] };
      changed = true;
    }
  }

  const kayitlar = record.ilerlemeKayitlari || [];
  if (kayitlar.length > 0) {
    const nextKayitlar = [];
    for (let ki = 0; ki < kayitlar.length; ki++) {
      const kayit = kayitlar[ki];
      const urls = (kayit.fotoUrls || []).filter(Boolean);
      if (urls.length > 0 && needsFotoUpload(urls)) {
        const uploaded = await uploadFotoList(record.id, urls, 100 + ki * 10);
        nextKayitlar.push({
          ...kayit,
          fotoUrls: uploaded.length ? uploaded : urls,
        });
        changed = true;
      } else {
        nextKayitlar.push(kayit);
      }
    }
    if (changed) {
      next = { ...next, ilerlemeKayitlari: nextKayitlar };
    }
  }

  return changed ? next : record;
}

/**
 * Kamp faaliyet fotoğrafını Storage'a taşır (`kamp-faaliyet/{id}/…`).
 * Başarısız olursa inline data URL döner (kayıt yine düşer).
 */
export async function ensureKampFaaliyetFotoPersisted(
  faaliyetId: string,
  fotoUrl?: string | null
): Promise<string> {
  const raw = String(fotoUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const payload = await preparePayload(
    raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  );

  try {
    const path = `kamp-faaliyet/${faaliyetId}/foto_${Date.now()}.jpg`;
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
      'Kamp foto Storage'
    );
    return await withTimeout(getDownloadURL(storageRef), 6000, 'Kamp foto URL');
  } catch (err) {
    console.warn('Kamp foto Storage atlandı, inline kullanılacak:', faaliyetId, err);
    return payload;
  }
}

/**
 * Şoför yol harcaması fiş görselini Storage'a taşır (`yol-harcama/{id}/…`).
 * Başarısız olursa inline data URL döner.
 */
export async function ensureYolHarcamaFotoPersisted(
  harcamaId: string,
  fotoUrl?: string | null
): Promise<string> {
  const raw = String(fotoUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const payload = await preparePayload(
    raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  );

  try {
    const path = `yol-harcama/${harcamaId}/fis_${Date.now()}.jpg`;
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
      'Yol harcama foto Storage'
    );
    return await withTimeout(getDownloadURL(storageRef), 6000, 'Yol harcama foto URL');
  } catch (err) {
    console.warn('Yol harcama foto Storage atlandı, inline kullanılacak:', harcamaId, err);
    return payload;
  }
}

/**
 * Haftalık Kasa fiş görselini Storage'a taşır (`kasa-fis/{id}/…`).
 * Büyük data URL Firestore yazımını düşürüp kaydı rollback ettiriyordu.
 */
export async function ensureKasaFisFotoPersisted(
  hareketId: string,
  fotoUrl?: string | null
): Promise<string> {
  const raw = String(fotoUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const payload = await preparePayload(
    raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  );

  try {
    const path = `kasa-fis/${hareketId}/fis_${Date.now()}.jpg`;
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
      'Kasa fiş foto Storage'
    );
    return await withTimeout(getDownloadURL(storageRef), 6000, 'Kasa fiş foto URL');
  } catch (err) {
    console.warn('Kasa fiş Storage atlandı:', hareketId, err);
    // Firestore 1MB limiti — büyük inline yazma; boş bırak (kayıt yine de kalsın)
    if (payload.length > 700_000) return '';
    return payload;
  }
}

/**
 * Kapı irsaliye onayında evrak görselini Storage'a taşır (`kapi-irsaliye/{id}/…`).
 * Inline data URL irsaliye dokümanını şişirip Firestore yazımını düşürüyordu.
 */
export async function ensureKapiIrsaliyeFotoPersisted(
  irsaliyeId: string,
  fotoUrl?: string | null
): Promise<string> {
  const raw = String(fotoUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

  const payload = await preparePayload(
    raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`
  );

  try {
    const path = `kapi-irsaliye/${irsaliyeId}/evrak_${Date.now()}.jpg`;
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
      'Kapı irsaliye foto Storage'
    );
    return await withTimeout(getDownloadURL(storageRef), 6000, 'Kapı irsaliye foto URL');
  } catch (err) {
    console.warn('Kapı irsaliye Storage atlandı:', irsaliyeId, err);
    if (payload.length > 700_000) return '';
    return payload;
  }
}
