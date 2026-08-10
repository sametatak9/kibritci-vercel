import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';
import type { GuvenlikFotoMetod, GuvenlikFotoPaket, GuvenlikFotoSlot } from './guvenlikEvrakFotolar';
import { compressImage } from './imageCompress';

const STORAGE_UPLOAD_TIMEOUT_MS = 7000;
const COMPRESS_TIMEOUT_MS = 4000;
/** Tek slot için güvenli üst sınır (karakter) — Firestore 1MB doküman limiti */
const MAX_SLOT_CHARS = 140_000;
/** Tüm data URL’lerin toplamı (karakter) — UTF-16 tahmini için *2 sonra ~700KB hedef */
const MAX_TOTAL_DATA_CHARS = 320_000;
const MAX_SLOTS_PER_METOD = 1;

function extForSlot(slot: GuvenlikFotoSlot): string {
  const t = (slot.fileType || '').toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  return 'jpg';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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

async function compressSlotPayload(
  slot: GuvenlikFotoSlot,
  maxW = 640,
  maxH = 640,
  quality = 0.48
): Promise<string> {
  const raw = String(slot.dataUrl || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if ((slot.fileType || '').startsWith('image/') || raw.startsWith('data:image/')) {
    try {
      return await withTimeout(
        compressImage(raw, maxW, maxH, quality, COMPRESS_TIMEOUT_MS),
        COMPRESS_TIMEOUT_MS + 400,
        'Foto sıkıştırma'
      );
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Tek slot’u Firestore’a sığacak boyuta indir.
 * PDF / aşırı büyük dosyalar atlanır (kayıt yine yazılsın diye).
 */
async function capSlotForFirestore(slot: GuvenlikFotoSlot): Promise<GuvenlikFotoSlot | null> {
  const raw = String(slot.dataUrl || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return slot;

  const isPdf =
    (slot.fileType || '').toLowerCase().includes('pdf') || raw.startsWith('data:application/pdf');
  if (isPdf) {
    // Büyük PDF Firestore’u kilitler — kapı kaydını engellemesin
    if (raw.length > MAX_SLOT_CHARS) {
      console.warn('Güvenlik PDF çok büyük, slot atlandı:', slot.fileName, raw.length);
      return null;
    }
    return slot;
  }

  let payload = raw;
  if (payload.startsWith('data:image/') && payload.length > 90_000) {
    payload = await compressSlotPayload(slot, 640, 640, 0.45);
  }
  if (payload.length > MAX_SLOT_CHARS) {
    payload = await compressSlotPayload({ ...slot, dataUrl: payload }, 480, 480, 0.35);
  }
  if (payload.length > MAX_SLOT_CHARS) {
    payload = await compressSlotPayload({ ...slot, dataUrl: payload }, 360, 360, 0.28);
  }
  if (payload.length > MAX_SLOT_CHARS) {
    console.warn('Güvenlik foto hâlâ büyük, slot atlandı:', slot.fileName, payload.length);
    return null;
  }
  return { ...slot, dataUrl: payload };
}

/**
 * Kapı gönderimi: Storage yok, ağır stringify yok.
 * Slot’ları küçültüp paket döner — setDoc ana thread’i kilitlemesin.
 */
export async function prepareGuvenlikFotoPaketForSave(
  paket: GuvenlikFotoPaket
): Promise<GuvenlikFotoPaket> {
  const mapSlots = async (slots: GuvenlikFotoSlot[]) => {
    const out: GuvenlikFotoSlot[] = [];
    for (const s of (slots || []).slice(0, MAX_SLOTS_PER_METOD)) {
      const capped = await capSlotForFirestore(s);
      if (capped) out.push(capped);
    }
    return out;
  };

  let result: GuvenlikFotoPaket = {
    evrakFotolar: await mapSlots(paket.evrakFotolar || []),
    kalemFotolar: await mapSlots(paket.kalemFotolar || []),
    firmaFotolar: await mapSlots(paket.firmaFotolar || []),
    faturaFotolar: await mapSlots(paket.faturaFotolar || []),
    scanPdfUrl: paket.scanPdfUrl,
  };

  // Tarama PDF çok büyükse atla (foto yine kalsın)
  const scanRaw = String(result.scanPdfUrl || '').trim();
  if (scanRaw.startsWith('data:') && scanRaw.length > MAX_SLOT_CHARS) {
    result = { ...result, scanPdfUrl: undefined };
  }

  // Toplam hâlâ büyükse yalnızca ilk foto kalsın
  if (sumPaketDataChars(result) > MAX_TOTAL_DATA_CHARS) {
    const first =
      result.evrakFotolar[0] ||
      result.kalemFotolar[0] ||
      result.firmaFotolar[0] ||
      result.faturaFotolar[0] ||
      null;
    if (!first) {
      return { evrakFotolar: [], kalemFotolar: [], firmaFotolar: [], faturaFotolar: [] };
    }
    const capped = await capSlotForFirestore(first);
    if (!capped || String(capped.dataUrl || '').length > MAX_SLOT_CHARS) {
      return { evrakFotolar: [], kalemFotolar: [], firmaFotolar: [], faturaFotolar: [] };
    }
    result = { evrakFotolar: [capped], kalemFotolar: [], firmaFotolar: [], faturaFotolar: [] };
  }

  // Son çare: fotoğrafsız paket (meta kayıt yine gitsin)
  if (sumPaketDataChars(result) > MAX_TOTAL_DATA_CHARS) {
    return { evrakFotolar: [], kalemFotolar: [], firmaFotolar: [], faturaFotolar: [] };
  }

  return result;
}

function sumPaketDataChars(paket: GuvenlikFotoPaket): number {
  let n = 0;
  for (const s of [
    ...(paket.evrakFotolar || []),
    ...(paket.kalemFotolar || []),
    ...(paket.firmaFotolar || []),
    ...(paket.faturaFotolar || []),
  ]) {
    n += String(s.dataUrl || '').length;
  }
  n += String(paket.scanPdfUrl || '').length;
  return n;
}

/** Boyut tahmini — JSON.stringify YAPMAZ (büyük fotoda UI kilitlenmesin). */
export function estimatePaketPayloadBytes(paket: GuvenlikFotoPaket, overhead = 4000): number {
  return (sumPaketDataChars(paket) + overhead) * 2;
}

export function isPaketTooLargeForFirestore(paket: GuvenlikFotoPaket): boolean {
  return estimatePaketPayloadBytes(paket) > 850_000;
}

/**
 * Fotoğrafı Storage’a yüklemeyi dener; 7 sn içinde olmazsa sıkıştırılmış
 * data URL ile devam eder. (Opsiyonel — kapı gönderiminde kullanılmaz.)
 */
export async function uploadGuvenlikFotoSlot(
  docId: string,
  slot: GuvenlikFotoSlot
): Promise<GuvenlikFotoSlot> {
  const raw = String(slot.dataUrl || '').trim();
  if (!raw) return slot;
  if (/^https?:\/\//i.test(raw)) return slot;

  const payload = await compressSlotPayload(slot);

  if (payload.startsWith('data:') && payload.length > 900_000) {
    console.warn('Güvenlik foto çok büyük, Storage atlandı:', slot.fileName);
    return { ...slot, dataUrl: payload };
  }

  try {
    const path = `guvenlik-evrak/${docId}/${slot.metod}/${slot.id}.${extForSlot(slot)}`;
    const storageRef = ref(storage, path);
    await withTimeout(
      uploadString(storageRef, payload, 'data_url', {
        contentType:
          slot.fileType ||
          (payload.startsWith('data:image/') ? 'image/jpeg' : 'application/octet-stream'),
        customMetadata: {
          metod: slot.metod,
          fileName: slot.fileName || '',
        },
      }),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'Storage upload'
    );
    const url = await withTimeout(getDownloadURL(storageRef), 5000, 'Storage downloadURL');
    return { ...slot, dataUrl: url };
  } catch (err) {
    console.warn(
      'Güvenlik foto Storage atlandı (timeout/izin/ağ), data URL kullanılacak:',
      slot.fileName,
      err
    );
    return { ...slot, dataUrl: payload };
  }
}

export async function uploadGuvenlikFotoPaket(
  docId: string,
  paket: GuvenlikFotoPaket
): Promise<GuvenlikFotoPaket> {
  const mapSlots = async (slots: GuvenlikFotoSlot[]) => {
    const out: GuvenlikFotoSlot[] = [];
    for (const s of slots || []) {
      out.push(await uploadGuvenlikFotoSlot(docId, s));
    }
    return out;
  };

  return {
    evrakFotolar: await mapSlots(paket.evrakFotolar || []),
    kalemFotolar: await mapSlots(paket.kalemFotolar || []),
    firmaFotolar: await mapSlots(paket.firmaFotolar || []),
    faturaFotolar: await mapSlots(paket.faturaFotolar || []),
    scanPdfUrl: paket.scanPdfUrl,
  };
}

/** @deprecated estimatePaketPayloadBytes kullanın — JSON.stringify UI kilitleyebilir */
export function estimateFirestoreJsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

const FIRESTORE_SAFE_LIMIT = 850_000;

export function isFirestorePayloadTooLarge(value: unknown): boolean {
  return estimateFirestoreJsonBytes(value) > FIRESTORE_SAFE_LIMIT;
}

export async function aggressiveCompressPaket(
  paket: GuvenlikFotoPaket
): Promise<GuvenlikFotoPaket> {
  const compressSlot = async (slot: GuvenlikFotoSlot): Promise<GuvenlikFotoSlot> => {
    const raw = String(slot.dataUrl || '');
    if (!raw.startsWith('data:image/')) return slot;
    try {
      const dataUrl = await withTimeout(
        compressImage(raw, 400, 400, 0.3, COMPRESS_TIMEOUT_MS),
        COMPRESS_TIMEOUT_MS + 400,
        'Agresif sıkıştırma'
      );
      return { ...slot, dataUrl };
    } catch {
      return slot;
    }
  };
  return {
    kalemFotolar: await Promise.all((paket.kalemFotolar || []).map(compressSlot)),
    firmaFotolar: await Promise.all((paket.firmaFotolar || []).map(compressSlot)),
    faturaFotolar: await Promise.all((paket.faturaFotolar || []).map(compressSlot)),
    evrakFotolar: await Promise.all((paket.evrakFotolar || []).map(compressSlot)),
    scanPdfUrl: paket.scanPdfUrl,
  };
}

/**
 * Firestore’a yazılacak yalın paket.
 * fotoUrls yalnızca http(s); inline data URL tekrar edilmez.
 */
export function buildLeanGuvenlikEvrakFotoFields(paket: GuvenlikFotoPaket): {
  evrakFotolar: GuvenlikFotoSlot[];
  kalemFotolar: GuvenlikFotoSlot[];
  firmaFotolar: GuvenlikFotoSlot[];
  faturaFotolar: GuvenlikFotoSlot[];
  fotoUrl: string;
  fotoUrls: string[];
  scanPdfUrl: string;
  storageBackend: string;
} {
  const evrakFotolar = paket.evrakFotolar || [];
  const kalemFotolar = paket.kalemFotolar || [];
  const firmaFotolar = paket.firmaFotolar || [];
  const faturaFotolar = paket.faturaFotolar || [];
  const all = [...evrakFotolar, ...kalemFotolar, ...firmaFotolar, ...faturaFotolar];
  const fotoUrl = all[0]?.dataUrl || '';
  const httpUrls = all.map((s) => s.dataUrl).filter((u) => /^https?:\/\//i.test(String(u || '')));
  const storageBackend = httpUrls.length > 0 ? 'FIREBASE_STORAGE' : 'INLINE_DATA_URL';
  return {
    evrakFotolar,
    kalemFotolar,
    firmaFotolar,
    faturaFotolar,
    fotoUrl,
    fotoUrls: httpUrls.length ? Array.from(new Set(httpUrls)) : [],
    scanPdfUrl: String(paket.scanPdfUrl || '').trim(),
    storageBackend,
  };
}

export function metodLabelShort(metod: GuvenlikFotoMetod): string {
  if (metod === 'EVRAK') return 'Evrak';
  if (metod === 'KALEM') return 'Kalem';
  if (metod === 'FIRMA') return 'Firma';
  return 'Fatura';
}

export async function toAiParsePayload(
  url: string
): Promise<{ fileBase64: string; mimeType: string } | null> {
  const raw = String(url || '').trim();
  if (!raw) return null;

  if (raw.startsWith('data:')) {
    const parts = raw.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/data:(.*?);base64/);
    return {
      mimeType: mimeMatch?.[1] || 'image/jpeg',
      fileBase64: parts[1],
    };
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const res = await withTimeout(fetch(raw), 8000, 'YZ foto fetch');
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return toAiParsePayload(dataUrl);
    } catch (err) {
      console.warn('YZ için foto indirilemedi:', err);
      return null;
    }
  }

  return null;
}
