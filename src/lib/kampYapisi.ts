import { KampKat, KampKaydi, KampOdasi, KampYerleske } from '../types/erp';
import { db, fetchCollection, removeDocument, saveDocument, withTimeout } from './firebase';
import { isProductionLive } from './productionDataGuard';
import { writeBatch, doc } from 'firebase/firestore';

const KAMP_PURGE_TIMEOUT_MS = 90_000;
let kampPurgeQueue: Promise<unknown> = Promise.resolve();

function kampId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function enqueueKampPurge<T>(task: () => Promise<T>): Promise<T> {
  const run = kampPurgeQueue.then(() =>
    Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                'Kamp silme işlemi zaman aşımına uğradı (90 sn). Sayfayı yenileyip tekrar deneyin.'
              )
            ),
          KAMP_PURGE_TIMEOUT_MS
        );
      }),
    ])
  );
  kampPurgeQueue = run.catch(() => {});
  return run;
}

async function verifyCollectionEmptyWithRetry(
  collectionName: string,
  retries = 4,
  delayMs = 600
): Promise<number> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const count = await verifyCollectionEmpty(collectionName);
    if (count === 0) return 0;
    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return verifyCollectionEmpty(collectionName);
}

export async function createKampYerleske(ad: string, olusturan?: string): Promise<KampYerleske> {
  const trimmed = ad.trim();
  if (!trimmed) throw new Error('Yerleşke adı boş olamaz');
  const item: KampYerleske = {
    id: kampId('ky'),
    ad: trimmed,
    olusturmaTarihi: new Date().toISOString(),
    olusturan,
  };
  await saveDocument('kampYerleskeleri', item);
  return item;
}

export async function createKampKat(
  yerleske: KampYerleske,
  ad: string,
  sira = 1
): Promise<KampKat> {
  const trimmed = ad.trim();
  if (!trimmed) throw new Error('Kat adı boş olamaz');
  const item: KampKat = {
    id: kampId('kk'),
    yerleskeId: yerleske.id,
    yerleskeAdi: yerleske.ad,
    ad: trimmed,
    sira,
    olusturmaTarihi: new Date().toISOString(),
  };
  await saveDocument('kampKatlari', item);
  return item;
}

export function katsForYerleske(katlar: KampKat[], yerleskeId: string): KampKat[] {
  return katlar
    .filter((k) => k.yerleskeId === yerleskeId)
    .sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr'));
}

export async function findYerleskeByAd(ad: string): Promise<KampYerleske | null> {
  const list = await fetchCollection<KampYerleske>('kampYerleskeleri');
  return list.find((y) => y.ad === ad.trim()) ?? null;
}

export async function findOrCreateYerleske(ad: string, olusturan?: string): Promise<KampYerleske> {
  const existing = await findYerleskeByAd(ad);
  if (existing) return existing;
  return createKampYerleske(ad, olusturan);
}

export async function findKatByYerleskeAndAd(
  yerleskeId: string,
  ad: string
): Promise<KampKat | null> {
  const list = await fetchCollection<KampKat>('kampKatlari');
  return list.find((k) => k.yerleskeId === yerleskeId && k.ad === ad.trim()) ?? null;
}

export async function findOrCreateKat(
  yerleske: KampYerleske,
  ad: string,
  sira?: number
): Promise<KampKat> {
  const existing = await findKatByYerleskeAndAd(yerleske.id, ad);
  if (existing) return existing;
  const katlar = await fetchCollection<KampKat>('kampKatlari');
  const count = katlar.filter((k) => k.yerleskeId === yerleske.id).length;
  return createKampKat(yerleske, ad, sira ?? count + 1);
}

export interface CreateKampOdasiInput {
  yerleskeAdi: string;
  kogusNo: string;
  odaNo: string;
  kapasite: number;
  firmaTipi: 'ANA_FIRMA' | 'TASERON';
  yerleskeId?: string;
  katId?: string;
  olusturan?: string;
}

