import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  onSnapshot,
  writeBatch,
  query
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

/**
 * Helper to wrap any promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Firebase işlem zaman aşımına uğradı (Timeout)"));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generic helper to fetch all documents in a collection
 */
export async function fetchCollection<T>(collectionName: string): Promise<T[]> {
  const colRef = collection(db, collectionName);
  const snapshot = await withTimeout(getDocs(colRef));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as unknown as T);
}

/**
 * Recursively cleans an object by replacing undefined values with null
 * to prevent Firestore synchronization crashes.
 */
function cleanUndefined(obj: any): any {
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
  await setDoc(docRef, cleanUndefined(item), { merge: true });
}

/**
 * Generic helper to delete a document
 */
export async function removeDocument(collectionName: string, id: string): Promise<void> {
  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
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
    console.log(`Seeding initial data for ${collectionName}...`);
    const batch = writeBatch(db);
    
    initialItems.forEach(item => {
      const docRef = doc(db, collectionName, item.id);
      batch.set(docRef, cleanUndefined(item));
    });
    
    await withTimeout(batch.commit());
    return initialItems;
  }
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as unknown as T);
}

/**
 * Specifically seed yoklamalar because its keys are dynamic and the root is a nested map
 * Let's store yoklama in a single document 'all_yoklama' under collection 'yoklamalar' 
 * or as individual documents with { id: personelId, d: { [day]: { durum, mesai } } }
 */
export async function seedYoklamaIfEmpty(initialYoklama: any): Promise<any> {
  const docRef = doc(db, 'yoklamalar', 'global_yoklama_map');
  const snapshot = await withTimeout(getDocs(collection(db, 'yoklamalar')));
  
  if (snapshot.empty) {
    console.log(`Seeding dynamic yoklama map...`);
    await withTimeout(setDoc(docRef, cleanUndefined({ data: initialYoklama })));
    return initialYoklama;
  }
  
  // Find 'global_yoklama_map' document
  const globalDoc = snapshot.docs.find(d => d.id === 'global_yoklama_map');
  if (globalDoc) {
    return (globalDoc.data() as any).data || {};
  }
  return {};
}

export async function saveYoklamaDocument(yoklamaMap: any): Promise<void> {
  const docRef = doc(db, 'yoklamalar', 'global_yoklama_map');
  await setDoc(docRef, cleanUndefined({ data: yoklamaMap }));
}

/**
 * Generic helper to delta-sync live list array states to Firestore
 */
export async function syncArrayToFirestore<T extends { id: string }>(
  collectionName: string,
  oldArray: T[],
  newArray: T[]
): Promise<void> {
  try {
    const oldMap = new Map(oldArray.map(item => [item.id, item]));
    const newMap = new Map(newArray.map(item => [item.id, item]));

    const promises: Promise<any>[] = [];

    // Save/Update new or changed items
    for (const [id, item] of newMap.entries()) {
      const oldItem = oldMap.get(id);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
        promises.push(saveDocument(collectionName, item));
      }
    }

    // Delete removed items
    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) {
        promises.push(removeDocument(collectionName, id));
      }
    }

    await Promise.all(promises);
  } catch (error) {
    console.error(`Error syncing array for collection ${collectionName}:`, error);
  }
}

