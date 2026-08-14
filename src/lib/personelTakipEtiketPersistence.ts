import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, withTimeout } from './firebase';
import {
  isBuiltinPersonelTakipEtiketi,
  normalizePersonelTakipEtiketi,
  personelTakipEtiketDocId,
} from './personelTakipEtiketUtils';

export const PERSONEL_TAKIP_ETIKET_COLLECTION = 'personelTakipEtiketleri';

export interface PersonelTakipEtiketKaydi {
  id: string;
  etiket: string;
  olusturmaTarihi?: string;
}

export function subscribePersonelTakipEtiketleri(cb: (etiketler: string[]) => void): () => void {
  return onSnapshot(collection(db, PERSONEL_TAKIP_ETIKET_COLLECTION), (snap) => {
    const list: string[] = [];
    snap.forEach((d) => {
      const data = d.data() as Partial<PersonelTakipEtiketKaydi>;
      const etiket = normalizePersonelTakipEtiketi(data.etiket || d.id);
      if (etiket) list.push(etiket);
    });
    cb(list);
  });
}

export async function rememberPersonelTakipEtiketleri(
  etiketler: string[],
  alreadyKnown: Iterable<string> = []
): Promise<string[]> {
  const known = new Set(
    [...alreadyKnown].map((e) => normalizePersonelTakipEtiketi(e)).filter(Boolean)
  );
  const saved: string[] = [];
  const now = new Date().toISOString();

  for (const raw of etiketler) {
    const etiket = normalizePersonelTakipEtiketi(raw);
    if (!etiket || isBuiltinPersonelTakipEtiketi(etiket) || known.has(etiket)) continue;
    const id = personelTakipEtiketDocId(etiket);
    const ref = doc(db, PERSONEL_TAKIP_ETIKET_COLLECTION, id);
    await withTimeout(
      () =>
        setDoc(
          ref,
          {
            id,
            etiket,
            olusturmaTarihi: now,
          } satisfies PersonelTakipEtiketKaydi,
          { merge: true }
        ),
      15000,
      1
    );
    known.add(etiket);
    saved.push(etiket);
  }

  return saved;
}