/** Yerleşke + kat yapısını garanti ederek oda oluşturur (Kamp Yönetimi ↔ Kampçı Mobil ortak) */
export async function createKampOdasi(input: CreateKampOdasiInput): Promise<KampOdasi> {
  const yerleske = input.yerleskeId
    ? (await fetchCollection<KampYerleske>('kampYerleskeleri')).find((y) => y.id === input.yerleskeId)
        ?? (await findOrCreateYerleske(input.yerleskeAdi, input.olusturan))
    : await findOrCreateYerleske(input.yerleskeAdi, input.olusturan);

  const kat = input.katId
    ? (await fetchCollection<KampKat>('kampKatlari')).find((k) => k.id === input.katId)
        ?? (await findOrCreateKat(yerleske, input.kogusNo))
    : await findOrCreateKat(yerleske, input.kogusNo);

  const room: KampOdasi = {
    id: kampId('room'),
    yerleskeAdi: yerleske.ad,
    kogusNo: kat.ad,
    yerleskeId: yerleske.id,
    katId: kat.id,
    odaNo: input.odaNo.trim(),
    kapasite: Number(input.kapasite),
    firmaTipi: input.firmaTipi,
    durum: 'BOŞ',
  };

  await saveDocument('kampOdalari', room);
  return room;
}

export interface UpdateKampOdasiInput {
  room: KampOdasi;
  yerleskeAdi?: string;
  kogusNo?: string;
  odaNo?: string;
  kapasite?: number;
  firmaTipi?: 'ANA_FIRMA' | 'TASERON';
  olusturan?: string;
}

/** Oda bilgisini günceller; gerekirse yeni yerleşke/kat yapısını otomatik oluşturur */
export async function updateKampOdasi(input: UpdateKampOdasiInput): Promise<KampOdasi> {
  const current = input.room;
  const nextYerleskeAdi = (input.yerleskeAdi ?? current.yerleskeAdi).trim();
  const nextKogusNo = (input.kogusNo ?? current.kogusNo).trim();
  const nextOdaNo = (input.odaNo ?? current.odaNo).trim();
  const nextKapasite = Number(input.kapasite ?? current.kapasite);
  const nextFirmaTipi = input.firmaTipi ?? current.firmaTipi;

  if (!nextYerleskeAdi || !nextKogusNo || !nextOdaNo) {
    throw new Error('Yerleşke, kat/blok ve oda no zorunludur');
  }
  if (!Number.isFinite(nextKapasite) || nextKapasite < 1) {
    throw new Error('Kapasite en az 1 olmalıdır');
  }

  const yerleske = await findOrCreateYerleske(nextYerleskeAdi, input.olusturan);
  const kat = await findOrCreateKat(yerleske, nextKogusNo);

  const updated: KampOdasi = {
    ...current,
    yerleskeAdi: yerleske.ad,
    yerleskeId: yerleske.id,
    kogusNo: kat.ad,
    katId: kat.id,
    odaNo: nextOdaNo,
    kapasite: nextKapasite,
    firmaTipi: nextFirmaTipi,
  };

  await saveDocument('kampOdalari', updated);
  return updated;
}

export async function loadKampStateSnapshot(): Promise<{
  odalar: KampOdasi[];
  kayitlar: KampKaydi[];
  yerleskeler: KampYerleske[];
  katlar: KampKat[];
}> {
  const [odalar, kayitlar, yerleskeler, katlar] = await Promise.all([
    fetchCollection<KampOdasi>('kampOdalari'),
    fetchCollection<KampKaydi>('kampKayitlari'),
    fetchCollection<KampYerleske>('kampYerleskeleri'),
    fetchCollection<KampKat>('kampKatlari'),
  ]);
  return { odalar, kayitlar, yerleskeler, katlar };
}

export async function deleteKampOdasi(roomId: string): Promise<void> {
  await deleteKampOdasiCascade(roomId);
}

/** Oda + bağlı konaklama kayıtlarını Firestore'dan siler */
export async function deleteKampOdasiCascade(roomId: string): Promise<void> {
  const kayitlar = await fetchCollection<KampKaydi & { id: string }>('kampKayitlari');
  const linked = kayitlar.filter(
    (k) => k.odaId === roomId || k.roomId === roomId
  );
  await Promise.all([
    removeDocument('kampOdalari', roomId),
    ...linked.map((k) => removeDocument('kampKayitlari', k.id)),
  ]);
}

