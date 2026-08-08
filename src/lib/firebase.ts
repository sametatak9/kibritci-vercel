import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  doc, 
  getDoc,
  setDoc, 
  deleteDoc, 
  getDocs, 
  onSnapshot,
  writeBatch,
  query,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestoreDatabaseId, resolveFirebaseConfig } from './firebaseConfig';
import { shouldBlockMassDelete } from './productionDataGuard';

// New utilities for performance optimization
/**
 * Execute a batch of write operations (set/delete) limited to Firestore's max batch size (500).
 * Returns a promise that resolves when the batch is committed.
 */
export async function executeBatchWrites(batch: ReturnType<typeof writeBatch>) {
  // Firestore limits batches to 500 operations.
  return batch.commit();
}

/** Debounce wrapper to coalesce rapid successive calls to a function.
 * @param fn Function to debounce.
 * @param waitMs Milliseconds to wait before invoking.
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, waitMs = 200): T {
  let timeout: NodeJS.Timeout;
  // @ts-ignore – dynamic return signature
  return function (...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), waitMs);
  } as any;
}

/** Enable IndexedDB persistence for specific collections (placeholder, global currently). */
export function enableCache(enable = true) {
  // Currently Firestore persistence is configured globally at initialization.
  // This function exists for future per‑collection cache toggles.
  console.info(`[Firebase] Cache ${enable ? 'enabled' : 'disabled'}.`);
}

export { mergeYoklamaMaps } from './yoklamaGuard';

const firebaseConfig = resolveFirebaseConfig();

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const firestoreDbId = getFirestoreDatabaseId(firebaseConfig);
// Canlı verileri IndexedDB'de sakla. Sonraki açılışlarda onSnapshot önce yerel
// önbelleği döndürür; ağdan güncel veri arka planda gelir.
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firestoreDbId
);
export const auth = getAuth(app);
export const storage = getStorage(app);

/** Firestore güvenlik kuralları oturum gerektirir. */
async function waitForAuthUser(maxMs = 8000) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise<typeof auth.currentUser>((resolve) => {
    const started = Date.now();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user || Date.now() - started >= maxMs) {
        unsub();
        resolve(user);
      }
    });
  });
}

export type EnsureFirestoreAuthOptions = {
  /**
   * true: oturum yoksa anonim aç (yalnızca public koleksiyonlar: personelGirisTalepleri vb.)
   * false/undefined: ERP — anonim oluşturma yok; mevcut anonim oturum yetersiz sayılır
   */
  allowAnonymous?: boolean;
};

/**
 * Firestore oturumu hazırlar.
 * ERP yazmaları için allowAnonymous=false (varsayılan): e-posta oturumu şart.
 */
export async function ensureFirestoreAuth(
  opts?: EnsureFirestoreAuthOptions
): Promise<boolean> {
  const allowAnonymous = Boolean(opts?.allowAnonymous);
  const existing = await waitForAuthUser(6000);

  if (existing) {
    if (existing.isAnonymous && !allowAnonymous) {
      console.warn(
        '[Firebase] Anonim oturum ERP yazması için yetersiz; e-posta girişi gerekli.'
      );
      return false;
    }
    return true;
  }

  if (!allowAnonymous) {
    console.warn('[Firebase] ERP oturumu yok; anonim oluşturulmayacak.');
    return false;
  }

  try {
    await signInAnonymously(auth);
    return true;
  } catch (err) {
    console.warn('Anonim Firestore oturumu açılamadı:', err);
    return false;
  }
}

/** Hangi Firebase projesine bağlı olduğumuzu konsolda görmek için */
if (typeof window !== 'undefined') {
  console.info(
    `[Firebase] projectId=${firebaseConfig.projectId}` +
      (firestoreDbId ? ` firestoreDb=${firestoreDbId}` : ' firestoreDb=(default)')
  );
}

/**
 * Helper to wrap any promise with a timeout and automatic retry logic
 * to prevent transient FIRESTORE_TIMEOUT crashes without breaking existing calls.
 */
export async function withTimeout<T>(
  promiseFnOrPromise: Promise<T> | (() => Promise<T>), 
  ms = 25000, 
  retries = 2
): Promise<T> {
  let attempt = 0;

  while (attempt <= retries) {
    attempt++;
    let timeoutId: ReturnType<typeof setTimeout>;

    const promise = typeof promiseFnOrPromise === 'function' 
      ? promiseFnOrPromise() 
      : (attempt === 1 ? promiseFnOrPromise : Promise.reject(new Error('FIRESTORE_TIMEOUT')));

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('FIRESTORE_TIMEOUT'));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (err: any) {
      const isTimeout = err?.message === 'FIRESTORE_TIMEOUT' || err?.code === 'unavailable';
      if (isTimeout && attempt <= retries && typeof promiseFnOrPromise === 'function') {
        console.warn(`[Firestore] Zaman aşımı denemesi ${attempt}/${retries} başarısız oldu, yeniden deneniyor...`);
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  throw new Error('FIRESTORE_TIMEOUT');
}

/**
 * Generic helper to fetch all documents in a collection
 */
export async function fetchCollection<T>(collectionName: string): Promise<T[]> {
  const colRef = collection(db, collectionName);
  const snapshot = await withTimeout(getDocs(colRef));
  // Firestore doc.id her zaman kazanır — data.id üzerine yazmasın (silinemeyen kart bug'ı)
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as unknown as T);
}

/**
 * Recursively cleans an object by replacing undefined values with null
 * to prevent Firestore synchronization crashes.
 */
export function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item));
  }

  if (typeof obj === 'object') {
    if (obj instanceof Date || obj instanceof RegExp) {
      return obj;
    }
    const cleanObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        cleanObj[key] = val === undefined ? null : cleanUndefined(val);
      }
    }
    return cleanObj;
  }

  return obj;
}

