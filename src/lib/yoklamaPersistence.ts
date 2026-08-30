import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
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
/** Mega-belge: PC'de getDocFromServer sık timeout — cache/ay shard tercih edilir */
export const YOKLAMA_SERVER_READ_TIMEOUT_MS = 90_000;
export const YOKLAMA_CACHE_READ_TIMEOUT_MS = 35_000;
export const YOKLAMA_WRITE_TIMEOUT_MS = 60_000;
export const YOKLAMA_MONTH_READ_TIMEOUT_MS = 20_000;
/** Arşiv budama en fazla bu kadar saniyede bir çalışır (her kayıtta tam tarama yok) */
const ARCHIVE_PRUNE_MIN_INTERVAL_MS = 10 * 60 * 1000;

let lastArchivePruneAt = 0;
let archivePruneInFlight: Promise<void> | null = null;
let monthShardMigrateInFlight: Promise<void> | null = null;
let monthShardQueued: AylikYoklamaMap | null = null;

export type YoklamaSaveSource =
  | 'yoklama_screen'
  | 'formen_mobil'
  | 'idari'
  | 'kamp'
  | 'evrak'
  | 'legacy_bootstrap'
  | 'restore'
  | 'sync'
  | 'personel_merge';

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
      const parsed = JSON.parse(raw.dataJson) as AylikYoklamaMap;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* eski `data` alanına düş */
    }
  }
  return (raw.data as AylikYoklamaMap) || {};
}

/** Silinen personel id'lerinin günlerini kalan karta taşır; eski anahtarı düşürür. */
export function remapYoklamaMapPersonelIds(
  map: AylikYoklamaMap,
  fromIds: string[],
  keepId: string
): AylikYoklamaMap {
  const next: AylikYoklamaMap = { ...map };
  for (const fromId of fromIds) {
    if (!fromId || fromId === keepId) continue;
    const dupe = next[fromId];
    if (!dupe) continue;
    const keep = { ...(next[keepId] || {}) };
    for (const [day, data] of Object.entries(dupe)) {
      if (!data) continue;
      const existing = keep[Number(day)] || keep[day as unknown as number];
      if (!existing || !existing.durum || existing.durum === 'Girilmedi') {
        keep[Number.isNaN(Number(day)) ? (day as unknown as number) : Number(day)] = data;
      }
    }
    next[keepId] = keep;
    delete next[fromId];
  }
  return next;
}

/** Son yoklama arşivlerinde aynı id taşımasını yapar (birleştirme sonrası tek kayıt). */
export async function remapYoklamaArchivesPersonelIds(
  fromIds: string[],
  keepId: string
): Promise<number> {
  const ids = fromIds.filter((id) => id && id !== keepId);
  if (!ids.length || !keepId) return 0;
  const colRef = collection(db, YOKLAMA_ARCHIVE_COLLECTION);
  const snapshot = await withTimeout(
    getDocs(query(colRef, orderBy('olusturmaTarihi', 'desc'), limit(40)))
  );
  let patched = 0;
  for (const snap of snapshot.docs) {
    const raw = snap.data() as Record<string, unknown>;
    const map = parseYoklamaDataJson(raw);
    if (!ids.some((id) => Object.prototype.hasOwnProperty.call(map, id))) continue;
    const next = remapYoklamaMapPersonelIds(map, ids, keepId);
    try {
      await withTimeout(
        setDoc(
          snap.ref,
          cleanUndefined({
            ...raw,
            dataJson: JSON.stringify(next),
            personelSayisi: countYoklamaPersons(next),
            gunSayisi: countYoklamaDayEntries(next),
            doluGunSayisi: countYoklamaFilledDays(next),
          }),
          { merge: true }
        ),
        20000
      );
      patched += 1;
    } catch (err) {
      console.warn('Yoklama arşivi id taşıması atlandı', snap.id, err);
    }
  }
  return patched;
}

export function yoklamaMonthDocId(yearMonth: string): string {
  return `ay_${yearMonth}`;
}

