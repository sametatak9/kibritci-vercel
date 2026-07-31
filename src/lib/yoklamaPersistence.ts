import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { AylikYoklamaMap } from '../types/erp';
import { db, cleanUndefined, withTimeout } from './firebase';
import { formatFirestoreWriteError } from './authWriteGuard';
import {
  countYoklamaDateKeys,
  countYoklamaDayEntries,
  countYoklamaFilledDays,
  countYoklamaPersons,
  mergeYoklamaMaps,
  shouldBlockYoklamaMassWrite,
} from './yoklamaGuard';
import { hasSubstantialYoklamaData, isProductionLive } from './productionDataGuard';

export const YOKLAMA_DOC_ID = 'global_yoklama_map';
export const YOKLAMA_ARCHIVE_COLLECTION = 'yoklamaArsivleri';
const MAX_ARCHIVES = 80;

export type YoklamaSaveSource =
  | 'yoklama_screen'
  | 'formen_mobil'
  | 'idari'
  | 'kamp'
  | 'evrak'
  | 'legacy_bootstrap'
  | 'restore'
  | 'sync';

export interface YoklamaSaveResult {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  personCount?: number;
  filledDayCount?: number;
  /** Sunucuya yazılan birleşik harita (yerel state bununla güncellenmeli) */
  map?: AylikYoklamaMap;
}

export interface YoklamaArchiveEntry {
  id: string;
  olusturmaTarihi: string;
  kaynak: YoklamaSaveSource;
  personelSayisi: number;
  gunSayisi: number;
  doluGunSayisi: number;
  tarihAnahtarSayisi: number;
  aciklama?: string;
}

function buildYoklamaFirestorePayload(map: Record<string, unknown>): { dataJson: string } {
  return { dataJson: JSON.stringify(map) };
}

export function parseYoklamaDataJson(raw: Record<string, unknown> | undefined): AylikYoklamaMap {
  if (!raw) return {};
  if (typeof raw.dataJson === 'string') {
    try {
      return JSON.parse(raw.dataJson) as AylikYoklamaMap;
    } catch {
      return {};
    }
  }
  return (raw.data as AylikYoklamaMap) || {};
}

export async function fetchYoklamaMap(): Promise<AylikYoklamaMap> {
  const docRef = doc(db, 'yoklamalar', YOKLAMA_DOC_ID);
  const docSnap = await withTimeout(getDoc(docRef));
  if (!docSnap.exists()) return {};
  return parseYoklamaDataJson(docSnap.data() as Record<string, unknown>);
}

async function fetchYoklamaMapWithRetry(retries = 3): Promise<AylikYoklamaMap> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchYoklamaMap();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Yoklama belgesi okunamadı');
}

async function writeYoklamaMap(map: AylikYoklamaMap): Promise<void> {
  const docRef = doc(db, 'yoklamalar', YOKLAMA_DOC_ID);
  await withTimeout(
    setDoc(docRef, cleanUndefined(buildYoklamaFirestorePayload(map)), { merge: false }),
    45000
  );
}

