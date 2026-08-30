import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';
import { compressImage } from './imageCompress';

/** Plan kanıtlarını Firestore yerine Storage'da saklar. */
export async function uploadSahaIsPlanKaniti(
  planId: string,
  asama: 'baslangic' | 'bitis',
  dataUrl: string
): Promise<string> {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const compressed = await compressImage(raw, 1280, 1280, 0.72, 7000);
  const storageRef = ref(storage, `saha-is-planlari/${planId}/${asama}_${Date.now()}.jpg`);
  await uploadString(storageRef, compressed, 'data_url', {
    contentType: compressed.includes('image/png') ? 'image/png' : 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}
