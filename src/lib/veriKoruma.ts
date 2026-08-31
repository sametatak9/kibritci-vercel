import { doc, setDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { AylikYoklamaMap } from '../types/erp';
import { db, cleanUndefined, withTimeout } from './firebase';
import { archiveYoklamaSnapshot, listYoklamaArchives } from './yoklamaPersistence';
import { listSahaFaaliyetArchives } from './sahaFaaliyetPersistence';

export const PROGRAM_BACKUP_COLLECTION = 'programVeriYedekleri';

export interface ProgramVeriYedegi {
  id: string;
  olusturmaTarihi: string;
  kullanici: string;
  yoklamaArsivId?: string | null;
  ozet: Record<string, number>;
  not?: string;
}

export async function createProgramVeriYedegi(
  yoklamalar: AylikYoklamaMap,
  ozet: Record<string, number>,
  kullanici: string,
  not?: string
): Promise<ProgramVeriYedegi> {
  const yoklamaArsivId = await archiveYoklamaSnapshot(
    yoklamalar,
    'sync',
    not || 'Admin panel — manuel program yedeği'
  );

  const id = `yedek_${Date.now()}`;
  const payload: ProgramVeriYedegi = {
    id,
    olusturmaTarihi: new Date().toISOString(),
    kullanici,
    yoklamaArsivId,
    ozet,
    not,
  };

  await withTimeout(
    setDoc(doc(db, PROGRAM_BACKUP_COLLECTION, id), cleanUndefined(payload)),
    20000
  );

  return payload;
}

export async function listProgramVeriYedekleri(limitCount = 20): Promise<ProgramVeriYedegi[]> {
  const snapshot = await withTimeout(
    getDocs(
      query(
        collection(db, PROGRAM_BACKUP_COLLECTION),
        orderBy('olusturmaTarihi', 'desc'),
        limit(limitCount)
      )
    )
  );
  return snapshot.docs.map((d) => d.data() as ProgramVeriYedegi);
}

export async function fetchVeriKorumaOzeti(): Promise<{
  yoklamaArsivSayisi: number;
  sahaArsivSayisi: number;
  programYedekSayisi: number;
  sonYoklamaArsiv?: string;
  sonProgramYedek?: string;
}> {
  const [yoklamaArsivleri, sahaArsivleri, programYedekleri] = await Promise.all([
    listYoklamaArchives(5),
    listSahaFaaliyetArchives(5),
    listProgramVeriYedekleri(5),
  ]);

  return {
    yoklamaArsivSayisi: yoklamaArsivleri.length,
    sahaArsivSayisi: sahaArsivleri.length,
    programYedekSayisi: programYedekleri.length,
    sonYoklamaArsiv: yoklamaArsivleri[0]?.olusturmaTarihi,
    sonProgramYedek: programYedekleri[0]?.olusturmaTarihi,
  };
}
