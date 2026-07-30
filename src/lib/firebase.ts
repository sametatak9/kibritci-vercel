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
  query
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestoreDatabaseId, resolveFirebaseConfig } from './firebaseConfig';
import { shouldBlockMassDelete } from './productionDataGuard';

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

/** Firestore güvenlik kuralları oturum gerektirir; giriş öncesi anonim oturum açar. */
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

export async function ensureFirestoreAuth(): Promise<boolean> {
  const existing = await waitForAuthUser(6000);
  if (existing) return true;

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
 * Helper to wrap any promise with a timeout
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 18000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('FIRESTORE_TIMEOUT'));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
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
  try {
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

    const promises: Promise<any>[] = [];

    // Helper for stable deep comparison independent of key order
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

    // Save/Update new or changed items
    for (const [id, item] of newMap.entries()) {
      const oldItem = oldMap.get(id);
      if (!oldItem || stableStringify(oldItem) !== stableStringify(item)) {
        // personeller: büyük foto/PDF’yi değişmediyse tekrar yazma (timeout → rollback)
        if (collectionName === 'personeller') {
          promises.push(saveDocument(collectionName, leanPersonelSyncPayload(item, oldItem)));
        } else if (collectionName === 'kasaHareketleri') {
          promises.push(saveDocument(collectionName, leanKasaSyncPayload(item, oldItem)));
        } else {
          promises.push(saveDocument(collectionName, item));
        }
      }
    }

    // Delete removed items
    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) {
        promises.push(removeDocument(collectionName, id));
      }
    }

    // #endregion
    await Promise.all(promises);
  } catch (error) {
    console.error(`Error syncing array for collection ${collectionName}:`, error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

