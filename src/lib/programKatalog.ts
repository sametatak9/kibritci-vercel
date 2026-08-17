import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, cleanUndefined, withTimeout } from './firebase';
import {
  CatalogKind,
  DEFAULT_ALAN_PRESETS,
  DEFAULT_BIRIM_PRESETS,
  DEFAULT_GOREV_PRESETS,
  DEFAULT_NITELIK_PRESETS,
  mergeCatalogOptions,
  normalizeCatalogValue,
} from './catalogFieldUtils';

const COLLECTION = 'programKataloglari';

function docIdForKind(kind: CatalogKind): string {
  if (kind === 'gorev') return 'gorevler';
  if (kind === 'nitelik') return 'nitelikler';
  if (kind === 'birim') return 'birimler';
  return 'kullanimAlanlari';
}

function defaultsForKind(kind: CatalogKind): string[] {
  if (kind === 'gorev') return [...DEFAULT_GOREV_PRESETS];
  if (kind === 'nitelik') return [...DEFAULT_NITELIK_PRESETS];
  if (kind === 'birim') return [...DEFAULT_BIRIM_PRESETS];
  return [...DEFAULT_ALAN_PRESETS];
}

export async function fetchProgramCatalog(kind: CatalogKind): Promise<string[]> {
  const ref = doc(db, COLLECTION, docIdForKind(kind));
  const snap = await withTimeout(getDoc(ref));
  const stored = snap.exists() ? ((snap.data().items as string[]) || []) : [];
  return mergeCatalogOptions(defaultsForKind(kind), stored);
}

export function subscribeProgramCatalog(
  kind: CatalogKind,
  onData: (items: string[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const ref = doc(db, COLLECTION, docIdForKind(kind));
  return onSnapshot(
    ref,
    (snap) => {
      const stored = snap.exists() ? ((snap.data().items as string[]) || []) : [];
      onData(mergeCatalogOptions(defaultsForKind(kind), stored));
    },
    (err) => onError?.(err)
  );
}

export async function addProgramCatalogItem(kind: CatalogKind, value: string): Promise<string[]> {
  const trimmed = value.trim();
  if (!trimmed) return fetchProgramCatalog(kind);

  const current = await fetchProgramCatalog(kind);
  const key = normalizeCatalogValue(trimmed);
  if (current.some((item) => normalizeCatalogValue(item) === key)) {
    return current;
  }

  const next = mergeCatalogOptions(current, [trimmed]);
  const ref = doc(db, COLLECTION, docIdForKind(kind));
  await withTimeout(
    setDoc(
      ref,
      cleanUndefined({
        id: docIdForKind(kind),
        kind,
        items: next,
        guncellemeTarihi: new Date().toISOString(),
      }),
      { merge: true }
    ),
    15000
  );
  return next;
}
