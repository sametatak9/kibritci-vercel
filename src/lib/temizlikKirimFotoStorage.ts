import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';
import { compressImage } from './imageCompress';

export async function uploadTemizlikKirimFoto(
  kind: 'daire' | 'baca',
  entityId: string,
  asama: string,
  dataUrl: string
): Promise<string> {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const compressed = await compressImage(raw, 1280, 1280, 0.72, 7000);
  const safeAsama = String(asama || 'foto').replace(/[^\w.-]+/g, '_');
  const storageRef = ref(storage, `temizlik-kirim/${kind}/${entityId}/${safeAsama}_${Date.now()}.jpg`);
  await uploadString(storageRef, compressed, 'data_url', {
    contentType: compressed.includes('image/png') ? 'image/png' : 'image/jpeg',
  });
  return getDownloadURL(storageRef);
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
