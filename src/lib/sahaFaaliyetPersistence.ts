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
import { SahaFaaliyeti } from '../types/erp';
import { db, cleanUndefined, withTimeout } from './firebase';
import { getFaaliyetFotolar } from './sahaFaaliyetUtils';
import { ensureSahaFaaliyetFotolarPersisted } from './sahaFaaliyetFotoStorage';
import { isProductionLive, shouldBlockMassDelete } from './productionDataGuard';

export const SAHA_FAALIYET_COLLECTION = 'sahaFaaliyetleri';
export const SAHA_FAALIYET_ARCHIVE_COLLECTION = 'sahaFaaliyetArsivleri';
const MAX_ARCHIVES = 150;

export type SahaFaaliyetSaveSource =
  | 'formen_mobil'
  | 'idari_saha'
  | 'evrak'
  | 'sync'
  | 'restore'
  | 'delete'
  | 'legacy_bootstrap';

export interface SahaFaaliyetSaveResult {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  id?: string;
}

export interface SahaFaaliyetArchiveEntry {
  id: string;
  faaliyetId: string;
  olusturmaTarihi: string;
  kaynak: SahaFaaliyetSaveSource;
  tarih?: string;
  parsel?: string;
  blok?: string;
  isNiteligi?: string;
  fotoSayisi: number;
  aciklama?: string;
}

function archiveDocId(faaliyetId: string): string {
  return `sfa_${faaliyetId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Güncellemede Formen/İdari tarafından gönderilmeyen foto alanlarını korur */
export function mergeSahaFaaliyetRecords(
  remote: SahaFaaliyeti,
  local: SahaFaaliyeti
): SahaFaaliyeti {
  const remoteFotos = getFaaliyetFotolar(remote);
  const localFotos = getFaaliyetFotolar(local);
  const fotoUrls = localFotos.length > 0 ? localFotos : remoteFotos;
  const fotoUrl = fotoUrls[0] || local.fotoUrl || remote.fotoUrl;

  return {
    ...remote,
    ...local,
    fotoUrls: fotoUrls.length ? fotoUrls : undefined,
    fotoUrl: fotoUrl || undefined,
  };
}

export async function fetchSahaFaaliyetById(id: string): Promise<SahaFaaliyeti | null> {
  const snap = await withTimeout(getDoc(doc(db, SAHA_FAALIYET_COLLECTION, id)));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SahaFaaliyeti;
}

export async function archiveSahaFaaliyet(
  record: SahaFaaliyeti,
  kaynak: SahaFaaliyetSaveSource,
  aciklama?: string
): Promise<string | null> {
  if (!record?.id) return null;

  const id = archiveDocId(record.id);
  const fotos = getFaaliyetFotolar(record);
  const payload = {
    id,
    faaliyetId: record.id,
    olusturmaTarihi: new Date().toISOString(),
    kaynak,
    tarih: record.tarih,
    parsel: record.parsel,
    blok: record.blok,
    isNiteligi: record.isNiteligi,
    fotoSayisi: fotos.length,
    aciklama: aciklama || null,
    dataJson: JSON.stringify(record),
  };

  await withTimeout(
    setDoc(doc(db, SAHA_FAALIYET_ARCHIVE_COLLECTION, id), cleanUndefined(payload)),
    25000
  );

  void pruneOldSahaFaaliyetArchives().catch((err) => {
    console.warn('Saha faaliyet arşivi temizliği atlandı:', err);
  });

  return id;
}

async function pruneOldSahaFaaliyetArchives(): Promise<void> {
  const colRef = collection(db, SAHA_FAALIYET_ARCHIVE_COLLECTION);
  const snapshot = await withTimeout(
    getDocs(query(colRef, orderBy('olusturmaTarihi', 'desc')))
  );
  if (snapshot.docs.length <= MAX_ARCHIVES) return;
  const toDelete = snapshot.docs.slice(MAX_ARCHIVES);
  await Promise.all(toDelete.map((d) => withTimeout(deleteDoc(d.ref), 10000)));
}

let saveChain: Promise<SahaFaaliyetSaveResult> = Promise.resolve({ ok: true });

export function enqueueSahaFaaliyetSave(
  record: SahaFaaliyeti,
  kaynak: SahaFaaliyetSaveSource,
  options?: { previousRecord?: SahaFaaliyeti | null }
): Promise<SahaFaaliyetSaveResult> {
  const task = saveChain.then(() => persistSahaFaaliyet(record, kaynak, options));
  saveChain = task.catch(() => ({ ok: false, error: 'Saha faaliyet kayıt kuyruğu hatası' }));
  return task;
}

export async function persistSahaFaaliyet(
  record: SahaFaaliyeti,
  kaynak: SahaFaaliyetSaveSource = 'sync',
  options?: { previousRecord?: SahaFaaliyeti | null }
): Promise<SahaFaaliyetSaveResult> {
  if (!record?.id) {
    return { ok: false, error: 'Saha faaliyet kaydı geçersiz (id yok).' };
  }

  let remote: SahaFaaliyeti | null = options?.previousRecord || null;
  if (!remote) {
    try {
      remote = await fetchSahaFaaliyetById(record.id);
    } catch {
      if (isProductionLive()) {
        return {
          ok: false,
          error:
            'Saha faaliyeti kaydedilemedi: mevcut kayıt okunamadı. Fotoğraflar korunması için kayıt iptal edildi.',
        };
      }
    }
  }

  // data: URL → Storage (Firestore 1MB); mevcut http URL'ler korunur
  let prepared = record;
  try {
    prepared = await ensureSahaFaaliyetFotolarPersisted(record);
  } catch (err) {
    console.warn('Saha foto Storage hazırlığı atlandı:', err);
  }

  const payload = remote ? mergeSahaFaaliyetRecords(remote, prepared) : prepared;

  if (remote) {
    await archiveSahaFaaliyet(remote, kaynak, 'Güncelleme öncesi otomatik yedek');
  }

  try {
    const cleaned = cleanUndefined(payload) as Record<string, unknown>;
    // Boş foto alanlarını null yazma — merge:true ile mevcut fotoğrafları silmesin
    if (getFaaliyetFotolar(payload).length === 0) {
      delete cleaned.fotoUrls;
      delete cleaned.fotoUrl;
      delete cleaned.sahaFotoBase64;
      delete cleaned.fotoBase64;
    }
    await withTimeout(
      setDoc(doc(db, SAHA_FAALIYET_COLLECTION, payload.id), cleaned, {
        merge: true,
      }),
      45000
    );
    return { ok: true, id: payload.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Saha faaliyeti yazılamadı: ${msg}` };
  }
}