function archiveDocId(): string {
  return `arsiv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function archiveYoklamaSnapshot(
  map: AylikYoklamaMap,
  kaynak: YoklamaSaveSource,
  aciklama?: string
): Promise<string | null> {
  const personelSayisi = countYoklamaPersons(map);
  const gunSayisi = countYoklamaDayEntries(map);
  if (personelSayisi === 0 && gunSayisi === 0) return null;

  const id = archiveDocId();
  const payload = {
    id,
    olusturmaTarihi: new Date().toISOString(),
    kaynak,
    personelSayisi,
    gunSayisi,
    doluGunSayisi: countYoklamaFilledDays(map),
    tarihAnahtarSayisi: countYoklamaDateKeys(map),
    aciklama: aciklama || null,
    dataJson: JSON.stringify(map),
  };

  await withTimeout(
    setDoc(doc(db, YOKLAMA_ARCHIVE_COLLECTION, id), cleanUndefined(payload)),
    20000
  );

  void pruneOldYoklamaArchives().catch((err) => {
    console.warn('Yoklama arşivi temizliği atlandı:', err);
  });

  return id;
}

async function pruneOldYoklamaArchives(): Promise<void> {
  const colRef = collection(db, YOKLAMA_ARCHIVE_COLLECTION);
  const snapshot = await withTimeout(
    getDocs(query(colRef, orderBy('olusturmaTarihi', 'desc')))
  );
  const docs = snapshot.docs;
  if (docs.length <= MAX_ARCHIVES) return;

  const toDelete = docs.slice(MAX_ARCHIVES);
  await Promise.all(toDelete.map((d) => withTimeout(deleteDoc(d.ref), 10000)));
}

export async function listYoklamaArchives(limitCount = 25): Promise<YoklamaArchiveEntry[]> {
  const colRef = collection(db, YOKLAMA_ARCHIVE_COLLECTION);
  const snapshot = await withTimeout(
    getDocs(query(colRef, orderBy('olusturmaTarihi', 'desc'), limit(limitCount)))
  );
  return snapshot.docs.map((d) => {
    const data = d.data() as YoklamaArchiveEntry & { dataJson?: string };
    return {
      id: data.id || d.id,
      olusturmaTarihi: data.olusturmaTarihi,
      kaynak: data.kaynak,
      personelSayisi: data.personelSayisi,
      gunSayisi: data.gunSayisi,
      doluGunSayisi: data.doluGunSayisi,
      tarihAnahtarSayisi: data.tarihAnahtarSayisi,
      aciklama: data.aciklama,
    };
  });
}

export async function loadYoklamaArchiveMap(archiveId: string): Promise<AylikYoklamaMap> {
  const snapshot = await withTimeout(getDocs(collection(db, YOKLAMA_ARCHIVE_COLLECTION)));
  const found = snapshot.docs.find((d) => d.id === archiveId);
  if (!found) throw new Error('Arşiv kaydı bulunamadı');
  return parseYoklamaDataJson(found.data() as Record<string, unknown>);
}

let saveChain: Promise<YoklamaSaveResult> = Promise.resolve({ ok: true });

export function enqueueYoklamaSave(
  localMap: AylikYoklamaMap,
  kaynak: YoklamaSaveSource
): Promise<YoklamaSaveResult> {
  const task = saveChain.then(() => persistYoklamaDocument(localMap, kaynak));
  saveChain = task.catch(() => ({ ok: false, error: 'Kayıt kuyruğu hatası' }));
  return task;
}

export async function persistYoklamaDocument(
  localMap: AylikYoklamaMap,
  kaynak: YoklamaSaveSource = 'sync'
): Promise<YoklamaSaveResult> {
  let remote: AylikYoklamaMap;

  try {
    remote = await fetchYoklamaMapWithRetry(isProductionLive() ? 3 : 2);
  } catch (err) {
    if (isProductionLive() || hasSubstantialYoklamaData(localMap)) {
      return {
        ok: false,
        error:
          'Yoklama kaydedilemedi: sunucudaki mevcut veri okunamadı. Kayıt güvenlik nedeniyle iptal edildi. Bağlantınızı kontrol edip tekrar deneyin.',
      };
    }
    remote = {};
  }

  const remoteNonEmpty = Object.keys(remote).length > 0;
  const payload = remoteNonEmpty
    ? (mergeYoklamaMaps(remote, localMap) as AylikYoklamaMap)
    : localMap;

  if (remoteNonEmpty) {
    const guard = shouldBlockYoklamaMassWrite(remote, payload);
    if (guard.blocked) {
      await archiveYoklamaSnapshot(remote, kaynak, `Engellenen yazma: ${guard.reason}`);
      return { ok: false, blocked: true, error: guard.reason };
    }
  }

  if (remoteNonEmpty) {
    await archiveYoklamaSnapshot(remote, kaynak, 'Kayıt öncesi otomatik yedek');
  }

  try {
    await writeYoklamaMap(payload);
    return {
      ok: true,
      map: payload,
      personCount: countYoklamaPersons(payload),
      filledDayCount: countYoklamaFilledDays(payload),
    };
  } catch (err) {
    const msg = formatFirestoreWriteError(err, 'Yoklama yazılamadı');
    return { ok: false, error: `Yoklama yazılamadı: ${msg}` };
  }
}

export async function restoreYoklamaFromArchive(
  archiveId: string,
  kaynak: YoklamaSaveSource = 'restore'
): Promise<YoklamaSaveResult> {
  const archivedMap = await loadYoklamaArchiveMap(archiveId);
  if (!hasSubstantialYoklamaData(archivedMap) && countYoklamaDayEntries(archivedMap) < 5) {
    return { ok: false, error: 'Seçilen arşiv kaydı boş veya geçersiz görünüyor.' };
  }

  let remote: AylikYoklamaMap = {};
  try {
    remote = await fetchYoklamaMapWithRetry(3);
  } catch {
    /* ilk kurulum */
  }

  if (Object.keys(remote).length > 0) {
    await archiveYoklamaSnapshot(remote, 'restore', `Geri yükleme öncesi yedek (hedef: ${archiveId})`);
  }

  const merged = Object.keys(remote).length > 0
    ? (mergeYoklamaMaps(remote, archivedMap) as AylikYoklamaMap)
    : archivedMap;

  try {
    await writeYoklamaMap(merged);
    return {
      ok: true,
      personCount: countYoklamaPersons(merged),
      filledDayCount: countYoklamaFilledDays(merged),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Geri yükleme başarısız: ${msg}` };
  }
}