/**
 * Generic helper to save or update a single document
 */
export async function saveDocument<T extends { id: string }>(collectionName: string, item: T): Promise<void> {
  const docRef = doc(db, collectionName, item.id);
  await withTimeout(setDoc(docRef, cleanUndefined(item), { merge: true }), 15000);
}

/** Yeni üyelik — portal + kullanıcı kayıtlarını paralel yazar */
export async function saveSignupDocuments(
  emailKey: string,
  portalData: Record<string, unknown>,
  kullaniciData: Record<string, unknown>
): Promise<void> {
  const portalRef = doc(db, 'portalKullanicilar', emailKey);
  const kullaniciRef = doc(db, 'kullanicilar', emailKey);
  const payload = cleanUndefined({ ...kullaniciData, id: emailKey, email: emailKey });

  await withTimeout(
    Promise.all([
      setDoc(portalRef, cleanUndefined(portalData), { merge: true }),
      setDoc(kullaniciRef, payload, { merge: true }),
    ]),
    30000
  );
}

/**
 * Generic helper to delete a document
 */
export async function removeDocument(collectionName: string, id: string): Promise<void> {
  const docRef = doc(db, collectionName, id);
  await withTimeout(deleteDoc(docRef), 15000);
}

/**
 * Generic helper to seed collection with initial items if empty
 */
export async function seedCollectionIfEmpty<T extends { id: string }>(
  collectionName: string, 
  initialItems: T[]
): Promise<T[]> {
  const colRef = collection(db, collectionName);
  const snapshot = await withTimeout(getDocs(colRef));
  
  if (snapshot.empty) {
    if (initialItems.length === 0) {
      return [];
    }
    console.log(`Seeding initial data for ${collectionName}...`);
    const batch = writeBatch(db);
    
    initialItems.forEach(item => {
      const docRef = doc(db, collectionName, item.id);
      batch.set(docRef, cleanUndefined(item));
    });
    
    await withTimeout(batch.commit());
    return initialItems;
  }
  
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as unknown as T);
}