async function batchDeleteDocuments(collectionName: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids.filter(Boolean))];
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = writeBatch(db);
    unique.slice(i, i + CHUNK).forEach((id) => {
      batch.delete(doc(db, collectionName, id));
    });
    await withTimeout(batch.commit(), 60000);
  }
}

async function verifyCollectionEmpty(collectionName: string): Promise<number> {
  const remaining = await fetchCollection<{ id: string }>(collectionName);
  return remaining.length;
}

export interface KampMetaState {
  id: string;
  demoPurgedAt?: string;
  purgedBy?: string;
  clearedRoomCount?: number;
  version?: number;
  neverSeedDemo?: boolean;
}

export async function getKampMetaState(): Promise<KampMetaState | null> {
  const list = await fetchCollection<KampMetaState>('kampMeta');
  return list.find((m) => m.id === 'global') ?? null;
}

/** Örnek/demo kamp silindikten sonra kalıcı işaret — yenilemede geri gelmesin */
export async function saveKampDemoPurgedState(
  clearedRoomCount: number,
  purgedBy?: string
): Promise<void> {
  await saveDocument('kampMeta', {
    id: 'global',
    demoPurgedAt: new Date().toISOString(),
    purgedBy,
    clearedRoomCount,
    version: 1,
    neverSeedDemo: true,
  });
}

export async function deleteKampKat(katId: string): Promise<void> {
  await removeDocument('kampKatlari', katId);
}

export async function deleteKampYerleske(yerleskeId: string): Promise<void> {
  await removeDocument('kampYerleskeleri', yerleskeId);
}

/** Mevcut odalardan eksik yerleşke/kat kayıtlarını Firestore'a yazar */
export async function ensureYapıFromOdalari(
  kampOdalari: KampOdasi[],
  olusturan?: string
): Promise<void> {
  const pairs = new Set<string>();
  for (const room of kampOdalari) {
    if (!room.yerleskeAdi?.trim() || !room.kogusNo?.trim()) continue;
    pairs.add(`${room.yerleskeAdi.trim()}::${room.kogusNo.trim()}`);
  }
  for (const key of pairs) {
    const [yerleskeAdi, kogusNo] = key.split('::');
    const y = await findOrCreateYerleske(yerleskeAdi, olusturan);
    await findOrCreateKat(y, kogusNo);
  }
}

export function deriveCampusNames(yerleskeler: KampYerleske[]): string[] {
  return yerleskeler.map((y) => y.ad).sort((a, b) => a.localeCompare(b, 'tr'));
}

