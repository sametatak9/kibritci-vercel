import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, withTimeout } from './firebase';
import {
  isBuiltinYoklamaEtiketi,
  normalizeYoklamaEtiketi,
  yoklamaEtiketDocId,
} from './yoklamaEtiketUtils';

export const YOKLAMA_MESLEK_ETIKET_COLLECTION = 'yoklamaMeslekEtiketleri';

export interface YoklamaMeslekEtiketKaydi {
  id: string;
  etiket: string;
  olusturmaTarihi?: string;
}

export function subscribeYoklamaMeslekEtiketleri(cb: (etiketler: string[]) => void): () => void {
  return onSnapshot(collection(db, YOKLAMA_MESLEK_ETIKET_COLLECTION), (snap) => {
    const list: string[] = [];
    snap.forEach((d) => {
      const data = d.data() as Partial<YoklamaMeslekEtiketKaydi>;
      const etiket = normalizeYoklamaEtiketi(data.etiket || d.id);
      if (etiket) list.push(etiket);
    });
    cb(list);
  });
}

/** Elle yazılan meslek etiketini kalıcı kataloga kaydet (ön tanımlılar yazılmaz). */
export async function rememberYoklamaMeslekEtiketleri(
  etiketler: string[],
  alreadyKnown: Iterable<string> = []
): Promise<string[]> {
  const known = new Set(
    [...alreadyKnown].map((e) => normalizeYoklamaEtiketi(e)).filter(Boolean)
  );
  const saved: string[] = [];
  const now = new Date().toISOString();

  for (const raw of etiketler) {
    const etiket = normalizeYoklamaEtiketi(raw);
    if (!etiket || isBuiltinYoklamaEtiketi(etiket) || known.has(etiket)) continue;
    const id = yoklamaEtiketDocId(etiket);
    const ref = doc(db, YOKLAMA_MESLEK_ETIKET_COLLECTION, id);
    await withTimeout(
      () =>
        setDoc(
          ref,
          {
            id,
            etiket,
            olusturmaTarihi: now,
          } satisfies YoklamaMeslekEtiketKaydi,
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