export async function removeSahaFaaliyetSafe(
  id: string,
  kaynak: SahaFaaliyetSaveSource = 'delete',
  existingRecord?: SahaFaaliyeti | null
): Promise<SahaFaaliyetSaveResult> {
  let record = existingRecord || null;
  if (!record) {
    try {
      record = await fetchSahaFaaliyetById(id);
    } catch {
      /* yok */
    }
  }

  if (record) {
    await archiveSahaFaaliyet(record, kaynak, 'Silme öncesi otomatik yedek');
  }

  try {
    await withTimeout(deleteDoc(doc(db, SAHA_FAALIYET_COLLECTION, id)), 15000);
    return { ok: true, id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Saha faaliyeti silinemedi: ${msg}` };
  }
}

export async function syncSahaFaaliyetleriArray(
  oldArray: SahaFaaliyeti[],
  newArray: SahaFaaliyeti[]
): Promise<SahaFaaliyetSaveResult> {
  const massDeleteBlocked = shouldBlockMassDelete(
    SAHA_FAALIYET_COLLECTION,
    oldArray.length,
    newArray.length
  );
  if (massDeleteBlocked) {
    return {
      ok: false,
      blocked: true,
      error: 'Şüpheli toplu saha faaliyeti silme engellendi.',
    };
  }

  const oldMap = new Map(oldArray.map((item) => [item.id, item]));
  const newMap = new Map(newArray.map((item) => [item.id, item]));

  for (const [id, item] of newMap.entries()) {
    const oldItem = oldMap.get(id);
    if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
      const result = await enqueueSahaFaaliyetSave(item, 'sync', { previousRecord: oldItem });
      if (!result.ok) return result;
    }
  }

  for (const id of oldMap.keys()) {
    if (!newMap.has(id)) {
      const result = await removeSahaFaaliyetSafe(id, 'delete', oldMap.get(id));
      if (!result.ok) return result;
    }
  }

  return { ok: true };
}

export async function listSahaFaaliyetArchives(
  limitCount = 25
): Promise<SahaFaaliyetArchiveEntry[]> {
  const colRef = collection(db, SAHA_FAALIYET_ARCHIVE_COLLECTION);
  const snapshot = await withTimeout(
    getDocs(query(colRef, orderBy('olusturmaTarihi', 'desc'), limit(limitCount)))
  );
  return snapshot.docs.map((d) => {
    const data = d.data() as SahaFaaliyetArchiveEntry & { dataJson?: string };
    return {
      id: data.id || d.id,
      faaliyetId: data.faaliyetId,
      olusturmaTarihi: data.olusturmaTarihi,
      kaynak: data.kaynak,
      tarih: data.tarih,
      parsel: data.parsel,
      blok: data.blok,
      isNiteligi: data.isNiteligi,
      fotoSayisi: data.fotoSayisi,
      aciklama: data.aciklama,
    };
  });
}

export async function loadSahaFaaliyetArchiveRecord(
  archiveId: string
): Promise<SahaFaaliyeti | null> {
  const snap = await withTimeout(getDoc(doc(db, SAHA_FAALIYET_ARCHIVE_COLLECTION, archiveId)));
  if (!snap.exists()) return null;
  const raw = snap.data() as { dataJson?: string };
  if (!raw.dataJson) return null;
  try {
    return JSON.parse(raw.dataJson) as SahaFaaliyeti;
  } catch {
    return null;
  }
}

export async function restoreSahaFaaliyetFromArchive(
  archiveId: string
): Promise<SahaFaaliyetSaveResult> {
  const archived = await loadSahaFaaliyetArchiveRecord(archiveId);
  if (!archived?.id) {
    return { ok: false, error: 'Arşiv kaydı okunamadı veya geçersiz.' };
  }

  const remote = await fetchSahaFaaliyetById(archived.id);
  if (remote) {
    await archiveSahaFaaliyet(remote, 'restore', `Geri yükleme öncesi yedek (${archiveId})`);
  }

  return enqueueSahaFaaliyetSave(archived, 'restore', { previousRecord: remote });
}
