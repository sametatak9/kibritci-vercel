import { AylikYoklamaMap } from '../types/erp';
import { countYoklamaDayEntries } from './yoklamaGuard';

import { resolveFirebaseConfig } from './firebaseConfig';

/** Tarayıcıda canlı üretim modu işaretlendiğinde demo/legacy veri yazımı engellenir */
export const PRODUCTION_LIVE_KEY = 'kibritci_production_live';

export function markProductionLive(): void {
  try {
    localStorage.setItem(PRODUCTION_LIVE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isProductionLive(): boolean {
  try {
    const config = resolveFirebaseConfig();
    if (config.projectId === 'kibritci-erp') {
      return true;
    }
    return localStorage.getItem(PRODUCTION_LIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export { countYoklamaDayEntries } from './yoklamaGuard';

/** Firestore'da anlamlı yoklama birikmiş mi */
export function hasSubstantialYoklamaData(map: AylikYoklamaMap): boolean {
  const persons = Object.keys(map).length;
  const days = countYoklamaDayEntries(map);
  return persons >= 15 || days >= 80;
}

/** Boş / eksik istemci state'inin tüm koleksiyonu silmesini engelle */
export function shouldBlockMassDelete(
  collectionName: string,
  oldArrayLength: number,
  newArrayLength: number
): boolean {
  // Allow normal deletions/wipes for transactions & inventories
  if (['kasaHareketleri', 'araclar', 'demirbaslar'].includes(collectionName)) {
    return false;
  }
  if (oldArrayLength < 3) return false;
  if (newArrayLength === 0 && oldArrayLength >= 3) {
    console.warn(
      `[productionDataGuard] ${collectionName}: boş dizinin ${oldArrayLength} kaydı silmesi engellendi`
    );
    return true;
  }
  if (isProductionLive() && oldArrayLength >= 10 && newArrayLength < oldArrayLength * 0.25) {
    console.warn(
      `[productionDataGuard] ${collectionName}: şüpheli toplu silme engellendi (${oldArrayLength} → ${newArrayLength})`
    );
    return true;
  }
  return false;
}

/** Canlı sistemde demo seed kullanılmasın */
export function initialSeedAllowed(): boolean {
  return !isProductionLive();
}
