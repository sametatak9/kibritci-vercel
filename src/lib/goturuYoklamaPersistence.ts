import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { AylikYoklamaMap, GoturuYoklamaGunKaydi, GoturuYoklamaSatir, Personel } from '../types/erp';
import { db, cleanUndefined } from './firebase';
import { normalizeDateKey } from './dateKeyUtils';
import { getYoklamaDay, setYoklamaDay, yoklamaDateKey } from './yoklamaUtils';

export const GOTURU_YOKLAMA_COLLECTION = 'goturuYoklamalari';

export type { GoturuYoklamaGunKaydi, GoturuYoklamaSatir };

export interface GoturuYoklamaGunOzet {
  tarih: string;
  geldi: number;
  yok: number;
  mesaiToplam: number;
  kaydeden?: string;
  guncellenme?: string;
}

export function subscribeGoturuYoklamalari(
  cb: (gunler: GoturuYoklamaGunKaydi[]) => void
): () => void {
  return onSnapshot(collection(db, GOTURU_YOKLAMA_COLLECTION), (snap) => {
    const list: GoturuYoklamaGunKaydi[] = [];
    snap.forEach((d) => {
      const data = d.data() as Partial<GoturuYoklamaGunKaydi>;
      const tarih = normalizeDateKey(data.tarih || d.id) || d.id;
      list.push({
        id: d.id,
        tarih,
        kaydeden: data.kaydeden,
        guncellenme: data.guncellenme,
        satirlar: Array.isArray(data.satirlar) ? data.satirlar : [],
      });
    });
    list.sort((a, b) => b.tarih.localeCompare(a.tarih));
    cb(list);
  });
}

export function goturuGunleriToAylikMap(gunler: GoturuYoklamaGunKaydi[]): AylikYoklamaMap {
  let map: AylikYoklamaMap = {};
  for (const gun of gunler) {
    const parts = gun.tarih.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !n)) continue;
    const [y, m, d] = parts;
    for (const s of gun.satirlar || []) {
      if (!s?.personelId) continue;
      map = {
        ...map,
        [s.personelId]: setYoklamaDay(map[s.personelId], y, m, d, {
          durum: s.durum || 'Girilmedi',
          mesaiSaati: Number(s.mesaiSaati) || 0,
          gonderen: gun.kaydeden,
        }),
      };
    }
  }
  return map;
}

export function ozetGoturuYoklamaGunleri(
  gunler: GoturuYoklamaGunKaydi[],
  monthPrefix?: string
): GoturuYoklamaGunOzet[] {
  return gunler
    .filter((g) => !monthPrefix || g.tarih.startsWith(monthPrefix))
    .map((g) => {
      let geldi = 0;
      let yok = 0;
      let mesaiToplam = 0;
      for (const s of g.satirlar || []) {
        if (s.durum === 'Geldi') geldi += 1;
        else if (s.durum === 'Yok') yok += 1;
        mesaiToplam += Number(s.mesaiSaati) || 0;
      }
      return {
        tarih: g.tarih,
        geldi,
        yok,
        mesaiToplam,
        kaydeden: g.kaydeden,
        guncellenme: g.guncellenme,
      };
    });
}

function extractDateKeysFromSparse(sparse: AylikYoklamaMap): string[] {
  const keys = new Set<string>();
  for (const personMap of Object.values(sparse || {})) {
    if (!personMap || typeof personMap !== 'object') continue;
    for (const key of Object.keys(personMap)) {
      const dk = normalizeDateKey(key);
      if (dk) keys.add(dk);
    }
  }
  return [...keys];
}

export async function persistGoturuYoklamaSparse(opts: {
  sparse: AylikYoklamaMap;
  existingGunler: GoturuYoklamaGunKaydi[];
  personeller: Personel[];
  kaydeden: string;
  fallbackDate?: string;
}): Promise<GoturuYoklamaGunKaydi[]> {
  const dates = extractDateKeysFromSparse(opts.sparse);
  if (dates.length === 0 && opts.fallbackDate) dates.push(opts.fallbackDate);
  const written: GoturuYoklamaGunKaydi[] = [];
  const byId = new Map(opts.personeller.map((p) => [p.id, p]));

  for (const tarih of dates) {
    const parts = tarih.split('-').map(Number);
    if (parts.length !== 3) continue;
    const [y, m, d] = parts;
    const prev = opts.existingGunler.find((g) => g.tarih === tarih);
    const satirById = new Map((prev?.satirlar || []).map((s) => [s.personelId, s]));

    for (const [personelId, personMap] of Object.entries(opts.sparse)) {
      const cell = getYoklamaDay(personMap as any, y, m, d);
      if (!cell) continue;
      if (cell.durum === 'Girilmedi') {
        satirById.delete(personelId);
        continue;
      }
      const p = byId.get(personelId);
      satirById.set(personelId, {
        personelId,
        ad: p?.ad || satirById.get(personelId)?.ad || '',
        soyad: p?.soyad || satirById.get(personelId)?.soyad || '',
        gorev: p?.gorev || satirById.get(personelId)?.gorev,
        durum: cell.durum,
        mesaiSaati: Number(cell.mesaiSaati) || 0,
      });
    }

    const payload: GoturuYoklamaGunKaydi = {
      id: tarih,
      tarih,
      kaydeden: opts.kaydeden,
      guncellenme: new Date().toISOString(),
      satirlar: [...satirById.values()].sort((a, b) =>
        `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, 'tr')
      ),
    };
    await setDoc(doc(db, GOTURU_YOKLAMA_COLLECTION, tarih), cleanUndefined(payload as any));
    written.push(payload);
  }
  return written;
}

export function sparseFromGoturuMap(
  map: AylikYoklamaMap,
  tarih: string
): AylikYoklamaMap {
  const dk = normalizeDateKey(tarih);
  if (!dk) return {};
  const [y, m, d] = dk.split('-').map(Number);
  const sparse: AylikYoklamaMap = {};
  for (const [pid, personMap] of Object.entries(map || {})) {
    const cell = getYoklamaDay(personMap, y, m, d);
    if (!cell) continue;
    sparse[pid] = { [yoklamaDateKey(y, m, d)]: cell } as any;
  }
  return sparse;
}
