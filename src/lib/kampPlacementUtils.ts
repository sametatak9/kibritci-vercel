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