/** Haritadaki YYYY-MM anahtarlarını listeler */
export function listYoklamaYearMonths(map: AylikYoklamaMap): string[] {
  const months = new Set<string>();
  for (const personMap of Object.values(map || {})) {
    if (!personMap || typeof personMap !== 'object') continue;
    for (const key of Object.keys(personMap)) {
      const m = key.match(/^(\d{4}-\d{2})-\d{2}$/);
      if (m) months.add(m[1]);
    }
  }
  return [...months].sort();
}

export function sliceYoklamaMapToYearMonth(map: AylikYoklamaMap, yearMonth: string): AylikYoklamaMap {
  const prefix = `${yearMonth}-`;
  const out: AylikYoklamaMap = {};
  for (const [personId, days] of Object.entries(map || {})) {
    if (!days || typeof days !== 'object') continue;
    const sliced: Record<string, unknown> = {};
    for (const [dayKey, val] of Object.entries(days)) {
      if (dayKey.startsWith(prefix)) sliced[dayKey] = val;
    }
    if (Object.keys(sliced).length > 0) {
      out[personId] = sliced as AylikYoklamaMap[string];
    }
  }
  return out;
}

function countFilledInYearMonths(map: AylikYoklamaMap, yearMonths: string[]): number {
  if (!yearMonths.length) return countYoklamaFilledDays(map);
  let total = 0;
  for (const ym of yearMonths) {
    total += countYoklamaFilledDays(sliceYoklamaMapToYearMonth(map, ym));
  }
  return total;
}