export function parseYoklamaSnapshotData(
  raw: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw.dataJson === 'string') {
    try {
      return JSON.parse(raw.dataJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw.data as Record<string, unknown>) || {};
}

function buildYoklamaFirestorePayload(map: Record<string, unknown>): { dataJson: string } {
  return { dataJson: JSON.stringify(map) };
}

/**
 * Specifically seed yoklamalar because its keys are dynamic and the root is a nested map
 * Let's store yoklama in a single document 'all_yoklama' under collection 'yoklamalar' 
 * or as individual documents with { id: personelId, d: { [day]: { durum, mesai } } }
 */
export async function seedYoklamaIfEmpty(initialYoklama: any): Promise<any> {
  const docRef = doc(db, 'yoklamalar', 'global_yoklama_map');
  const docSnap = await withTimeout(getDoc(docRef));
  
  if (!docSnap.exists()) {
    console.log(`Seeding dynamic yoklama map...`);
    await withTimeout(setDoc(docRef, cleanUndefined(buildYoklamaFirestorePayload(initialYoklama))));
    return initialYoklama;
  }
  
  return parseYoklamaSnapshotData(docSnap.data() as Record<string, unknown>);
}

export async function fetchYoklamaDocument(): Promise<Record<string, unknown>> {
  const docRef = doc(db, 'yoklamalar', 'global_yoklama_map');
  const docSnap = await withTimeout(getDoc(docRef));
  if (docSnap.exists()) {
    return parseYoklamaSnapshotData(docSnap.data() as Record<string, unknown>);
  }
  return {};
}

export async function saveYoklamaDocument(
  yoklamaMap: Record<string, unknown>,
  kaynak: import('./yoklamaPersistence').YoklamaSaveSource = 'sync'
): Promise<import('./yoklamaPersistence').YoklamaSaveResult> {
  const { enqueueYoklamaSave } = await import('./yoklamaPersistence');
  return enqueueYoklamaSave(yoklamaMap as import('../types/erp').AylikYoklamaMap, kaynak);
}

/**
 * Generic helper to delta-sync live list array states to Firestore
 */
const PERSONEL_MEDIA_KEYS = ['fotografUrl', 'sigortaEvrakUrl'] as const;
const MAX_PERSONEL_SYNC_INLINE = 120_000;
const MAX_KASA_FIS_INLINE = 700_000;

/** Personel sync: değişmeyen büyük data URL’leri yazma (timeout/rollback engeli) */
function leanPersonelSyncPayload<T extends { id: string }>(item: T, oldItem?: T): T {
  const out: Record<string, unknown> = { ...(item as Record<string, unknown>) };
  const prev = (oldItem || {}) as Record<string, unknown>;
  for (const key of PERSONEL_MEDIA_KEYS) {
    const nextVal = String(out[key] || '');
    const prevVal = String(prev[key] || '');
    if (!nextVal.startsWith('data:') || nextVal.length <= MAX_PERSONEL_SYNC_INLINE) continue;
    if (!oldItem || nextVal === prevVal) {
      delete out[key];
    } else {
      delete out[key];
    }
  }
  return out as T;
}

/** Kasa: aşırı büyük inline fiş Firestore yazımını düşürüp tüm kaydı rollback ettirmesin */
function leanKasaSyncPayload<T extends { id: string }>(item: T, oldItem?: T): T {
  const out: Record<string, unknown> = { ...(item as Record<string, unknown>) };
  const nextVal = String(out.fisEvrakUrl || '');
  if (!nextVal.startsWith('data:') || nextVal.length <= MAX_KASA_FIS_INLINE) {
    return out as T;
  }
  const prevVal = String((oldItem as Record<string, unknown> | undefined)?.fisEvrakUrl || '');
  if (prevVal && !prevVal.startsWith('data:')) {
    out.fisEvrakUrl = prevVal;
  } else {
    delete out.fisEvrakUrl;
  }
  return out as T;
}

export async function syncArrayToFirestore<T extends { id: string }>(
  collectionName: string,
  oldArray: T[],
  newArray: T[]
): Promise<void> {
  // Optimized: uses a single Firestore batch commit instead of individual
  // parallel writes — reduces billing operations and network round-trips.
  try {
    const { assertErpWriteAuth } = await import('./authWriteGuard');
    const authBlock = await assertErpWriteAuth();
    if (authBlock) {
      throw new Error(authBlock);
    }

    if (collectionName === 'sahaFaaliyetleri') {
      const { syncSahaFaaliyetleriArray } = await import('./sahaFaaliyetPersistence');
      const result = await syncSahaFaaliyetleriArray(
        oldArray as unknown as import('../types/erp').SahaFaaliyeti[],
        newArray as unknown as import('../types/erp').SahaFaaliyeti[]
      );
      if (!result.ok) {
        throw new Error(result.error || 'Saha faaliyet senkronizasyonu başarısız');
      }
      return;
    }

    const massDeleteBlocked = shouldBlockMassDelete(collectionName, oldArray.length, newArray.length);
    if (massDeleteBlocked) {
      throw new Error(
        `[${collectionName}] Şüpheli toplu silme engellendi (${oldArray.length} → ${newArray.length}).`
      );
    }

    const oldMap = new Map(oldArray.map(item => [item.id, item]));
    const newMap = new Map(newArray.map(item => [item.id, item]));

    // Stable deep-compare helper (key-order independent)
    const stableStringify = (obj: any): string => {
      const isObject = (val: any) => val && typeof val === 'object' && !Array.isArray(val);
      const stringifyObj = (o: any): any => {
        if (!isObject(o)) {
          if (Array.isArray(o)) return o.map(stringifyObj);
          return o;
        }
        return Object.keys(o).sort().reduce((acc: any, key: string) => {
          acc[key] = stringifyObj(o[key]);
          return acc;
        }, {});
      };
      return JSON.stringify(stringifyObj(obj));
    };

    // Collect all operations into a single batch (max 500 per Firestore rules)
    const batch = writeBatch(db);
    let opCount = 0;

    // Save/Update new or changed items
    for (const [id, item] of newMap.entries()) {
      const oldItem = oldMap.get(id);
      if (!oldItem || stableStringify(oldItem) !== stableStringify(item)) {
        if (collectionName === 'personeller') {
          batch.set(doc(db, collectionName, id), leanPersonelSyncPayload(item, oldItem));
        } else if (collectionName === 'kasaHareketleri') {
          batch.set(doc(db, collectionName, id), leanKasaSyncPayload(item, oldItem));
        } else {
          batch.set(doc(db, collectionName, id), item);
        }
        opCount++;
      }
    }

    // Delete removed items
    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) {
        batch.delete(doc(db, collectionName, id));
        opCount++;
      }
    }

    // Only commit if there are actual changes
    if (opCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    const { formatFirestoreWriteError } = await import('./authWriteGuard');
    const friendly = formatFirestoreWriteError(error, `Error syncing ${collectionName}`);
    console.error(`Error syncing array for collection ${collectionName}:`, error);
    throw new Error(friendly);
  }
}