export function deriveCampusFloors(
  campusNames: string[],
  katlar: KampKat[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  campusNames.forEach((camp) => {
    result[camp] = katlar
      .filter((k) => k.yerleskeAdi === camp)
      .sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr'))
      .map((k) => k.ad);
  });
  return result;
}

export async function deleteYerleskeCascade(
  campName: string,
  yerleskeler: KampYerleske[],
  katlar: KampKat[],
  kampOdalari: KampOdasi[]
): Promise<string[]> {
  let yerleske = yerleskeler.find((y) => y.ad === campName) ?? (await findYerleskeByAd(campName));
  const roomIds = kampOdalari.filter((r) => r.yerleskeAdi === campName).map((r) => r.id);
  await Promise.all(roomIds.map((id) => deleteKampOdasi(id)));

  const katIds = katlar.filter((k) => k.yerleskeAdi === campName).map((k) => k.id);
  await Promise.all(katIds.map((id) => deleteKampKat(id)));

  if (yerleske) await deleteKampYerleske(yerleske.id);
  return roomIds;
}

export async function deleteKatCascade(
  campName: string,
  floorName: string,
  katlar: KampKat[],
  kampOdalari: KampOdasi[]
): Promise<string[]> {
  const kat = katlar.find((k) => k.yerleskeAdi === campName && k.ad === floorName);
  const roomIds = kampOdalari
    .filter((r) => r.yerleskeAdi === campName && r.kogusNo === floorName)
    .map((r) => r.id);
  await Promise.all(roomIds.map((id) => deleteKampOdasi(id)));
  if (kat) await deleteKampKat(kat.id);
  return roomIds;
}

export function isLegacyKampRoom(room: KampOdasi): boolean {
  return room.id.startsWith('ko_room_') || room.id.startsWith('demo_room_');
}

export function isLegacyKampYerleske(ad: string): boolean {
  return ad.startsWith('ko_') || ad.startsWith('demo_');
}

/** Demo/seed ile gelen örnek odalar */
export function hasLegacySeedRooms(rooms: KampOdasi[]): boolean {
  return rooms.some(isLegacyKampRoom);
}

export async function clearLegacySeedRooms(rooms: KampOdasi[]): Promise<string[]> {
  const toDelete = rooms.filter(isLegacyKampRoom);
  await Promise.all(toDelete.map((r) => deleteKampOdasi(r.id)));
  return toDelete.map((r) => r.id);
}

/** Eski demo yerleşke, kat ve odalarını Firestore'dan temizler ve kalıcı kaydeder */
export async function purgeLegacyKampData(purgedBy?: string): Promise<{
  roomIds: string[];
  kayitIds: string[];
  yerleskeIds: string[];
  katIds: string[];
}> {
  return enqueueKampPurge(async () => {
  const [rooms, kayitlar, yerleskeler, katlar] = await Promise.all([
    fetchCollection<KampOdasi & { id: string }>('kampOdalari'),
    fetchCollection<KampKaydi & { id: string }>('kampKayitlari'),
    fetchCollection<KampYerleske & { id: string }>('kampYerleskeleri'),
    fetchCollection<KampKat & { id: string }>('kampKatlari'),
  ]);

  const legacyRooms = rooms.filter(isLegacyKampRoom);
  const legacyRoomIdSet = new Set(legacyRooms.map((r) => r.id));
  const legacyYerleskeIdSet = new Set(legacyRooms.map((r) => r.yerleskeId).filter(Boolean));
  const legacyKatIdSet = new Set(legacyRooms.map((r) => r.katId).filter(Boolean));

  const legacyKayitlar = kayitlar.filter(
    (k) =>
      legacyRoomIdSet.has(k.odaId || '') ||
      legacyRoomIdSet.has(k.roomId || '') ||
      k.odaId?.startsWith('ko_room_') ||
      k.roomId?.startsWith('ko_room_')
  );

  const legacyYerleskeler = yerleskeler.filter((y) => legacyYerleskeIdSet.has(y.id));
  const legacyKatlar = katlar.filter((k) => legacyKatIdSet.has(k.id));

  await batchDeleteDocuments('kampOdalari', legacyRooms.map((r) => r.id));
  await batchDeleteDocuments('kampKayitlari', legacyKayitlar.map((k) => k.id));
  await batchDeleteDocuments('kampYerleskeleri', legacyYerleskeler.map((y) => y.id));
  await batchDeleteDocuments('kampKatlari', legacyKatlar.map((k) => k.id));

  await saveKampDemoPurgedState(legacyRooms.length, purgedBy);

  await new Promise((resolve) => setTimeout(resolve, 600));
  const remainingLegacy = (await fetchCollection<KampOdasi>('kampOdalari')).filter(isLegacyKampRoom);
  if (remainingLegacy.length > 0) {
    throw new Error(`${remainingLegacy.length} örnek oda Firestore'dan silinemedi`);
  }

  return {
    roomIds: legacyRooms.map((r) => r.id),
    kayitIds: legacyKayitlar.map((k) => k.id),
    yerleskeIds: legacyYerleskeler.map((y) => y.id),
    katIds: legacyKatlar.map((k) => k.id),
  };
  });
}

/** Realtime dinleyiciler için yardımcı */
export { collection, onSnapshot } from 'firebase/firestore';
export { db };

/** Tüm kamp verisini kalıcı olarak siler (boş başlangıç) */
export async function purgeAllKampData(): Promise<{
  odalar: number;
  kayitlar: number;
  yerleskeler: number;
  katlar: number;
}> {
  if (isProductionLive()) {
    throw new Error(
      'Canlı üretim modunda tüm kamp verisini silme engellendi. Geliştirici modunda veya test ortamında deneyin.'
    );
  }
  return enqueueKampPurge(async () => {
  const counts = { odalar: 0, kayitlar: 0, yerleskeler: 0, katlar: 0 };
  const specs: Array<[string, keyof typeof counts]> = [
    ['kampOdalari', 'odalar'],
    ['kampKayitlari', 'kayitlar'],
    ['kampYerleskeleri', 'yerleskeler'],
    ['kampKatlari', 'katlar'],
  ];
  for (const [col, key] of specs) {
    const items = await fetchCollection<{ id: string }>(col);
    counts[key] = items.length;
    await batchDeleteDocuments(col, items.map((i) => i.id));
  }
  await saveKampDemoPurgedState(counts.odalar, 'purgeAll');

  const [remainOdalar, remainKayit, remainYerleske, remainKat] = await Promise.all([
    verifyCollectionEmptyWithRetry('kampOdalari'),
    verifyCollectionEmptyWithRetry('kampKayitlari'),
    verifyCollectionEmptyWithRetry('kampYerleskeleri'),
    verifyCollectionEmptyWithRetry('kampKatlari'),
  ]);
  if (remainOdalar + remainKayit + remainYerleske + remainKat > 0) {
    throw new Error(
      `Silme tamamlanamadı: ${remainOdalar} oda, ${remainKayit} kayıt, ${remainYerleske} yerleşke, ${remainKat} kat kaldı`
    );
  }

  return counts;
  });
}

/** Uygulama açılışında eski demo odaları otomatik temizler */
export async function purgeLegacyKampIfNeeded(triggeredBy = 'auto-boot'): Promise<{
  purged: boolean;
  roomIds: string[];
}> {
  const rooms = await fetchCollection<KampOdasi & { id: string }>('kampOdalari');
  if (!hasLegacySeedRooms(rooms)) {
    return { purged: false, roomIds: [] };
  }
  const result = await purgeLegacyKampData(triggeredBy);
  return { purged: true, roomIds: result.roomIds };
}

export async function updateKampYerleskeAdi(yerleske: KampYerleske, yeniAd: string): Promise<void> {
  const trimmed = yeniAd.trim();
  if (!trimmed) throw new Error('Yerleşke adı boş olamaz');
  await saveDocument('kampYerleskeleri', { ...yerleske, ad: trimmed });
  const eskiAd = yerleske.ad;
  const [rooms, kats] = await Promise.all([
    fetchCollection<KampOdasi & { id: string }>('kampOdalari'),
    fetchCollection<KampKat & { id: string }>('kampKatlari'),
  ]);
  await Promise.all([
    ...rooms
      .filter((r) => r.yerleskeId === yerleske.id || r.yerleskeAdi === eskiAd)
      .map((r) => saveDocument('kampOdalari', { ...r, yerleskeAdi: trimmed, yerleskeId: yerleske.id })),
    ...kats
      .filter((k) => k.yerleskeId === yerleske.id)
      .map((k) => saveDocument('kampKatlari', { ...k, yerleskeAdi: trimmed })),
  ]);
}

export async function updateKampKatAdi(kat: KampKat, yeniAd: string, yeniSira?: number): Promise<void> {
  const trimmed = yeniAd.trim();
  if (!trimmed) throw new Error('Kat adı boş olamaz');
  await saveDocument('kampKatlari', {
    ...kat,
    ad: trimmed,
    sira: yeniSira ?? kat.sira,
  });
  const eskiAd = kat.ad;
  const rooms = await fetchCollection<KampOdasi & { id: string }>('kampOdalari');
  await Promise.all(
    rooms
      .filter((r) => r.katId === kat.id || (r.yerleskeAdi === kat.yerleskeAdi && r.kogusNo === eskiAd))
      .map((r) => saveDocument('kampOdalari', { ...r, kogusNo: trimmed, katId: kat.id }))
  );
}
