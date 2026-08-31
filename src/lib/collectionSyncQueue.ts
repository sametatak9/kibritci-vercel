import { syncArrayToFirestore } from './firebase';

const chains = new Map<string, Promise<void>>();

/**
 * Koleksiyon bazlı sıralı sync kuyruğu — setTimeout yarışlarını önler.
 */
export async function enqueueArraySync<T extends { id: string }>(
  collectionName: string,
  oldArray: T[],
  newArray: T[]
): Promise<void> {
  const prevChain = chains.get(collectionName) ?? Promise.resolve();
  const task = prevChain.then(() => syncArrayToFirestore(collectionName, oldArray, newArray));
  chains.set(
    collectionName,
    task.catch(() => undefined)
  );
  return task;
}

export function queueArrayStateSync<T extends { id: string }>(
  collectionName: string,
  prev: T[],
  next: T[],
  rollback: () => void,
  onError?: (message: string) => void
): void {
  void enqueueArraySync(collectionName, prev, next).catch((err) => {
    rollback();
    const msg =
      err instanceof Error ? err.message : 'Veritabanı senkronizasyonu başarısız oldu';
    onError?.(msg);
  });
}
