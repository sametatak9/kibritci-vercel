import { KampKaydi, KampOdasi } from '../types/erp';
import { saveDocument } from './firebase';
import { normalizeTurkishName } from './yoklamaUtils';

export interface AssignKampResidentInput {
  roomId: string;
  personelIsim: string;
  personelId?: string;
  calistigiFirma?: string;
  firmaTipi?: 'ANA_FIRMA' | 'TASERON';
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function roomDurumFromCount(count: number, kapasite: number): KampOdasi['durum'] {
  if (count <= 0) return 'BOŞ';
  if (count >= kapasite) return 'DOLU';
  return 'KISMEN DOLU';
}

export async function assignKampResident(
  input: AssignKampResidentInput
): Promise<{ reg: KampKaydi; room: KampOdasi }> {
  const targetRoom = input.kampOdalari.find((r) => r.id === input.roomId);
  if (!targetRoom) throw new Error('Oda bulunamadı');

  const currentOccupants = input.kampKayitlari.filter(
    (k) =>
      (k.odaId === input.roomId || k.roomId === input.roomId) && k.durum === 'AKTIF'
  );

  if (currentOccupants.length >= targetRoom.kapasite) {
    throw new Error(`Oda dolu (kapasite: ${targetRoom.kapasite})`);
  }

  const already = input.kampKayitlari.find(
    (k) =>
      k.durum === 'AKTIF' &&
      ((input.personelId && k.personelId === input.personelId) ||
        k.personelIsim.toLowerCase() === input.personelIsim.toLowerCase())
  );
  if (already) throw new Error(`${input.personelIsim} zaten başka bir odada aktif`);

  const reg: KampKaydi = {
    id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    personelIsim: input.personelIsim.trim(),
    personelId: input.personelId,
    odaId: input.roomId,
    roomId: input.roomId,
    yerleskeAdi: targetRoom.yerleskeAdi,
    katAdi: targetRoom.kogusNo,
    odaNo: targetRoom.odaNo,
    girisTarihi: new Date().toISOString().slice(0, 10),
    durum: 'AKTIF',
    calistigiFirma: input.calistigiFirma,
    firmaTipi: input.firmaTipi,
  };

  const newCount = currentOccupants.length + 1;
  let durum: KampOdasi['durum'] = 'KISMEN DOLU';
  if (newCount >= targetRoom.kapasite) durum = 'DOLU';

  const room: KampOdasi = { ...targetRoom, durum };

  await saveDocument('kampKayitlari', reg);
  await saveDocument('kampOdalari', room);

  return { reg, room };
}

export async function evictKampResident(
  reg: KampKaydi,
  kampOdalari: KampOdasi[],
  kampKayitlari: KampKaydi[],
  cikisTarihi?: string
): Promise<void> {
  const roomId = reg.odaId || reg.roomId;
  const targetRoom = kampOdalari.find((r) => r.id === roomId);

  const updatedReg: KampKaydi = {
    ...reg,
    durum: 'PASIF',
    cikisTarihi: cikisTarihi || todayIsoDate(),
  };
  await saveDocument('kampKayitlari', updatedReg);

  if (!targetRoom) return;

  const remaining = kampKayitlari.filter(
    (k) =>
      (k.odaId === roomId || k.roomId === roomId) &&
      k.durum === 'AKTIF' &&
      k.id !== reg.id
  );

  await saveDocument('kampOdalari', {
    ...targetRoom,
    durum: roomDurumFromCount(remaining.length, targetRoom.kapasite),
  });
}

/**
 * İşten çıkarılan / silinen personelin tüm aktif kamp oda kayıtlarını tahliye eder.
 * Oda doluluk durumunu yeniden hesaplar. Güncel kayit/oda listesini döner (UI state için).
 */
export async function evictActiveKampResidentsForPersonel(options: {
  personelId?: string;
  personelIsim?: string;
  /** Aynı kişiye ait ek id’ler (mükerrer personel kartları) */
  personelIds?: string[];
  cikisTarihi?: string;
  kampOdalari: KampOdasi[];
  kampKayitlari: KampKaydi[];
}): Promise<{
  evictedCount: number;
  affectedRoomIds: string[];
  kampKayitlari: KampKaydi[];
  kampOdalari: KampOdasi[];
}> {
  const cikisTarihi = options.cikisTarihi || todayIsoDate();
  const nameKey = normalizeTurkishName(options.personelIsim || '');
  const idSet = new Set<string>(
    [options.personelId, ...(options.personelIds || [])].filter(Boolean) as string[]
  );

  const activeMatches = options.kampKayitlari.filter((k) => {
    if (k.durum !== 'AKTIF') return false;
    if (k.personelId && idSet.has(k.personelId)) return true;
    if (nameKey && normalizeTurkishName(k.personelIsim || '') === nameKey) return true;
    return false;
  });

  if (activeMatches.length === 0) {
    return {
      evictedCount: 0,
      affectedRoomIds: [],
      kampKayitlari: options.kampKayitlari,
      kampOdalari: options.kampOdalari,
    };
  }

  let kayitlar = [...options.kampKayitlari];
  let odalar = [...options.kampOdalari];
  const affectedRoomIds = new Set<string>();

  for (const reg of activeMatches) {
    const updatedReg: KampKaydi = {
      ...reg,
      durum: 'PASIF',
      cikisTarihi,
    };
    await saveDocument('kampKayitlari', updatedReg);
    kayitlar = kayitlar.map((k) => (k.id === reg.id ? updatedReg : k));
    const roomId = reg.odaId || reg.roomId;
    if (roomId) affectedRoomIds.add(roomId);
  }

  for (const roomId of affectedRoomIds) {
    const room = odalar.find((r) => r.id === roomId);
    if (!room) continue;
    const remaining = kayitlar.filter(
      (k) => (k.odaId === roomId || k.roomId === roomId) && k.durum === 'AKTIF'
    );
    const updatedRoom: KampOdasi = {
      ...room,
      durum: roomDurumFromCount(remaining.length, room.kapasite),
    };
    await saveDocument('kampOdalari', updatedRoom);
    odalar = odalar.map((r) => (r.id === roomId ? updatedRoom : r));
  }

  return {
    evictedCount: activeMatches.length,
    affectedRoomIds: Array.from(affectedRoomIds),
    kampKayitlari: kayitlar,
    kampOdalari: odalar,
  };
}

export function isPersonelAktifDurum(durum: unknown): boolean {
  if (durum === true) return true;
  if (durum === false || durum == null) return false;
  const s = String(durum).trim().toLocaleLowerCase('tr-TR');
  if (!s || s === 'false' || s === 'pasif' || s === '0') return false;
  return s === 'true' || s === 'aktif' || s === '1';
}

export interface ReactivateKampStaysInput {
  kampKayitlari: KampKaydi[];
  kampOdalari: KampOdasi[];
  /** Son N günde PASIF’e alınanları aday yap (varsayılan 21) */
  withinDays?: number;
  /** Sadece bu çıkış tarihindeki PASIF’leri geri al (toplu tahliye günü) */
  onlyCikisTarihi?: string;
  /**
   * Bilinçli silinen personel id / isim anahtarları — bunlar geri açılmaz.
   * (App.tsx blocklist ile beslenebilir)
   */
  blockedPersonelIds?: Set<string>;
  blockedNameKeys?: Set<string>;
}

export interface ReactivateKampStaysResult {
  reactivatedCount: number;
  skippedCount: number;
  kampKayitlari: KampKaydi[];
  kampOdalari: KampOdasi[];
}

/**
 * Aynı çıkış tarihinde ≥ minCount PASIF kayıt varsa toplu tahliye günü kabul edilir.
 */
export function detectMassKampEvictionDate(
  kampKayitlari: KampKaydi[],
  minCount = 5
): { date: string; count: number } | null {
  const counts: Record<string, number> = {};
  for (const k of kampKayitlari) {
    if (k.durum !== 'PASIF') continue;
    const d = (k.cikisTarihi || '').slice(0, 10);
    if (!d) continue;
    counts[d] = (counts[d] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < minCount) return null;
  return { date: top[0], count: top[1] };
}

/**
 * Yanlış otomatik tahliye (PASIF) kayıtlarını güvenle AKTIF’e çevirir.
 * - Kayıtlar silinmez; durum geri alınır
 * - Aynı kişi zaten başka odada AKTIF ise atlanır
 * - Oda kapasitesi doluysa atlanır
 * - Oda yoksa atlanır
 */
export async function reactivateEvictedKampStays(
  input: ReactivateKampStaysInput
): Promise<ReactivateKampStaysResult> {
  const withinDays = Math.max(1, input.withinDays ?? 21);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - withinDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const blockedIds = input.blockedPersonelIds || new Set<string>();
  const blockedNames = input.blockedNameKeys || new Set<string>();

  let kayitlar = [...input.kampKayitlari];
  let odalar = [...input.kampOdalari];
  let reactivatedCount = 0;
  let skippedCount = 0;
  const affectedRoomIds = new Set<string>();

  const activePersonKeys = new Set<string>();
  for (const k of kayitlar) {
    if (k.durum !== 'AKTIF') continue;
    if (k.personelId) activePersonKeys.add(`id:${k.personelId}`);
    const nk = normalizeTurkishName(k.personelIsim || '');
    if (nk) activePersonKeys.add(`name:${nk}`);
  }

  const roomActiveCount = new Map<string, number>();
  for (const k of kayitlar) {
    if (k.durum !== 'AKTIF') continue;
    const rid = k.odaId || k.roomId;
    if (!rid) continue;
    roomActiveCount.set(rid, (roomActiveCount.get(rid) || 0) + 1);
  }

  const candidates = kayitlar
    .filter((k) => {
      if (k.durum !== 'PASIF') return false;
      const cikis = (k.cikisTarihi || '').slice(0, 10);
      if (input.onlyCikisTarihi) {
        if (cikis !== input.onlyCikisTarihi.slice(0, 10)) return false;
      } else if (cikis && cikis < cutoffIso) {
        return false;
      }
      const nameKey = normalizeTurkishName(k.personelIsim || '');
      if (k.personelId && blockedIds.has(k.personelId)) return false;
      if (nameKey && blockedNames.has(nameKey)) return false;
      const roomId = k.odaId || k.roomId;
      if (!roomId) return false;
      if (!odalar.some((r) => r.id === roomId)) return false;
      return true;
    })
    // En yeni çıkışlar önce (yanlış toplu tahliye genelde aynı gün)
    .sort((a, b) =>
      String(b.cikisTarihi || '').localeCompare(String(a.cikisTarihi || ''))
    );

  for (const reg of candidates) {
    const roomId = (reg.odaId || reg.roomId)!;
    const room = odalar.find((r) => r.id === roomId);
    if (!room) {
      skippedCount += 1;
      continue;
    }

    const nameKey = normalizeTurkishName(reg.personelIsim || '');
    if (reg.personelId && activePersonKeys.has(`id:${reg.personelId}`)) {
      skippedCount += 1;
      continue;
    }
    if (nameKey && activePersonKeys.has(`name:${nameKey}`)) {
      skippedCount += 1;
      continue;
    }

    const occupied = roomActiveCount.get(roomId) || 0;
    if (occupied >= room.kapasite) {
      skippedCount += 1;
      continue;
    }

    const updated: KampKaydi = {
      ...reg,
      durum: 'AKTIF',
      odaId: roomId,
      roomId,
      odaNo: reg.odaNo || room.odaNo,
      yerleskeAdi: reg.yerleskeAdi || room.yerleskeAdi,
      katAdi: reg.katAdi || room.kogusNo,
    };
    delete (updated as { cikisTarihi?: string }).cikisTarihi;

    // merge:true ile alanı temizlemek için null yaz (omit edilirse eski cikisTarihi kalır)
    await saveDocument('kampKayitlari', {
      ...updated,
      cikisTarihi: null,
    } as KampKaydi);
    kayitlar = kayitlar.map((k) => (k.id === reg.id ? updated : k));

    roomActiveCount.set(roomId, occupied + 1);
    if (reg.personelId) activePersonKeys.add(`id:${reg.personelId}`);
    if (nameKey) activePersonKeys.add(`name:${nameKey}`);
    affectedRoomIds.add(roomId);
    reactivatedCount += 1;
  }

  for (const roomId of affectedRoomIds) {
    const room = odalar.find((r) => r.id === roomId);
    if (!room) continue;
    const count = roomActiveCount.get(roomId) || 0;
    const updatedRoom: KampOdasi = {
      ...room,
      durum: roomDurumFromCount(count, room.kapasite),
    };
    await saveDocument('kampOdalari', updatedRoom);
    odalar = odalar.map((r) => (r.id === roomId ? updatedRoom : r));
  }

  return {
    reactivatedCount,
    skippedCount,
    kampKayitlari: kayitlar,
    kampOdalari: odalar,
  };
}

/** Elle girilen taşeron / misafir için personel kartı oluşturma önerisi */
export function suggestPersonelKaydi(
  isim: string,
  firma: string,
  onCreatePersonel?: () => void
): void {
  if (!isim.trim()) return;
  const msg =
    `"${isim}"${firma ? ` (${firma})` : ''} veritabanında kayıtlı değil.\n\n` +
    'Bu kişiyi Personel listesine kalıcı kayıt olarak eklemek ister misiniz?';
  if (window.confirm(msg) && onCreatePersonel) {
    onCreatePersonel();
  }
}