function surroundingYearMonths(center = new Date(), radius = 2): string[] {
  const out: string[] = [];
  const y = center.getFullYear();
  const m = center.getMonth(); // 0-based
  for (let i = -radius; i <= radius; i++) {
    const d = new Date(y, m + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

async function fetchMonthShard(yearMonth: string): Promise<AylikYoklamaMap> {
  const docRef = doc(db, 'yoklamalar', yoklamaMonthDocId(yearMonth));
  try {
    const snap = await withTimeout(getDoc(docRef), YOKLAMA_MONTH_READ_TIMEOUT_MS);
    if (!snap.exists()) return {};
    return parseYoklamaDataJson(snap.data() as Record<string, unknown>);
  } catch {
    return {};
  }
}

/** Yazmadan önce güncel ay: cache değil sunucu (başka rolün sabah kaydı kaybolmasın) */
async function fetchMonthShardPreferServer(yearMonth: string): Promise<AylikYoklamaMap> {
  const docRef = doc(db, 'yoklamalar', yoklamaMonthDocId(yearMonth));
  try {
    const snap = await withTimeout(getDocFromServer(docRef), YOKLAMA_MONTH_READ_TIMEOUT_MS);
    if (!snap.exists()) return {};
    return parseYoklamaDataJson(snap.data() as Record<string, unknown>);
  } catch {
    return fetchMonthShard(yearMonth);
  }
}

/** Küçük ay belgelerini paralel oku — PC timeout'ta ana belgeye gerek kalmaz */
export async function fetchYoklamaMonthShards(
  yearMonths: string[]
): Promise<AylikYoklamaMap> {
  const unique = [...new Set(yearMonths.filter(Boolean))];
  if (unique.length === 0) return {};
  const parts = await Promise.all(unique.map((ym) => fetchMonthShard(ym)));
  let merged: AylikYoklamaMap = {};
  for (const part of parts) {
    if (Object.keys(part).length === 0) continue;
    merged = mergeYoklamaMaps(merged, part) as AylikYoklamaMap;
  }
  return merged;
}

async function writeMonthShard(yearMonth: string, slice: AylikYoklamaMap): Promise<void> {
  if (Object.keys(slice).length === 0) return;
  const docRef = doc(db, 'yoklamalar', yoklamaMonthDocId(yearMonth));
  await withTimeout(
    setDoc(
      docRef,
      cleanUndefined({
        ...buildYoklamaFirestorePayload(slice),
        yearMonth,
        updatedAt: new Date().toISOString(),
        personCount: countYoklamaPersons(slice),
        filledDayCount: countYoklamaFilledDays(slice),
      }),
      { merge: false }
    ),
    25_000
  );
}

/** Büyük haritayı ay belgelerine böler (arka plan; hata yutma) */
export function scheduleYoklamaMonthShardSync(map: AylikYoklamaMap): void {
  if (monthShardMigrateInFlight) {
    monthShardQueued = map;
    return;
  }
  const months = listYoklamaYearMonths(map);
  if (months.length === 0) return;
  monthShardMigrateInFlight = (async () => {
    // Önce yakın aylar — PC Temmuz yüklemesi için kritik
    const near = new Set(surroundingYearMonths(new Date(), 3));
    const ordered = [
      ...months.filter((m) => near.has(m)),
      ...months.filter((m) => !near.has(m)),
    ];
    for (const ym of ordered) {
      try {
        const slice = sliceYoklamaMapToYearMonth(map, ym);
        await writeMonthShard(ym, slice);
      } catch (err) {
        console.warn('[yoklama] ay shard yazılamadı', ym, err);
      }
    }
  })()
    .catch((err) => console.warn('[yoklama] ay shard senkronu atlandı:', err))
    .finally(() => {
      monthShardMigrateInFlight = null;
      if (monthShardQueued) {
        const queued = monthShardQueued;
        monthShardQueued = null;
        scheduleYoklamaMonthShardSync(queued);
      }
    });
}

export async function fetchYoklamaMap(): Promise<AylikYoklamaMap> {
  const docRef = doc(db, 'yoklamalar', YOKLAMA_DOC_ID);
  const docSnap = await withTimeout(getDoc(docRef), YOKLAMA_CACHE_READ_TIMEOUT_MS);
  if (!docSnap.exists()) return {};
  return parseYoklamaDataJson(docSnap.data() as Record<string, unknown>);
}

/** IndexedDB önbelleğini atlayıp sunucudan oku (masaüstü/telefon senkron farkı için). */
export async function fetchYoklamaMapFromServer(): Promise<{
  map: AylikYoklamaMap;
  dataJson: string | null;
}> {
  const docRef = doc(db, 'yoklamalar', YOKLAMA_DOC_ID);
  const docSnap = await withTimeout(getDocFromServer(docRef), YOKLAMA_SERVER_READ_TIMEOUT_MS);
  if (!docSnap.exists()) return { map: {}, dataJson: null };
  const raw = docSnap.data() as Record<string, unknown>;
  return {
    map: parseYoklamaDataJson(raw),
    dataJson: typeof raw.dataJson === 'string' ? raw.dataJson : null,
  };
}

/** Sunucu okuması: timeout / ağ kopmasında birkaç kez dene. */
export async function fetchYoklamaMapFromServerWithRetry(retries = 3): Promise<{
  map: AylikYoklamaMap;
  dataJson: string | null;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchYoklamaMapFromServer();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Yoklama sunucudan okunamadı');
}

/**
 * PC dostu yükleme: önce cache (getDoc), sonra ay shard'ları, en son mega-belge sunucu.
 * Zaman aşımında boş dönmek yerine eldeki en dolu haritayı verir.
 */
export async function fetchYoklamaMapPreferFast(opts?: {
  yearMonths?: string[];
  allowServerForce?: boolean;
}): Promise<{
  map: AylikYoklamaMap;
  dataJson: string | null;
  source: 'cache' | 'month_shards' | 'server' | 'merged';
}> {
  const yearMonths = opts?.yearMonths?.length
    ? opts.yearMonths
    : surroundingYearMonths(new Date(), 2);
  const allowServerForce = opts?.allowServerForce !== false;

  let best: AylikYoklamaMap = {};
  let bestFilled = 0;
  let dataJson: string | null = null;
  let source: 'cache' | 'month_shards' | 'server' | 'merged' = 'cache';

  // 1) Cache / local — PC'de IndexedDB çoğu zaman dolu; getDocFromServer'a gerek yok
  try {
    const cached = await fetchYoklamaMapWithRetry(2);
    const filled = countYoklamaFilledDays(cached);
    if (filled > bestFilled) {
      best = cached;
      bestFilled = filled;
      source = 'cache';
      try {
        dataJson = JSON.stringify(cached);
      } catch {
        dataJson = null;
      }
    }
  } catch (err) {
    console.warn('[yoklama] cache okuma başarısız:', err);
  }

  // 2) Ay shard'ları (küçük belgeler — timeout riski düşük)
  try {
    const shards = await fetchYoklamaMonthShards(yearMonths);
    const shardFilled = countYoklamaFilledDays(shards);
    if (shardFilled > 0) {
      if (bestFilled > 0) {
        best = mergeYoklamaMaps(best, shards) as AylikYoklamaMap;
        bestFilled = countYoklamaFilledDays(best);
        source = 'merged';
      } else {
        best = shards;
        bestFilled = shardFilled;
        source = 'month_shards';
      }
    }
  } catch (err) {
    console.warn('[yoklama] ay shard okuma atlandı:', err);
  }

  // 3) Genel cache dolu ama istenen aylar boşsa (PC’de sık: eski aylar var, Temmuz yok)
  //    veya cache zayıfsa → sunucu. Timeout olursa eldeki cache ile devam (throw yok).
  const requestedFilled = countFilledInYearMonths(best, yearMonths);
  const needServer =
    allowServerForce &&
    (bestFilled < 30 || !hasSubstantialYoklamaData(best) || requestedFilled < 5);

  if (needServer) {
    try {
      const server = await fetchYoklamaMapFromServerWithRetry(2);
      const serverFilled = countYoklamaFilledDays(server.map);
      if (serverFilled >= bestFilled) {
        best = server.map;
        bestFilled = serverFilled;
        dataJson = server.dataJson;
        source = 'server';
      } else if (serverFilled > 0) {
        best = mergeYoklamaMaps(best, server.map) as AylikYoklamaMap;
        bestFilled = countYoklamaFilledDays(best);
        source = 'merged';
      }
    } catch (err) {
      console.warn('[yoklama] sunucu mega-belge okunamadı (cache/shard ile devam):', err);
      if (bestFilled === 0) {
        throw err instanceof Error
          ? err
          : new Error(
              'Yoklama yüklenemedi: bağlantı zaman aşımı. Önbellek ve ay yedekleri de boş.'
            );
      }
    }
  } else if (allowServerForce && bestFilled >= 30) {
    // Arka plan sessiz yenileme — UI’yi bekletmez / toast atmaz
    void fetchYoklamaMapFromServer()
      .then((server) => {
        scheduleYoklamaMonthShardSync(server.map);
      })
      .catch(() => undefined);
  }

  if (bestFilled >= 30) {
    scheduleYoklamaMonthShardSync(best);
  }

  return { map: best, dataJson, source };
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
    YOKLAMA_WRITE_TIMEOUT_MS
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

  const now = Date.now();
  if (now - lastArchivePruneAt >= ARCHIVE_PRUNE_MIN_INTERVAL_MS) {
    lastArchivePruneAt = now;
    if (!archivePruneInFlight) {
      archivePruneInFlight = pruneOldYoklamaArchives()
        .catch((err) => {
          console.warn('Yoklama arşivi temizliği atlandı:', err);
        })
        .finally(() => {
          archivePruneInFlight = null;
        });
    }
  }

  return id;
}

async function pruneOldYoklamaArchives(): Promise<void> {
  const colRef = collection(db, YOKLAMA_ARCHIVE_COLLECTION);
  // Sadece fazlalık kadar oku — tüm arşiv koleksiyonunu çekme
  const snapshot = await withTimeout(
    getDocs(query(colRef, orderBy('olusturmaTarihi', 'desc'), limit(MAX_ARCHIVES + 25)))
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
  const found = await withTimeout(getDoc(doc(db, YOKLAMA_ARCHIVE_COLLECTION, archiveId)));
  if (!found.exists()) throw new Error('Arşiv kaydı bulunamadı');
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

/** Yazmadan önce uzak harita: cache + güncel ay sunucu shard. Mega-belge ancak tam ise ezilir. */
async function loadRemoteForWrite(): Promise<{ map: AylikYoklamaMap; allowMegaWrite: boolean }> {
  let map: AylikYoklamaMap = {};
  let allowMegaWrite = false;

  try {
    const cached = await fetchYoklamaMapWithRetry(isProductionLive() ? 3 : 2);
    const cachedFilled = countYoklamaFilledDays(cached);
    if (cachedFilled > 0) {
      map = cached;
      if (hasSubstantialYoklamaData(cached) || cachedFilled >= 30) {
        allowMegaWrite = true;
      }
    }
  } catch {
    /* cache boş / timeout */
  }

  try {
    const parts = await Promise.all(
      surroundingYearMonths(new Date(), 1).map((ym) => fetchMonthShardPreferServer(ym))
    );
    for (const part of parts) {
      if (Object.keys(part).length === 0) continue;
      map = mergeYoklamaMaps(map, part) as AylikYoklamaMap;
    }
  } catch {
    /* ignore */
  }

  if (!allowMegaWrite) {
    try {
      const server = await fetchYoklamaMapFromServerWithRetry(2);
      const serverFilled = countYoklamaFilledDays(server.map);
      if (serverFilled > 0) {
        map =
          Object.keys(map).length > 0
            ? (mergeYoklamaMaps(server.map, map) as AylikYoklamaMap)
            : server.map;
        if (hasSubstantialYoklamaData(server.map) || serverFilled >= 30) {
          allowMegaWrite = true;
        }
      }
    } catch {
      /* mega okunamadı — yalnızca shard ile devam */
    }
  } else {
    void fetchYoklamaMapFromServer()
      .then((s) => {
        if (countYoklamaFilledDays(s.map) > countYoklamaFilledDays(map) + 20) {
          scheduleYoklamaMonthShardSync(s.map);
        }
      })
      .catch(() => undefined);
  }

  if (Object.keys(map).length === 0) {
    map = (await fetchYoklamaMapFromServerWithRetry(2)).map;
    allowMegaWrite = hasSubstantialYoklamaData(map) || countYoklamaFilledDays(map) >= 30;
  }

  return { map, allowMegaWrite };
}

async function writeTouchedMonthShards(
  fullMap: AylikYoklamaMap,
  localMap: AylikYoklamaMap
): Promise<void> {
  const months = listYoklamaYearMonths(localMap);
  const targets = months.length > 0 ? months : surroundingYearMonths(new Date(), 0);
  for (const ym of targets) {
    try {
      await writeMonthShard(ym, sliceYoklamaMapToYearMonth(fullMap, ym));
    } catch (err) {
      console.warn('[yoklama] dokunulan ay shard yazılamadı', ym, err);
    }
  }
}

export async function persistYoklamaDocument(
  localMap: AylikYoklamaMap,
  kaynak: YoklamaSaveSource = 'sync',
  options?: { dropPersonelIds?: string[] }
): Promise<YoklamaSaveResult> {
  let remote: AylikYoklamaMap;
  let allowMegaWrite = false;

  try {
    const loaded = await loadRemoteForWrite();
    remote = loaded.map;
    allowMegaWrite = loaded.allowMegaWrite;
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
  const payloadRaw = remoteNonEmpty
    ? (mergeYoklamaMaps(remote, localMap) as AylikYoklamaMap)
    : localMap;
  const dropIds = (options?.dropPersonelIds || []).filter(Boolean);
  const payload: AylikYoklamaMap = dropIds.length
    ? Object.fromEntries(Object.entries(payloadRaw).filter(([id]) => !dropIds.includes(id)))
    : payloadRaw;

  if (remoteNonEmpty) {
    const guard = shouldBlockYoklamaMassWrite(remote, payload);
    if (guard.blocked) {
      void archiveYoklamaSnapshot(remote, kaynak, `Engellenen yazma: ${guard.reason}`).catch((e) =>
        console.warn('Engellenen yazma arşivi atlandı:', e)
      );
      return { ok: false, blocked: true, error: guard.reason };
    }
  }

  try {
    // Kısmi uzak harita ile mega-belgeyi ezme (geçmiş aylar kaybolmasın)
    if (allowMegaWrite || !remoteNonEmpty) {
      await writeYoklamaMap(payload);
    } else {
      console.warn('[yoklama] mega-belge yazımı atlandı (uzak harita kısmi); ay yedeği yazılıyor');
    }
    await writeTouchedMonthShards(payload, localMap);
    scheduleYoklamaMonthShardSync(payload);
    if (remoteNonEmpty) {
      void archiveYoklamaSnapshot(remote, kaynak, 'Kayıt sonrası otomatik yedek').catch((e) =>
        console.warn('Yoklama arşivi atlandı:', e)
      );
    }
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
    scheduleYoklamaMonthShardSync(merged);
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
